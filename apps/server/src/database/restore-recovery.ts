import { closeSync, copyFileSync, cpSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { basename, dirname, join, resolve } from "node:path";

import { LATEST_SCHEMA_VERSION } from "./migrations.js";

const STAGE_PREFIX = ".restore-stage-";
const MANIFEST_NAME = "restore-manifest.json";
const COMMITTED_MARKER = "restore-committed";
const RECOVERED_MARKER = "restore-recovered";
const RECOVERY_DIRECTORIES = ["generated", "knowledge", "assets"] as const;

interface RestoreManifest {
  readonly version: 1;
  readonly databaseFile: string;
}

/** Persist the recovery source identity before a restore mutates live files. */
export function writeRestoreManifest(stage: string, databasePath: string): void {
  const temporary = join(stage, `${MANIFEST_NAME}.tmp`);
  writeFileSync(temporary, JSON.stringify({ version: 1, databaseFile: basename(databasePath) } satisfies RestoreManifest), { flag: "wx" });
  syncFile(temporary);
  renameSync(temporary, join(stage, MANIFEST_NAME));
}

/** A committed restore must not be rolled back after a process restart. */
export function markRestoreCommitted(stage: string): void {
  writeMarker(join(stage, COMMITTED_MARKER));
}

/**
 * Recover a restore interrupted between file swaps. This runs before SQLite
 * opens or migrates the database, so a missing live file cannot become a new
 * empty database and hide the interrupted transaction.
 */
export function recoverInterruptedRestore(databasePath: string): void {
  if (databasePath === ":memory:") return;
  const dataRoot = resolve(dirname(databasePath));
  if (!existsSync(dataRoot)) return;
  const stages = readdirSync(dataRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(STAGE_PREFIX))
    .map((entry) => join(dataRoot, entry.name))
    .sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs);

  for (const stage of stages) {
    const stageInfo = lstatSync(stage);
    if (!stageInfo.isDirectory() || stageInfo.isSymbolicLink() || dirname(resolve(stage)) !== dataRoot) {
      throw new Error("El directorio de recuperación de restauración no es seguro.");
    }
    const manifestPath = join(stage, MANIFEST_NAME);
    if (!existsSync(manifestPath)) {
      if (readdirSync(stage).length === 0) cleanupStage(stage, dataRoot);
      else throw new Error("Se encontró una restauración sin manifiesto; SQLite no se abrió y se conservaron los archivos para recuperación manual.");
      continue;
    }
    const manifestInfo = lstatSync(manifestPath);
    if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error("El manifiesto de recuperación no es un archivo regular.");
    const manifest = readManifest(manifestPath);
    if (manifest.databaseFile !== basename(databasePath)) continue;
    if (markerExists(stage, COMMITTED_MARKER) || markerExists(stage, RECOVERED_MARKER)) {
      cleanupStage(stage, dataRoot);
      continue;
    }

    const rollbackDatabase = join(stage, "rollback", "rollback.sqlite");
    validateRecoverySnapshot(rollbackDatabase);
    for (const directory of RECOVERY_DIRECTORIES) {
      installDirectorySnapshot(join(stage, "rollback", directory), join(dataRoot, directory), stage, directory);
    }
    installDatabaseSnapshot(rollbackDatabase, databasePath, stage);
    writeMarker(join(stage, RECOVERED_MARKER));
    cleanupStage(stage, dataRoot);
  }
}

function readManifest(path: string): RestoreManifest {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, "utf8")) as unknown; }
  catch (error) { throw new Error("El manifiesto de recuperación está dañado; se conservó para recuperación manual.", { cause: error }); }
  if (!parsed || typeof parsed !== "object" || !("version" in parsed) || !("databaseFile" in parsed) ||
      parsed.version !== 1 || typeof parsed.databaseFile !== "string" || basename(parsed.databaseFile) !== parsed.databaseFile) {
    throw new Error("El manifiesto de recuperación no es válido; se conservó para recuperación manual.");
  }
  return parsed as RestoreManifest;
}

function validateRecoverySnapshot(databasePath: string): void {
  const databaseInfo = lstatSync(databasePath);
  if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink()) throw new Error("La base de recuperación no es un archivo regular; se conservó la carpeta de restauración.");
  const probe = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = probe.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
    const version = probe.prepare("SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations").get() as { version: number };
    if (integrity.integrity_check !== "ok" || version.version !== LATEST_SCHEMA_VERSION || probe.prepare("PRAGMA foreign_key_check").all().length) {
      throw new Error("La base de recuperación no supera integridad, esquema o claves foráneas.");
    }
  } finally { probe.close(); }
  for (const directory of RECOVERY_DIRECTORIES) {
    const directoryPath = join(dirname(databasePath), directory);
    const directoryInfo = lstatSync(directoryPath);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error(`El snapshot de recuperación para ${directory} no es un directorio regular.`);
  }
}

function installDirectorySnapshot(source: string, target: string, stage: string, name: string): void {
  const incoming = join(stage, `.recover-${name}.incoming`);
  const displaced = join(stage, `.recover-${name}.displaced`);
  rmSync(incoming, { recursive: true, force: true });
  cpSync(source, incoming, { recursive: true });
  rmSync(displaced, { recursive: true, force: true });
  if (pathEntryExists(target)) renameSync(target, displaced);
  renameSync(incoming, target);
}

function installDatabaseSnapshot(source: string, target: string, stage: string): void {
  const incoming = join(stage, ".recover-database.incoming");
  const displaced = join(stage, ".recover-database.displaced");
  rmSync(incoming, { force: true });
  copyFileSync(source, incoming);
  rmSync(displaced, { force: true });
  rmSync(`${target}-wal`, { force: true });
  rmSync(`${target}-shm`, { force: true });
  if (pathEntryExists(target)) renameSync(target, displaced);
  renameSync(incoming, target);
}

function cleanupStage(stage: string, dataRoot: string): void {
  if (dirname(resolve(stage)) !== dataRoot || !basename(stage).startsWith(STAGE_PREFIX)) {
    throw new Error("La carpeta de recuperación está fuera del directorio permitido.");
  }
  try { rmSync(stage, { recursive: true, force: true }); } catch { /* A committed/recovered marker makes cleanup safe to retry. */ }
}

function writeMarker(path: string): void {
  if (pathEntryExists(path)) return;
  const descriptor = openSync(path, "wx");
  try { fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
}

function syncFile(path: string): void {
  const descriptor = openSync(path, "r+");
  try { fsyncSync(descriptor); }
  finally { closeSync(descriptor); }
}

function markerExists(stage: string, name: string): boolean {
  const path = join(stage, name);
  if (!pathEntryExists(path)) return false;
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`El marcador ${name} no es un archivo regular.`);
  return true;
}

function pathEntryExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

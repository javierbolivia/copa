import type { BackupInfo } from "@our-platform/shared";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import type { AppDatabase } from "../database/database.js";
import { LATEST_SCHEMA_VERSION } from "../database/migrations.js";

export class BackupService {
  readonly directory: string;

  constructor(private readonly database: AppDatabase) {
    this.directory = database.path === ":memory:"
      ? join(tmpdir(), "our-platform-memory-backups")
      : join(dirname(database.path), "backups");
  }

  async create(prefix = "backup"): Promise<BackupInfo> {
    mkdirSync(this.directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    let filename = `${prefix}-${stamp}.sqlite`, sequence = 1;
    while (existsSync(join(this.directory, filename))) filename = `${prefix}-${stamp}-${sequence++}.sqlite`;
    const path = join(this.directory, filename);
    await backup(this.database.connection, path);
    const dataRoot = dirname(this.database.path);
    this.copyDirectoryIfPresent(join(dataRoot, "generated"), `${path}.files`);
    this.copyDirectoryIfPresent(join(dataRoot, "knowledge"), `${path}.knowledge`);
    this.copyDirectoryIfPresent(join(dataRoot, "assets"), `${path}.assets`);
    return this.inspect(filename);
  }

  list(): BackupInfo[] {
    mkdirSync(this.directory, { recursive: true });
    return readdirSync(this.directory)
      .filter((name) => /^[-a-z]+-\d{8}T\d{6}Z(?:-\d+)?\.sqlite$/.test(name))
      .map((name) => this.inspect(name))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async restore(filename: string): Promise<{ restored: BackupInfo; safetyBackup: BackupInfo }> {
    const safe = basename(filename);
    if (safe !== filename) throw new Error("Nombre de backup inválido.");
    const restored = this.inspect(safe);
    if (restored.schemaVersion !== LATEST_SCHEMA_VERSION) throw new Error("Versión de backup incompatible.");
    const backupPath = join(this.directory, safe);
    const generatedSidecar = `${backupPath}.files`, knowledgeSidecar = `${backupPath}.knowledge`, assetsSidecar=`${backupPath}.assets`;
    this.validateGenerated(backupPath, generatedSidecar);
    this.validateKnowledge(backupPath, knowledgeSidecar);
    this.validateAssets(backupPath, assetsSidecar);
    const safetyBackup = await this.create("pre-restore");
    this.database.restoreFrom(backupPath);
    const dataRoot = dirname(this.database.path);
    this.replaceDirectory(generatedSidecar, join(dataRoot, "generated"));
    this.replaceDirectory(knowledgeSidecar, join(dataRoot, "knowledge"));
    this.replaceDirectory(assetsSidecar, join(dataRoot, "assets"));
    return { restored, safetyBackup };
  }

  private inspect(filename: string): BackupInfo {
    const path = join(this.directory, filename), probe = new DatabaseSync(path, { readOnly: true });
    let schemaVersion = 0;
    try {
      const integrity = probe.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      if (integrity.integrity_check !== "ok") throw new Error("Backup corrupto.");
      schemaVersion = (probe.prepare("SELECT COALESCE(MAX(version),0) version FROM schema_migrations").get() as { version: number }).version;
    } finally { probe.close(); }
    const stat = statSync(path);
    return { filename, createdAt: stat.mtime.toISOString(), bytes: stat.size, schemaVersion };
  }

  private validateGenerated(databasePath: string, sidecar: string): void {
    this.validateChecksums(databasePath, sidecar, "generated_files", "relative_path", "checksum", "generated/");
  }

  private validateKnowledge(databasePath: string, sidecar: string): void {
    this.validateChecksums(databasePath, sidecar, "knowledge_documents", "stored_relative_path", "file_sha256", "knowledge/");
  }

  private validateAssets(databasePath:string,sidecar:string):void{
    this.validateChecksums(databasePath,sidecar,"product_assets","relative_path","checksum","assets/");
  }

  private validateChecksums(databasePath: string, sidecar: string, tableName: string, pathColumn: string, hashColumn: string, prefix: string): void {
    const probe = new DatabaseSync(databasePath, { readOnly: true });
    try {
      if (!probe.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName)) return;
      const rows = probe.prepare(`SELECT ${pathColumn} AS relative_path, ${hashColumn} AS checksum FROM ${tableName} WHERE ${pathColumn} IS NOT NULL`).all() as unknown as Array<{ relative_path: string; checksum: string }>;
      if (rows.length > 0 && !existsSync(sidecar)) throw new Error(`El backup no contiene el directorio requerido para ${tableName}.`);
      for (const row of rows) {
        const relative = row.relative_path.replaceAll("\\", "/");
        if (relative.includes("..") || relative.startsWith("/") || (prefix && !relative.startsWith(prefix))) throw new Error("El backup contiene una ruta de archivo inválida.");
        const local = prefix ? relative.slice(prefix.length) : relative;
        const path = join(sidecar, local);
        if (!existsSync(path)) throw new Error(`Falta un archivo en el backup: ${relative}`);
        const checksum = createHash("sha256").update(readFileSync(path)).digest("hex");
        if (checksum !== row.checksum) throw new Error(`Checksum inválido en el backup: ${relative}`);
      }
    } finally { probe.close(); }
  }

  private copyDirectoryIfPresent(source: string, target: string): void {
    if (existsSync(source)) cpSync(source, target, { recursive: true });
  }

  private replaceDirectory(source: string, target: string): void {
    rmSync(target, { recursive: true, force: true });
    if (existsSync(source)) cpSync(source, target, { recursive: true });
  }
}

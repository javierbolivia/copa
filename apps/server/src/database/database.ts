import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LATEST_SCHEMA_VERSION, migrations } from "./migrations.js";
import { recoverInterruptedRestore } from "./restore-recovery.js";

export class AppDatabase {
  connection: DatabaseSync;

  constructor(readonly path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
      recoverInterruptedRestore(path);
    }

    this.connection = new DatabaseSync(path);
    this.connection.exec("PRAGMA foreign_keys = ON");
    if (path !== ":memory:") {
      this.connection.exec("PRAGMA journal_mode = WAL");
    }
    this.migrate();
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      ) STRICT
    `);

    const hasMigration = this.connection.prepare(
      "SELECT 1 FROM schema_migrations WHERE version = ?",
    );
    const recordMigration = this.connection.prepare(
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
    );

    for (const migration of migrations) {
      if (hasMigration.get(migration.version) !== undefined) {
        continue;
      }

      this.connection.exec("BEGIN IMMEDIATE");
      try {
        this.connection.exec(migration.sql);
        recordMigration.run(
          migration.version,
          migration.name,
          new Date().toISOString(),
        );
        this.connection.exec("COMMIT");
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    }
  }

  getSchemaVersion(): number {
    const row = this.connection
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations",
      )
      .get() as { version: number };
    return row.version;
  }

  check(): boolean {
    const row = this.connection.prepare("SELECT 1 AS ok").get() as {
      ok: number;
    };
    return row.ok === 1;
  }

  close(): void {
    this.connection.close();
  }

  restoreFrom(validatedBackupPath: string): void {
    if (this.path === ":memory:") throw new Error("No se puede restaurar una base en memoria.");
    const temporaryPath = `${this.path}.restore-${randomUUID()}.tmp`;
    const previousPath = `${temporaryPath}.previous`;
    copyFileSync(validatedBackupPath, temporaryPath);
    const candidate = new DatabaseSync(temporaryPath, { readOnly: true });
    try {
      const integrity = candidate.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      const version = candidate.prepare("SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations").get() as { version: number };
      if (integrity.integrity_check !== "ok" || version.version !== LATEST_SCHEMA_VERSION || candidate.prepare("PRAGMA foreign_key_check").all().length) {
        throw new Error("El backup no supera integridad o versión de esquema.");
      }
    } catch (error) {
      candidate.close();
      rmSync(temporaryPath, { force: true });
      throw error;
    }
    candidate.close();

    // Checkpoint before moving the original file so its committed WAL data survives rollback.
    const checkpoint = this.connection.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
    if (checkpoint.busy) { rmSync(temporaryPath, { force: true }); throw new Error("La base está ocupada; no se puede restaurar mientras otra conexión la utiliza."); }
    this.close();
    let movedPrevious = false, installed = false;
    try {
      rmSync(`${this.path}-wal`, { force: true });
      rmSync(`${this.path}-shm`, { force: true });
      renameSync(this.path, previousPath);
      movedPrevious = true;
      renameSync(temporaryPath, this.path);
      installed = true;
      this.connection = this.openConnection();
    } catch (error) {
      if (installed) {
        rmSync(`${this.path}-wal`, { force: true });
        rmSync(`${this.path}-shm`, { force: true });
        renameSync(this.path, temporaryPath);
      }
      if (movedPrevious) renameSync(previousPath, this.path);
      this.connection = this.openConnection();
      throw error;
    } finally { try { rmSync(temporaryPath, { force: true }); } catch { /* Preserve diagnostic candidate. */ } }
    if (existsSync(previousPath)) { try { rmSync(previousPath); } catch { /* Original remains recoverable. */ } }
  }

  private openConnection(): DatabaseSync {
    const connection = new DatabaseSync(this.path);
    try {
    connection.exec("PRAGMA foreign_keys = ON");
    if (this.path !== ":memory:") connection.exec("PRAGMA journal_mode = WAL");
    return connection;
    } catch (error) { connection.close(); throw error; }
  }
}

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { LATEST_SCHEMA_VERSION, migrations } from "./migrations.js";

export class AppDatabase {
  connection: DatabaseSync;

  constructor(readonly path: string) {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
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
    const temporaryPath = `${this.path}.restore-tmp`;
    copyFileSync(validatedBackupPath, temporaryPath);
    const candidate = new DatabaseSync(temporaryPath, { readOnly: true });
    try {
      const integrity = candidate.prepare("PRAGMA integrity_check").get() as { integrity_check: string };
      const version = candidate.prepare("SELECT COALESCE(MAX(version),0) AS version FROM schema_migrations").get() as { version: number };
      if (integrity.integrity_check !== "ok" || version.version !== LATEST_SCHEMA_VERSION) {
        throw new Error("El backup no supera integridad o versión de esquema.");
      }
    } finally { candidate.close(); }

    this.close();
    try {
      rmSync(`${this.path}-wal`, { force: true });
      rmSync(`${this.path}-shm`, { force: true });
      copyFileSync(temporaryPath, this.path);
      this.connection = this.openConnection();
    } catch (error) {
      this.connection = this.openConnection();
      throw error;
    } finally { rmSync(temporaryPath, { force: true }); }
  }

  private openConnection(): DatabaseSync {
    const connection = new DatabaseSync(this.path);
    connection.exec("PRAGMA foreign_keys = ON");
    if (this.path !== ":memory:") connection.exec("PRAGMA journal_mode = WAL");
    return connection;
  }
}

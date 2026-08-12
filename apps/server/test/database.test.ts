import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AppDatabase } from "../src/database/database.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("AppDatabase", () => {
  it("crea, migra, cierra y reabre una base persistente", () => {
    const directory = mkdtempSync(join(tmpdir(), "our-platform-database-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "test.db");

    const first = new AppDatabase(path);
    expect(first.check()).toBe(true);
    expect(first.getSchemaVersion()).toBe(5);
    first.connection
      .prepare(`
        INSERT INTO projects (
          id, name, niche, status, language, currency, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', 'es', 'USD', ?, ?)
      `)
      .run("01912345-6789-7abc-8def-0123456789ab", "Persistente", "Prueba", "2026-08-12T00:00:00.000Z", "2026-08-12T00:00:00.000Z");
    first.close();

    expect(existsSync(path)).toBe(true);
    const reopened = new AppDatabase(path);
    const row = reopened.connection
      .prepare("SELECT name FROM projects WHERE id = ?")
      .get("01912345-6789-7abc-8def-0123456789ab") as { name: string };
    expect(row.name).toBe("Persistente");
    expect(reopened.getSchemaVersion()).toBe(5);
    reopened.close();
  });
});

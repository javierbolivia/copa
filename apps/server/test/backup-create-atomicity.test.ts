import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { BackupService } from "../src/services/backup-service.js";

const fault = vi.hoisted(() => ({ copyFrom: "", failPublish: false, beforePublish: undefined as (() => void) | undefined, beforeReserve: undefined as ((stage: string) => void) | undefined }));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    mkdirSync: (path: string, options: Parameters<typeof fs.mkdirSync>[1]) => {
      if (String(path).endsWith(".pending")) fault.beforeReserve?.(path);
      return fs.mkdirSync(path, options);
    },
    cpSync: (source: string, target: string, options: Parameters<typeof fs.cpSync>[2]) => {
      if (source === fault.copyFrom) throw new Error("COPY_FAILED");
      return fs.cpSync(source, target, options);
    },
    renameSync: (source: string, target: string) => {
      if (/backup-.*\.sqlite$/.test(target)) {
        fault.beforePublish?.();
        if (fault.failPublish) throw new Error("PUBLISH_FAILED");
      }
      return fs.renameSync(source, target);
    },
  };
});

describe("backup creation publishes complete snapshots", () => {
  let root: string | undefined;
  let db: AppDatabase | undefined;
  afterEach(() => {
    fault.copyFrom = "";
    fault.failPublish = false;
    fault.beforePublish = undefined;
    fault.beforeReserve = undefined;
    db?.close();
    db = undefined;
    if (root) {
      const path = resolve(root);
      if (!path.startsWith(resolve(tmpdir()) + sep) || !path.includes("hallazia-backup-create-test-")) throw new Error("Unsafe test cleanup");
      rmSync(path, { recursive: true, force: true });
      root = undefined;
    }
    vi.useRealTimers();
  });

  function fixture(kind: "generated" | "knowledge" | "assets" = "knowledge") {
    root = mkdtempSync(join(tmpdir(), "hallazia-backup-create-test-"));
    db = new AppDatabase(join(root, "test.sqlite"));
    const project = new ProjectRepository(db).create({ name: "Backup test", niche: "Test" });
    const content = Buffer.from("Original whose checksum must remain valid.");
    const checksum = createHash("sha256").update(content).digest("hex");
    let relativePath = `${kind}/${project.id}/original.txt`;
    if (kind === "knowledge") {
      const knowledge = new KnowledgeRepository(db);
      const library = knowledge.createLibrary({ name: "Originals", scope: "PROJECT", projectId: project.id });
      relativePath = `knowledge/${library.id}/${checksum}.txt`;
      knowledge.createDocument({ libraryId: library.id, title: "Original", documentType: "txt", storedRelativePath: relativePath, fileSha256: checksum, bytes: content.length });
    } else if (kind === "generated") {
      db.connection.prepare("INSERT INTO generated_files(id,project_id,file_role,format,relative_path,checksum,bytes,created_at) VALUES(?,?,'test','txt',?,?,?,?)")
        .run("generated-test", project.id, relativePath, checksum, content.length, new Date().toISOString());
    } else {
      db.connection.prepare("INSERT INTO product_assets(id,project_id,asset_type,original_name,mime_type,relative_path,checksum,bytes,created_at) VALUES(?,?,'IMAGE','test','image/png',?,?,?,?)")
        .run("asset-test", project.id, relativePath, checksum, content.length, new Date().toISOString());
    }
    const original = join(root, relativePath);
    mkdirSync(dirname(original), { recursive: true });
    writeFileSync(original, content);
    return { service: new BackupService(db), original, kind };
  }

  it.each(["generated", "knowledge", "assets"] as const)("rejects a missing %s file without publishing a backup", async (kind) => {
    const { service, original } = fixture(kind);
    rmSync(original);
    await expect(service.create()).rejects.toThrow(/Falta un archivo/);
    expect(service.list()).toEqual([]);
    expect(readdirSync(service.directory)).toEqual([]);
  });

  it.each(["generated", "knowledge", "assets"] as const)("rejects a changed %s checksum without publishing a backup", async (kind) => {
    const { service, original } = fixture(kind);
    writeFileSync(original, "changed outside the database");
    await expect(service.create()).rejects.toThrow(/Checksum inválido/);
    expect(service.list()).toEqual([]);
    expect(readdirSync(service.directory)).toEqual([]);
  });

  it("keeps the prior backup and removes a partial copy after failure", async () => {
    const { service } = fixture();
    const saved = await service.create();
    service.list();
    const previousEntries = readdirSync(service.directory).sort();
    fault.copyFrom = join(root!, "knowledge");
    await expect(service.create()).rejects.toThrow("COPY_FAILED");
    expect(service.list().map((item) => item.filename)).toEqual([saved.filename]);
    expect(readdirSync(service.directory).sort()).toEqual(previousEntries);
  });

  it("publishes SQLite last and removes installed sidecars if publication fails", async () => {
    const { service, original } = fixture();
    let beforePublish = false;
    fault.beforePublish = () => {
      beforePublish = true;
      expect(service.list()).toEqual([]);
      expect(readdirSync(service.directory).some((name) => name.endsWith(".sqlite.knowledge"))).toBe(true);
    };
    fault.failPublish = true;
    await expect(service.create()).rejects.toThrow("PUBLISH_FAILED");
    expect(beforePublish).toBe(true);
    expect(service.list()).toEqual([]);
    expect(readdirSync(service.directory)).toEqual([]);
    expect(existsSync(original)).toBe(true);
  });

  it("reserves distinct names for concurrent creations and skips incomplete old sidecars", async () => {
    const { service } = fixture();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    mkdirSync(service.directory, { recursive: true });
    const orphan = "backup-20261008T120000Z.sqlite.knowledge";
    mkdirSync(join(service.directory, orphan));
    const results = await Promise.all(Array.from({ length: 4 }, () => new BackupService(db!).create()));
    expect(new Set(results.map((item) => item.filename)).size).toBe(4);
    expect(results.every((item) => item.filename !== "backup-20261008T120000Z.sqlite")).toBe(true);
    expect(service.list()).toHaveLength(4);
    expect(readdirSync(service.directory).filter((name) => name.endsWith(".pending"))).toEqual([]);
    for (const saved of results) expect(existsSync(join(service.directory, `${saved.filename}.knowledge`))).toBe(true);
  });

  it("does not overwrite a backup published immediately before acquiring the name reservation", async () => {
    const { service } = fixture();
    const saved = await service.create();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    const racingName = "backup-20261009T120000Z.sqlite";
    fault.beforeReserve = (stage) => {
      fault.beforeReserve = undefined;
      const target = stage.slice(0, -".pending".length);
      copyFileSync(join(service.directory, saved.filename), target);
      cpSync(join(service.directory, `${saved.filename}.knowledge`), `${target}.knowledge`, { recursive: true });
    };
    const next = await service.create();
    expect(next.filename).toBe("backup-20261009T120000Z-1.sqlite");
    expect(service.list().map((item) => item.filename)).toEqual(expect.arrayContaining([saved.filename, racingName, next.filename]));
  });
});

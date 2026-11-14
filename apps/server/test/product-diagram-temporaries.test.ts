import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProductDocumentRepository } from "../src/repositories/product-document-repository.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { ProductExportService } from "../src/services/product-export-service.js";

const state = vi.hoisted(() => ({
  tempDirectories: [] as string[], renderedPages: [] as string[], failWrite: false, failRender: false,
}));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    existsSync: (path: Parameters<typeof fs.existsSync>[0]) => String(path).endsWith("msedge.exe") || fs.existsSync(path),
    mkdirSync: (path: string, options: Parameters<typeof fs.mkdirSync>[1]) => {
      if (String(path).replaceAll("\\", "/").endsWith("/data/generated/.diagram")) throw new Error("WORKSPACE_TEMP_NOT_ALLOWED");
      return fs.mkdirSync(path, options);
    },
    mkdtempSync: (prefix: string) => {
      const created = fs.mkdtempSync(prefix);
      if (String(prefix).includes("hallazia-mermaid-")) state.tempDirectories.push(created);
      return created;
    },
    writeFileSync: (path: string, data: Parameters<typeof fs.writeFileSync>[1], options: Parameters<typeof fs.writeFileSync>[2]) => {
      fs.writeFileSync(path, data, options);
      if (state.failWrite && String(path).endsWith(".html")) throw new Error("HTML_WRITE_FAILED");
    },
  };
});
vi.mock("node:child_process", () => ({
  spawnSync: (_command: string, args: string[]) => {
    const page = fileURLToPath(args.find((arg) => arg.startsWith("file:"))!);
    state.renderedPages.push(page);
    expect(readFileSync(page, "utf8")).toContain("mermaid.initialize");
    return state.failRender
      ? { status: 1, stdout: "", stderr: "RENDER_FAILED" }
      : { status: 0, stdout: '<body data-render="ready"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0L10 10"/></svg></body>', stderr: "" };
  },
}));

describe("Mermaid temporary file isolation", () => {
  let root: string;
  let db: AppDatabase;
  let service: ProductExportService;
  let projectId: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "hallazia-diagram-test-"));
    db = new AppDatabase(join(root, "test.sqlite"));
    projectId = new ProjectRepository(db).create({ name: "Diagram test", niche: "Test" }).id;
    service = new ProductExportService(db, new ProductDocumentRepository(db), root);
  });
  afterEach(() => {
    db.close();
    for (const path of [root, ...state.tempDirectories]) {
      const absolute = resolve(path);
      if (!absolute.startsWith(resolve(tmpdir()) + sep) || !/^hallazia-(diagram-test|mermaid)-/.test(basename(absolute))) throw new Error("Unsafe test cleanup");
      rmSync(absolute, { recursive: true, force: true });
    }
    state.tempDirectories = [];
    state.renderedPages = [];
    state.failWrite = false;
    state.failRender = false;
  });
  const input = { title: "Flow", diagramType: "flowchart" as const, description: "Prepare. Review." };

  it("uses independent system temp directories and removes pages and browser profiles", async () => {
    await service.addDiagram(projectId, input);
    await service.addDiagram(projectId, input);
    expect(state.renderedPages).toHaveLength(2);
    expect(new Set(state.tempDirectories).size).toBe(2);
    for (const path of state.tempDirectories) {
      expect(resolve(path).startsWith(resolve(tmpdir()) + sep)).toBe(true);
      expect(existsSync(path)).toBe(false);
    }
    for (const page of state.renderedPages) expect(existsSync(page)).toBe(false);
    expect(service.listAssets(projectId)).toHaveLength(2);
  });

  it.each(["write", "render"] as const)("cleans its temporary directory after a %s failure", async (failure) => {
    state.failWrite = failure === "write";
    state.failRender = failure === "render";
    await expect(service.addDiagram(projectId, input)).rejects.toThrow(failure === "write" ? "HTML_WRITE_FAILED" : "RENDER_FAILED");
    expect(state.tempDirectories).toHaveLength(1);
    expect(existsSync(state.tempDirectories[0]!)).toBe(false);
    expect(service.listAssets(projectId)).toEqual([]);
  });
});

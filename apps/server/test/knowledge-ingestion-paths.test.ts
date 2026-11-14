import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppDatabase } from "../src/database/database.js";
import type { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { KnowledgeIngestionService } from "../src/services/knowledge-ingestion-service.js";

const platform = vi.hoisted(() => ({ value: "win32" as "posix" | "win32" }));
vi.mock("node:path", async (importOriginal) => {
  const path = await importOriginal<typeof import("node:path")>();
  return {
    ...path,
    resolve: (...paths: string[]) => path[platform.value].resolve(...paths),
    relative: (from: string, to: string) => path[platform.value].relative(from, to),
    isAbsolute: (value: string) => path[platform.value].isAbsolute(value),
  };
});

describe("Knowledge file containment", () => {
  afterEach(() => { platform.value = "win32"; });
  it.each(["win32", "posix"] as const)("accepts descendants and rejects escapes with %s paths", (flavor) => {
    platform.value = flavor;
    const root = flavor === "win32" ? "C:/hallazia/data" : "/hallazia/data";
    const service = new KnowledgeIngestionService({} as AppDatabase, {} as KnowledgeRepository, root);
    const paths = service as unknown as { safeAbsolutePath(value: string): string };
    expect(paths.safeAbsolutePath("knowledge/library/original.txt")).toMatch(/knowledge[/\\]library[/\\]original\.txt$/);
    expect(() => paths.safeAbsolutePath("../data-other/outside.txt")).toThrow("Ruta de conocimiento inválida");
    expect(() => paths.safeAbsolutePath(".")).toThrow("Ruta de conocimiento inválida");
  });

  it("keeps the document row when its original path is outside the data root", () => {
    const row = { stored_relative_path: "../outside.txt", scope: "PROJECT" };
    const database = { connection: { prepare: () => ({ get: () => row }) } } as unknown as AppDatabase;
    const deleteDocument = vi.fn(() => true);
    const repository = { deleteDocument } as unknown as KnowledgeRepository;
    const service = new KnowledgeIngestionService(database, repository, "C:/hallazia/data");
    expect(() => service.delete("project", "document")).toThrow("Ruta de conocimiento inválida");
    expect(deleteDocument).not.toHaveBeenCalled();
  });
});

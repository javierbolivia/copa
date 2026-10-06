import type { ModuleResult } from "@our-platform/shared";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { FileExporterService } from "../src/services/file-exporter-service.js";

describe("module approval and generated files", () => {
  const roots: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("rolls back a Landing approval when export fails after writing its files", async () => {
    const root = mkdtempSync(join(tmpdir(), "hallazia-approval-export-"));
    roots.push(root);
    const app = await createApp({ databasePath: join(root, "data", "app.sqlite"), serveFrontend: false });
    try {
      const demo = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: { id: string } }>();
      const projectId = demo.project.id;
      const base = `/api/projects/${projectId}/modules/landing`;
      const before = (await app.inject({ method: "GET", url: base })).json<{ results: ModuleResult[] }>().results;
      const active = before.find((version) => version.status === "approved" && version.freshness === "fresh")!;
      const draftResponse = await app.inject({ method: "POST", url: `${base}/drafts`, payload: { outputData: active.outputData, expectedBaseVersionId: active.versionId } });
      expect(draftResponse.statusCode, draftResponse.body).toBe(201);
      const draft = draftResponse.json<ModuleResult>();

      const original = FileExporterService.prototype.exportLanding;
      vi.spyOn(FileExporterService.prototype, "exportLanding").mockImplementationOnce(function (this: FileExporterService, ...args) {
        original.apply(this, args);
        throw new Error("simulated file export failure");
      });
      const approval = await app.inject({ method: "POST", url: `${base}/versions/${draft.versionId}/approve` });
      expect(approval.statusCode).toBe(409);
      const after = (await app.inject({ method: "GET", url: base })).json<{ results: ModuleResult[] }>().results;
      expect(after.find((version) => version.versionId === draft.versionId)?.status).toBe("draft");
      expect(after.find((version) => version.versionId === active.versionId)).toMatchObject({ status: "approved", freshness: "fresh" });
      const files = (await app.inject({ method: "GET", url: `/api/projects/${projectId}/files` })).json<{ files: Array<{ artifactVersionId: string | null }> }>().files;
      expect(files.filter((file) => file.artifactVersionId === draft.versionId)).toHaveLength(0);
      expect(existsSync(join(root, "data", "generated", projectId, `v-${draft.versionId}`))).toBe(false);
    } finally {
      await app.close();
    }
  });
});

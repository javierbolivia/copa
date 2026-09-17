import type { Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { createDemoOutput } from "../src/domain/demo-outputs.js";

describe("provider evidence projection persistence", () => {
  let app: FastifyInstance | undefined;
  let databasePath: string | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    if (databasePath) rmSync(databasePath, { force: true });
    databasePath = undefined;
  });

  it("sends a marked provider projection while preserving the source and version audit", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ ...createDemoOutput("research", []), evidenceIds: [] }) }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    databasePath = join(tmpdir(), `hallazia-provider-evidence-${randomUUID()}.db`);
    app = await createApp({ databasePath, serveFrontend: false, gemini: { apiKey: "test", fetch: fetchMock as typeof fetch } });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Aislamiento de evidencia", niche: "tema de prueba" } })).json<Project>();
    const source = await app.inject({ method: "POST", url: `/api/projects/${project.id}/sources`, payload: { sourceType: "manual", title: "Fixture", text: "El comentario dice hijo de puta y describe cortadas las dos manos." } });
    expect(source.statusCode).toBe(201);

    const run = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "gemini" } });
    expect(run.statusCode, run.body).toBe(200);
    const request = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    const providerInput = JSON.parse(request.contents[0]!.parts[0]!.text) as { evidence: Array<{ id: string; quoteText?: string }>; providerEvidenceProjection?: { transformedSnippetCount: number } };
    expect(providerInput.providerEvidenceProjection).toMatchObject({ transformedSnippetCount: 1 });
    const sourceEvidenceId = providerInput.evidence[0]!.id;
    expect(providerInput.evidence).toEqual([{ id: sourceEvidenceId }]);
    expect(JSON.stringify(providerInput)).not.toContain("hijo de puta");

    await app.close();
    app = undefined;
    const database = new AppDatabase(databasePath);
    try {
      const stored = database.connection.prepare("SELECT quote_text FROM evidence_snippets WHERE id=?").get(sourceEvidenceId) as { quote_text: string };
      const snapshot = database.connection.prepare("SELECT version.input_snapshot FROM artifact_versions version JOIN artifacts artifact ON artifact.id=version.artifact_id WHERE version.project_id=? AND artifact.artifact_type='research'").get(project.id) as { input_snapshot: string };
      expect(stored.quote_text).toBe("El comentario dice hijo de puta y describe cortadas las dos manos.");
      expect(JSON.parse(snapshot.input_snapshot)).toMatchObject({ providerEvidenceProjection: { transformedSnippetCount: 1, transformations: [{ evidenceId: sourceEvidenceId }] } });
    } finally { database.close(); }
  });
});

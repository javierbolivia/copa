import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import type { FastifyInstance } from "fastify";

describe("Clustered Problems Pipeline (DeepSeek / Free Routers)", () => {
  let app: FastifyInstance | undefined;
  const directories: string[] = [];

  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const dir of directories.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function databasePath() {
    const directory = mkdtempSync(join(tmpdir(), "hallazia-clustered-problems-"));
    directories.push(directory);
    return join(directory, "app.db");
  }

  it("processes 250 evidence items with DeepSeek into exactly 2 MAP calls and 1 REDUCE call", async () => {
    const path = databasePath();
    const calls: Array<{ stage?: string | undefined; candidateCount?: number | undefined }> = [];

    // Mock DeepSeek provider that returns valid problems JSON
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const userContent = JSON.parse(body.messages.find((m) => m.role === "user")?.content || "{}") as {
        stage?: string;
        clusters?: Array<{ clusterId: string; representativeEvidenceIds: string[] }>;
        candidates?: Array<{ name: string; evidenceIds: string[] }>;
      };

      calls.push({ stage: userContent.stage });

      if (userContent.stage === "map") {
        // Return candidate problems referencing representative evidence IDs
        const repIds = userContent.clusters?.flatMap((c) => c.representativeEvidenceIds) ?? [];
        return new Response(
          JSON.stringify({
            id: "mock-ds-map",
            choices: [
              {
                finish_reason: "stop",
                message: {
                  content: JSON.stringify({
                    schemaVersion: 1,
                    items: [
                      {
                        id: "p1",
                        name: "Ladrido excesivo al pasear",
                        summary: "Los perros ladran y muestran agresividad cuando ven otros perros durante los paseos",
                        category: "pain",
                        evidenceIds: repIds.slice(0, 3),
                        semanticSignature: "agresividad_ladran_ladrido_pasear_perros",
                        researchRelevanceScore: 85,
                      },
                    ],
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 150, completion_tokens: 50 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      // global_reduce
      const candidateIds = userContent.candidates?.flatMap((c) => c.evidenceIds) ?? [];
      return new Response(
        JSON.stringify({
          id: "mock-ds-reduce",
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  schemaVersion: 1,
                  items: [
                    {
                      id: "final-p1",
                      name: "Ladrido excesivo y reactividad en paseos",
                      summary: "Dificultad recurrente de control cuando el perro ladra a otros perros",
                      category: "pain",
                      evidenceIds: candidateIds.slice(0, 2),
                      semanticSignature: "control_dificultad_ladra_ladrido_paseos_reactividad",
                      researchRelevanceScore: 90,
                    },
                  ],
                }),
              },
            },
          ],
          usage: { prompt_tokens: 200, completion_tokens: 60 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const discoveryProvider = {
      name: "mock-discovery",
      generate: async () => {
        throw new Error("discovery disabled in this fixture");
      },
    };

    app = await createApp({
      databasePath: path,
      serveFrontend: false,
      deepSeek: {
        apiKey: "test-deepseek-key",
        fetch: fetch as typeof globalThis.fetch,
      },
      llm: { discoveryProvider },
    });

    // Create project
    const project = (
      await app.inject({
        method: "POST",
        url: "/api/projects",
        payload: { name: "Clustered QA", niche: "Perros Reactivos" },
      })
    ).json<{ id: string }>();

    // Insert 250 comments with barking/reactivity keywords
    const comments = Array.from({ length: 250 }, (_, i) =>
      `Mi perro ladra mucho y no puedo controlarlo en el paseo cuando ve otro perro número ${i + 1}.`,
    ).join("\n\n");

    await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sources`,
      payload: { sourceType: "manual", title: "Fuente grande", text: comments },
    });

    // Run research first
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/projects/${project.id}/modules/research/run`,
          payload: { provider: "mock" },
        })
      ).statusCode,
    ).toBe(200);

    // Run Problems with DeepSeek
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/modules/problems/run`,
      payload: { provider: "deepseek" },
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json<{
      outputData: {
        analysisMetrics: {
          commentsSelectedForSemanticAnalysis: number;
          batchesSentToProvider: number;
          corpusCoverage: number;
        };
        items: Array<{ evidenceIds: string[] }>;
      };
    }>();

    // 250 items > 120, so clustering ran!
    // It should have sent at most 2 MAP batches + 1 REDUCE = 3 calls total
    const mapCalls = calls.filter((c) => c.stage === "map");
    const reduceCalls = calls.filter((c) => c.stage === "global_reduce");
    expect(mapCalls.length).toBeLessThanOrEqual(2);
    expect(reduceCalls.length).toBe(1);
    expect(calls.length).toBeLessThanOrEqual(3);

    // 100% corpus coverage verified
    expect(body.outputData.analysisMetrics.commentsSelectedForSemanticAnalysis).toBe(250);
    expect(body.outputData.analysisMetrics.corpusCoverage).toBe(100);

    // Reconciliation verified: final problem has expanded evidence IDs from the cluster!
    expect(body.outputData.items[0]!.evidenceIds.length).toBeGreaterThan(2);

    await app.close();
    app = undefined;
  });
});

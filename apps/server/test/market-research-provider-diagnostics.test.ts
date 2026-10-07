import { afterEach, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { YouTubeAdapter } from "../src/integrations/youtube-adapter.js";
import type { MarketResearchAnalyzerClient } from "../src/services/market-research-semantic-miner.js";

const apps: Array<Awaited<ReturnType<typeof createApp>>> = [];
const secret = "api_key=must-not-persist";

afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
});

function youtubeErrorResponse(reason: string): Response {
  return new Response(JSON.stringify({
    error: {
      errors: [{ reason, message: secret }],
      message: secret,
    },
  }), { status: 429, headers: { "content-type": "application/json" } });
}

it("keeps only an allowlisted YouTube reason code and the HTTP status", async () => {
  const adapter = new YouTubeAdapter({
    apiKey: "fixture-key",
    fetch: vi.fn(async () => youtubeErrorResponse("userRateLimitExceeded")) as unknown as typeof fetch,
  });

  let thrown: unknown;
  try {
    await adapter.searchVideos("perros reactivos");
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({
    code: "rate_limited",
    status: 429,
    remoteReasonCode: "userRateLimitExceeded",
  });
  expect((thrown as Error).message).not.toContain(secret);
});

it("does not retain an unknown remote reason or its response body", async () => {
  const adapter = new YouTubeAdapter({
    apiKey: "fixture-key",
    fetch: vi.fn(async () => youtubeErrorResponse(`unknown_${secret}`)) as unknown as typeof fetch,
  });

  let thrown: unknown;
  try {
    await adapter.searchVideos("perros reactivos");
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toMatchObject({ code: "rate_limited", status: 429 });
  expect((thrown as { remoteReasonCode?: string }).remoteReasonCode).toBeUndefined();
  expect((thrown as Error).message).not.toContain(secret);
});

it("persists allowlisted YouTube diagnostics and restores them from Market Research history", async () => {
  const fetchMock = vi.fn(async () => youtubeErrorResponse("userRateLimitExceeded"));
  const analyzer = {
    configured: true,
    generate: vi.fn(async () => ({
      provider: "deepseek",
      requestedModel: "fixture-model",
      output: { findings: [] },
      usage: { inputTokens: 0, outputTokens: 0, usageKind: "estimated" as const },
    })),
  } as unknown as MarketResearchAnalyzerClient;
  const app = await createApp({
    databasePath: ":memory:",
    serveFrontend: false,
    marketResearch: {
      clients: { youtube: new YouTubeAdapter({ apiKey: "fixture-key", fetch: fetchMock as unknown as typeof fetch }) },
      analyzers: { deepSeek: analyzer },
    },
  });
  apps.push(app);

  const createdProject = await app.inject({
    method: "POST",
    url: "/api/projects",
    payload: { name: "Diagnostics QA", niche: "Perros reactivos" },
  });
  expect(createdProject.statusCode).toBe(201);
  const project = createdProject.json<{ id: string }>();

  const response = await app.inject({
    method: "POST",
    url: `/api/projects/${project.id}/market-research`,
    payload: { topic: "perros reactivos", providers: ["youtube"] },
  });
  expect(response.statusCode).toBe(200);
  const run = response.json<{ runId: string; providers: Array<Record<string, unknown>> }>();
  expect(run.providers).toHaveLength(1);
  expect(run.providers[0]).toMatchObject({
    provider: "youtube",
    state: "temporary_error",
    failure: "rate_limited",
    httpStatus: 429,
    remoteReasonCode: "userRateLimitExceeded",
  });
  expect(JSON.stringify(run)).not.toContain(secret);

  const latest = await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/latest` });
  const history = await app.inject({ method: "GET", url: `/api/projects/${project.id}/market-research/history` });
  expect(latest.statusCode).toBe(200);
  expect(history.statusCode).toBe(200);
  expect(latest.json()).toEqual(run);
  expect(history.json()).toMatchObject({ runs: [run] });
  expect(JSON.stringify(history.json())).not.toContain(secret);
  expect(fetchMock).toHaveBeenCalled();
  expect(analyzer.generate).not.toHaveBeenCalled();
});

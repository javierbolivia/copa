import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "../src/integrations/integration-error.js";
import { MockLLMProvider } from "../src/integrations/mock-llm-provider.js";
import { OpenAIProvider } from "../src/integrations/openai-provider.js";
import { YouTubeAdapter, extractYouTubeVideoId } from "../src/integrations/youtube-adapter.js";

const request = {
  provider: "mock",
  model: "demo-model",
  systemInstructions: "Responde de forma estructurada.",
  input: "Crea un resultado demo.",
};

describe("MockLLMProvider", () => {
  it("produce una salida estructurada determinista a partir del schema", async () => {
    const provider = new MockLLMProvider();
    const structured = {
      ...request,
      structuredOutput: {
        name: "demo_result",
        jsonSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            score: { type: "integer", minimum: 10 },
            tags: { type: "array", items: { type: "string" }, minItems: 2 },
          },
          required: ["title", "score", "tags"],
        },
      },
    };
    const first = await provider.generate<{ title: string; score: number; tags: string[] }>(structured);
    const second = await provider.generate<{ title: string; score: number; tags: string[] }>(structured);
    expect(first.output).toEqual({ title: "DEMO: title", score: 10, tags: ["DEMO: tags", "DEMO: tags"] });
    expect(second.output).toEqual(first.output);
    expect(first.usage).toMatchObject({ estimatedCost: 0, usageKind: "estimated" });
  });

  it("usa fixtures aislados y puede exigirlos", async () => {
    const provider = new MockLLMProvider({ fixtures: { text: "respuesta fija" }, strictFixtures: true });
    expect((await provider.generate(request)).output).toBe("respuesta fija");
    await expect(provider.generate({ ...request, structuredOutput: { name: "missing", jsonSchema: {} } }))
      .rejects.toMatchObject({ code: "fixture_missing" });
  });
});

describe("OpenAIProvider", () => {
  it("envía una Responses API request y normaliza structured output y usage", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      return new Response(JSON.stringify({
      id: "resp_demo",
      model: "reported-model",
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "{\"ok\":true}" }] }],
      usage: { input_tokens: 12, output_tokens: 4, input_tokens_details: { cached_tokens: 3 } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const provider = new OpenAIProvider({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
    const result = await provider.generate<{ ok: boolean }>({
      ...request,
      structuredOutput: { name: "demo", jsonSchema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } },
      maxOutputTokens: 250,
    });
    expect(result.output).toEqual({ ok: true });
    expect(result.reportedModel).toBe("reported-model");
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 4, cachedTokens: 3, usageKind: "provider_reported" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(calls[0]!.init?.body));
    expect(body).toMatchObject({ model: "demo-model", instructions: request.systemInstructions, input: request.input, max_output_tokens: 250 });
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "demo", strict: false });
  });

  it("falla localmente sin clave y tipa rate limits", async () => {
    await expect(new OpenAIProvider().generate(request)).rejects.toMatchObject({ code: "missing_api_key" });
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      fetch: (async () => new Response(JSON.stringify({ error: { type: "rate_limit_error" } }), { status: 429 })) as typeof fetch,
    });
    await expect(provider.generate(request)).rejects.toMatchObject({ code: "rate_limited", status: 429, retryable: true });
  });

  it("tipa una salida estructurada inválida", async () => {
    const provider = new OpenAIProvider({
      apiKey: "test-key",
      fetch: (async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "no-json" }] }] }), { status: 200 })) as typeof fetch,
    });
    await expect(provider.generate({ ...request, structuredOutput: { name: "demo", jsonSchema: {} } }))
      .rejects.toMatchObject({ code: "schema_mismatch" });
  });

  it("respeta los flujos de un solo intento sin gastar una llamada de reparación", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: "{}" }] }],
    })));
    const provider = new OpenAIProvider({ apiKey: "fake", fetch: fetchMock });
    await expect(provider.generate({ ...request, structuredOutput: {
      name: "single_attempt", retryOnInvalidSchema: false,
      jsonSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
    } })).rejects.toMatchObject({ code: "schema_mismatch" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("YouTubeAdapter", () => {
  it("extrae IDs desde formatos normales", () => {
    expect(extractYouTubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=2")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("invalid")).toBeUndefined();
  });

  it("normaliza metadata, hilos, replies y paginación", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const parsed = new URL(String(url));
      if (parsed.pathname.endsWith("/videos")) {
        return new Response(JSON.stringify({ items: [{ id: "video1", snippet: { title: "Video", channelId: "channel1", channelTitle: "Canal", publishedAt: "2026-01-01T00:00:00Z" }, statistics: { commentCount: "8" } }] }));
      }
      if (parsed.pathname.endsWith("/commentThreads")) {
        return new Response(JSON.stringify({ nextPageToken: "next", items: [{
          id: "thread1",
          snippet: { totalReplyCount: 2, topLevelComment: { id: "comment1", snippet: { authorDisplayName: "Ana", textOriginal: "Texto", likeCount: 5, publishedAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" } } },
          replies: { comments: [{ id: "reply1", snippet: { authorDisplayName: "Luis", textOriginal: "Respuesta", likeCount: 1, publishedAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z" } }] },
        }] }));
      }
      return new Response(JSON.stringify({ items: [{ id: "reply2", snippet: { authorDisplayName: "Sol", textOriginal: "Otra", likeCount: 0, publishedAt: "2026-01-04T00:00:00Z", updatedAt: "2026-01-04T00:00:00Z" } }] }));
    });
    const adapter = new YouTubeAdapter({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
    expect(await adapter.getVideo("video1")).toMatchObject({ title: "Video", commentCount: 8 });
    const page = await adapter.listCommentThreads({ videoId: "video1", order: "time" });
    expect(page.nextPageToken).toBe("next");
    expect(page.items[0]).toMatchObject({ threadId: "thread1", totalReplyCount: 2 });
    expect(page.items[0]!.topLevelComment).toMatchObject({ commentId: "comment1", author: "Ana", isReply: false });
    expect(page.items[0]!.embeddedReplies[0]).toMatchObject({ commentId: "reply1", parentCommentId: "comment1", isReply: true });
    expect((await adapter.listReplies({ parentCommentId: "comment1" })).items[0]).toMatchObject({ commentId: "reply2", isReply: true });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("key=test-key");
  });

  it("no hace red sin clave y clasifica quota exceeded", async () => {
    const never = vi.fn();
    await expect(new YouTubeAdapter({ fetch: never as typeof fetch }).getVideo("video1"))
      .rejects.toMatchObject({ code: "missing_api_key" });
    expect(never).not.toHaveBeenCalled();
    const adapter = new YouTubeAdapter({
      apiKey: "test-key",
      fetch: (async () => new Response(JSON.stringify({ error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }), { status: 403 })) as typeof fetch,
    });
    await expect(adapter.getVideo("video1")).rejects.toMatchObject({ code: "quota_exceeded", retryable: false });
  });

  it("expone errores como IntegrationError", async () => {
    const adapter = new YouTubeAdapter({
      apiKey: "test-key",
      fetch: (async () => { throw new TypeError("socket failed"); }) as typeof fetch,
    });
    try {
      await adapter.getVideo("video1");
      throw new Error("La llamada debía fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(IntegrationError);
      expect(error).toMatchObject({ code: "network_error", retryable: true });
    }
  });
});

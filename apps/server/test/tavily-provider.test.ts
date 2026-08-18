import { describe, expect, it, vi } from "vitest";

import { TavilyProvider } from "../src/integrations/tavily-provider.js";

describe("TavilyProvider", () => {
  it("acota la búsqueda y devuelve únicamente metadatos seguros", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: [{ title: "uno" }, { title: "dos" }, { title: "tres" }, { title: "cuatro" }],
      usage: 2,
      credits: 7,
    }), {
      status: 200,
      headers: { "x-ratelimit-remaining": "9", "x-ratelimit-limit": "10" },
    }));
    const provider = new TavilyProvider({ apiKey: "tavily-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.search("consulta no retornable", { maxResults: 99 })).resolves.toEqual({
      status: 200,
      resultCount: 3,
      usage: 2,
      credits: 7,
      rateLimitRemaining: 9,
      rateLimitLimit: 10,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ search_depth: "basic", max_results: 3, include_answer: false, include_raw_content: false });
    expect(JSON.stringify(body)).toContain("tavily-test-key");
  });

  it("no filtra la clave al informar errores remotos", async () => {
    const provider = new TavilyProvider({
      apiKey: "tavily-secret-value",
      fetch: async () => new Response(JSON.stringify({ error: { type: "invalid_api_key", message: "tavily-secret-value" } }), { status: 401 }),
    });

    await expect(provider.search("x")).rejects.toMatchObject({ code: "authentication_failed", status: 401 });
    await provider.search("x").catch((error: unknown) => expect(error instanceof Error ? error.message : "").not.toContain("tavily-secret-value"));
  });
});

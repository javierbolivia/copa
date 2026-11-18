import { describe, expect, it, vi } from "vitest";

import { FirecrawlProvider } from "../src/integrations/firecrawl-provider.js";

describe("FirecrawlProvider", () => {
  it("acota la búsqueda web y devuelve sólo metadatos seguros", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { web: [{ url: "https://example.test/1" }, { url: "https://example.test/2" }, { url: "https://example.test/3" }, { url: "https://example.test/4" }] },
      creditsUsed: 2,
    }), {
      status: 200,
      headers: { "x-ratelimit-remaining": "9", "x-ratelimit-limit": "10" },
    }));
    const provider = new FirecrawlProvider({ apiKey: "firecrawl-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.search("consulta no retornable", { maxResults: 99 })).resolves.toEqual({
      status: 200,
      resultCount: 3,
      usage: 2,
      rateLimitRemaining: 9,
      rateLimitLimit: 10,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ authorization: "Bearer firecrawl-test-key", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ query: "consulta no retornable", limit: 3, sources: ["web"] });
  });

  it("no filtra la clave al informar errores remotos", async () => {
    const provider = new FirecrawlProvider({
      apiKey: "firecrawl-secret-value",
      fetch: async () => new Response(JSON.stringify({ error: { type: "invalid_api_key", message: "firecrawl-secret-value" } }), { status: 401 }),
    });

    await expect(provider.search("x")).rejects.toMatchObject({ code: "authentication_failed", status: 401 });
    await provider.search("x").catch((error: unknown) => expect(error instanceof Error ? error.message : "").not.toContain("firecrawl-secret-value"));
  });
});


  it("expone discovery limitado y scrape de una URL explícita sin crawl ni batch", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if ("query" in body) return new Response(JSON.stringify({ data: { web: Array.from({ length: 21 }, (_, index) => ({ url: `https://example.test/${index}`, title: `R${index}`, description: "snippet" })) } }), { status: 200 });
      return new Response(JSON.stringify({ data: { markdown: "contenido acotado" } }), { status: 200 });
    });
    const provider = new FirecrawlProvider({ apiKey: "firecrawl-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.discover("consulta", { maxResults: 99 })).resolves.toMatchObject({
      results: Array.from({ length: 20 }, () => expect.objectContaining({ snippet: "snippet" })),
      metadata: { resultCount: 20 },
    });
    await expect(provider.scrape("https://example.test/a")).resolves.toMatchObject({ metadata: { resultCount: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

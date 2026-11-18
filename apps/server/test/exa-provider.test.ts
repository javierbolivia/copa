import { describe, expect, it, vi } from "vitest";

import { ExaProvider } from "../src/integrations/exa-provider.js";

describe("ExaProvider", () => {
  it("acota la búsqueda semántica y devuelve sólo metadatos seguros", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      results: [{ title: "uno" }, { title: "dos" }, { title: "tres" }, { title: "cuatro" }],
      costDollars: 0.01,
    }), {
      status: 200,
      headers: { "x-ratelimit-remaining": "9", "x-ratelimit-limit": "10" },
    }));
    const provider = new ExaProvider({ apiKey: "exa-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.search("consulta no retornable", { maxResults: 99 })).resolves.toEqual({
      status: 200,
      resultCount: 3,
      usage: 0.01,
      rateLimitRemaining: 9,
      rateLimitLimit: 10,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ "x-api-key": "exa-test-key", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ query: "consulta no retornable", type: "auto", numResults: 3 });
  });

  it("no filtra la clave al informar errores remotos", async () => {
    const provider = new ExaProvider({
      apiKey: "exa-secret-value",
      fetch: async () => new Response(JSON.stringify({ error: { type: "invalid_api_key", message: "exa-secret-value" } }), { status: 401 }),
    });

    await expect(provider.search("x")).rejects.toMatchObject({ code: "authentication_failed", status: 401 });
    await provider.search("x").catch((error: unknown) => expect(error instanceof Error ? error.message : "").not.toContain("exa-secret-value"));
  });
});


  it("expone discovery limitado con texto opcional", async () => {
    const provider = new ExaProvider({
      apiKey: "exa-test-key",
      fetch: async () => new Response(JSON.stringify({
        results: Array.from({ length: 21 }, (_, index) => ({ id: `id-${index}`, url: `https://example.test/${index}`, title: `R${index}`, text: "texto" })),
        costDollars: 0.02,
      }), { status: 200 }),
    });

    await expect(provider.discover("consulta", { maxResults: 99 })).resolves.toMatchObject({
      results: Array.from({ length: 20 }, (_, index) => expect.objectContaining({ id: `id-${index}`, text: "texto" })),
      metadata: { resultCount: 20, estimatedCost: 0.02 },
    });
  });

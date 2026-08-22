import { describe, expect, it, vi } from "vitest";

import { DEEPSEEK_DEFAULT_MODEL, DeepSeekProvider } from "../src/integrations/deepseek-provider.js";

function response(content: unknown, model = "deepseek-v4-flash") {
  return new Response(JSON.stringify({
    model,
    choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 12, completion_tokens: 4 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("DeepSeekProvider", () => {
  it("usa DeepSeek V4 Flash cuando no recibe modelo explícito", async () => {
    const fetchMock = vi.fn(async () => response({ ok: true }));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch, model: "  " });

    const result = await provider.generate<{ ok: boolean }>({
      provider: "deepseek",
      model: provider.effectiveModel,
      systemInstructions: "JSON",
      input: "{}",
      structuredOutput: { name: "check", jsonSchema: { type: "object" } },
    });

    expect(DEEPSEEK_DEFAULT_MODEL).toBe("deepseek-v4-flash");
    expect(result).toMatchObject({ requestedModel: DEEPSEEK_DEFAULT_MODEL, reportedModel: DEEPSEEK_DEFAULT_MODEL, usage: { inputTokens: 12, outputTokens: 4, usageKind: "provider_reported" }, finishReason: "stop" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body=JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: DEEPSEEK_DEFAULT_MODEL, response_format: { type: "json_object" } });
    expect(body.messages[0].content).toContain("CONTRATO DE SALIDA JSON ESTRICTO");
    expect(body.messages[0].content).toContain("todas las propiedades declaradas en required");
    expect(body.messages[0].content).toContain("No sustituyas el objeto raíz por un array");
    expect(body.messages[0].content).toContain("uses null");
    expect(body.messages[0].content).toContain("No uses placeholders");
    expect(body.messages[0].content).toContain("No inventes afirmaciones");
    expect(body.messages[0].content).toContain('"type":"object"');
  });

  it("rechaza V4 Pro configurado antes de crear un cliente de red", () => {
    const fetchMock = vi.fn();

    expect(() => new DeepSeekProvider({
      apiKey: "deepseek-test-key",
      model: "  DEEPSEEK V4 PRO  ",
      fetch: fetchMock as typeof fetch,
    })).toThrow("DeepSeek V4 Pro no está permitido");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza V4 Pro solicitado antes de llamar a la red", async () => {
    const fetchMock = vi.fn();
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.generate({ provider: "deepseek", model: " deepseek-v4-pro ", systemInstructions: "x", input: "x" }))
      .rejects.toThrow("DeepSeek V4 Pro no está permitido");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permite un override de modelo que no es V4 Pro", async () => {
    const fetchMock = vi.fn(async () => response("OK", "reported-custom-model"));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", model: "custom-research-model", fetch: fetchMock as typeof fetch });

    const result = await provider.generate({ provider: "deepseek", model: "allowed-request-model", systemInstructions: "x", input: "x" });

    expect(provider.effectiveModel).toBe("custom-research-model");
    expect(result).toMatchObject({ requestedModel: "allowed-request-model", reportedModel: "reported-custom-model", finishReason: "stop" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "allowed-request-model" });
  });

  it("acepta un único bloque JSON cercado y rechaza objetos que no cumplen el schema",async()=>{
    const schema={type:"object",required:["ok"],properties:{ok:{type:"boolean"}},additionalProperties:false} as const;
    const fenced=new DeepSeekProvider({apiKey:"deepseek-test-key",fetch:vi.fn(async()=>response("```json\n{\"ok\":true}\n```")) as typeof fetch});
    await expect(fenced.generate({provider:"deepseek",model:fenced.effectiveModel,systemInstructions:"JSON",input:"{}",structuredOutput:{name:"check",jsonSchema:schema}})).resolves.toMatchObject({output:{ok:true}});

    const invalidFetch = vi.fn(async()=>response({}));
    const invalid=new DeepSeekProvider({apiKey:"deepseek-test-key",fetch:invalidFetch as typeof fetch});
    await expect(invalid.generate({provider:"deepseek",model:invalid.effectiveModel,systemInstructions:"JSON",input:"{}",structuredOutput:{name:"check",jsonSchema:schema}})).rejects.toMatchObject({
      code:"invalid_schema",
      attemptCount: 2,
      validationIssues: [{ path: "$.ok", expected: "boolean", actual: "missing", missingRequiredProperties: ["ok"] }],
      message: expect.stringContaining("$.ok"),
    });
    expect(invalidFetch).toHaveBeenCalledTimes(2);
  });

  it("reintenta una sola vez tras invalid_schema y entrega los errores concretos al intento final", async () => {
    const schema={type:"object",required:["ok"],properties:{ok:{type:"boolean"}},additionalProperties:false} as const;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ ok: true }));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch });

    const result = await provider.generate({provider:"deepseek",model:provider.effectiveModel,systemInstructions:"JSON",input:"{}",structuredOutput:{name:"check",jsonSchema:schema}});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      output: { ok: true },
      structuredOutputDiagnostics: {
        attemptCount: 2,
        recoveredAfterInvalidSchema: true,
        firstAttemptIssues: [{ path: "$.ok", expected: "boolean", actual: "missing", missingRequiredProperties: ["ok"] }],
      },
    });
    const [, retryInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    const retryBody = JSON.parse(String(retryInit.body));
    expect(retryBody.messages[0].content).toContain("INTENTO FINAL 2/2");
    expect(retryBody.messages[0].content).toContain("$.ok (expected boolean; actual missing");
    expect(retryBody.messages[0].content).toContain("JSON Schema completo");
  });

  it("respeta un contrato de intento único sin hacer retry de schema", async () => {
    const schema={type:"object",required:["ok"],properties:{ok:{type:"boolean"}},additionalProperties:false} as const;
    const fetchMock = vi.fn(async () => response({}));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.generate({
      provider:"deepseek",
      model:provider.effectiveModel,
      systemInstructions:"JSON",
      input:"{}",
      structuredOutput:{name:"check",jsonSchema:schema,retryOnInvalidSchema:false},
    })).rejects.toMatchObject({ code:"invalid_schema", attemptCount:1 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("no filtra la clave en errores", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { type: "invalid_api_key", message: "deepseek-secret-value" } }), { status: 401 }));
    const provider = new DeepSeekProvider({
      apiKey: "deepseek-secret-value",
      fetch: fetchMock as typeof fetch,
    });

    await expect(provider.generate({ provider: "deepseek", model: provider.effectiveModel, systemInstructions: "x", input: "x" })).rejects.toMatchObject({
      code: "http_auth_error",
      status: 401,
      message: expect.not.stringContaining("deepseek-secret-value"),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

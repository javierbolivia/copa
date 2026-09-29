import { describe, expect, it, vi } from "vitest";

import { DEEPSEEK_DEFAULT_MODEL, DeepSeekProvider } from "../src/integrations/deepseek-provider.js";

function response(content: unknown, model = DEEPSEEK_DEFAULT_MODEL) {
  return new Response(JSON.stringify({
    model,
    choices: [{ finish_reason: "stop", message: { content: typeof content === "string" ? content : JSON.stringify(content) } }],
    usage: { prompt_tokens: 12, completion_tokens: 4 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function responsesApiResponse(content: unknown, model = DEEPSEEK_DEFAULT_MODEL) {
  return new Response(JSON.stringify({
    model,
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: typeof content === "string" ? content : JSON.stringify(content) }] }],
    usage: { input_tokens: 12, output_tokens: 4 },
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

    expect(DEEPSEEK_DEFAULT_MODEL).toBe("deepseek-flash");
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
    expect(body.messages[0].content).toContain('EJEMPLO DE FORMA DEL OBJETO RAÍZ');
    expect(body.messages[0].content).toContain("\n{}\nJSON Schema completo:");
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

  it("normaliza los aliases retirados de Flash al nombre canónico", async () => {
    const fetchMock = vi.fn(async () => response({ ok: true }, "deepseek-flash"));
    const provider = new DeepSeekProvider({
      apiKey: "deepseek-test-key",
      model: "deepseek-v4-flash",
      fetch: fetchMock as typeof fetch,
    });

    const result = await provider.generate({
      provider: "deepseek",
      model: "deepseek-v4-flash",
      systemInstructions: "JSON",
      input: "{}",
      structuredOutput: { name: "check", jsonSchema: { type: "object" } },
    });

    expect(provider.effectiveModel).toBe("deepseek-flash");
    expect(result.requestedModel).toBe("deepseek-flash");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "deepseek-flash" });
  });

  it("acepta un único bloque JSON cercado y rechaza objetos que no cumplen el schema",async()=>{
    const schema={type:"object",required:["ok"],properties:{ok:{type:"boolean"}},additionalProperties:false} as const;
    const fenced=new DeepSeekProvider({apiKey:"deepseek-test-key",fetch:vi.fn(async()=>response("```json\n{\"ok\":true}\n```")) as typeof fetch});
    await expect(fenced.generate({provider:"deepseek",model:fenced.effectiveModel,systemInstructions:"JSON",input:"{}",structuredOutput:{name:"check",jsonSchema:schema}})).resolves.toMatchObject({output:{ok:true}});

    const invalidFetch = vi.fn()
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(responsesApiResponse({}));
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
      .mockResolvedValueOnce(responsesApiResponse({ ok: true }));
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
    expect(retryBody).toMatchObject({
      model: DEEPSEEK_DEFAULT_MODEL,
      reasoning: { effort: "none" },
      text: { format: { type: "json_schema", name: "check", schema } },
    });
    expect(retryBody.instructions).toContain("INTENTO FINAL 2/2");
    expect(retryBody.instructions).toContain("$.ok (expected boolean; actual missing");
    expect(retryBody.instructions).toContain("JSON Schema completo");
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.deepseek.com/responses");
  });

  it("reintenta una vez si DeepSeek devuelve texto en lugar de JSON", async () => {
    const schema={type:"object",required:["ok"],properties:{ok:{type:"boolean"}},additionalProperties:false} as const;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response("No pude preparar el objeto solicitado."))
      .mockResolvedValueOnce(responsesApiResponse({ ok: true }));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch });

    const result = await provider.generate({
      provider:"deepseek",
      model:provider.effectiveModel,
      systemInstructions:"JSON",
      input:"{}",
      structuredOutput:{name:"check",jsonSchema:schema},
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      output:{ok:true},
      structuredOutputDiagnostics:{
        attemptCount:2,
        recoveredAfterInvalidSchema:true,
        firstAttemptIssues:[{path:"$",expected:"valid JSON object",actual:"non-JSON text"}],
      },
    });
    const [, retryInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(retryInit.body)).instructions).toContain("INTENTO FINAL 2/2");
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

  it("acepta respuestas con bloques <think> y llaves de razonamiento", async () => {
    const thinkResponse = `<think>
Razonando sobre la oportunidad {"id": "item-1"} y evaluando scores.
</think>
\`\`\`json
{"ok": true}
\`\`\``;
    const fetchMock = vi.fn(async () => response(thinkResponse));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch });

    const result = await provider.generate<{ ok: boolean }>({
      provider: "deepseek",
      model: provider.effectiveModel,
      systemInstructions: "JSON",
      input: "{}",
      structuredOutput: {
        name: "check",
        jsonSchema: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" } } },
      },
    });

    expect(result.output).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("identifica truncamiento por límite de tokens (finish_reason=length) como quota_exceeded", async () => {
    const truncatedPayload = '{"items": [{"id": "opp-1", "name": "Incompleto", "scores": {"urgency": ';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: DEEPSEEK_DEFAULT_MODEL,
      choices: [{ finish_reason: "length", message: { content: truncatedPayload } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const provider = new DeepSeekProvider({ apiKey: "deepseek-test-key", fetch: fetchMock as typeof fetch });

    await expect(provider.generate({
      provider: "deepseek",
      model: provider.effectiveModel,
      systemInstructions: "JSON",
      input: "{}",
      structuredOutput: {
        name: "check",
        jsonSchema: { type: "object", required: ["items"], properties: { items: { type: "array" } } },
      },
    })).rejects.toMatchObject({
      code: "quota_exceeded",
      message: expect.stringContaining("finish_reason=length"),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

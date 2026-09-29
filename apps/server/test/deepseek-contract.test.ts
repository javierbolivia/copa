import { describe, expect, it, vi } from "vitest";

import { DEEPSEEK_DEFAULT_MODEL, DeepSeekProvider } from "../src/integrations/deepseek-provider.js";

/**
 * Fixtures mirror the documented `POST /chat/completions` contract for
 * `deepseek-v4-flash`: thinking mode is enabled by default, the chain of
 * thought is returned in `reasoning_content` next to `content`, `content` is
 * nullable, and `finish_reason` is `length` when `max_tokens` is exhausted.
 */
function documentedSuccess(overrides: {
  readonly content?: unknown;
  readonly reasoningContent?: string;
  readonly finishReason?: string;
} = {}) {
  return new Response(JSON.stringify({
    id: "chatcmpl-contract",
    object: "chat.completion",
    created: 1_775_000_000,
    model: DEEPSEEK_DEFAULT_MODEL,
    system_fingerprint: "fp_contract",
    choices: [{
      index: 0,
      finish_reason: overrides.finishReason ?? "stop",
      logprobs: null,
      message: {
        role: "assistant",
        content: overrides.content === undefined ? "Respuesta final acotada." : overrides.content,
        reasoning_content: overrides.reasoningContent ?? "Cadena de pensamiento documentada.",
      },
    }],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 8,
      prompt_cache_hit_tokens: 0,
      prompt_cache_miss_tokens: 11,
      total_tokens: 19,
      completion_tokens_details: { reasoning_tokens: 8 },
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function documentedResponsesSuccess(content: unknown) {
  return new Response(JSON.stringify({
    id: "resp-contract",
    object: "response",
    model: DEEPSEEK_DEFAULT_MODEL,
    status: "completed",
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: content }] }],
    usage: { input_tokens: 11, output_tokens: 8, total_tokens: 19 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function documentedError(status: number, code: string) {
  return new Response(JSON.stringify({ error: { message: "deepseek-secret-value", type: code, code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function provider(fetchImpl: unknown, options: { readonly thinking?: "enabled" | "disabled" } = {}) {
  return new DeepSeekProvider({
    apiKey: "deepseek-secret-value",
    fetch: fetchImpl as typeof fetch,
    ...options,
  });
}

const baseRequest = {
  provider: "deepseek" as const,
  model: DEEPSEEK_DEFAULT_MODEL,
  systemInstructions: "Responde de forma concisa.",
  input: "OK",
};

describe("contrato documentado de DeepSeek V4 Flash", () => {
  it("acepta una respuesta válida documentada con reasoning_content y usage detallado", async () => {
    const result = await provider(vi.fn(async () => documentedSuccess())).generate({ ...baseRequest, maxOutputTokens: 64 });

    expect(result).toMatchObject({
      provider: "deepseek",
      requestedModel: DEEPSEEK_DEFAULT_MODEL,
      reportedModel: DEEPSEEK_DEFAULT_MODEL,
      output: "Respuesta final acotada.",
      finishReason: "stop",
      usage: { inputTokens: 11, outputTokens: 8, usageKind: "provider_reported" },
    });
  });

  it("clasifica como empty_completion la truncación por presupuesto de tokens del modo pensamiento", async () => {
    const truncated = provider(vi.fn(async () => documentedSuccess({ content: null, finishReason: "length" })));

    await expect(truncated.generate({ ...baseRequest, maxOutputTokens: 8 })).rejects.toMatchObject({
      code: "empty_completion",
      status: undefined,
    });
    await truncated.generate({ ...baseRequest, maxOutputTokens: 8 }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      expect(message).toContain("length");
      expect(message).not.toContain("deepseek-secret-value");
      expect(message).not.toContain("Cadena de pensamiento documentada.");
    });
  });

  it("clasifica una cadena vacía sin finish_reason length como empty_completion", async () => {
    await expect(provider(vi.fn(async () => documentedSuccess({ content: "   ", finishReason: "stop" })))
      .generate(baseRequest)).rejects.toMatchObject({ code: "empty_completion" });
  });

  it("mantiene el modo no pensante fuera del cuerpo salvo que se configure explícitamente", async () => {
    const defaultFetch = vi.fn(async () => documentedSuccess());
    await provider(defaultFetch).generate({ ...baseRequest, maxOutputTokens: 64 });
    const [, defaultInit] = defaultFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(defaultInit.body))).not.toHaveProperty("thinking");

    const disabledFetch = vi.fn(async () => documentedSuccess());
    await provider(disabledFetch, { thinking: "disabled" }).generate({ ...baseRequest, maxOutputTokens: 64 });
    const [, disabledInit] = disabledFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(disabledInit.body))).toMatchObject({
      model: DEEPSEEK_DEFAULT_MODEL,
      thinking: { type: "disabled" },
      stream: false,
    });
  });

  it("normaliza los códigos de error documentados sin exponer el cuerpo remoto", async () => {
    const cases: readonly { readonly status: number; readonly code: string; readonly expected: string }[] = [
      { status: 401, code: "invalid_api_key", expected: "http_auth_error" },
      { status: 402, code: "insufficient_balance", expected: "http_balance_error" },
      { status: 429, code: "rate_limit_reached", expected: "http_rate_limit" },
      { status: 400, code: "invalid_request_error", expected: "http_provider_error" },
      { status: 500, code: "server_error", expected: "http_provider_error" },
      { status: 503, code: "server_overloaded", expected: "http_provider_error" },
    ];

    for (const { status, code, expected } of cases) {
      await expect(provider(vi.fn(async () => documentedError(status, code))).generate(baseRequest))
        .rejects.toMatchObject({ code: expected, status, message: expect.not.stringContaining("deepseek-secret-value") });
    }
  });

  it("distingue modelo no soportado, respuesta no JSON y esquema inválido", async () => {
    await expect(provider(vi.fn(async () => documentedError(400, "model_not_exist"))).generate(baseRequest))
      .rejects.toMatchObject({ code: "unsupported_model", status: 400 });

    await expect(provider(vi.fn(async () => new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } })))
      .generate(baseRequest)).rejects.toMatchObject({ code: "non_json_response" });

    await expect(provider(vi.fn(async () => new Response(JSON.stringify({ model: DEEPSEEK_DEFAULT_MODEL, choices: {} }), { status: 200, headers: { "content-type": "application/json" } })))
      .generate(baseRequest)).rejects.toMatchObject({ code: "invalid_schema" });

    await expect(provider(vi.fn()
      .mockResolvedValueOnce(documentedSuccess({ content: "no es json" }))
      .mockResolvedValueOnce(documentedResponsesSuccess("no es json")))
      .generate({ ...baseRequest, structuredOutput: { name: "check", jsonSchema: { type: "object" } } }))
      .rejects.toMatchObject({ code: "invalid_schema" });
  });

  it("clasifica el transporte fallido y el timeout sin reintentar", async () => {
    const failing = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(provider(failing).generate(baseRequest)).rejects.toMatchObject({ code: "transport_error", retryable: true });
    expect(failing).toHaveBeenCalledOnce();

    const aborting = vi.fn(async () => { throw new DOMException("aborted", "AbortError"); });
    await expect(provider(aborting).generate(baseRequest)).rejects.toMatchObject({ code: "timeout" });
    expect(aborting).toHaveBeenCalledOnce();
  });

  it("rechaza V4 Pro como unsupported_model antes de cualquier petición", async () => {
    const fetchMock = vi.fn();

    expect(() => new DeepSeekProvider({ apiKey: "deepseek-secret-value", model: " DeepSeek_V4_Pro ", fetch: fetchMock as typeof fetch }))
      .toThrow("DeepSeek V4 Pro no está permitido");
    await expect(provider(fetchMock).generate({ ...baseRequest, model: "deepseek-v4-pro" }))
      .rejects.toMatchObject({ code: "unsupported_model" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

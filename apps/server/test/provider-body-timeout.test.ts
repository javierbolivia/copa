import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../src/integrations/openai-provider.js";
import { GeminiProvider } from "../src/integrations/gemini-provider.js";
import { DeepSeekProvider } from "../src/integrations/deepseek-provider.js";
import { YouTubeAdapter } from "../src/integrations/youtube-adapter.js";
import { TavilyProvider } from "../src/integrations/tavily-provider.js";
import { ExaProvider } from "../src/integrations/exa-provider.js";
import { BraveSearchProvider } from "../src/integrations/brave-search-provider.js";
import { FirecrawlProvider } from "../src/integrations/firecrawl-provider.js";

type Options = { apiKey: string; fetch: typeof fetch; timeoutMs: number };
const request = { provider: "test", model: "test-model", systemInstructions: "Test", input: "Test" };
const cases: Array<{ name: string; run: (options: Options) => Promise<unknown> }> = [
  { name: "OpenAI", run: o => new OpenAIProvider(o).generate(request) },
  { name: "Gemini", run: o => new GeminiProvider(o).generate(request) },
  { name: "DeepSeek", run: o => new DeepSeekProvider(o).generate(request) },
  { name: "YouTube", run: o => new YouTubeAdapter(o).getVideo("test-video") },
  { name: "Tavily search", run: o => new TavilyProvider(o).search("test") },
  { name: "Tavily discover", run: o => new TavilyProvider(o).discover("test") },
  { name: "Exa search", run: o => new ExaProvider(o).search("test") },
  { name: "Exa discover", run: o => new ExaProvider(o).discover("test") },
  { name: "Brave", run: o => new BraveSearchProvider(o).discover("test") },
  { name: "Firecrawl search", run: o => new FirecrawlProvider(o).search("test") },
  { name: "Firecrawl discover", run: o => new FirecrawlProvider(o).discover("test") },
  { name: "Firecrawl scrape", run: o => new FirecrawlProvider(o).scrape("https://example.com") },
];

afterEach(() => vi.useRealTimers());
describe.each(cases)("$name response deadline", ({ run }) => {
  it.each([null, [], "unexpected", 42].map(body => ({ body })))("rejects an invalid JSON root ($body) as a provider error", async ({ body }) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body)));
    await expect(run({ apiKey: "fake", fetch: fetchMock, timeoutMs: 50 }))
      .rejects.toMatchObject({ name: "IntegrationError", code: expect.stringMatching(/^(invalid_response|invalid_schema)$/) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 503])("bounds stalled HTTP %s bodies after headers arrive", async status => {
    vi.useFakeTimers();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      signal = init!.signal!;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        stream = controller;
        signal!.addEventListener("abort", () => controller.error(signal!.reason), { once: true });
      } }), { status });
    });
    let error: unknown;
    let settled = false;
    const pending = run({ apiKey: "fake", fetch: fetchMock, timeoutMs: 50 })
      .catch(reason => { error = reason; }).finally(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(60);
    const settledAtDeadline = settled;
    const abortedAtDeadline = signal?.aborted;
    // Release the deliberately stalled fixture even when testing the broken implementation.
    if (!settled) stream.error(new Error("fixture cleanup"));
    await pending;
    expect(settledAtDeadline).toBe(true);
    expect(abortedAtDeadline).toBe(true);
    expect(error).toMatchObject({ code: "timeout", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { YouTubeTranscriptClient, type TranscriptFetcher } from "../src/integrations/youtube-transcript-client.js";

describe("YouTubeTranscriptClient", () => {
  it("normalizes timestamped caption fragments without a network call", async () => {
    const fetcher: TranscriptFetcher = { fetch: async () => [{ text: "  Ejercicio\nuno ", offset: 2.5, duration: 4, lang: "es" }, { text: "", offset: 7, duration: 1, lang: "es" }] };
    await expect(new YouTubeTranscriptClient(fetcher).fetch("abc12345678", ["es"])).resolves.toEqual({ status: "ready", language: "es", isGenerated: null, segments: [{ text: "Ejercicio uno", startSeconds: 2.5, endSeconds: 6.5 }] });
  });
  it("does not invoke a fetcher for an invalid id and keeps a missing transcript non-fatal", async () => {
    let calls = 0; const client = new YouTubeTranscriptClient({ fetch: async () => { calls++; return []; } });
    await expect(client.fetch("bad id")).resolves.toMatchObject({ status: "video_unavailable", segments: [] });
    await expect(client.fetch("abc12345678")).resolves.toMatchObject({ status: "unavailable", segments: [] });
    expect(calls).toBe(1);
  });
  it("tries declared language preferences before reporting an unavailable language", async () => {
    const client = new YouTubeTranscriptClient({ fetch: async (_id, language) => language === "es" ? [{ text: "hola", offset: 0, duration: 1, lang: "es" }] : Promise.reject(new Error("unexpected")) });
    await expect(client.fetch("abc12345678", ["es"])).resolves.toMatchObject({ status: "ready", language: "es" });
  });
});

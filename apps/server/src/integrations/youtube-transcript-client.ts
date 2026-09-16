import {
  YoutubeTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError,
  type TranscriptResponse,
} from "youtube-transcript";

export type TranscriptFetchStatus = "ready" | "unavailable" | "language_unavailable" | "rate_limited" | "video_unavailable" | "temporary_error";
export interface YouTubeTranscriptSegment { readonly text: string; readonly startSeconds: number; readonly endSeconds: number; }
export interface YouTubeTranscriptResult { readonly status: TranscriptFetchStatus; readonly language: string | null; readonly isGenerated: boolean | null; readonly segments: readonly YouTubeTranscriptSegment[]; readonly reason?: string; }
export interface TranscriptFetcher { fetch(videoId: string, language?: string): Promise<readonly TranscriptResponse[]>; }

const defaultFetcher: TranscriptFetcher = { fetch: (videoId, language) => YoutubeTranscript.fetchTranscript(videoId, language ? { lang: language } : undefined) };

function normalize(segments: readonly TranscriptResponse[]): readonly YouTubeTranscriptSegment[] {
  return segments.flatMap((segment) => {
    const text = segment.text.normalize("NFKC").replace(/\s+/g, " ").trim();
    const startSeconds = Number(segment.offset), duration = Number(segment.duration);
    if (!text || !Number.isFinite(startSeconds) || !Number.isFinite(duration) || startSeconds < 0 || duration <= 0) return [];
    return [{ text, startSeconds, endSeconds: startSeconds + duration }];
  });
}

/**
 * Narrow public-caption adapter. It does not authenticate, use proxies, bypass
 * restrictions, or make a transcript a prerequisite for the YouTube import.
 */
export class YouTubeTranscriptClient {
  constructor(private readonly fetcher: TranscriptFetcher = defaultFetcher) {}
  async fetch(videoId: string, preferredLanguages: readonly string[] = []): Promise<YouTubeTranscriptResult> {
    const id = videoId.trim();
    if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return { status: "video_unavailable", language: null, isGenerated: null, segments: [], reason: "invalid_video_id" };
    const languages = preferredLanguages.map((language) => language.trim()).filter(Boolean);
    let lastError: unknown;
    for (const language of languages.length ? languages : [undefined]) {
      try {
        const raw = await this.fetcher.fetch(id, language);
        const segments = normalize(raw);
        if (segments.length === 0) return { status: "unavailable", language: language ?? null, isGenerated: null, segments: [], reason: "empty_transcript" };
        return { status: "ready", language: raw[0]?.lang ?? language ?? null, isGenerated: null, segments };
      } catch (error) { lastError = error; if (!(error instanceof YoutubeTranscriptNotAvailableLanguageError)) break; }
    }
    if (lastError instanceof YoutubeTranscriptNotAvailableLanguageError) return { status: "language_unavailable", language: null, isGenerated: null, segments: [], reason: lastError.message };
    if (lastError instanceof YoutubeTranscriptTooManyRequestError) return { status: "rate_limited", language: null, isGenerated: null, segments: [], reason: lastError.message };
    if (lastError instanceof YoutubeTranscriptVideoUnavailableError || lastError instanceof YoutubeTranscriptDisabledError) return { status: "video_unavailable", language: null, isGenerated: null, segments: [], reason: lastError?.message };
    return { status: "temporary_error", language: null, isGenerated: null, segments: [], reason: lastError instanceof Error ? lastError.message : "transcript_fetch_failed" };
  }
}

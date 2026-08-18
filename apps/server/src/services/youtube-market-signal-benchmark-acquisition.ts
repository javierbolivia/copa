import type { NormalizedMarketSignal } from "@our-platform/shared";
import type { YouTubeAdapter } from "../integrations/youtube-adapter.js";
import type { MarketBenchmarkAcquisition } from "./market-intelligence-benchmark.js";
import { adaptYouTubeMarketSignals } from "./youtube-market-signal-adapter.js";

export interface YouTubeBenchmarkAcquisitionInput {
  readonly query: string;
  /** Bounded before the first network request; benchmark maximum is ten. */
  readonly maxSignals?: number;
}

function boundedSignalCount(value: number | undefined): number {
  return Math.min(10, Math.max(1, Math.floor(value ?? 10)));
}

/**
 * Bounded benchmark-only acquisition: one one-result search, one selected
 * video, one bounded comment-thread page, and never an extra reply request or
 * persistence. The reported latency includes acquisition and normalization.
 */
export async function acquireYouTubeBenchmarkSignals(
  adapter: Pick<YouTubeAdapter, "searchVideos" | "getVideo" | "listCommentThreads">,
  input: Readonly<YouTubeBenchmarkAcquisitionInput>,
): Promise<MarketBenchmarkAcquisition> {
  const maxSignals = boundedSignalCount(input.maxSignals);
  const startedAt = Date.now();
  const search = await adapter.searchVideos(input.query, undefined, 1);
  const selected = search.items[0];
  if (!selected) {
    return { requested: maxSignals, returned: 0, valid: 0, signals: [], latencyMs: Date.now() - startedAt, usage: null, credits: null };
  }

  const video = await adapter.getVideo(selected.videoId);
  if (!video) {
    return { requested: maxSignals, returned: 0, valid: 0, signals: [], latencyMs: Date.now() - startedAt, usage: null, credits: null };
  }
  const threads = await adapter.listCommentThreads({ videoId: video.videoId, maxResults: maxSignals });
  const signals = adaptYouTubeMarketSignals({
    video,
    query: input.query,
    threads: threads.items.slice(0, maxSignals),
  }).signals.slice(0, maxSignals);
  return {
    requested: maxSignals,
    returned: threads.items.length,
    valid: signals.length,
    signals,
    latencyMs: Date.now() - startedAt,
    usage: null,
    credits: null,
  };
}

export type { NormalizedMarketSignal };

import { MARKET_RESEARCH_BUDGETS, type NormalizedMarketSignal } from "@our-platform/shared";

import type {
  YouTubeAdapter,
  YouTubeChannel,
  YouTubeComment,
  YouTubeSearchResult,
  YouTubeThread,
  YouTubeVideo,
} from "../integrations/youtube-adapter.js";
import { adaptYouTubeMarketSignals } from "./youtube-market-signal-adapter.js";
import {
  YOUTUBE_COMMENT_REJECTIONS,
  YouTubeEvidenceDeduper,
  youtubeCommentRejection,
  type YouTubeCommentRejection,
} from "./youtube-evidence-quality.js";
import {
  deriveYouTubeResearchQueries,
  type YouTubeResearchAngle,
  type YouTubeResearchQuery,
  type YouTubeResearchQueryLanguage,
} from "./youtube-research-queries.js";

/**
 * The client surface used for deep acquisition. Search, single-video lookup and
 * comment threads are required; the batch metadata and reply endpoints are
 * optional so an environment (or a test double) without them degrades to a
 * shallower but still bounded acquisition instead of failing.
 */
export type YouTubeDeepResearchClient =
  Pick<YouTubeAdapter, "searchVideos" | "getVideo" | "listCommentThreads">
  & Partial<Pick<YouTubeAdapter, "getVideos" | "getChannels" | "listReplies">>;

/**
 * Why acquisition stopped. Only deterministic local conditions are reported;
 * no semantic or saturation claim is made in this phase.
 */
export const YOUTUBE_ACQUISITION_STOP_REASONS = [
  "target_reached",
  "comment_limit_reached",
  "video_limit_reached",
  "acquisition_saturation",
  "videos_exhausted",
  "no_videos",
  "provider_error",
] as const;
export type YouTubeAcquisitionStopReason = (typeof YOUTUBE_ACQUISITION_STOP_REASONS)[number];

/** One discovered video plus its discovery provenance and declared metadata. */
export interface YouTubeResearchVideoCandidate {
  readonly videoId: string;
  readonly title: string;
  readonly description: string;
  readonly channelId: string;
  readonly channelTitle: string;
  readonly publishedAt: string;
  readonly url: string;
  /** The exact query string that discovered this video first. */
  readonly query: string;
  readonly angle: YouTubeResearchAngle;
  readonly queryLanguage: YouTubeResearchQueryLanguage;
  readonly viewCount: number | null;
  readonly likeCount: number | null;
  readonly commentCount: number | null;
  readonly duration: string | null;
  readonly tags: readonly string[];
  readonly categoryId: string | null;
  /** Declared by YouTube only; never inferred from region or query language. */
  readonly defaultAudioLanguage: string | null;
  readonly defaultLanguage: string | null;
  readonly channelCountry: string | null;
  readonly enriched: boolean;
}

export interface YouTubeDeepAcquisitionMetrics {
  readonly queries: number;
  readonly videosDiscovered: number;
  readonly videosSelected: number;
  readonly videosWithComments: number;
  readonly videosSkipped: number;
  readonly commentsFetched: number;
  readonly commentsValid: number;
  readonly commentsUnique: number;
  readonly commentsDiscarded: number;
  /** Records the signal adapter could not validate at all. */
  readonly structurallyRejected: number;
  readonly qualityRejected: number;
  readonly qualityRejections: Readonly<Record<YouTubeCommentRejection, number>>;
  readonly exactDuplicatesRemoved: number;
  readonly nearDuplicatesRemoved: number;
  /** Retained items that are replies rather than top-level comments. */
  readonly repliesRetained: number;
  readonly distinctVideosRepresented: number;
  readonly distinctChannelsRepresented: number;
  readonly maxCommentsFromOneVideo: number;
  readonly maxCommentsFromOneChannel: number;
  /** Consecutive low-yield batches at the moment acquisition stopped. */
  readonly lowYieldBatches: number;
  readonly repliesFetched: number;
  readonly searchRequests: number;
  readonly enrichmentRequests: number;
  readonly commentRequests: number;
  readonly replyRequests: number;
  readonly channelsRepresented: number;
  /** Distinct declared audio/default languages; empty when YouTube declared none. */
  readonly declaredLanguages: readonly string[];
  readonly queryLanguages: readonly YouTubeResearchQueryLanguage[];
  readonly stopReason: YouTubeAcquisitionStopReason;
}

export interface YouTubeDeepAcquisition {
  readonly requested: number;
  readonly returned: number;
  readonly valid: number;
  readonly signals: readonly NormalizedMarketSignal[];
  readonly latencyMs: number;
  readonly usage: number | null;
  readonly credits: number | null;
  readonly metrics: YouTubeDeepAcquisitionMetrics;
  /** Selected candidates, retained for later phases and for auditability. */
  readonly candidates: readonly YouTubeResearchVideoCandidate[];
}

export interface YouTubeDeepResearchInput {
  readonly topic: string;
}

const VIDEO_ID = /^[\w-]{11}$/u;
const COMMENT_SOURCE_PREFIX = "youtube-comment:";

function emptyRejectionTally(): Record<YouTubeCommentRejection, number> {
  return Object.fromEntries(YOUTUBE_COMMENT_REJECTIONS.map((reason) => [reason, 0])) as Record<YouTubeCommentRejection, number>;
}

function commentIdOf(sourceId: string | null): string {
  return sourceId !== null && sourceId.startsWith(COMMENT_SOURCE_PREFIX)
    ? sourceId.slice(COMMENT_SOURCE_PREFIX.length)
    : "";
}

interface CommentOccurrence {
  readonly author: string | undefined;
  readonly isReply: boolean;
}

/**
 * Maps comment IDs back to the raw record so the quality gate can see the
 * author and whether the item is a reply. Values are read defensively because
 * the payload comes from an external provider.
 */
function commentOccurrenceIndex(
  threads: readonly YouTubeThread[],
  extraReplies: ReadonlyMap<string, readonly YouTubeComment[]>,
): ReadonlyMap<string, CommentOccurrence> {
  const index = new Map<string, CommentOccurrence>();
  const register = (comment: YouTubeComment, isReply: boolean): void => {
    if (typeof comment?.commentId !== "string") return;
    index.set(comment.commentId, {
      author: typeof comment.author === "string" ? comment.author : undefined,
      isReply,
    });
  };
  for (const thread of threads) {
    register(thread.topLevelComment, false);
    for (const reply of thread.embeddedReplies) register(reply, true);
  }
  for (const replies of extraReplies.values()) {
    for (const reply of replies) register(reply, true);
  }
  return index;
}

function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function candidateFrom(
  result: YouTubeSearchResult,
  query: Readonly<YouTubeResearchQuery>,
): YouTubeResearchVideoCandidate {
  return {
    videoId: result.videoId,
    title: result.title,
    description: result.description,
    channelId: result.channelId,
    channelTitle: result.channelTitle,
    publishedAt: result.publishedAt,
    url: videoUrl(result.videoId),
    query: query.query,
    angle: query.angle,
    queryLanguage: query.language,
    viewCount: null,
    likeCount: null,
    commentCount: null,
    duration: null,
    tags: [],
    categoryId: null,
    defaultAudioLanguage: null,
    defaultLanguage: null,
    channelCountry: null,
    enriched: false,
  };
}

function enrichCandidate(
  candidate: YouTubeResearchVideoCandidate,
  video: YouTubeVideo | undefined,
  channel: YouTubeChannel | undefined,
): YouTubeResearchVideoCandidate {
  if (video === undefined && channel === undefined) return candidate;
  return {
    ...candidate,
    ...(video === undefined ? {} : {
      title: video.title,
      description: video.description ?? candidate.description,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      viewCount: video.viewCount ?? null,
      likeCount: video.likeCount ?? null,
      commentCount: video.commentCount ?? null,
      duration: video.duration ?? null,
      tags: video.tags ?? [],
      categoryId: video.categoryId ?? null,
      defaultAudioLanguage: video.defaultAudioLanguage ?? null,
      defaultLanguage: video.defaultLanguage ?? null,
    }),
    ...(channel?.country === undefined ? {} : { channelCountry: channel.country }),
    enriched: video !== undefined,
  };
}

/** The adapter needs a full video record; the search result is the safe fallback. */
function videoRecord(
  candidate: YouTubeResearchVideoCandidate,
  enriched: YouTubeVideo | undefined,
): YouTubeVideo {
  if (enriched !== undefined) return enriched;
  return {
    videoId: candidate.videoId,
    title: candidate.title,
    channelId: candidate.channelId,
    channelTitle: candidate.channelTitle,
    publishedAt: candidate.publishedAt,
    ...(candidate.description === "" ? {} : { description: candidate.description }),
  };
}

/**
 * Channel-diverse selection. Candidates are grouped by channel in discovery
 * order and then taken round-robin, so a prolific channel cannot consume the
 * video budget before other channels are represented.
 */
export function selectDiverseYouTubeCandidates(
  candidates: readonly YouTubeResearchVideoCandidate[],
  limits: { readonly maxVideos: number; readonly maxPerChannel: number },
): readonly YouTubeResearchVideoCandidate[] {
  const byChannel = new Map<string, YouTubeResearchVideoCandidate[]>();
  for (const candidate of candidates) {
    const bucket = byChannel.get(candidate.channelId);
    if (bucket === undefined) byChannel.set(candidate.channelId, [candidate]);
    else bucket.push(candidate);
  }
  const selected: YouTubeResearchVideoCandidate[] = [];
  const queues = [...byChannel.values()];
  for (let round = 0; round < limits.maxPerChannel; round += 1) {
    for (const queue of queues) {
      if (selected.length >= limits.maxVideos) return selected;
      const candidate = queue[round];
      if (candidate !== undefined) selected.push(candidate);
    }
  }
  return selected;
}

/** Trims embedded replies so one thread cannot fill a video's whole allowance. */
function trimThread(thread: YouTubeThread, maxReplies: number): YouTubeThread {
  return thread.embeddedReplies.length <= maxReplies
    ? thread
    : { ...thread, embeddedReplies: thread.embeddedReplies.slice(0, maxReplies) };
}

function occurrenceCount(thread: YouTubeThread): number {
  return 1 + thread.embeddedReplies.length;
}

interface VideoCommentPage {
  readonly threads: readonly YouTubeThread[];
  /** Raw occurrences the API returned, before trimming or validation. */
  readonly fetched: number;
  readonly requests: number;
  readonly unavailable: boolean;
}

/**
 * Bounded comment-thread pagination for one video: at most
 * `youtubeMaxCommentPagesPerVideo` pages, stopping as soon as the video's
 * allowance is covered or YouTube stops returning a page token. A video with
 * comments disabled or otherwise unavailable is skipped, never retried.
 */
async function fetchVideoThreads(
  client: YouTubeDeepResearchClient,
  videoId: string,
  allowance: number,
): Promise<VideoCommentPage> {
  const threads: YouTubeThread[] = [];
  let fetched = 0;
  let requests = 0;
  let pageToken: string | undefined;
  for (let page = 0; page < MARKET_RESEARCH_BUDGETS.youtubeMaxCommentPagesPerVideo; page += 1) {
    let response: Awaited<ReturnType<YouTubeDeepResearchClient["listCommentThreads"]>>;
    try {
      requests += 1;
      response = await client.listCommentThreads({
        videoId,
        maxResults: MARKET_RESEARCH_BUDGETS.youtubeCommentPageSize,
        ...(pageToken === undefined ? {} : { pageToken }),
      });
    } catch {
      // Comments disabled or unavailable: skip this video without retrying.
      return { threads, fetched, requests, unavailable: threads.length === 0 };
    }
    for (const thread of response.items) {
      fetched += occurrenceCount(thread);
      threads.push(trimThread(thread, MARKET_RESEARCH_BUDGETS.youtubeMaxRepliesPerThread));
    }
    const covered = threads.reduce((total, thread) => total + occurrenceCount(thread), 0);
    pageToken = response.nextPageToken;
    if (covered >= allowance || pageToken === undefined) break;
  }
  return { threads, fetched, requests, unavailable: false };
}

/**
 * One bounded, adaptive YouTube acquisition pass.
 *
 * Discovery fans the topic out into deterministic Spanish, English and global
 * query lanes, dedupes videos across all lanes, then selects a channel-diverse
 * subset within the hard video ceiling. Comments are acquired per video under a
 * per-video ceiling and a global ceiling, with bounded pagination and bounded
 * reply expansion. Every retained comment keeps its full provenance through the
 * existing MarketSignal adapter; no model is invoked anywhere in this path.
 */
export async function acquireYouTubeDeepResearchSignals(
  client: YouTubeDeepResearchClient,
  input: Readonly<YouTubeDeepResearchInput>,
): Promise<YouTubeDeepAcquisition> {
  const startedAt = Date.now();
  const requested = MARKET_RESEARCH_BUDGETS.youtubeTargetComments;
  const queries = deriveYouTubeResearchQueries(input.topic);

  // ---- Discovery: one bounded page per query lane, deduped by video ID. ----
  const discovered = new Map<string, YouTubeResearchVideoCandidate>();
  let searchRequests = 0;
  let discoveryFailed = false;
  for (const query of queries) {
    if (discovered.size >= MARKET_RESEARCH_BUDGETS.youtubeMaxCandidates) break;
    try {
      searchRequests += 1;
      const page = await client.searchVideos(
        query.query,
        undefined,
        MARKET_RESEARCH_BUDGETS.youtubeSearchResultsPerQuery,
      );
      for (const result of page.items) {
        if (discovered.size >= MARKET_RESEARCH_BUDGETS.youtubeMaxCandidates) break;
        // Global results are kept regardless of language; only unusable IDs drop.
        if (!VIDEO_ID.test(result.videoId) || discovered.has(result.videoId)) continue;
        discovered.set(result.videoId, candidateFrom(result, query));
      }
    } catch (error) {
      // No retries: a failing search ends discovery and keeps what was found.
      discoveryFailed = true;
      if (discovered.size === 0) throw error;
      break;
    }
  }

  const emptyMetrics = (stopReason: YouTubeAcquisitionStopReason): YouTubeDeepAcquisitionMetrics => ({
    queries: queries.length,
    videosDiscovered: discovered.size,
    videosSelected: 0,
    videosWithComments: 0,
    videosSkipped: 0,
    commentsFetched: 0,
    commentsValid: 0,
    commentsUnique: 0,
    commentsDiscarded: 0,
    structurallyRejected: 0,
    qualityRejected: 0,
    qualityRejections: emptyRejectionTally(),
    exactDuplicatesRemoved: 0,
    nearDuplicatesRemoved: 0,
    repliesRetained: 0,
    distinctVideosRepresented: 0,
    distinctChannelsRepresented: 0,
    maxCommentsFromOneVideo: 0,
    maxCommentsFromOneChannel: 0,
    lowYieldBatches: 0,
    repliesFetched: 0,
    searchRequests,
    enrichmentRequests: 0,
    commentRequests: 0,
    replyRequests: 0,
    channelsRepresented: 0,
    declaredLanguages: [],
    queryLanguages: [...new Set(queries.map((query) => query.language))],
    stopReason,
  });

  if (discovered.size === 0) {
    return {
      requested, returned: 0, valid: 0, signals: [], latencyMs: Date.now() - startedAt,
      usage: null, credits: null,
      metrics: emptyMetrics(discoveryFailed ? "provider_error" : "no_videos"),
      candidates: [],
    };
  }

  const selectedCandidates = selectDiverseYouTubeCandidates([...discovered.values()], {
    maxVideos: MARKET_RESEARCH_BUDGETS.youtubeMaxVideos,
    maxPerChannel: MARKET_RESEARCH_BUDGETS.youtubeMaxVideosPerChannel,
  });

  // ---- Enrichment: bounded batch metadata, never per-comment lookups. ----
  const videos = new Map<string, YouTubeVideo>();
  const channels = new Map<string, YouTubeChannel>();
  let enrichmentRequests = 0;
  const videoIds = selectedCandidates.map((candidate) => candidate.videoId);
  if (client.getVideos !== undefined) {
    for (let index = 0; index < videoIds.length; index += 50) {
      try {
        enrichmentRequests += 1;
        for (const video of await client.getVideos(videoIds.slice(index, index + 50))) {
          videos.set(video.videoId, video);
        }
      } catch {
        // Enrichment is optional: acquisition continues with search metadata.
      }
    }
  }
  if (client.getChannels !== undefined) {
    const channelIds = [...new Set(selectedCandidates.map((candidate) => candidate.channelId))].slice(0, 50);
    if (channelIds.length > 0) {
      try {
        enrichmentRequests += 1;
        for (const channel of await client.getChannels(channelIds)) channels.set(channel.channelId, channel);
      } catch {
        // Channel country stays null rather than being guessed.
      }
    }
  }

  const candidates = selectedCandidates.map((candidate) =>
    enrichCandidate(candidate, videos.get(candidate.videoId), channels.get(candidate.channelId)));

  // ---- Comment acquisition under per-video, global and raw ceilings. ----
  const signals: NormalizedMarketSignal[] = [];
  const uniqueKeys = new Set<string>();
  const deduper = new YouTubeEvidenceDeduper();
  const qualityRejections = emptyRejectionTally();
  const retainedByVideo = new Map<string, number>();
  const retainedByChannel = new Map<string, number>();
  let commentsFetched = 0;
  let repliesFetched = 0;
  let commentRequests = 0;
  let replyRequests = 0;
  let videosWithComments = 0;
  let videosSkipped = 0;
  let processedVideos = 0;
  let structurallyRejected = 0;
  let qualityRejected = 0;
  let exactDuplicatesRemoved = 0;
  let nearDuplicatesRemoved = 0;
  let repliesRetained = 0;
  let lowYieldBatches = 0;
  let stopReason: YouTubeAcquisitionStopReason = "videos_exhausted";

  for (const candidate of candidates) {
    if (signals.length >= MARKET_RESEARCH_BUDGETS.youtubeMaxComments) { stopReason = "comment_limit_reached"; break; }
    if (commentsFetched >= MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments) { stopReason = "comment_limit_reached"; break; }
    if (signals.length >= MARKET_RESEARCH_BUDGETS.youtubeTargetComments) { stopReason = "target_reached"; break; }
    if (processedVideos >= MARKET_RESEARCH_BUDGETS.youtubeMaxVideos) { stopReason = "video_limit_reached"; break; }
    processedVideos += 1;

    const allowance = Math.min(
      MARKET_RESEARCH_BUDGETS.youtubeMaxCommentsPerVideo,
      MARKET_RESEARCH_BUDGETS.youtubeMaxComments - signals.length,
    );
    if (allowance <= 0) { stopReason = "comment_limit_reached"; break; }

    const page = await fetchVideoThreads(client, candidate.videoId, allowance);
    commentsFetched += page.fetched;
    commentRequests += page.requests;
    if (page.threads.length === 0) {
      videosSkipped += 1;
      continue;
    }

    // Bounded reply expansion: one page per thread, only while the video still
    // has allowance and the run still has reply-request budget.
    const extraReplies = new Map<string, readonly YouTubeComment[]>();
    if (client.listReplies !== undefined) {
      let covered = page.threads.reduce((total, thread) => total + occurrenceCount(thread), 0);
      for (const thread of page.threads) {
        if (covered >= allowance) break;
        if (replyRequests >= MARKET_RESEARCH_BUDGETS.youtubeMaxReplyRequests) break;
        if (thread.totalReplyCount <= thread.embeddedReplies.length) continue;
        try {
          replyRequests += 1;
          const replies = await client.listReplies({
            parentCommentId: thread.topLevelComment.commentId,
            maxResults: MARKET_RESEARCH_BUDGETS.youtubeMaxRepliesPerThread,
          });
          const bounded = replies.items.slice(0, MARKET_RESEARCH_BUDGETS.youtubeMaxRepliesPerThread);
          if (bounded.length === 0) continue;
          extraReplies.set(thread.topLevelComment.commentId, bounded);
          repliesFetched += bounded.length;
          commentsFetched += bounded.length;
          covered += bounded.length;
        } catch {
          // Replies are optional enrichment; never retried.
          break;
        }
      }
    }

    const adaptation = adaptYouTubeMarketSignals({
      video: videoRecord(candidate, videos.get(candidate.videoId)),
      query: candidate.query,
      threads: page.threads,
      discovery: {
        angle: candidate.angle,
        language: candidate.queryLanguage,
        declaredLanguage: candidate.defaultAudioLanguage ?? candidate.defaultLanguage,
        channelCountry: candidate.channelCountry,
      },
      ...(extraReplies.size === 0 ? {} : { extraReplies }),
    });
    structurallyRejected += adaptation.audit.rejected.length;

    // Quality and dedupe run before anything is retained, so the comment target
    // counts usable unique evidence rather than raw fetched comments.
    const occurrences = commentOccurrenceIndex(page.threads, extraReplies);
    const declaredLanguage = candidate.defaultAudioLanguage ?? candidate.defaultLanguage;
    let retainedForVideo = 0;
    let newUnique = 0;
    for (const signal of adaptation.signals) {
      if (retainedForVideo >= allowance) break;
      if (signals.length >= MARKET_RESEARCH_BUDGETS.youtubeMaxComments) break;
      const occurrence = occurrences.get(commentIdOf(signal.sourceId));
      const rejection = youtubeCommentRejection({
        text: signal.text,
        author: occurrence?.author,
        channelTitle: candidate.channelTitle,
      });
      if (rejection !== null) {
        qualityRejected += 1;
        qualityRejections[rejection] += 1;
        continue;
      }
      const verdict = deduper.classify({ text: signal.text, language: declaredLanguage });
      if (verdict === "exact_duplicate") { exactDuplicatesRemoved += 1; continue; }
      if (verdict === "near_duplicate") { nearDuplicatesRemoved += 1; continue; }
      signals.push(signal);
      uniqueKeys.add(signal.sourceId ?? signal.url ?? signal.text);
      retainedForVideo += 1;
      newUnique += 1;
      if (occurrence?.isReply === true) repliesRetained += 1;
    }
    if (retainedForVideo > 0) {
      videosWithComments += 1;
      retainedByVideo.set(candidate.videoId, retainedForVideo);
      retainedByChannel.set(candidate.channelId, (retainedByChannel.get(candidate.channelId) ?? 0) + retainedForVideo);
    }

    // Acquisition saturation: only videos that actually returned comments count
    // toward the window, and several consecutive low-yield batches are required.
    if (newUnique >= MARKET_RESEARCH_BUDGETS.youtubeMinNewUniquePerBatch) {
      lowYieldBatches = 0;
    } else {
      lowYieldBatches += 1;
      if (lowYieldBatches >= MARKET_RESEARCH_BUDGETS.youtubeSaturationBatches) {
        stopReason = "acquisition_saturation";
        break;
      }
    }
  }

  if (signals.length >= MARKET_RESEARCH_BUDGETS.youtubeMaxComments) stopReason = "comment_limit_reached";
  else if (stopReason === "videos_exhausted" && signals.length >= MARKET_RESEARCH_BUDGETS.youtubeTargetComments) {
    stopReason = "target_reached";
  }

  const declaredLanguages = [...new Set(candidates.flatMap((candidate) =>
    [candidate.defaultAudioLanguage, candidate.defaultLanguage].filter((value): value is string => value !== null)))].sort();

  return {
    requested,
    returned: commentsFetched,
    valid: signals.length,
    signals,
    latencyMs: Date.now() - startedAt,
    usage: null,
    credits: null,
    metrics: {
      queries: queries.length,
      videosDiscovered: discovered.size,
      videosSelected: candidates.length,
      videosWithComments,
      videosSkipped,
      commentsFetched,
      commentsValid: signals.length,
      commentsUnique: uniqueKeys.size,
      commentsDiscarded: Math.max(0, commentsFetched - signals.length),
      structurallyRejected,
      qualityRejected,
      qualityRejections,
      exactDuplicatesRemoved,
      nearDuplicatesRemoved,
      repliesRetained,
      distinctVideosRepresented: retainedByVideo.size,
      distinctChannelsRepresented: retainedByChannel.size,
      maxCommentsFromOneVideo: Math.max(0, ...retainedByVideo.values()),
      maxCommentsFromOneChannel: Math.max(0, ...retainedByChannel.values()),
      lowYieldBatches,
      repliesFetched,
      searchRequests,
      enrichmentRequests,
      commentRequests,
      replyRequests,
      channelsRepresented: new Set(candidates.slice(0, processedVideos).map((candidate) => candidate.channelId)).size,
      declaredLanguages,
      queryLanguages: [...new Set(queries.map((query) => query.language))],
      stopReason,
    },
    candidates,
  };
}

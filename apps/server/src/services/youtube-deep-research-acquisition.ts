import {
  MARKET_RESEARCH_BUDGETS,
  MARKET_RESEARCH_YOUTUBE_RELEVANCE_GATE_VERSION,
  type MarketResearchYouTubeRelevanceProvenance,
  type MarketResearchYouTubeRelevanceReview,
  type MarketResearchYouTubeVideoDecisionAudit,
  type NormalizedMarketSignal,
  type YouTubeQueryPlan,
  type YouTubeQueryPlanComparison,
} from "@our-platform/shared";

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
import type { YouTubeRelevanceReviewBatch, YouTubeRelevanceReviewer } from "./youtube-relevance-reviewer.js";
import {
  assessYouTubeCommentRelevance,
  assessYouTubeVideoRelevance,
  resolveYouTubeMinimumDurationSeconds,
  topicTerms,
  type YouTubeVideoRelevance,
} from "./youtube-research-relevance.js";
import {
  deriveYouTubeResearchQueries,
  type YouTubeResearchAngle,
  type YouTubeResearchQuery,
  type YouTubeResearchQueryLanguage,
} from "./youtube-research-queries.js";

/**
 * Search and comment threads are required. The legacy single-video lookup
 * remains in the client contract for compatibility but is intentionally not
 * used here; batch/channel metadata and replies are optional. Missing batch
 * records fail only their candidates without additional metadata requests.
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
  /** Full final gate provenance, populated only for eligible videos. */
  readonly relevance: MarketResearchYouTubeRelevanceProvenance | null;
  readonly enriched: boolean;
}

export interface YouTubeDeepAcquisitionMetrics {
  readonly queries: number;
  readonly queryPlanComparison?: YouTubeQueryPlanComparison;
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
  readonly videoMetadataFailures: number;
  readonly videoDurationRejects: number;
  readonly deterministicRelevantVideos: number;
  readonly deterministicBorderlineVideos: number;
  readonly deterministicIrrelevantVideos: number;
  readonly successfulBorderlineReviews: number;
  readonly borderlineReviewerFailures: number;
  readonly finalRelevantVideos: number;
  readonly researchRelevantComments: number;
  readonly researchIrrelevantComments: number;
  readonly creatorPromotionalCommentsExcluded: number;
  readonly relevanceReviewerAttempts: number;
  readonly relevanceReviewerFallbackAttempts: number;
  readonly relevanceReviewerInputTokens: number;
  readonly relevanceReviewerOutputTokens: number;
  readonly videoRelevanceDecisionAudit: MarketResearchYouTubeVideoDecisionAudit[];
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
  /** Proposed plan is telemetry only; discovery continues to use the current plan. */
  readonly shadowQueryPlan?: YouTubeQueryPlan;
  readonly youtubeMinimumDurationSeconds?: number;
  /** Optional bounded review of deterministic borderline video metadata only. */
  readonly relevanceReviewer?: YouTubeRelevanceReviewer;
}

const VIDEO_ID = /^[\w-]{11}$/u;
const COMMENT_SOURCE_PREFIX = "youtube-comment:";

interface AssessedVideoCandidate {
  readonly candidate: YouTubeResearchVideoCandidate;
  readonly assessment: YouTubeVideoRelevance;
}

function emptyReviewBatch(): YouTubeRelevanceReviewBatch {
  return {
    results: new Map(),
    attempts: 0,
    fallbackAttempts: 0,
    successes: 0,
    failures: 0,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function failedReviewBatch(videoIds: readonly string[]): YouTubeRelevanceReviewBatch {
  const failure: MarketResearchYouTubeRelevanceReview = {
    decision: null,
    provider: null,
    model: null,
    fallback: false,
    reason: "fail_closed:reviewer_unhandled_failure",
    matchedAspects: [],
    failure: "reviewer_unhandled_failure",
  };
  return {
    results: new Map(videoIds.map((videoId) => [videoId, failure])),
    attempts: 0,
    fallbackAttempts: 0,
    successes: 0,
    failures: videoIds.length,
    inputTokens: 0,
    outputTokens: 0,
  };
}

function relevanceProvenance(
  assessment: YouTubeVideoRelevance,
  minimumDurationSeconds: number,
  reviewer: MarketResearchYouTubeRelevanceProvenance["reviewer"],
  eligible: boolean,
  rejectionReason: string | null,
): MarketResearchYouTubeRelevanceProvenance {
  return {
    version: MARKET_RESEARCH_YOUTUBE_RELEVANCE_GATE_VERSION,
    deterministic: {
      decision: assessment.decision,
      reason: assessment.reason,
      matchedTerms: [...assessment.matchedTerms],
      durationSeconds: assessment.durationSeconds,
      minimumDurationSeconds,
    },
    reviewer,
    final: { eligible, rejectionReason },
  };
}

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
    relevance: null,
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

/** Trims embedded replies to the configured per-thread and remaining raw limits. */
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
  /** Raw thread/reply occurrences retained for processing after hard limits. */
  readonly fetched: number;
  readonly requests: number;
  readonly unavailable: boolean;
}

/**
 * Bounded comment-thread pagination for one video: at most
 * `youtubeMaxCommentPagesPerVideo` pages, stopping as soon as the video's
 * allowance is covered, the run's remaining raw allowance is exhausted, or
 * YouTube stops returning a page token. A video with comments disabled or
 * otherwise unavailable is skipped, never retried.
 */
async function fetchVideoThreads(
  client: YouTubeDeepResearchClient,
  videoId: string,
  allowance: number,
  remainingRawAllowance: number,
): Promise<VideoCommentPage> {
  const threads: YouTubeThread[] = [];
  let fetched = 0;
  let requests = 0;
  let pageToken: string | undefined;
  if (allowance <= 0 || remainingRawAllowance <= 0) {
    return { threads, fetched, requests, unavailable: false };
  }
  for (let page = 0;
    page < MARKET_RESEARCH_BUDGETS.youtubeMaxCommentPagesPerVideo && fetched < remainingRawAllowance;
    page += 1) {
    let response: Awaited<ReturnType<YouTubeDeepResearchClient["listCommentThreads"]>>;
    try {
      requests += 1;
      response = await client.listCommentThreads({
        videoId,
        maxResults: Math.min(
          MARKET_RESEARCH_BUDGETS.youtubeCommentPageSize,
          remainingRawAllowance - fetched,
        ),
        ...(pageToken === undefined ? {} : { pageToken }),
      });
    } catch {
      // Comments disabled or unavailable: skip this video without retrying.
      return { threads, fetched, requests, unavailable: threads.length === 0 };
    }
    for (const thread of response.items) {
      const remaining = remainingRawAllowance - fetched;
      if (remaining <= 0) break;
      const boundedThread = trimThread(
        thread,
        Math.min(MARKET_RESEARCH_BUDGETS.youtubeMaxRepliesPerThread, remaining - 1),
      );
      threads.push(boundedThread);
      fetched += occurrenceCount(boundedThread);
    }
    const covered = threads.reduce((total, thread) => total + occurrenceCount(thread), 0);
    pageToken = response.nextPageToken;
    if (covered >= allowance || fetched >= remainingRawAllowance || pageToken === undefined) break;
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
 * existing MarketSignal adapter. The only optional model call is the bounded
 * metadata review for deterministic borderline videos; comments are never sent
 * to a model.
 */
export async function acquireYouTubeDeepResearchSignals(
  client: YouTubeDeepResearchClient,
  input: Readonly<YouTubeDeepResearchInput>,
): Promise<YouTubeDeepAcquisition> {
  const startedAt = Date.now();
  const requested = MARKET_RESEARCH_BUDGETS.youtubeTargetComments;
  const minimumDurationSeconds = resolveYouTubeMinimumDurationSeconds(input.youtubeMinimumDurationSeconds);
  const queries = deriveYouTubeResearchQueries(input.topic);
  const queryPlanComparison: YouTubeQueryPlanComparison | undefined = input.shadowQueryPlan === undefined
    ? undefined
    : {
        mode: "SHADOW",
        executor: "CURRENT_PLAN",
        currentQueries: queries.map((query) => ({ ...query })),
        proposed: input.shadowQueryPlan,
      };

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
    ...(queryPlanComparison === undefined ? {} : { queryPlanComparison }),
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
    videoMetadataFailures: 0,
    videoDurationRejects: 0,
    deterministicRelevantVideos: 0,
    deterministicBorderlineVideos: 0,
    deterministicIrrelevantVideos: 0,
    successfulBorderlineReviews: 0,
    borderlineReviewerFailures: 0,
    finalRelevantVideos: 0,
    researchRelevantComments: 0,
    researchIrrelevantComments: 0,
    creatorPromotionalCommentsExcluded: 0,
    relevanceReviewerAttempts: 0,
    relevanceReviewerFallbackAttempts: 0,
    relevanceReviewerInputTokens: 0,
    relevanceReviewerOutputTokens: 0,
    videoRelevanceDecisionAudit: [],
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

  const preGateCandidates = selectDiverseYouTubeCandidates([...discovered.values()], {
    maxVideos: MARKET_RESEARCH_BUDGETS.youtubeMaxVideos,
    maxPerChannel: MARKET_RESEARCH_BUDGETS.youtubeMaxVideosPerChannel,
  });

  // ---- Enrichment: bounded batch metadata; missing records fail only their candidate. ----
  const videos = new Map<string, YouTubeVideo>();
  const channels = new Map<string, YouTubeChannel>();
  let enrichmentRequests = 0;
  const videoIds = preGateCandidates.map((candidate) => candidate.videoId);
  if (client.getVideos !== undefined) {
    for (let index = 0; index < videoIds.length; index += 50) {
      try {
        enrichmentRequests += 1;
        for (const video of await client.getVideos(videoIds.slice(index, index + 50))) {
          videos.set(video.videoId, video);
        }
      } catch {
        // A failed batch stays unavailable; omitted records already remain absent.
      }
    }
  }
  if (client.getChannels !== undefined) {
    const channelIds = [...new Set(preGateCandidates.map((candidate) => candidate.channelId))].slice(0, 50);
    if (channelIds.length > 0) {
      try {
        enrichmentRequests += 1;
        for (const channel of await client.getChannels(channelIds)) channels.set(channel.channelId, channel);
      } catch {
        // Channel country stays null rather than being guessed.
      }
    }
  }

  const assessed: AssessedVideoCandidate[] = preGateCandidates.map((candidate) => {
    const enriched = enrichCandidate(candidate, videos.get(candidate.videoId), channels.get(candidate.channelId));
    return {
      candidate: enriched,
      assessment: assessYouTubeVideoRelevance({
        topic: input.topic,
        query: enriched.query,
        title: enriched.title,
        description: enriched.description,
        tags: enriched.tags,
        channelTitle: enriched.channelTitle,
        duration: enriched.duration,
        metadataAvailable: enriched.enriched,
        minimumDurationSeconds,
      }),
    };
  });
  const researchTopicTerms = topicTerms(input.topic);
  const deterministicRelevantVideos = assessed.filter(({ assessment }) => assessment.decision === "relevant").length;
  const deterministicBorderlineVideos = assessed.filter(({ assessment }) => assessment.decision === "borderline").length;
  const deterministicIrrelevantVideos = assessed.filter(({ assessment }) => assessment.decision === "irrelevant").length;
  const videoMetadataFailures = assessed.filter(({ assessment }) =>
    assessment.reason === "video_metadata_unavailable" || assessment.reason === "duration_unavailable").length;
  const videoDurationRejects = assessed.filter(({ assessment }) =>
    assessment.reason === "duration_below_minimum").length;
  const borderline = assessed.filter(({ assessment }) => assessment.decision === "borderline");

  let reviewBatch = emptyReviewBatch();
  if (deterministicRelevantVideos < MARKET_RESEARCH_BUDGETS.youtubeTargetVideos
    && borderline.length > 0
    && input.relevanceReviewer !== undefined) {
    const reviewCandidates = borderline.slice(0, MARKET_RESEARCH_BUDGETS.youtubeRelevanceMaxBorderlineVideos);
    try {
      reviewBatch = await input.relevanceReviewer.review(
        input.topic,
        reviewCandidates.map(({ candidate }) => ({
          videoId: candidate.videoId,
          title: candidate.title,
          description: candidate.description,
          tags: candidate.tags,
          channelTitle: candidate.channelTitle,
          declaredLanguage: candidate.defaultAudioLanguage ?? candidate.defaultLanguage,
        })),
      );
    } catch {
      reviewBatch = failedReviewBatch(reviewCandidates.map(({ candidate }) => candidate.videoId));
    }
  }

  // Final eligibility is resolved in the original diversity order. Rejections
  // leave room for later pre-gate candidates to backfill up to the target.
  const candidates: YouTubeResearchVideoCandidate[] = [];
  const videoRelevanceDecisionAudit: MarketResearchYouTubeVideoDecisionAudit[] = [];
  for (const [index, item] of assessed.entries()) {
    const review = reviewBatch.results.get(item.candidate.videoId) ?? null;
    const qualifies = item.assessment.decision === "relevant"
      || (item.assessment.decision === "borderline" && review?.failure === null && review.decision === "relevant");
    const eligible = qualifies && candidates.length < MARKET_RESEARCH_BUDGETS.youtubeTargetVideos;
    let rejectionReason: string | null = null;
    if (!eligible) {
      if (qualifies) rejectionReason = "final_target_reached";
      else if (item.assessment.decision === "irrelevant") rejectionReason = item.assessment.reason;
      else if (review === null) rejectionReason = "borderline_not_reviewed";
      else if (review.failure !== null || review.decision === null) rejectionReason = "review_failed";
      else if (review.decision === "borderline") rejectionReason = "reviewer_borderline";
      else rejectionReason = "reviewer_irrelevant";
    }
    const provenance = relevanceProvenance(
      item.assessment,
      minimumDurationSeconds,
      review,
      eligible,
      rejectionReason,
    );
    videoRelevanceDecisionAudit.push({
      videoId: item.candidate.videoId,
      channelId: item.candidate.channelId,
      selectionOrder: index + 1,
      relevance: provenance,
    });
    if (eligible) candidates.push({ ...item.candidate, relevance: provenance });
  }

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
  let researchRelevantComments = 0;
  let researchIrrelevantComments = 0;
  let creatorPromotionalCommentsExcluded = 0;
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
    const remainingRawAllowance = MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments - commentsFetched;
    if (allowance <= 0 || remainingRawAllowance <= 0) { stopReason = "comment_limit_reached"; break; }

    const page = await fetchVideoThreads(client, candidate.videoId, allowance, remainingRawAllowance);
    commentsFetched += page.fetched;
    commentRequests += page.requests;
    if (page.threads.length === 0) {
      videosSkipped += 1;
      continue;
    }

    // Bounded reply expansion: one page per thread, only while the video and
    // run still have raw allowance and the run has reply-request budget.
    const extraReplies = new Map<string, readonly YouTubeComment[]>();
    if (client.listReplies !== undefined) {
      let covered = page.threads.reduce((total, thread) => total + occurrenceCount(thread), 0);
      for (const thread of page.threads) {
        const remainingVideoAllowance = allowance - covered;
        const remainingRawReplyAllowance = MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments - commentsFetched;
        if (remainingVideoAllowance <= 0 || remainingRawReplyAllowance <= 0) break;
        if (replyRequests >= MARKET_RESEARCH_BUDGETS.youtubeMaxReplyRequests) break;
        if (thread.totalReplyCount <= thread.embeddedReplies.length) continue;
        const replyAllowance = Math.min(
          MARKET_RESEARCH_BUDGETS.youtubeMaxRepliesPerThread,
          remainingVideoAllowance,
          remainingRawReplyAllowance,
        );
        try {
          replyRequests += 1;
          const replies = await client.listReplies({
            parentCommentId: thread.topLevelComment.commentId,
            maxResults: replyAllowance,
          });
          const bounded = replies.items.slice(0, replyAllowance);
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
        ...(candidate.relevance === null ? {} : { relevance: candidate.relevance }),
      },
      ...(extraReplies.size === 0 ? {} : { extraReplies }),
    });
    structurallyRejected += adaptation.audit.rejected.length;

    // Structural adaptation is followed by topical relevance, then the existing
    // semantic-quality rules, then exact/near dedupe. The counters stay disjoint.
    const occurrences = commentOccurrenceIndex(page.threads, extraReplies);
    const declaredLanguage = candidate.defaultAudioLanguage ?? candidate.defaultLanguage;
    let retainedForVideo = 0;
    let newUnique = 0;
    for (const signal of adaptation.signals) {
      if (retainedForVideo >= allowance) break;
      if (signals.length >= MARKET_RESEARCH_BUDGETS.youtubeMaxComments) break;
      const occurrence = occurrences.get(commentIdOf(signal.sourceId));
      const commentRelevance = assessYouTubeCommentRelevance({
        text: signal.text,
        topicTerms: researchTopicTerms,
        ...(occurrence?.author === undefined ? {} : { author: occurrence.author }),
        channelTitle: candidate.channelTitle,
      });
      if (commentRelevance === "creator_promotion") {
        creatorPromotionalCommentsExcluded += 1;
        continue;
      }
      if (commentRelevance !== "research_relevant") {
        researchIrrelevantComments += 1;
        continue;
      }
      researchRelevantComments += 1;

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
    if (commentsFetched >= MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments) {
      stopReason = "comment_limit_reached";
      break;
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

  if (commentsFetched >= MARKET_RESEARCH_BUDGETS.youtubeMaxRawComments
    || signals.length >= MARKET_RESEARCH_BUDGETS.youtubeMaxComments) {
    stopReason = "comment_limit_reached";
  } else if (stopReason === "videos_exhausted" && signals.length >= MARKET_RESEARCH_BUDGETS.youtubeTargetComments) {
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
      ...(queryPlanComparison === undefined ? {} : { queryPlanComparison }),
      videosDiscovered: discovered.size,
      videosSelected: preGateCandidates.length,
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
      videoMetadataFailures,
      videoDurationRejects,
      deterministicRelevantVideos,
      deterministicBorderlineVideos,
      deterministicIrrelevantVideos,
      successfulBorderlineReviews: reviewBatch.successes,
      borderlineReviewerFailures: reviewBatch.failures,
      finalRelevantVideos: candidates.length,
      researchRelevantComments,
      researchIrrelevantComments,
      creatorPromotionalCommentsExcluded,
      relevanceReviewerAttempts: reviewBatch.attempts,
      relevanceReviewerFallbackAttempts: reviewBatch.fallbackAttempts,
      relevanceReviewerInputTokens: reviewBatch.inputTokens,
      relevanceReviewerOutputTokens: reviewBatch.outputTokens,
      videoRelevanceDecisionAudit,
      declaredLanguages,
      queryLanguages: [...new Set(queries.map((query) => query.language))],
      stopReason,
    },
    candidates,
  };
}

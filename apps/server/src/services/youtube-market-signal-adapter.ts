import type { NormalizedMarketSignal } from "@our-platform/shared";
import type { YouTubeComment, YouTubeThread, YouTubeVideo } from "../integrations/youtube-adapter.js";
import { normalizeMarketSignal } from "./market-signal-normalizer.js";

const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/u;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const ISO_TIMESTAMP = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?<fraction>\.\d{1,3})?(?<zone>Z|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u;

type YouTubeMarketSignalOrigin = "top_level" | "embedded_reply" | "extra_reply";

export interface YouTubeMarketSignalInput {
  readonly video: YouTubeVideo;
  readonly query: string | null;
  readonly threads: readonly YouTubeThread[];
  /** Query-lane provenance recorded during the bounded Market Research acquisition. */
  readonly discovery?: {
    readonly angle: string;
    readonly language: string;
    readonly channelCountry?: string | null;
    readonly declaredLanguage?: string | null;
  };
  /** Replies fetched after the embedded replies in a comment thread. */
  readonly extraReplies?: ReadonlyMap<string, readonly YouTubeComment[]>;
}

export interface YouTubeMarketSignalRecordAudit {
  readonly commentId: string | null;
  readonly threadId: string | null;
  readonly parentCommentId: string | null;
  readonly isReply: boolean | null;
  readonly text: string | null;
  readonly origin: YouTubeMarketSignalOrigin;
}

export interface YouTubeMarketSignalRejection {
  readonly record: YouTubeMarketSignalRecordAudit;
  readonly reason: string;
}

export interface YouTubeMarketSignalDuplicate {
  readonly commentId: string;
  readonly retained: YouTubeMarketSignalRecordAudit;
  readonly duplicate: YouTubeMarketSignalRecordAudit;
}

export interface YouTubeMarketSignalAdaptation {
  readonly signals: readonly NormalizedMarketSignal[];
  readonly audit: {
    readonly rejected: readonly YouTubeMarketSignalRejection[];
    readonly duplicates: readonly YouTubeMarketSignalDuplicate[];
  };
}

interface YouTubeCommentOccurrence {
  readonly comment: unknown;
  readonly thread: unknown;
  readonly origin: YouTubeMarketSignalOrigin;
}

interface RejectedOccurrence {
  readonly record: YouTubeMarketSignalRecordAudit;
  readonly reason: string;
}

interface ValidYouTubeCommentOccurrence {
  readonly comment: YouTubeComment;
  readonly thread: YouTubeThread;
  readonly origin: YouTubeMarketSignalOrigin;
  readonly commentId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAudit(occurrence: YouTubeCommentOccurrence): YouTubeMarketSignalRecordAudit {
  const comment = isRecord(occurrence.comment) ? occurrence.comment : {};
  const thread = isRecord(occurrence.thread) ? occurrence.thread : {};
  return {
    commentId: typeof comment.commentId === "string" ? comment.commentId : null,
    threadId: typeof thread.threadId === "string" ? thread.threadId : null,
    parentCommentId: typeof comment.parentCommentId === "string" ? comment.parentCommentId : null,
    isReply: typeof comment.isReply === "boolean" ? comment.isReply : null,
    text: typeof comment.text === "string" ? comment.text : null,
    origin: occurrence.origin,
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  return value;
}

function requireStableIdentifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty stable identifier`);
  }
  if (value.trim() !== value || value.normalize("NFC") !== value || CONTROL_CHARACTER.test(value) || /\s/u.test(value)) {
    throw new Error(`${field} must be a canonical stable identifier`);
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  if (!value.trim()) throw new Error(`${field} must not be empty`);
  if (value !== value.trim() || CONTROL_CHARACTER.test(value)) {
    throw new Error(`${field} must be an ISO-8601 timestamp with timezone`);
  }
  const match = value.match(ISO_TIMESTAMP);
  if (!match?.groups) throw new Error(`${field} must be an ISO-8601 timestamp with timezone`);

  const { groups } = match;
  const year = Number(groups.year);
  const month = Number(groups.month);
  const day = Number(groups.day);
  const hour = Number(groups.hour);
  const minute = Number(groups.minute);
  const second = Number(groups.second);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  calendar.setUTCHours(hour, minute, second, 0);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59
    || calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
    || calendar.getUTCDate() !== day || calendar.getUTCHours() !== hour
    || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    throw new Error(`${field} must be a valid timestamp`);
  }
  if (groups.zone !== "Z" && (Number(groups.offsetHour) > 23 || Number(groups.offsetMinute) > 59)) {
    throw new Error(`${field} must have a valid timezone offset`);
  }
  if (Number.isNaN(new Date(value).getTime())) throw new Error(`${field} must be a valid timestamp`);
  return value;
}

function requireVideo(video: unknown): YouTubeVideo {
  const record = requireRecord(video, "YouTube video");
  const videoId = record.videoId;
  if (typeof videoId !== "string" || !YOUTUBE_VIDEO_ID.test(videoId)) {
    throw new Error("YouTube videoId must be a stable 11-character identifier");
  }
  requireNonEmptyString(record.title, "YouTube video.title");
  requireNonEmptyString(record.channelId, "YouTube video.channelId");
  requireNonEmptyString(record.channelTitle, "YouTube video.channelTitle");
  requireTimestamp(record.publishedAt, "YouTube video.publishedAt");
  for (const field of ["commentCount", "viewCount", "likeCount"] as const) {
    if (record[field] !== undefined) requireNonNegativeInteger(record[field], `YouTube video.${field}`);
  }
  return video as YouTubeVideo;
}

function requireThread(thread: unknown): YouTubeThread {
  const record = requireRecord(thread, "YouTube thread");
  requireStableIdentifier(record.threadId, "YouTube threadId");
  requireRecord(record.topLevelComment, "YouTube thread.topLevelComment");
  requireNonNegativeInteger(record.totalReplyCount, "YouTube thread.totalReplyCount");
  if (!Array.isArray(record.embeddedReplies)) throw new Error("YouTube thread.embeddedReplies must be an array");
  return thread as YouTubeThread;
}

function requireCommentOccurrence(occurrence: YouTubeCommentOccurrence): ValidYouTubeCommentOccurrence {
  const thread = requireThread(occurrence.thread);
  const comment = requireRecord(occurrence.comment, "YouTube comment") as unknown as YouTubeComment;
  const commentId = requireStableIdentifier(comment.commentId, "YouTube commentId");
  if (comment.parentCommentId !== null && typeof comment.parentCommentId !== "string") {
    throw new Error("YouTube comment.parentCommentId must be a string or null");
  }
  requireNonEmptyString(comment.author, "YouTube comment.author");
  requireNonNegativeInteger(comment.likes, "YouTube comment.likes");
  requireTimestamp(comment.publishedAt, "YouTube comment.publishedAt");
  requireTimestamp(comment.updatedAt, "YouTube comment.updatedAt");
  if (typeof comment.isReply !== "boolean") throw new Error("YouTube comment.isReply must be a boolean");

  if (occurrence.origin === "top_level") {
    if (comment.isReply || comment.parentCommentId !== null) {
      throw new Error("YouTube top-level comment must not be a reply");
    }
  } else {
    const parentCommentId = requireStableIdentifier(comment.parentCommentId, "YouTube comment.parentCommentId");
    const topLevelComment = requireRecord(thread.topLevelComment, "YouTube thread.topLevelComment");
    const topLevelCommentId = requireStableIdentifier(topLevelComment.commentId, "YouTube top-level commentId");
    if (!comment.isReply || parentCommentId !== topLevelCommentId) {
      throw new Error("YouTube reply must reference its thread top-level comment");
    }
  }

  return { comment, thread, origin: occurrence.origin, commentId };
}

function videoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

function buildContext(input: Readonly<YouTubeMarketSignalInput>, video: YouTubeVideo, occurrence: ValidYouTubeCommentOccurrence): string {
  const { comment, thread, origin } = occurrence;
  return JSON.stringify({
    video: {
      videoId: video.videoId,
      title: video.title,
      channelId: video.channelId,
      channelTitle: video.channelTitle,
      publishedAt: video.publishedAt,
      description: video.description ?? null,
      thumbnailUrl: video.thumbnailUrl ?? null,
      duration: video.duration ?? null,
      viewCount: video.viewCount ?? null,
      likeCount: video.likeCount ?? null,
      commentCount: video.commentCount ?? null,
      tags: video.tags ?? [],
      categoryId: video.categoryId ?? null,
      defaultAudioLanguage: video.defaultAudioLanguage ?? null,
      defaultLanguage: video.defaultLanguage ?? null,
    },
    discovery: input.discovery === undefined ? null : {
      angle: input.discovery.angle,
      language: input.discovery.language,
      declaredLanguage: input.discovery.declaredLanguage ?? video.defaultAudioLanguage ?? video.defaultLanguage ?? null,
      channelCountry: input.discovery.channelCountry ?? null,
    },
    comment: {
      commentId: comment.commentId,
      parentCommentId: comment.parentCommentId,
      author: comment.author,
      publishedAt: comment.publishedAt,
      updatedAt: comment.updatedAt,
      isReply: comment.isReply,
      threadId: thread.threadId,
      totalReplyCount: thread.totalReplyCount,
      origin,
    },
  });
}

function buildEngagement(video: YouTubeVideo, occurrence: ValidYouTubeCommentOccurrence): Record<string, number> {
  const engagement: Record<string, number> = {
    comment_likes: occurrence.comment.likes,
    thread_total_replies: occurrence.thread.totalReplyCount,
  };
  if (video.commentCount !== undefined) engagement.video_comment_count = video.commentCount;
  if (video.viewCount !== undefined) engagement.video_view_count = video.viewCount;
  if (video.likeCount !== undefined) engagement.video_like_count = video.likeCount;
  return engagement;
}

function* commentOccurrences(input: Readonly<YouTubeMarketSignalInput>): Generator<YouTubeCommentOccurrence | RejectedOccurrence> {
  const threads = (input as { readonly threads?: unknown }).threads;
  if (!Array.isArray(threads)) {
    yield {
      record: { commentId: null, threadId: null, parentCommentId: null, isReply: null, text: null, origin: "top_level" },
      reason: "YouTube threads must be an array",
    };
    return;
  }

  const extraReplies = (input as { readonly extraReplies?: unknown }).extraReplies;
  for (const rawThread of threads) {
    let thread: YouTubeThread;
    try {
      thread = requireThread(rawThread);
    } catch (error) {
      const topLevelComment = isRecord(rawThread) ? rawThread.topLevelComment : undefined;
      yield {
        record: recordAudit({ comment: topLevelComment, thread: rawThread, origin: "top_level" }),
        reason: error instanceof Error ? error.message : "YouTube thread validation failed",
      };
      continue;
    }

    yield { comment: thread.topLevelComment, thread, origin: "top_level" };
    for (const comment of thread.embeddedReplies) {
      yield { comment, thread, origin: "embedded_reply" };
    }

    if (extraReplies === undefined) continue;
    if (!(extraReplies instanceof Map)) {
      yield {
        record: recordAudit({ comment: thread.topLevelComment, thread, origin: "extra_reply" }),
        reason: "YouTube extraReplies must be a map",
      };
      continue;
    }

    let replies: unknown;
    try {
      replies = extraReplies.get(thread.topLevelComment.commentId);
    } catch {
      yield {
        record: recordAudit({ comment: thread.topLevelComment, thread, origin: "extra_reply" }),
        reason: "YouTube extraReplies could not be read",
      };
      continue;
    }
    if (replies === undefined) continue;
    if (!Array.isArray(replies)) {
      yield {
        record: recordAudit({ comment: thread.topLevelComment, thread, origin: "extra_reply" }),
        reason: "YouTube extraReplies entry must be an array",
      };
      continue;
    }
    for (const comment of replies) {
      yield { comment, thread, origin: "extra_reply" };
    }
  }
}

function isRejectedOccurrence(value: YouTubeCommentOccurrence | RejectedOccurrence): value is RejectedOccurrence {
  return "reason" in value;
}

/**
 * Pure 20.2 transformation boundary for already-fetched YouTube DTOs. It has
 * no provider client, network, persistence, clock, LLM, or adapter collect I/O.
 * `capturedAt` is the source comment publication timestamp; `updatedAt` and the
 * complete video/thread context remain auditable in `context`.
 */
export function adaptYouTubeMarketSignals(input: Readonly<YouTubeMarketSignalInput>): YouTubeMarketSignalAdaptation {
  const signals: NormalizedMarketSignal[] = [];
  const rejected: YouTubeMarketSignalRejection[] = [];
  const duplicates: YouTubeMarketSignalDuplicate[] = [];
  const retainedByCommentId = new Map<string, YouTubeMarketSignalRecordAudit>();

  for (const candidate of commentOccurrences(input)) {
    if (isRejectedOccurrence(candidate)) {
      rejected.push(candidate);
      continue;
    }

    const record = recordAudit(candidate);
    try {
      const occurrence = requireCommentOccurrence(candidate);
      const video = requireVideo(input.video);
      const retained = retainedByCommentId.get(occurrence.commentId);
      if (retained) {
        duplicates.push({ commentId: occurrence.commentId, retained, duplicate: record });
        continue;
      }

      const url = videoUrl(video.videoId);
      const signal = normalizeMarketSignal({
        source: "youtube",
        sourceId: `youtube-comment:${occurrence.commentId}`,
        url,
        query: input.query,
        capturedAt: occurrence.comment.publishedAt,
        text: occurrence.comment.text,
        engagement: buildEngagement(video, occurrence),
        context: buildContext(input, video, occurrence),
        pain: null,
        desiredOutcome: null,
        failedAttempt: null,
        currentSolution: null,
        solutionComplaint: null,
        urgency: null,
        specificity: null,
        commercialIntent: null,
        provenance: {
          provider: "youtube-data-api/v3",
          source: "youtube",
          sourceId: `youtube-comment:${occurrence.commentId}`,
          url,
          query: input.query,
          capturedAt: occurrence.comment.publishedAt,
          normalizationVersion: "youtube-market-signal/raw-v1",
        },
      });
      signals.push(signal);
      retainedByCommentId.set(occurrence.commentId, record);
    } catch (error) {
      rejected.push({ record, reason: error instanceof Error ? error.message : "YouTube market signal normalization failed" });
    }
  }

  return { signals, audit: { rejected, duplicates } };
}

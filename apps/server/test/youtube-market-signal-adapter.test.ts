import { describe, expect, it, vi } from "vitest";
import type { YouTubeComment, YouTubeThread, YouTubeVideo } from "../src/integrations/youtube-adapter.js";
import { adaptYouTubeMarketSignals, type YouTubeMarketSignalInput } from "../src/services/youtube-market-signal-adapter.js";

const video: YouTubeVideo = {
  videoId: "dQw4w9WgXcQ",
  title: "  Cómo organizar fotos  ",
  channelId: "channel-1",
  channelTitle: "Canal de prueba",
  publishedAt: "2025-01-01T00:00:00Z",
  description: "Descripción original",
  duration: "PT10M",
  viewCount: 1_000,
  likeCount: 25,
  commentCount: 4,
};

function comment(overrides: Partial<YouTubeComment> = {}): YouTubeComment {
  return {
    commentId: "comment-1",
    parentCommentId: null,
    author: "Autor original",
    text: "  Necesito un flujo más rápido.\r\nLo actual es lento.  ",
    likes: 7,
    publishedAt: "2025-02-03T04:05:06+00:00",
    updatedAt: "2025-02-04T05:06:07Z",
    isReply: false,
    ...overrides,
  };
}

function input(overrides: Partial<YouTubeMarketSignalInput> = {}): YouTubeMarketSignalInput {
  const topLevel = comment();
  const reply = comment({
    commentId: "reply-1",
    parentCommentId: topLevel.commentId,
    author: "Respuesta",
    text: "Yo también lo necesito.",
    likes: 2,
    isReply: true,
  });
  const thread: YouTubeThread = {
    threadId: "thread-1",
    topLevelComment: topLevel,
    totalReplyCount: 1,
    embeddedReplies: [reply],
  };
  return { video, query: "  organizar fotos  ", threads: [thread], ...overrides };
}

describe("YouTube MarketSignal adapter", () => {
  it("is deterministic, does not mutate DTO input, and never calls fetch", () => {
    const value = input();
    const original = structuredClone(value);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const first = adaptYouTubeMarketSignals(value);
    const second = adaptYouTubeMarketSignals(value);

    expect(first).toEqual(second);
    expect(value).toEqual(original);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("preserves complete provenance, canonical video URL, query, engagement, and context", () => {
    const result = adaptYouTubeMarketSignals(input());
    const signal = result.signals[0]!;

    expect(result.audit).toEqual({ rejected: [], duplicates: [] });
    expect(signal).toMatchObject({
      source: "youtube",
      sourceId: "youtube-comment:comment-1",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      query: "organizar fotos",
      capturedAt: "2025-02-03T04:05:06.000Z",
      text: "Necesito un flujo más rápido.\nLo actual es lento.",
      engagement: {
        comment_likes: 7,
        thread_total_replies: 1,
        video_comment_count: 4,
        video_like_count: 25,
        video_view_count: 1_000,
      },
      provenance: {
        provider: "youtube-data-api/v3",
        source: "youtube",
        sourceId: "youtube-comment:comment-1",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        query: "organizar fotos",
        capturedAt: "2025-02-03T04:05:06.000Z",
        normalizationVersion: "market-signal/v1",
      },
    });
    expect(JSON.parse(signal.context!)).toEqual({
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "  Cómo organizar fotos  ",
        channelId: "channel-1",
        channelTitle: "Canal de prueba",
        publishedAt: "2025-01-01T00:00:00Z",
        description: "Descripción original",
        thumbnailUrl: null,
        duration: "PT10M",
        viewCount: 1_000,
        likeCount: 25,
        commentCount: 4,
      },
      comment: {
        commentId: "comment-1",
        parentCommentId: null,
        author: "Autor original",
        publishedAt: "2025-02-03T04:05:06+00:00",
        updatedAt: "2025-02-04T05:06:07Z",
        isReply: false,
        threadId: "thread-1",
        totalReplyCount: 1,
        origin: "top_level",
      },
    });
  });

  it("leaves every semantic field explicitly null without inferring from comments", () => {
    const signal = adaptYouTubeMarketSignals(input()).signals[0]!;

    expect({
      pain: signal.pain,
      desiredOutcome: signal.desiredOutcome,
      failedAttempt: signal.failedAttempt,
      currentSolution: signal.currentSolution,
      solutionComplaint: signal.solutionComplaint,
      urgency: signal.urgency,
      specificity: signal.specificity,
      commercialIntent: signal.commercialIntent,
    }).toEqual({
      pain: null,
      desiredOutcome: null,
      failedAttempt: null,
      currentSolution: null,
      solutionComplaint: null,
      urgency: null,
      specificity: null,
      commercialIntent: null,
    });
  });

  it("deduplicates only stable comment identity across embedded and extra replies with inspectable audit", () => {
    const value = input();
    const thread = value.threads[0]!;
    const duplicateReply = comment({
      commentId: "reply-1",
      parentCommentId: thread.topLevelComment.commentId,
      text: "Texto distinto de la misma identidad.",
      isReply: true,
    });
    const uniqueReply = comment({
      commentId: "reply-2",
      parentCommentId: thread.topLevelComment.commentId,
      text: "Mismo texto, identidad diferente.",
      isReply: true,
    });
    const result = adaptYouTubeMarketSignals({
      ...value,
      extraReplies: new Map([[thread.topLevelComment.commentId, [duplicateReply, uniqueReply]]]),
    });

    expect(result.signals.map((signal) => signal.sourceId)).toEqual([
      "youtube-comment:comment-1",
      "youtube-comment:reply-1",
      "youtube-comment:reply-2",
    ]);
    expect(result.audit.duplicates).toEqual([{
      commentId: "reply-1",
      retained: expect.objectContaining({ origin: "embedded_reply", text: "Yo también lo necesito." }),
      duplicate: expect.objectContaining({ origin: "extra_reply", text: "Texto distinto de la misma identidad." }),
    }]);
  });

  it("rejects malformed records with deterministic audit instead of inventing traceability", () => {
    const malformed = input({
      threads: [{
        threadId: "thread-invalid",
        topLevelComment: comment({ commentId: "", text: "Sin identidad estable" }),
        totalReplyCount: 0,
        embeddedReplies: [],
      }],
    });
    const missingTimestamp = input({
      threads: [{
        threadId: "thread-invalid-time",
        topLevelComment: comment({ commentId: "comment-invalid-time", publishedAt: "" }),
        totalReplyCount: 0,
        embeddedReplies: [],
      }],
    });

    expect(adaptYouTubeMarketSignals(malformed)).toEqual({
      signals: [],
      audit: {
        duplicates: [],
        rejected: [{
          record: {
            commentId: "",
            threadId: "thread-invalid",
            parentCommentId: null,
            isReply: false,
            text: "Sin identidad estable",
            origin: "top_level",
          },
          reason: "YouTube commentId must be a non-empty stable identifier",
        }],
      },
    });
    expect(adaptYouTubeMarketSignals(missingTimestamp).audit.rejected).toEqual([expect.objectContaining({
      record: expect.objectContaining({ commentId: "comment-invalid-time" }),
      reason: "YouTube comment.publishedAt must not be empty",
    })]);
  });

  it("rejects non-canonical comment identities before dedupe and emits only their canonical counterpart", () => {
    const canonicalId = "commenté";
    const result = adaptYouTubeMarketSignals(input({
      threads: [
        { threadId: "thread-space", topLevelComment: comment({ commentId: ` ${canonicalId} ` }), totalReplyCount: 0, embeddedReplies: [] },
        { threadId: "thread-nfd", topLevelComment: comment({ commentId: "commente\u0301" }), totalReplyCount: 0, embeddedReplies: [] },
        { threadId: "thread-canonical", topLevelComment: comment({ commentId: canonicalId }), totalReplyCount: 0, embeddedReplies: [] },
      ],
    }));

    expect(result.signals.map((signal) => signal.sourceId)).toEqual([`youtube-comment:${canonicalId}`]);
    expect(result.audit.duplicates).toEqual([]);
    expect(result.audit.rejected).toEqual([
      expect.objectContaining({ record: expect.objectContaining({ commentId: ` ${canonicalId} ` }), reason: "YouTube commentId must be a canonical stable identifier" }),
      expect.objectContaining({ record: expect.objectContaining({ commentId: "commente\u0301" }), reason: "YouTube commentId must be a canonical stable identifier" }),
    ]);
  });

  it("does not retain an identity until its signal normalizes successfully", () => {
    const result = adaptYouTubeMarketSignals(input({
      threads: [
        { threadId: "thread-rejected", topLevelComment: comment({ commentId: "comment-retry", text: "   " }), totalReplyCount: 0, embeddedReplies: [] },
        { threadId: "thread-valid", topLevelComment: comment({ commentId: "comment-retry", text: "Registro válido posterior." }), totalReplyCount: 0, embeddedReplies: [] },
      ],
    }));

    expect(result.signals.map((signal) => signal.sourceId)).toEqual(["youtube-comment:comment-retry"]);
    expect(result.audit.duplicates).toEqual([]);
    expect(result.audit.rejected).toEqual([expect.objectContaining({
      record: expect.objectContaining({ threadId: "thread-rejected", commentId: "comment-retry" }),
      reason: "text must not be empty",
    })]);
  });

  it("rejects every required source timestamp when it is empty, impossible, or lacks a timezone", () => {
    const timestampCases: readonly { readonly value: YouTubeMarketSignalInput; readonly reason: string; readonly rejectedCount: number }[] = [
      {
        value: input({ video: { ...video, publishedAt: "2025-02-30T00:00:00Z" } }),
        reason: "YouTube video.publishedAt must be a valid timestamp",
        rejectedCount: 2,
      },
      {
        value: input({ threads: [{ threadId: "thread-no-zone", topLevelComment: comment({ publishedAt: "2025-02-03T04:05:06" }), totalReplyCount: 0, embeddedReplies: [] }] }),
        reason: "YouTube comment.publishedAt must be an ISO-8601 timestamp with timezone",
        rejectedCount: 1,
      },
      {
        value: input({ threads: [{ threadId: "thread-empty-update", topLevelComment: comment({ updatedAt: "" }), totalReplyCount: 0, embeddedReplies: [] }] }),
        reason: "YouTube comment.updatedAt must not be empty",
        rejectedCount: 1,
      },
    ];

    for (const { value, reason, rejectedCount } of timestampCases) {
      const result = adaptYouTubeMarketSignals(value);
      expect(result.signals).toEqual([]);
      expect(result.audit.duplicates).toEqual([]);
      expect(result.audit.rejected).toHaveLength(rejectedCount);
      expect(result.audit.rejected).toEqual(Array.from({ length: rejectedCount }, () => expect.objectContaining({ reason })));
    }
  });

  it("audits malformed thread and reply structures without aborting later valid threads", () => {
    const validThread = input().threads[0]!;
    const result = adaptYouTubeMarketSignals(input({
      threads: [
        {
          threadId: "thread-invalid-replies",
          topLevelComment: comment({ commentId: "comment-invalid-replies" }),
          totalReplyCount: 0,
          embeddedReplies: null,
        } as unknown as YouTubeThread,
        {
          threadId: "thread-invalid-author",
          topLevelComment: comment({ commentId: "comment-context" }),
          totalReplyCount: 1,
          embeddedReplies: [comment({
            commentId: "reply-invalid-author",
            parentCommentId: "comment-context",
            author: "",
            isReply: true,
          })],
        },
        validThread,
      ],
    }));

    expect(result.signals.map((signal) => signal.sourceId)).toEqual([
      "youtube-comment:comment-context",
      "youtube-comment:comment-1",
      "youtube-comment:reply-1",
    ]);
    expect(result.audit.duplicates).toEqual([]);
    expect(result.audit.rejected).toEqual([
      expect.objectContaining({
        record: expect.objectContaining({ commentId: "comment-invalid-replies", threadId: "thread-invalid-replies", origin: "top_level" }),
        reason: "YouTube thread.embeddedReplies must be an array",
      }),
      expect.objectContaining({
        record: expect.objectContaining({ commentId: "reply-invalid-author", threadId: "thread-invalid-author", origin: "embedded_reply" }),
        reason: "YouTube comment.author must be a non-empty string",
      }),
    ]);
  });
});

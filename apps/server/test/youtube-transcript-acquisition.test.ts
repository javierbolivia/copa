import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { YouTubeAdapter, type YouTubePage, type YouTubeThread } from "../src/integrations/youtube-adapter.js";
import { YouTubeImportService } from "../src/services/youtube-import-service.js";
import type { TranscriptFetcher, YouTubeTranscriptResult } from "../src/integrations/youtube-transcript-client.js";
import { YouTubeTranscriptClient } from "../src/integrations/youtube-transcript-client.js";

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const video = { videoId: "dQw4w9WgXcQ", title: "Video", channelId: "channel", channelTitle: "Canal", publishedAt: "2026-01-01" };
const page = (id: string): YouTubePage<YouTubeThread> => ({ items: [{
  threadId: id, totalReplyCount: 0, embeddedReplies: [],
  topLevelComment: { commentId: id, parentCommentId: null, author: "Autor", text: id, likes: 0, publishedAt: "2026-01-01", updatedAt: "2026-01-01", isReply: false },
}] });

describe("YouTube transcript acquisition during import", () => {
  let db: AppDatabase;
  let sources: SourceRepository;
  let jobs: JobRepository;
  let projectId: string;
  beforeEach(() => {
    db = new AppDatabase(":memory:");
    sources = new SourceRepository(db);
    jobs = new JobRepository(db);
    projectId = new ProjectRepository(db).create({ name: "Transcript wiring", niche: "Evidence" }).id;
  });
  afterEach(() => db.close());

  function makeAdapter() {
    const adapter = new YouTubeAdapter({ apiKey: "fake" });
    vi.spyOn(adapter, "getVideo").mockResolvedValue(video);
    vi.spyOn(adapter, "listCommentThreads").mockResolvedValue(page("evidence"));
    return adapter;
  }

  it("acquires and persists a ready transcript only after comments are saved, without failing the import", async () => {
    const adapter = makeAdapter();
    const fetcher: TranscriptFetcher = { fetch: async () => [{ text: "Primer segmento", offset: 0, duration: 2, lang: "es" }] };
    const client = new YouTubeTranscriptClient(fetcher);
    const service = new YouTubeImportService(sources, jobs, "fake", adapter, client);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(sources.listComments(projectId)).toHaveLength(1);
    expect(sources.getVideoTranscript(projectId, queued.source.id)).toMatchObject({ status: "ready", language: "es" });
    expect(sources.listVideoTranscriptSegments(projectId, queued.source.id)).toEqual([
      expect.objectContaining({ segmentIndex: 0, startSeconds: 0, endSeconds: 2, text: "Primer segmento" }),
    ]);
  });

  it("completes the import normally when the transcript client throws", async () => {
    const adapter = makeAdapter();
    const client: { fetch: () => Promise<YouTubeTranscriptResult> } = { fetch: async () => { throw new Error("network exploded"); } };
    const service = new YouTubeImportService(sources, jobs, "fake", adapter, client as unknown as YouTubeTranscriptClient);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(sources.listComments(projectId)).toHaveLength(1);
    expect(sources.getVideoTranscript(projectId, queued.source.id)).toBeUndefined();
  });

  it("completes the import normally when captions are unavailable, persisting the non-ready status", async () => {
    const adapter = makeAdapter();
    const fetcher: TranscriptFetcher = { fetch: async () => [] };
    const client = new YouTubeTranscriptClient(fetcher);
    const service = new YouTubeImportService(sources, jobs, "fake", adapter, client);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(sources.getVideoTranscript(projectId, queued.source.id)).toMatchObject({ status: "unavailable" });
    expect(sources.listVideoTranscriptSegments(projectId, queued.source.id)).toEqual([]);
  });

  it("skips transcript acquisition entirely when no client is injected, matching prior behavior", async () => {
    const adapter = makeAdapter();
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(sources.listComments(projectId)).toHaveLength(1);
    expect(sources.getVideoTranscript(projectId, queued.source.id)).toBeUndefined();
  });

  it("does not re-scrape captions on retry once the transcript is already READY, avoiding an avoidable duplicate acquisition", async () => {
    const adapter = makeAdapter();
    let fetchCalls = 0;
    const fetcher: TranscriptFetcher = { fetch: async () => { fetchCalls++; return [{ text: "Primer segmento", offset: 0, duration: 2, lang: "es" }]; } };
    const client = new YouTubeTranscriptClient(fetcher);
    const service = new YouTubeImportService(sources, jobs, "fake", adapter, client);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(fetchCalls).toBe(1);
    expect(sources.getVideoTranscript(projectId, queued.source.id)).toMatchObject({ status: "ready" });

    // Simulate the exact race the guard protects against: the job crashes (or the
    // process restarts) after transcript acquisition succeeded but before the job
    // itself was marked COMPLETED. A retry restarts run() from scratch, including
    // the comment pagination (idempotent via upsert) and the transcript step.
    jobs.fail(projectId, queued.job.id, "simulated_crash", "Simulated crash after transcript acquisition");
    service.retry(projectId, queued.job.id);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(fetchCalls).toBe(1); // no second scrape: the READY transcript was reused, not re-fetched
    expect(sources.listComments(projectId)).toHaveLength(1); // comment upsert stayed idempotent
  });

  it("does not acquire a transcript for an attempt superseded by cancellation", async () => {
    const adapter = makeAdapter();
    let fetchCalls = 0;
    const fetcher: TranscriptFetcher = { fetch: async () => { fetchCalls++; return [{ text: "seg", offset: 0, duration: 1, lang: "es" }]; } };
    const client = new YouTubeTranscriptClient(fetcher);
    const service = new YouTubeImportService(sources, jobs, "fake", adapter, client);
    const queued = service.queue(projectId, video.videoId);
    service.cancel(projectId, queued.job.id);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("CANCELLED");
    expect(fetchCalls).toBe(0);
    expect(sources.getVideoTranscript(projectId, queued.source.id)).toBeUndefined();
  });
});

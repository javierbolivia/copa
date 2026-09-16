import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { YouTubeAdapter, type YouTubePage, type YouTubeThread } from "../src/integrations/youtube-adapter.js";
import { YouTubeImportService } from "../src/services/youtube-import-service.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const video = { videoId: "dQw4w9WgXcQ", title: "Video", channelId: "channel", channelTitle: "Canal", publishedAt: "2026-01-01" };
const page = (id: string): YouTubePage<YouTubeThread> => ({ items: [{
  threadId: id, totalReplyCount: 0, embeddedReplies: [],
  topLevelComment: { commentId: id, parentCommentId: null, author: "Autor", text: id, likes: 0, publishedAt: "2026-01-01", updatedAt: "2026-01-01", isReply: false },
}] });

describe("YouTube import attempt ownership", () => {
  let db: AppDatabase;
  let sources: SourceRepository;
  let jobs: JobRepository;
  let projectId: string;
  beforeEach(() => {
    db = new AppDatabase(":memory:");
    sources = new SourceRepository(db);
    jobs = new JobRepository(db);
    projectId = new ProjectRepository(db).create({ name: "Import lifecycle", niche: "Evidence" }).id;
  });
  afterEach(() => db.close());

  it.each(["success", "failure"])("ignores a stale %s after cancel and retry", async outcome => {
    const old = deferred<YouTubePage<YouTubeThread>>(), current = deferred<YouTubePage<YouTubeThread>>();
    const adapter = new YouTubeAdapter({ apiKey: "fake" });
    vi.spyOn(adapter, "getVideo").mockResolvedValue(video);
    const comments = vi.spyOn(adapter, "listCommentThreads").mockImplementationOnce(() => old.promise).mockImplementation(() => current.promise);
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    service.cancel(projectId, queued.job.id);
    service.retry(projectId, queued.job.id);
    await tick();
    if (outcome === "success") old.resolve(page("stale evidence"));
    else old.reject(new Error("stale failure"));
    await tick();
    const duringRetry = jobs.get(projectId, queued.job.id);
    const sourceDuringRetry = sources.get(projectId, queued.source.id);
    const evidenceDuringRetry = sources.listComments(projectId);
    current.resolve(page("current evidence"));
    await tick();
    expect(duringRetry?.status).toBe("RUNNING");
    expect(sourceDuringRetry?.status).toBe("pending");
    expect(evidenceDuringRetry).toEqual([]);
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("COMPLETED");
    expect(sources.listComments(projectId).map(comment => comment.text)).toEqual(["current evidence"]);
    expect(comments).toHaveBeenCalledTimes(2);
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("starts a queued retry once even when retry is requested twice", async () => {
    const metadata = deferred<typeof video>();
    const adapter = new YouTubeAdapter({ apiKey: "fake" });
    const lookup = vi.spyOn(adapter, "getVideo").mockImplementation(() => metadata.promise);
    vi.spyOn(adapter, "listCommentThreads").mockResolvedValue(page("evidence"));
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const queued = service.queue(projectId, video.videoId);
    service.cancel(projectId, queued.job.id);
    service.retry(projectId, queued.job.id);
    service.retry(projectId, queued.job.id);
    await tick();
    const calls = lookup.mock.calls.length;
    metadata.resolve(video);
    await tick();
    expect(calls).toBe(1);
    expect(jobs.getRecord(projectId, queued.job.id)?.attempts).toBe(1);
  });

  it("stops before fetching comments when the source was deleted during metadata lookup", async () => {
    const metadata = deferred<typeof video>();
    const adapter = new YouTubeAdapter({ apiKey: "fake" });
    vi.spyOn(adapter, "getVideo").mockImplementation(() => metadata.promise);
    const comments = vi.spyOn(adapter, "listCommentThreads").mockResolvedValue(page("deleted"));
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    sources.delete(projectId, queued.source.id);
    metadata.resolve(video);
    await tick();
    expect(comments).not.toHaveBeenCalled();
    expect(sources.listComments(projectId)).toEqual([]);
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each(["comments", "replies"])("stops repeated %s pagination tokens without an unbounded quota loop", async resource => {
    const adapter = new YouTubeAdapter({ apiKey: "fake" });
    vi.spyOn(adapter, "getVideo").mockResolvedValue(video);
    let calls = 0;
    const repeated = () => {
      if (++calls > 4) throw new Error("fixture call ceiling");
      return { items: [], nextPageToken: "same-token" };
    };
    if (resource === "comments") vi.spyOn(adapter, "listCommentThreads").mockImplementation(async () => repeated());
    else {
      const thread = page("parent").items[0]!;
      vi.spyOn(adapter, "listCommentThreads").mockResolvedValue({ items: [{ ...thread, totalReplyCount: 10 }] });
      vi.spyOn(adapter, "listReplies").mockImplementation(async () => repeated());
    }
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const queued = service.queue(projectId, video.videoId);
    await tick();
    expect(jobs.get(projectId, queued.job.id)?.status).toBe("FAILED");
    expect(calls).toBe(2);
    expect(sources.get(projectId, queued.source.id)?.status).toBe("failed");
    expect(db.connection.prepare("SELECT error_code FROM jobs WHERE id=?").get(queued.job.id)).toMatchObject({ error_code: "invalid_response" });
  });
});

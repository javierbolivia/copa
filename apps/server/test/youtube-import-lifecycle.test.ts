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

  it("fails safely when YouTube returns no public metadata for a video", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const adapter = new YouTubeAdapter({ apiKey: "fake", fetch: fetchMock as typeof fetch });
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const queued = service.queue(projectId, video.videoId);
    await tick();

    expect(jobs.get(projectId, queued.job.id)?.status).toBe("FAILED");
    expect(db.connection.prepare("SELECT error_code,error_message FROM jobs WHERE id=?").get(queued.job.id)).toMatchObject({
      error_code: "invalid_response",error_message: expect.stringContaining("no es público o no está disponible"),
    });
    expect(sources.get(projectId, queued.source.id)).toMatchObject({ status: "failed" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/videos?");
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("bounds concurrent YouTube imports across queued videos", async () => {
    const adapter = new YouTubeAdapter({ apiKey: "fake" });
    const commentRequests: Array<{ videoId: string; resolve: (value: YouTubePage<YouTubeThread>) => void }> = [];
    let active = 0, peak = 0;
    vi.spyOn(adapter, "getVideo").mockImplementation(async videoId => ({ ...video, videoId }));
    const comments = vi.spyOn(adapter, "listCommentThreads").mockImplementation(({ videoId }) => {
      const request = deferred<YouTubePage<YouTubeThread>>();
      active++;peak=Math.max(peak,active);
      commentRequests.push({ videoId, resolve: value => { active--;request.resolve(value); } });
      return request.promise;
    });
    const service = new YouTubeImportService(sources, jobs, "fake", adapter);
    const ids = ["dQw4w9WgXcQ", "9bZkp7q19f0", "J---aiyznGQ", "3JZ_D3ELwOQ"];
    const queued = ids.map(videoId => service.queue(projectId, videoId));
    await tick();await tick();

    expect(comments).toHaveBeenCalledTimes(3);
    expect(active).toBe(3);
    commentRequests[0]!.resolve({ items: [] });
    await tick();await tick();
    expect(comments).toHaveBeenCalledTimes(4);
    expect(peak).toBe(3);

    for(const request of commentRequests.slice(1))request.resolve({ items: [] });
    for(let attempt=0;attempt<8&&queued.some(item=>jobs.get(projectId,item.job.id)?.status!=="COMPLETED");attempt++)await tick();
    expect(queued.every(item=>jobs.get(projectId,item.job.id)?.status==="COMPLETED")).toBe(true);
    expect(peak).toBe(3);
    service.close();
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

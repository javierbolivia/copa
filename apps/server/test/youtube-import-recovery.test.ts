import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { YouTubeAdapter } from "../src/integrations/youtube-adapter.js";
import { YouTubeImportService } from "../src/services/youtube-import-service.js";

describe("YouTube restart recovery consistency", () => {
  let db: AppDatabase;
  let jobs: JobRepository;
  let sources: SourceRepository;
  let projectId: string;
  beforeEach(() => {
    db = new AppDatabase(":memory:");
    jobs = new JobRepository(db);
    sources = new SourceRepository(db);
    projectId = new ProjectRepository(db).create({ name: "Recovery", niche: "Evidence" }).id;
  });
  afterEach(() => db.close());

  function queued() {
    const source = sources.createPendingYouTube(projectId, "Pending", "https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ");
    const job = jobs.createYouTube(projectId, source.id, source.url!);
    return { source, job };
  }

  it("marks both job and source failed when the provider is unavailable after restart", () => {
    const { source, job } = queued();
    jobs.start(projectId, job.id);
    const fetch = vi.fn();
    new YouTubeImportService(sources, jobs, "", new YouTubeAdapter({ fetch })).resumePending();
    expect(jobs.get(projectId, job.id)?.status).toBe("FAILED");
    expect(sources.get(projectId, source.id)?.status).toBe("failed");
    expect(db.connection.prepare("SELECT error_code FROM sources WHERE id=?").get(source.id)).toMatchObject({ error_code: "youtube_not_configured" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("marks exhausted interrupted imports failed without changing completed or cancelled sources", () => {
    const exhausted = queued(), completed = queued(), cancelled = queued();
    jobs.start(projectId, exhausted.job.id);
    db.connection.prepare("UPDATE jobs SET attempts=max_attempts WHERE id=?").run(exhausted.job.id);
    jobs.complete(projectId, completed.job.id, {});
    jobs.cancel(projectId, cancelled.job.id);
    sources.markImportCancelled(projectId, cancelled.source.id);
    const completedSource = sources.get(projectId, completed.source.id);
    expect(jobs.recoverYouTubeImports()).toEqual([]);
    expect(jobs.get(projectId, exhausted.job.id)?.status).toBe("FAILED");
    expect(sources.get(projectId, exhausted.source.id)?.status).toBe("failed");
    expect(sources.get(projectId, cancelled.source.id)?.status).toBe("cancelled");
    expect(sources.get(projectId, completed.source.id)).toEqual(completedSource);
  });

  it.each(["exhausted", "unconfigured"])("rolls back source and job transitions together on %s recovery failure", reason => {
    const { source, job } = queued();
    if (reason === "exhausted") {
      jobs.start(projectId, job.id);
      db.connection.prepare("UPDATE jobs SET attempts=max_attempts WHERE id=?").run(job.id);
    }
    const before = jobs.get(projectId, job.id);
    db.connection.exec("CREATE TRIGGER reject_source_failure BEFORE UPDATE OF status ON sources WHEN NEW.status='failed' BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
    expect(() => reason === "exhausted" ? jobs.recoverYouTubeImports() : jobs.failPendingYouTubeWithoutProvider()).toThrow("controlled failure");
    expect(jobs.get(projectId, job.id)).toEqual(before);
    expect(sources.get(projectId, source.id)?.status).toBe("pending");
    expect(db.connection.isTransaction).toBe(false);
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.connection.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
  });
});

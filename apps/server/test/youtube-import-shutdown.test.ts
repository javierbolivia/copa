import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { YouTubeAdapter } from "../src/integrations/youtube-adapter.js";
import { JobRepository } from "../src/repositories/job-repository.js";

afterEach(() => vi.restoreAllMocks());
describe("YouTube import shutdown", () => {
  it.each(["success", "failure"])("ignores late metadata %s after the app database closes", async outcome => {
    let resolve!: (value: undefined) => void;
    let reject!: (reason: unknown) => void;
    const pending = new Promise<undefined>((done, fail) => { resolve = done; reject = fail; });
    vi.spyOn(YouTubeAdapter.prototype, "configured", "get").mockReturnValue(true);
    vi.spyOn(YouTubeAdapter.prototype, "getVideo").mockImplementation(() => pending);
    const comments = vi.spyOn(YouTubeAdapter.prototype, "listCommentThreads").mockResolvedValue({ items: [] });
    const reads = vi.spyOn(JobRepository.prototype, "getRecord");
    const app = await createApp({ databasePath: ":memory:", serveFrontend: false });
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "Shutdown", niche: "Evidence" } })).json();
    const queued = await app.inject({ method: "POST", url: `/api/projects/${project.id}/sources`, payload: { sourceType: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" } });
    expect(queued.statusCode).toBe(202);
    await app.close();
    const readsAtClose = reads.mock.calls.length;
    if (outcome === "success") resolve(undefined);
    else reject(new Error("controlled provider failure"));
    await new Promise<void>(done => setImmediate(done));
    expect(reads).toHaveBeenCalledTimes(readsAtClose);
    expect(comments).not.toHaveBeenCalled();
  });
});

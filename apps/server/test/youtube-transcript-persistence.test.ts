import { afterEach, describe, expect, it } from "vitest";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import type { YouTubeTranscriptResult } from "../src/integrations/youtube-transcript-client.js";

const video = { videoId: "abc12345678", title: "Video", channelId: "channel", channelTitle: "Canal", publishedAt: "2026-01-01T00:00:00Z" };
const ready = (text = "Primer segmento"): YouTubeTranscriptResult => ({ status: "ready", language: "es", isGenerated: null, segments: [{ text, startSeconds: 1.25, endSeconds: 3.5 }, { text: "Segundo segmento", startSeconds: 4, endSeconds: 6 }] });

describe("YouTube transcript persistence", () => {
  const databases: AppDatabase[] = [];
  afterEach(() => databases.splice(0).forEach((database) => database.close()));

  function fixture() {
    const database = new AppDatabase(":memory:"); databases.push(database);
    const projects = new ProjectRepository(database), sources = new SourceRepository(database);
    const project = projects.create({ name: "Transcript", niche: "Prueba" });
    const source = sources.createPendingYouTube(project.id, "Video", "https://www.youtube.com/watch?v=abc12345678", video.videoId);
    sources.finishYouTubeImport(project.id, source.id, video, [], new Map());
    return { database, projects, sources, project, source };
  }

  it("persists timestamped VIDEO_TRANSCRIPT segments with unknown generated status", () => {
    const { sources, project, source } = fixture();
    const transcript = sources.saveYouTubeTranscript(project.id, source.id, ready(), "2026-09-16T00:00:00Z");
    expect(transcript).toMatchObject({ projectId: project.id, sourceId: source.id, language: "es", isGenerated: null, origin: "VIDEO_TRANSCRIPT", provider: "youtube-transcript", status: "ready" });
    expect(transcript.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(sources.listVideoTranscriptSegments(project.id, source.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ segmentIndex: 0, startSeconds: 1.25, endSeconds: 3.5, text: "Primer segmento" }),
      expect.objectContaining({ segmentIndex: 1, startSeconds: 4, endSeconds: 6, text: "Segundo segmento" }),
    ]));
  });

  it("rebuilds changed segments, keeps temporary content, and clears confirmed unavailability", () => {
    const { sources, project, source } = fixture();
    sources.saveYouTubeTranscript(project.id, source.id, ready("Antes"));
    sources.saveYouTubeTranscript(project.id, source.id, ready("Después"));
    expect(sources.listVideoTranscriptSegments(project.id, source.id).map((item) => item.text)).toEqual(["Después", "Segundo segmento"]);
    sources.saveYouTubeTranscript(project.id, source.id, { status: "temporary_error", language: null, isGenerated: null, segments: [], reason: "retry" });
    expect(sources.listVideoTranscriptSegments(project.id, source.id)).toHaveLength(2);
    sources.saveYouTubeTranscript(project.id, source.id, { status: "unavailable", language: "es", isGenerated: null, segments: [], reason: "no_captions" });
    expect(sources.getVideoTranscript(project.id, source.id)).toMatchObject({ status: "unavailable", isGenerated: null, fingerprint: null });
    expect(sources.listVideoTranscriptSegments(project.id, source.id)).toEqual([]);
  });

  it("isolates projects and cascades transcript data when the source is deleted", () => {
    const { database, projects, sources, project, source } = fixture();
    sources.saveYouTubeTranscript(project.id, source.id, ready());
    const other = projects.create({ name: "Other", niche: "Prueba" });
    expect(sources.getVideoTranscript(other.id, source.id)).toBeUndefined();
    expect(sources.delete(project.id, source.id)).toBe(true);
    expect(database.connection.prepare("SELECT count(*) count FROM video_transcripts").get()).toEqual({ count: 0 });
    expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});

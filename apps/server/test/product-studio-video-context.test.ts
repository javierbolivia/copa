import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";

import type { ProductDocument, Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";

/**
 * Product Studio has never consulted the derived Knowledge Index
 * (KnowledgeIndexBuilder). It queries the knowledge_chunks/knowledge_documents
 * library engine plus a raw evidence_snippets lookup. VIDEO_TRANSCRIPT lived in
 * neither, so a chapter could never cite a video's spoken content. These tests
 * pin the minimal fix: video_transcript_segments is queried directly as
 * KNOWLEDGE (never EVIDENCE_BACKED, never evidence_links).
 */
describe("Product Studio benefits from VIDEO_TRANSCRIPT via its own retrieval", () => {
  let app: FastifyInstance | undefined;
  const directories: string[] = [];

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  function seedTranscript(databasePath: string, projectId: string, sourceId: string, platformVideoId: string, text: string, start: number, end: number): string {
    const db = new AppDatabase(databasePath);
    try {
      const now = new Date().toISOString();
      // video_transcripts.video_id/video_transcript_segments.video_id reference
      // videos.id (the internal row id), not the platform_video_id string.
      const videoRowId = uuidv7();
      db.connection.prepare(`INSERT INTO videos(id,project_id,source_id,platform_video_id,title,channel_id,channel_title,published_at,comment_count,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,'{}',?)`)
        .run(videoRowId, projectId, sourceId, platformVideoId, "Video", "channel", "Canal", now, null, now);
      const transcriptId = uuidv7();
      db.connection.prepare(`INSERT INTO video_transcripts(id,project_id,source_id,video_id,language,is_generated,provider,origin,status,fingerprint,retrieved_at,error_code,error_message,created_at,updated_at) VALUES(?,?,?,?,?,?, 'youtube-transcript','VIDEO_TRANSCRIPT','ready',?,?,NULL,NULL,?,?)`)
        .run(transcriptId, projectId, sourceId, videoRowId, "es", null, "fp", now, now, now);
      db.connection.prepare(`INSERT INTO video_transcript_segments(id,project_id,transcript_id,source_id,video_id,segment_index,start_seconds,end_seconds,text,text_fingerprint,created_at) VALUES(?,?,?,?,?,0,?,?,?,?,?)`)
        .run(uuidv7(), projectId, transcriptId, sourceId, videoRowId, start, end, text, "f".repeat(64), now);
      return videoRowId;
    } finally {
      db.close();
    }
  }

  /** Extracts a real content word (>=4 chars) from a chapter's title/objective so the
   * transcript fixture is guaranteed to lexically match generateChapter's LIKE query,
   * instead of guessing wording the mock generator happens to produce. */
  function keyTermOf(document: ProductDocument): string {
    const chapter = document.version.outline[0]!;
    const words = `${document.title} ${chapter.title} ${chapter.objective}`
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .match(/[a-z0-9]{4,}/g) ?? [];
    const term = words.find((word) => !["para", "sobre", "este", "esta", "considerar", "introduccion"].includes(word));
    if (!term) throw new Error("No key term found in outline fixture");
    return term;
  }

  async function createOutline(project: Project): Promise<ProductDocument> {
    let document = (
      await app!.inject({
        method: "POST",
        url: `/api/projects/${project.id}/product-documents`,
        payload: { documentType: "ebook", language: "es", length: "short", level: "beginner" },
      })
    ).json<ProductDocument>();
    document = (
      await app!.inject({ method: "POST", url: `/api/projects/${project.id}/product-documents/${document.id}/outline/generate`, payload: {} })
    ).json<ProductDocument>();
    return document;
  }

  async function approveOutlineAndGenerateChapters(project: Project, document: ProductDocument): Promise<ProductDocument> {
    document = (
      await app!.inject({ method: "POST", url: `/api/projects/${project.id}/product-documents/${document.id}/outline/approve`, payload: {} })
    ).json<ProductDocument>();
    const batch = await app!.inject({
      method: "POST",
      url: `/api/projects/${project.id}/product-documents/${document.id}/chapters/generate-pending`,
      payload: {},
    });
    expect(batch.statusCode, batch.body).toBe(200);
    return batch.json<{ document: ProductDocument }>().document;
  }

  async function demoWithTranscript(databasePath: string): Promise<{ project: Project; source: { id: string }; videoRowId: string; outline: ProductDocument }> {
    app = await createApp({ databasePath, serveFrontend: false });
    const project = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;
    const source = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/sources` })).json<{ sources: Array<{ id: string; sourceType: string }> }>().sources[0]!;
    const outline = await createOutline(project);
    const term = keyTermOf(outline);
    await app.close();
    const videoRowId = seedTranscript(databasePath, project.id, source.id, "video-abc123", `En este video explicamos con detalle el tema de ${term} paso a paso`, 12, 18);
    app = await createApp({ databasePath, serveFrontend: false });
    return { project, source, videoRowId, outline };
  }

  it("retrieves relevant video transcript content into a chapter, preserving sourceId/videoId/timestamps and KNOWLEDGE provenance (never evidence)", async () => {
    const directory = mkdtempSync(join(tmpdir(), "our-platform-video-context-"));
    directories.push(directory);
    const databasePath = join(directory, "video-context.db");
    const { project, source, videoRowId, outline } = await demoWithTranscript(databasePath);

    const document = await approveOutlineAndGenerateChapters(project, outline);
    const sourceReference = document.version.blocks.find(
      (block) => block.type === "sourceReference" && String(block.content).includes(videoRowId),
    );
    expect(sourceReference).toBeDefined();
    expect(sourceReference!.metadata.provenance).toBe("KNOWLEDGE");
    expect(sourceReference!.metadata.evidenceId).toBeUndefined();
    expect(String(sourceReference!.metadata.referenceId)).toMatch(/^video_transcript:/);

    // The transcript segment must never be linked as market-demand evidence.
    const db = new AppDatabase(databasePath);
    try {
      const links = db.connection.prepare("SELECT * FROM evidence_links WHERE project_id=?").all(project.id);
      const linkedEvidenceIds = new Set(
        (db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? AND source_id=?").all(project.id, source.id) as Array<{ id: string }>).map((row) => row.id),
      );
      expect(links.some((link) => linkedEvidenceIds.has(String((link as { source_id: string }).source_id)) && String((link as { source_id: string }).source_id).includes("segment"))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("isolates video transcript context by project", async () => {
    const directory = mkdtempSync(join(tmpdir(), "our-platform-video-context-isolation-"));
    directories.push(directory);
    const databasePath = join(directory, "isolation.db");
    const { project: projectA, videoRowId, outline: outlineA } = await demoWithTranscript(databasePath);
    const projectB = (await app!.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;
    const outlineB = await createOutline(projectB);

    const documentB = await approveOutlineAndGenerateChapters(projectB, outlineB);
    const leaked = documentB.version.blocks.find(
      (block) => block.type === "sourceReference" && String(block.content).includes(videoRowId),
    );
    expect(leaked).toBeUndefined();

    const documentA = await approveOutlineAndGenerateChapters(projectA, outlineA);
    const present = documentA.version.blocks.find(
      (block) => block.type === "sourceReference" && String(block.content).includes(videoRowId),
    );
    expect(present).toBeDefined();
  });

  it("does not surface an unavailable/non-ready transcript", async () => {
    const directory = mkdtempSync(join(tmpdir(), "our-platform-video-context-unready-"));
    directories.push(directory);
    const databasePath = join(directory, "unready.db");
    app = await createApp({ databasePath, serveFrontend: false });
    const project = (await app.inject({ method: "POST", url: "/api/demo/projects" })).json<{ project: Project }>().project;
    const source = (await app.inject({ method: "GET", url: `/api/projects/${project.id}/sources` })).json<{ sources: Array<{ id: string }> }>().sources[0]!;
    const outline = await createOutline(project);
    const term = keyTermOf(outline);
    await app.close();
    const db = new AppDatabase(databasePath);
    const now = new Date().toISOString();
    const videoRowId = uuidv7();
    db.connection.prepare(`INSERT INTO videos(id,project_id,source_id,platform_video_id,title,channel_id,channel_title,published_at,comment_count,metadata_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,'{}',?)`)
      .run(videoRowId, project.id, source.id, "video-unready", "Video", "channel", "Canal", now, null, now);
    const transcriptId = uuidv7();
    db.connection.prepare(`INSERT INTO video_transcripts(id,project_id,source_id,video_id,language,is_generated,provider,origin,status,fingerprint,retrieved_at,error_code,error_message,created_at,updated_at) VALUES(?,?,?,?,?,?, 'youtube-transcript','VIDEO_TRANSCRIPT','unavailable',NULL,?,'no_captions',NULL,?,?)`)
      .run(transcriptId, project.id, source.id, videoRowId, "es", null, now, now, now);
    // No segments inserted (matches saveYouTubeTranscript's real behavior for
    // a non-ready status), but even a stray segment row must not surface
    // because the parent transcript.status isn't 'ready'.
    db.connection.prepare(`INSERT INTO video_transcript_segments(id,project_id,transcript_id,source_id,video_id,segment_index,start_seconds,end_seconds,text,text_fingerprint,created_at) VALUES(?,?,?,?,?,0,0,1,?,?,?)`)
      .run(uuidv7(), project.id, transcriptId, source.id, videoRowId, `Contenido sobre ${term} que no debe aparecer`, "f".repeat(64), now);
    db.close();
    app = await createApp({ databasePath, serveFrontend: false });

    const document = await approveOutlineAndGenerateChapters(project, outline);
    const leaked = document.version.blocks.find(
      (block) => block.type === "sourceReference" && String(block.content).includes(videoRowId),
    );
    expect(leaked).toBeUndefined();
  });
});

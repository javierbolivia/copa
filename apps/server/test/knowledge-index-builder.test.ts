import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { KnowledgeIndexBuilder, artifactChunks, knowledgeIndexFingerprint } from "../src/services/knowledge/knowledge-index-builder.js";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE sources(id TEXT PRIMARY KEY,project_id TEXT,include_in_analysis INTEGER,status TEXT,source_type TEXT) STRICT;
    CREATE TABLE comments(id TEXT PRIMARY KEY,project_id TEXT,source_id TEXT,text TEXT,analysis_eligible INTEGER,updated_at TEXT) STRICT;
    CREATE TABLE evidence_snippets(id TEXT PRIMARY KEY,project_id TEXT,source_id TEXT,comment_id TEXT,quote_text TEXT,created_at TEXT) STRICT;
    CREATE TABLE video_transcripts(id TEXT PRIMARY KEY,project_id TEXT,source_id TEXT,video_id TEXT,status TEXT,language TEXT,retrieved_at TEXT) STRICT;
    CREATE TABLE video_transcript_segments(id TEXT PRIMARY KEY,project_id TEXT,transcript_id TEXT,source_id TEXT,video_id TEXT,segment_index INTEGER,start_seconds REAL,end_seconds REAL,text TEXT) STRICT;
    CREATE TABLE artifacts(id TEXT PRIMARY KEY,project_id TEXT,artifact_type TEXT,active_version_id TEXT) STRICT;
    CREATE TABLE artifact_versions(id TEXT PRIMARY KEY,artifact_id TEXT,status TEXT,freshness TEXT,output_data TEXT,created_at TEXT) STRICT;`);
  db.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-a","project-a",1,"ready","youtube");
  db.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-b","project-b",1,"completed","manual");
  db.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-excluded","project-a",0,"ready","youtube");
  db.prepare("INSERT INTO comments VALUES(?,?,?,?,?,?)").run("comment-a","project-a","source-a","Mi perro ladra al pasear",1,"2026-01-01");
  db.prepare("INSERT INTO comments VALUES(?,?,?,?,?,?)").run("comment-b","project-b","source-b","Las plantas necesitan riego",1,"2026-01-01");
  db.prepare("INSERT INTO comments VALUES(?,?,?,?,?,?)").run("comment-excluded","project-a","source-excluded","No indexar",1,"2026-01-01");
  db.prepare("INSERT INTO evidence_snippets VALUES(?,?,?,?,?,?)").run("evidence-a","project-a","source-a","comment-a","Mi perro ladra al pasear", "2026-01-01");
  db.prepare("INSERT INTO comments VALUES(?,?,?,?,?,?)").run("comment-noise","project-a","source-a","Gracias",1,"2026-01-01");
  db.prepare("INSERT INTO evidence_snippets VALUES(?,?,?,?,?,?)").run("evidence-noise","project-a","source-a","comment-noise","Gracias", "2026-01-01");
  db.prepare("INSERT INTO video_transcripts VALUES(?,?,?,?,?,?,?)").run("transcript-a","project-a","source-a","video-a","ready","es","2026-01-01");
  db.prepare("INSERT INTO video_transcript_segments VALUES(?,?,?,?,?,?,?,?,?)").run("segment-a","project-a","transcript-a","source-a","video-a",0,1.5,4,"En el video se explica el paseo tranquilo");
  const insertArtifact = (type: string, project: string, output: unknown, status = "approved", freshness = "fresh") => {
    const id=`artifact-${type}-${project}-${status}`; const version=`version-${type}-${project}-${status}`;
    db.prepare("INSERT INTO artifacts VALUES(?,?,?,?)").run(id,project,type,version);
    db.prepare("INSERT INTO artifact_versions VALUES(?,?,?,?,?,?)").run(version,id,status,freshness,JSON.stringify(output),"2026-01-01");
  };
  insertArtifact("research","project-a",{summary:"Reactividad canina",questions:["Qué detona los ladridos"],hypotheses:[{text:"El paseo estresa al dueño"}]});
  insertArtifact("problems","project-a",{items:[{name:"Ladridos al pasear",summary:"Perro reactivo frente a otros perros"}]});
  insertArtifact("opportunities","project-a",{items:[{name:"Guía de paseo",rationale:"Reduce tensión",opportunity:{urgencyExplanation:"Problema urgente"}}]});
  insertArtifact("product","project-a",{name:"Curso Paseo Tranquilo",promise:"Paseos sin tirones"});
  insertArtifact("avatar","project-a",{name:"Dueño frustrado",pains:"No controla a su perro"});
  insertArtifact("mechanism","project-a",{name:"Ritual de distancia",whyItWorks:"Reduce estímulos"});
  insertArtifact("beliefs","project-a",{belief:"Mi perro nunca cambiará",reframe:"Puede aprender"});
  insertArtifact("offer","project-a",{offer:"Plan 30 días",guarantee:"Acompañamiento"});
  insertArtifact("research","project-a",{summary:"Borrador"},"draft","fresh");
  return db;
}

describe("KnowledgeIndexBuilder", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => databases.splice(0).forEach((db) => db.close()));
  it("projects only eligible canonical records with type-specific, traceable chunks", () => {
    const source=fixture(); databases.push(source); const builder=new KnowledgeIndexBuilder(source);
    const result=builder.sync(); const chunks=builder.list();
    expect(result.created).toBe(chunks.length); expect(chunks.some((chunk)=>chunk.text.includes("No indexar"))).toBe(false); expect(chunks.some((chunk)=>chunk.entityId==="evidence-noise")).toBe(false);
    expect(chunks.find((chunk)=>chunk.entityType==="evidence")).toMatchObject({sourceId:"source-a",evidenceId:"evidence-a",lifecycle:"evidence"});
    expect(chunks.filter((chunk)=>chunk.entityType==="comment")).toHaveLength(1);
    expect(chunks.find((chunk)=>chunk.entityType==="video_transcript")).toMatchObject({sourceId:"source-a",videoId:"video-a",language:"es",startSeconds:1.5,endSeconds:4,lifecycle:"video_transcript"});
    expect(chunks.map((chunk)=>chunk.entityType)).toEqual(expect.arrayContaining(["research","problems","opportunities","product","avatar","mechanism","beliefs","offer"]));
    expect(result.audit.duplicateChunks).toBe(0); expect(result.audit.emptyChunks).toBe(0); expect(result.audit.excluded.quality_low_information).toBe(1);
    builder.close();
  });
  it("is isolated, incremental, removes ineligible origins, and rebuilds deterministically", () => {
    const source=fixture(); databases.push(source); const builder=new KnowledgeIndexBuilder(source);
    const first=builder.sync(); expect(builder.search("project-a","ladridos").every((chunk)=>chunk.projectId==="project-a")).toBe(true);
    expect(builder.search("project-a","plantas")).toEqual([]); expect(builder.search("project-b","plantas")).toHaveLength(1);
    expect(builder.semanticCandidates("project-a").every((candidate) => candidate.projectId === "project-a" && candidate.text !== "")).toBe(true);
    expect(builder.sync()).toMatchObject({created:0,updated:0,removed:0,reused:first.created});
    source.prepare("UPDATE evidence_snippets SET quote_text=?,created_at=? WHERE id=?").run("Mi perro ladra cuando ve bicicletas","2026-02-01","evidence-a");
    const changed=builder.sync(); expect(changed.updated).toBe(1); expect(builder.search("project-a","bicicletas")).toHaveLength(1);
    source.prepare("UPDATE sources SET include_in_analysis=0 WHERE id=?").run("source-b");
    expect(builder.sync().removed).toBe(1);
    const before=builder.list().map((chunk)=>chunk.originKey); expect(builder.rebuild().created).toBe(before.length); expect(builder.list().map((chunk)=>chunk.originKey)).toEqual(before);
    builder.close();
  });
  it("keeps fingerprints stable and refuses empty explicit adapter fields", () => {
    expect(knowledgeIndexFingerprint("  Perro\nreactivo ")).toBe(knowledgeIndexFingerprint("Perro reactivo"));
    expect(artifactChunks("research",{analysisMetrics:{comments:10}})).toEqual([]);
  });
  it("prevents exact duplicates while retaining one traceable origin", () => {
    const source=fixture(); databases.push(source);
    source.prepare("INSERT INTO evidence_snippets VALUES(?,?,?,?,?,?)").run("evidence-copy","project-a","source-a","comment-a","Mi perro ladra al pasear","2026-01-01");
    const builder=new KnowledgeIndexBuilder(source); const result=builder.sync();
    expect(result.audit.duplicateChunks).toBe(1);
    expect(builder.list("project-a").filter((chunk)=>chunk.entityType==="evidence")).toHaveLength(1);
    builder.close();
  });
});

describe("KnowledgeIndexBuilder video transcripts", () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => databases.splice(0).forEach((db) => db.close()));

  it("indexes only ready transcript segments, preserving identity, timestamps, provenance and raw spoken text", () => {
    const source=fixture(); databases.push(source); const builder=new KnowledgeIndexBuilder(source);
    builder.sync(); const chunk=builder.list("project-a").find((c)=>c.entityType==="video_transcript");
    expect(chunk).toMatchObject({
      projectId:"project-a", sourceId:"source-a", videoId:"video-a", language:"es",
      startSeconds:1.5, endSeconds:4, sourceType:"VIDEO_TRANSCRIPT", lifecycle:"video_transcript",
      entityId:"segment-a", chunkIndex:0, text:"En el video se explica el paseo tranquilo",
    });
    // Raw spoken text only: no synthetic metadata prefix should contaminate the indexed text.
    expect(chunk!.text.includes("Video transcript")).toBe(false);
    expect(chunk!.text.includes("·")).toBe(false);
    builder.close();
  });

  it("does not index unavailable transcripts, does not break rebuild on temporary failures, and never mixes transcript with evidence or comments", () => {
    const source=fixture(); databases.push(source);
    source.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-c","project-a",1,"ready","youtube");
    source.prepare("INSERT INTO video_transcripts VALUES(?,?,?,?,?,?,?)").run("transcript-unavailable","project-a","source-c","video-c","unavailable",null,"2026-01-01");
    // A transient failure leaves stale segments behind (mirrors saveYouTubeTranscript's real behavior)
    // but the parent transcript status is no longer 'ready', so the join must exclude them.
    source.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-d","project-a",1,"ready","youtube");
    source.prepare("INSERT INTO video_transcripts VALUES(?,?,?,?,?,?,?)").run("transcript-temp","project-a","source-d","video-d","temporary_error",null,"2026-01-01");
    source.prepare("INSERT INTO video_transcript_segments VALUES(?,?,?,?,?,?,?,?,?)").run("segment-stale","project-a","transcript-temp","source-d","video-d",0,0,2,"Segmento antiguo previo al fallo");
    const builder=new KnowledgeIndexBuilder(source);
    const result=builder.sync();
    expect(result.audit.excluded).not.toHaveProperty("empty");
    const transcriptChunks=builder.list("project-a").filter((c)=>c.entityType==="video_transcript");
    expect(transcriptChunks).toHaveLength(1); // only the ready transcript, not unavailable/temporary_error
    expect(transcriptChunks.some((c)=>c.entityId==="segment-stale")).toBe(false);
    expect(transcriptChunks.some((c)=>c.videoId==="video-c")).toBe(false);
    // rebuild after a transient-failure segment exists must remain stable and not throw
    expect(()=>builder.rebuild()).not.toThrow();
    expect(builder.list("project-a").filter((c)=>c.entityType==="video_transcript")).toHaveLength(1);
    // no cross-contamination: transcript text never appears as evidence/comment chunk and vice versa
    const evidenceOrComment=builder.list("project-a").filter((c)=>c.entityType==="evidence"||c.entityType==="comment");
    expect(evidenceOrComment.some((c)=>c.text.includes("paseo tranquilo"))).toBe(false);
    expect(transcriptChunks.every((c)=>c.text!=="Mi perro ladra al pasear")).toBe(true);
    builder.close();
  });

  it("isolates transcript chunks by project and is retrievable by FTS5 with correct timestamps and provenance", () => {
    const source=fixture(); databases.push(source);
    source.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-e","project-b",1,"ready","youtube");
    source.prepare("INSERT INTO video_transcripts VALUES(?,?,?,?,?,?,?)").run("transcript-b","project-b","source-e","video-e","ready","en","2026-01-01");
    source.prepare("INSERT INTO video_transcript_segments VALUES(?,?,?,?,?,?,?,?,?)").run("segment-b","project-b","transcript-b","source-e","video-e",0,10,12.25,"The walk stays calm today");
    const builder=new KnowledgeIndexBuilder(source); builder.sync();
    const hitsA=builder.search("project-a","paseo"); const hitsB=builder.search("project-b","calm");
    expect(hitsA.every((c)=>c.projectId==="project-a")).toBe(true);
    expect(hitsB.every((c)=>c.projectId==="project-b")).toBe(true);
    expect(builder.search("project-a","calm")).toEqual([]);
    const found=hitsA.find((c)=>c.entityType==="video_transcript");
    expect(found).toMatchObject({sourceId:"source-a",videoId:"video-a",startSeconds:1.5,endSeconds:4,sourceType:"VIDEO_TRANSCRIPT"});
    builder.close();
  });

  it("keeps transcript fingerprints stable, supports incremental sync, and removes chunks when the transcript is invalidated or the segment deleted", () => {
    const source=fixture(); databases.push(source); const builder=new KnowledgeIndexBuilder(source);
    const first=builder.sync(); expect(first.created).toBeGreaterThan(0);
    expect(builder.sync()).toMatchObject({created:0,updated:0,removed:0,reused:first.created});
    const before=builder.list("project-a").find((c)=>c.entityType==="video_transcript")!.textFingerprint;
    // re-saving identical content keeps the same fingerprint (stable)
    source.prepare("UPDATE video_transcript_segments SET text=? WHERE id=?").run("En el video se explica el paseo tranquilo","segment-a");
    builder.sync();
    expect(builder.list("project-a").find((c)=>c.entityType==="video_transcript")!.textFingerprint).toBe(before);
    // content change triggers an update, not a duplicate
    source.prepare("UPDATE video_transcript_segments SET text=?,start_seconds=?,end_seconds=? WHERE id=?").run("En el video se explica el paseo con distancia",2,5,"segment-a");
    const changed=builder.sync(); expect(changed.updated).toBe(1);
    expect(builder.list("project-a").find((c)=>c.entityType==="video_transcript")).toMatchObject({startSeconds:2,endSeconds:5});
    // invalidating the transcript (status flips away from ready) removes the derived chunk
    source.prepare("UPDATE video_transcripts SET status='unavailable' WHERE id='transcript-a'").run();
    const invalidated=builder.sync();
    expect(invalidated.removed).toBe(1);
    expect(builder.list("project-a").some((c)=>c.entityType==="video_transcript")).toBe(false);
    // restoring readiness re-creates it deterministically
    source.prepare("UPDATE video_transcripts SET status='ready' WHERE id='transcript-a'").run();
    const restored=builder.sync(); expect(restored.created).toBe(1);
    // deleting the segment outright also removes the chunk without breaking rebuild
    source.prepare("DELETE FROM video_transcript_segments WHERE id='segment-a'").run();
    const afterDelete=builder.sync(); expect(afterDelete.removed).toBe(1);
    expect(()=>builder.rebuild()).not.toThrow();
    builder.close();
  });

  it("FTS5 retrieves the exact spoken segment for a content query, with its own timestamp and source provenance, not sibling segments", () => {
    const source=fixture(); databases.push(source);
    // A second, later segment of the SAME transcript with clearly distinct spoken content
    // and non-overlapping timestamps, to prove the query resolves to the correct segment.
    source.prepare("INSERT INTO video_transcript_segments VALUES(?,?,?,?,?,?,?,?,?)").run("segment-a2","project-a","transcript-a","source-a","video-a",1,4,7.2,"Ahora hablamos sobre la alimentación balanceada del cachorro");
    const builder=new KnowledgeIndexBuilder(source); builder.sync();

    const walkHits=builder.search("project-a","explica");
    expect(walkHits).toHaveLength(1);
    expect(walkHits[0]).toMatchObject({
      entityType:"video_transcript", entityId:"segment-a", sourceId:"source-a", videoId:"video-a",
      language:"es", startSeconds:1.5, endSeconds:4, sourceType:"VIDEO_TRANSCRIPT",
      text:"En el video se explica el paseo tranquilo",
    });

    const feedingHits=builder.search("project-a","alimentación");
    expect(feedingHits).toHaveLength(1);
    expect(feedingHits[0]).toMatchObject({
      entityType:"video_transcript", entityId:"segment-a2", sourceId:"source-a", videoId:"video-a",
      language:"es", startSeconds:4, endSeconds:7.2, sourceType:"VIDEO_TRANSCRIPT",
      text:"Ahora hablamos sobre la alimentación balanceada del cachorro",
    });
    // Each query must resolve to its own segment, never the sibling's timestamp/entity.
    expect(walkHits[0]!.entityId).not.toBe(feedingHits[0]!.entityId);
    expect(walkHits[0]!.startSeconds).not.toBe(feedingHits[0]!.startSeconds);
    builder.close();
  });

  it("never creates a chunk for an empty transcript segment", () => {
    const source=fixture(); databases.push(source);
    source.prepare("INSERT INTO sources VALUES(?,?,?,?,?)").run("source-f","project-a",1,"ready","youtube");
    source.prepare("INSERT INTO video_transcripts VALUES(?,?,?,?,?,?,?)").run("transcript-empty","project-a","source-f","video-f","ready","es","2026-01-01");
    source.prepare("INSERT INTO video_transcript_segments VALUES(?,?,?,?,?,?,?,?,?)").run("segment-empty","project-a","transcript-empty","source-f","video-f",0,0,1,"   ");
    const builder=new KnowledgeIndexBuilder(source); const result=builder.sync();
    expect(result.audit.excluded.empty).toBe(1);
    expect(builder.list("project-a").some((c)=>c.entityId==="segment-empty")).toBe(false);
    builder.close();
  });
});

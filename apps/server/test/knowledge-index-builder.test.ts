import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

import { KnowledgeIndexBuilder, artifactChunks, knowledgeIndexFingerprint } from "../src/services/knowledge/knowledge-index-builder.js";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE sources(id TEXT PRIMARY KEY,project_id TEXT,include_in_analysis INTEGER,status TEXT,source_type TEXT) STRICT;
    CREATE TABLE comments(id TEXT PRIMARY KEY,project_id TEXT,source_id TEXT,text TEXT,analysis_eligible INTEGER,updated_at TEXT) STRICT;
    CREATE TABLE evidence_snippets(id TEXT PRIMARY KEY,project_id TEXT,source_id TEXT,comment_id TEXT,quote_text TEXT,created_at TEXT) STRICT;
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

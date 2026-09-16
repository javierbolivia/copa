import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { Project } from "@our-platform/shared";
import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";

function openAIResponse(output: unknown) {
  return new Response(JSON.stringify({
    status: "completed",
    model: "reported-powerful",
    output: [{ type: "message", content: [{ type: "output_text", text: typeof output === "string" ? output : JSON.stringify(output) }] }],
    usage: { input_tokens: 101, output_tokens: 37 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Strict Research contract + evidence grounding (integration)", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  async function makeApp(fetchMock: ReturnType<typeof vi.fn>) {
    return createApp({
      databasePath: ":memory:",
      serveFrontend: false,
      openAI: { apiKey: "test-key", fetch: fetchMock as typeof fetch },
      llm: { economyModel: "e", powerfulModel: "p" },
    });
  }

  const validOutput = () => ({schemaVersion:2,summary:"Plan acotado",subniches:["Paseos"],hypotheses:[{text:"Necesidad por comprobar",provenance:"AI_INFERENCE",evidenceIds:[]}],questions:["¿En qué contexto aparece?"],searchSuggestions:["experiencias de paseo"],insights:[{text:"Falta contrastar la hipótesis",provenance:"AI_INFERENCE",evidenceIds:[]}]});

  it("passes the actual project description and persisted Focus to Research",async()=>{
    let sent: Record<string,any> = {};
    app=await makeApp(vi.fn(async(_url,init)=>{
      const body=JSON.parse(String(init.body));
      sent=JSON.parse(body.input);
      return openAIResponse(validOutput());
    }));
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Scope",niche:"Comportamiento",description:"Sólo dificultades durante paseos; no ansiedad en casa."}})).json<Project>();
    await app.inject({method:"PUT",url:`/api/projects/${project.id}/research-focus`,payload:{value:"Reactividad durante paseos"}});
    const result=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"openai",instructions:"Prioriza experiencias del dueño"}});
    expect(result.statusCode).toBe(200);
    expect(sent.project.description).toBe(project.description);
    expect(sent.researchFocus).toBe("Reactividad durante paseos");
    expect(sent.additionalInstructions).toBe("Prioriza experiencias del dueño");
  });

  it("rejects incomplete or falsely grounded user drafts without adding versions",async()=>{
    app=await makeApp(vi.fn(async()=>openAIResponse(validOutput())));
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Draft",niche:"Prueba"}})).json<Project>();
    await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"openai"}});
    for(const outputData of [{schemaVersion:2,summary:"Incompleto"},{...validOutput(),insights:[{text:"Inventado",provenance:"EVIDENCE_BACKED",evidenceIds:["not-in-snapshot"]}]}]){
      const draft=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/drafts`,payload:{outputData}});
      expect(draft.statusCode).toBe(409);
    }
    const list=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/research`})).json();
    expect(list.results).toHaveLength(1);
  });

  it("cannot manually approve a generation whose evidence grounding failed",async()=>{
    app=await makeApp(vi.fn(async()=>openAIResponse({...validOutput(),insights:[{text:"Sin soporte",provenance:"EVIDENCE_BACKED",evidenceIds:["invalid"]}]})));
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Approval",niche:"Prueba"}})).json<Project>();
    const draft=(await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"openai"}})).json();
    expect(draft.status).toBe("draft");
    const result=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/versions/${draft.versionId}/approve`});
    expect(result.statusCode).toBe(409);
    const list=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/research`})).json();
    expect(list.results[0].status).toBe("draft");
  });

  it.each(["focus","project","evidence"])("rejects a Research publication if %s changes while awaiting the provider",async(kind)=>{
    let project:Project;
    app=await makeApp(vi.fn(async()=>{
      if(kind==="focus")await app!.inject({method:"PUT",url:`/api/projects/${project.id}/research-focus`,payload:{value:"Otro alcance"}});
      if(kind==="project")await app!.inject({method:"PATCH",url:`/api/projects/${project.id}`,payload:{description:"Un alcance nuevo"}});
      if(kind==="evidence")await app!.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",title:"Nueva entrevista",text:"No consigo pasear tranquilo con mi perro."}});
      return openAIResponse(validOutput());
    }));
    project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Race",niche:"Paseos"}})).json<Project>();
    const result=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"openai"}});
    expect(result.statusCode).toBe(409);
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/research`})).json().results).toHaveLength(0);
  });

  it("does not allow an older edited Research draft to replace a newer approved brief",async()=>{
    app=await makeApp(vi.fn(async()=>openAIResponse(validOutput())));
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"CAS",niche:"Prueba"}})).json<Project>();
    const base=`/api/projects/${project.id}/modules/research`;
    await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"openai"}});
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:validOutput()}})).json();
    await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"openai"}});
    const result=await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`});
    expect(result.statusCode).toBe(409);
  });

  it("marks a focus-aware brief stale after a real Focus change, without changing its payload",async()=>{
    app=await makeApp(vi.fn(async()=>openAIResponse(validOutput())));
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Focus",niche:"Prueba"}})).json<Project>();
    await app.inject({method:"PUT",url:`/api/projects/${project.id}/research-focus`,payload:{value:"Paseos urbanos"}});
    const brief=(await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"openai"}})).json();
    await app.inject({method:"PUT",url:`/api/projects/${project.id}/research-focus`,payload:{value:"  Paseos   urbanos  "}});
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/research`})).json().results[0].freshness).toBe("fresh");
    await app.inject({method:"PUT",url:`/api/projects/${project.id}/research-focus`,payload:{value:"Convivencia en casa"}});
    const stored=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/research`})).json().results[0];
    expect(stored.freshness).toBe("stale");
    expect(stored.outputData).toEqual(brief.outputData);
  });

  it("uses only ready, included local evidence and records bounded coverage without provider calls",async()=>{
    const directory=mkdtempSync(join(tmpdir(),"hallazia-research-contract-"));
    const databasePath=join(directory,"test.db");
    const provider=vi.fn(async()=>openAIResponse(validOutput()));
    try{
      app=await createApp({databasePath,serveFrontend:false,openAI:{apiKey:"test",fetch:provider as typeof fetch}});
      const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Muestra",niche:"Paseos"}})).json<Project>();
      const sources=[];
      for(const text of ["No puedo pasear tranquilo con mi perro.","Esta fuente todavía está importándose.","Esta fuente se ha excluido del análisis."]){
        sources.push((await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",title:text,text}})).json());
      }
      const db=new AppDatabase(databasePath);
      try{
        db.connection.prepare("UPDATE sources SET status='importing' WHERE id=?").run(sources[1].sources[0].id);
        db.connection.prepare("UPDATE sources SET include_in_analysis=0 WHERE id=?").run(sources[2].sources[0].id);
      }finally{db.close();}
      const result=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/research/run`,payload:{provider:"mock"}});
      expect(result.statusCode).toBe(200);
      expect(result.json().outputData.validationAudit).toMatchObject({inputEvidenceCount:1,citedEvidenceCount:1,ok:true});
      expect(provider).not.toHaveBeenCalled();
    }finally{
      await app?.close();app=undefined;
      rmSync(directory,{recursive:true,force:true});
    }
  });

  it("TEST 1 — complete valid Research output is APPROVED with all promised sections", async () => {
    const complete = {
      schemaVersion: 1,
      summary: "Resumen completo",
      subniches: ["Subnicho A"],
      hypotheses: [{ text: "Hipótesis A", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Pregunta A"],
      searchSuggestions: ["Búsqueda A"],
      insights: [{ text: "Hallazgo A", provenance: "AI_INFERENCE", evidenceIds: [] }],
    };
    const fetchMock = vi.fn(async () => openAIResponse(complete));
    app = await makeApp(fetchMock);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "R", niche: "Prueba" } })).json<Project>();
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; outputData: Record<string, unknown> }>();
    expect(body.status).toBe("approved");
    expect(body.outputData.schemaVersion).toBe(2);
    for (const key of ["summary", "subniches", "hypotheses", "questions", "searchSuggestions", "insights"]) {
      expect(body.outputData[key], key).toBeTruthy();
    }
    expect((body.outputData.validationAudit as { ok: boolean }).ok).toBe(true);
    expect((body.outputData.validationAudit as { unresolvedEvidenceRefs: number }).unresolvedEvidenceRefs).toBe(0);
  });

  it("TEST 5 — evidence-invalid (schema-complete) Research output is persisted as a DRAFT, never approved", async () => {
    // Schema-complete (all sections present) but the EVIDENCE_BACKED insight has
    // only an invalid/malformed evidence ID => reaches the validator => DRAFT.
    const incomplete = {
      schemaVersion: 1,
      summary: "Resumen",
      subniches: ["Subnicho A"],
      hypotheses: [{ text: "Hipótesis A", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Pregunta A"],
      searchSuggestions: ["Búsqueda A"],
      insights: [{ text: "Hallazgo A", provenance: "EVIDENCE_BACKED", evidenceIds: ["01a010d9-cdb7-76ce-01a010d9-cdb7-76ce-b2d6-0866d0a093df"] }],
    };
    const fetchMock = vi.fn(async () => openAIResponse(incomplete));
    app = await makeApp(fetchMock);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "R", niche: "Prueba" } })).json<Project>();
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; outputData: { validationAudit: { ok: boolean; unresolvedEvidenceIds: string[] } } }>();
    expect(body.status).toBe("draft");
    expect(body.outputData.validationAudit.ok).toBe(false);
    expect(body.outputData.validationAudit.unresolvedEvidenceIds).toContain("01a010d9-cdb7-76ce-01a010d9-cdb7-76ce-b2d6-0866d0a093df");
    // No approved version exists.
    const list = await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/research` });
    const results = list.json<{ results: Array<{ status: string }> }>().results;
    expect(results.some((v) => v.status === "approved")).toBe(false);
  });

  it("TEST 7 — schema-incomplete Research output (missing section) fails the generation explicitly, never approved", async () => {
    // Missing `subniches` violates the strict provider schema => schema_mismatch
    // (after the single repair attempt) => generation FAILED (409), no artifact.
    const incomplete = {
      schemaVersion: 1,
      summary: "Resumen incompleto",
      hypotheses: [{ text: "Hipótesis A", provenance: "AI_INFERENCE", evidenceIds: [] }],
      questions: ["Pregunta A"],
      searchSuggestions: ["Búsqueda A"],
      insights: [{ text: "Hallazgo A", provenance: "AI_INFERENCE", evidenceIds: [] }],
    };
    const fetchMock = vi.fn(async () => openAIResponse(incomplete));
    app = await makeApp(fetchMock);
    const project = (await app.inject({ method: "POST", url: "/api/projects", payload: { name: "R", niche: "Prueba" } })).json<Project>();
    const res = await app.inject({ method: "POST", url: `/api/projects/${project.id}/modules/research/run`, payload: { provider: "openai" } });
    expect(res.statusCode).toBe(409);
    const list = await app.inject({ method: "GET", url: `/api/projects/${project.id}/modules/research` });
    const results = list.json<{ results: Array<{ status: string }> }>().results;
    expect(results.some((v) => v.status === "approved")).toBe(false);
  });

  it("TEST 15 — historical schemaVersion 1 Research artifact still loads unchanged", () => {
    const db = new AppDatabase(":memory:");
    const project = new ProjectRepository(db).create({ name: "H", niche: "Prueba" });
    const artifacts = new ArtifactRepository(db);
    const legacy = { schemaVersion: 1, summary: "Antiguo", insights: [{ text: "x", provenance: "AI_INFERENCE", evidenceIds: [] }] };
    const version = artifacts.createVersion({ projectId: project.id, artifactType: "research", name: "Investigación", inputSnapshot: {}, outputData: legacy });
    const loaded = artifacts.getVersion(version.id)!;
    // Not retroactively rewritten: no schemaVersion 2 stamp, no validationAudit.
    expect(loaded.outputData).toEqual(legacy);
    db.close();
  });
});

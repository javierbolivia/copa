import { afterEach, describe, expect, it, vi } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { ArtifactRepository } from "../src/repositories/artifact-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { ProjectSettingsRepository } from "../src/repositories/project-settings-repository.js";
import { WorkflowRepository } from "../src/repositories/workflow-repository.js";
import { KnowledgeRepository } from "../src/repositories/knowledge-repository.js";
import { SemanticVocabularyRepository } from "../src/repositories/semantic-vocabulary-repository.js";
import { FileExporterService } from "../src/services/file-exporter-service.js";
import { ModuleService } from "../src/services/module-service.js";
import { DeepSeekProvider } from "../src/integrations/deepseek-provider.js";
import { GeminiProvider, GEMINI_ANALYSIS_MODEL } from "../src/integrations/gemini-provider.js";
import { OpenAIProvider } from "../src/integrations/openai-provider.js";
import { GroqProvider } from "../src/integrations/groq-provider.js";
import { ValidationSession, VALIDATION_PLAN, authorizedValidationTransport, resolveValidationAuthorizationId } from "../src/services/validation-session.js";
import { StageProviderRouter } from "../src/services/stage-provider-router.js";
import { assertFrozenPlan, prepareBoundedPlan } from "../src/services/bounded-validation-plan.js";

const dbs:AppDatabase[]=[];
afterEach(()=>{for(const db of dbs.splice(0))db.close();});
function fixture(){
  const db=new AppDatabase(":memory:");dbs.push(db);
  const project=new ProjectRepository(db).create({name:"Fixture",niche:"perros reactivos",description:null});
  const artifacts=new ArtifactRepository(db),sources=new SourceRepository(db);
  for(let i=0;i<8;i++)sources.createManual(project.id,{sourceType:"manual",title:`source ${i}`,text:`Mi perro ladra al pasear y tengo miedo cuando ve otros perros. Caso ${i}.\n\nMi perro tiene ansiedad al quedarse solo y destruye muebles. Caso ${i}.`});
  db.connection.prepare("UPDATE comments SET author='author-'||id,likes=50 WHERE project_id=?").run(project.id);
  const r=artifacts.createVersion({projectId:project.id,artifactType:"research",name:"Research",inputSnapshot:{},outputData:{}});
  artifacts.createVersion({projectId:project.id,artifactType:"sources",name:"Sources",inputSnapshot:{},outputData:{},parentVersionIds:[r.id]});
  return {db,project,artifacts};
}
function response(provider:string,output:unknown,status=200){return new Response(JSON.stringify(provider==="deepseek"?{model:"deepseek-v4-flash",choices:[{message:{content:JSON.stringify(output)},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}:{candidates:[{content:{parts:[{text:JSON.stringify(output)}]},finishReason:"STOP"}],usageMetadata:{promptTokenCount:10,candidatesTokenCount:20,totalTokenCount:30}}),{status});}
const schema={name:"test",jsonSchema:{type:"object",properties:{ok:{type:"boolean"}},required:["ok"]},retryOnInvalidSchema:false};
function sessionFixture(){const f=fixture(),session=new ValidationSession(f.db.connection,"once");session.create(f.project.id,"hash",{});session.start();return {...f,session};}
describe("physical validation budget",()=>{
  it("requires one explicitly supplied, well-formed authorization identity",()=>{
    const authorizationId="hallazia-bounded-validation-9b2a105b-8df1-4d82-9b8e-73962d4384f0";
    expect(resolveValidationAuthorizationId([`--authorization-id=${authorizationId}`])).toBe(authorizationId);
    expect(()=>resolveValidationAuthorizationId([])).toThrow("VALIDATION_AUTHORIZATION_ID_REQUIRED");
    expect(()=>resolveValidationAuthorizationId(["--authorization-id=generated-by-runner"])).toThrow("VALIDATION_AUTHORIZATION_ID_INVALID");
    expect(()=>resolveValidationAuthorizationId([`--authorization-id=${authorizationId}`,`--authorization-id=${authorizationId}`])).toThrow("VALIDATION_AUTHORIZATION_ID_REQUIRED");
  });
  it("unscoped calls cannot access the one-shot transport",()=>{
    const http=vi.fn();expect(()=>authorizedValidationTransport(http)("https://api.deepseek.com/chat/completions")).toThrow("UNRESERVED_HTTP_FORBIDDEN");expect(http).not.toHaveBeenCalled();
  });
  it("allows exactly 1..4 and blocks 5 before HTTP, including a new ledger instance",async()=>{
    const {session,db}=sessionFixture();const http=vi.fn(async (url:unknown)=>response(String(url).includes("deepseek")?"deepseek":"gemini",{ok:true}));
    const ds=new DeepSeekProvider({apiKey:"fixture",fetch:http as typeof fetch}),gemini=new GeminiProvider({apiKey:"fixture",fetch:http as typeof fetch});
    for(const [i,step] of VALIDATION_PLAN.entries()){
      const provider=step.provider==="deepseek"?ds:gemini, model=step.provider==="deepseek"?ds.effectiveModel:GEMINI_ANALYSIS_MODEL;
      await session.invoke({...step,model,generationId:`generation-${i}`},()=>provider.generate({provider:step.provider,model,input:"{}",systemInstructions:"JSON",structuredOutput:schema}));
      expect(http).toHaveBeenCalledTimes(i+1);
    }
    const reloaded=new ValidationSession(db.connection,"once");
    await expect(reloaded.invoke({...VALIDATION_PLAN[3],model:GEMINI_ANALYSIS_MODEL,generationId:"fifth"},()=>gemini.generate({provider:"gemini",model:GEMINI_ANALYSIS_MODEL,input:"{}",systemInstructions:"JSON",structuredOutput:schema}))).rejects.toThrow();
    expect(http).toHaveBeenCalledTimes(4);expect(reloaded.row().request5_attempted).toBe(1);
    expect(reloaded.requests()).toHaveLength(4);expect(()=>reloaded.start()).toThrow();
  });
  it("DeepSeek invalid_schema makes one physical request, no repair",async()=>{
    const {session}=sessionFixture(),http=vi.fn(async()=>response("deepseek",{}));
    const ds=new DeepSeekProvider({apiKey:"fixture",fetch:http as typeof fetch});
    await expect(session.invoke({...VALIDATION_PLAN[0],model:ds.effectiveModel,generationId:"g"},()=>ds.generate({provider:"deepseek",model:ds.effectiveModel,input:"{}",systemInstructions:"JSON",structuredOutput:schema}))).rejects.toThrow();
    expect(http).toHaveBeenCalledTimes(1);expect(session.row().state).toBe("FAILED");
  });
  it.each([429,503])("Gemini %s cannot retry or fallback",async(status)=>{
    const http=vi.fn(async()=>response("gemini",{},status)),fallback=vi.fn();
    const router=new StageProviderRouter({gemini:new GeminiProvider({apiKey:"fixture",fetch:http as typeof fetch}),groq:new GroqProvider({apiKey:"fixture",fetch:fallback})});
    await expect(router.generateWithRouting("opportunities/direct",{input:"{}",systemInstructions:"JSON",structuredOutput:schema},{validationMode:true,autoFallback:false})).rejects.toThrow();
    expect(http).toHaveBeenCalledTimes(1);expect(fallback).not.toHaveBeenCalled();
  });
  it("blocks concurrent reservations and duplicate module claims",async()=>{
    const {session}=sessionFixture();session.claimModule("problems");expect(()=>session.claimModule("problems")).toThrow();
    const ctx={session,...VALIDATION_PLAN[0],model:"m",generationId:"g"};session.reserve(ctx,2);
    expect(()=>session.reserve(ctx,2)).toThrow();expect(session.row().used_requests).toBe(1);
    expect(()=>session.claimModule("opportunities")).toThrow();
  });
  it("rejects vocabulary external requirement before HTTP and detects corpus races",()=>{
    const {db,project}=fixture();expect(()=>prepareBoundedPlan(db,project.id,{requireVocabulary:true})).toThrow("VOCABULARY_EXTERNAL_GENERATION_REQUIRED");
    const plan=prepareBoundedPlan(db,project.id);expect(plan.maps).toHaveLength(2);
    db.connection.prepare("UPDATE comments SET likes=likes+1 WHERE project_id=?").run(project.id);
    expect(()=>assertFrozenPlan(db,plan)).toThrow("VALIDATION_SNAPSHOT_CONFLICT");
  });
});
function pipelineFixture(failAt=0, mutateAt=0, invalidMapEvidenceId?:string){
    const {db,project,artifacts}=fixture();
    const http=vi.fn(async(url:unknown,init?:RequestInit)=>{
      const provider=String(url).includes("deepseek")?"deepseek":"gemini",body=JSON.parse(String(init?.body));
      if(http.mock.calls.length===failAt)return response(provider,{},503);
      if(http.mock.calls.length===mutateAt)db.connection.prepare("UPDATE comments SET likes=likes+1 WHERE project_id=?").run(project.id);
      const input=JSON.parse(provider==="deepseek"?body.messages.find((m:any)=>m.role==="user").content:body.contents[0].parts[0].text);
      let output:unknown;
      if(input.stage==="map")output={schemaVersion:1,items:input.clusters.map((c:any,i:number)=>({id:`p${i}`,name:c.representativeQuotes[0],summary:c.representativeQuotes[0],category:"pain",evidenceIds:i===0&&invalidMapEvidenceId?[invalidMapEvidenceId]:c.representativeEvidenceIds}))};
      else if(input.stage==="global_reduce")output={schemaVersion:1,items:input.candidates};
      else {const p=input.parentOutputs.problems.items[0];output={schemaVersion:1,items:[{id:"o1",name:"Guía",problemId:p.id,evidenceIds:p.evidenceIds,scores:{frequency:60,urgency:60,emotionalIntensity:60,willingnessToPay:60,solutionFeasibility:60,competition:60,differentiation:60,commercialPotential:60,evidenceConfidence:60}}],selectedId:"o1"};}
      return response(provider,output);
    });
    const fallback=vi.fn();
    const modules=new ModuleService(db,artifacts,new WorkflowRepository(db),new FileExporterService(db,"unused"),new ProjectSettingsRepository(db),new KnowledgeRepository(db),new SemanticVocabularyRepository(db),{openAI:new OpenAIProvider(),deepSeek:new DeepSeekProvider({apiKey:"fixture",fetch:http as typeof fetch}),gemini:new GeminiProvider({apiKey:"fixture",fetch:http as typeof fetch}),groq:new GroqProvider({apiKey:"fixture",fetch:fallback})});
    const plan=modules.prepareValidation(project.id);
    return {db,project,modules,plan,http,fallback};
}
describe("canonical bounded pipeline",()=>{
  it("routes two DeepSeek MAP then Gemini reduce/opportunities, publishes canonical lineage only once",async()=>{
    const {db,project,modules,plan,http,fallback}=pipelineFixture();
    const result=await modules.executeValidation("once",plan);
    expect(http).toHaveBeenCalledTimes(4);expect(fallback).not.toHaveBeenCalled();
    expect(result.problems.status).toBe("approved");expect(result.opportunities.status).toBe("approved");
    expect(db.connection.prepare("SELECT parent_version_id FROM lineage_edges WHERE child_version_id=?").get(result.opportunities.versionId)?.parent_version_id).toBe(result.problems.versionId);
    const session=new ValidationSession(db.connection,"once");expect(session.requests().map(r=>r.provider)).toEqual(["deepseek","deepseek","gemini","gemini"]);
    expect(()=>session.claimModule("opportunities")).toThrow();
    await expect(modules.executeValidation("once",plan)).rejects.toThrow();
    await expect(modules.run(project.id,"problems","deepseek")).rejects.toThrow("VALIDATION_PROJECT_LOCKED");
    expect(http).toHaveBeenCalledTimes(4);
  });
  it.each([1,2,3,4])("stops entire pipeline at physical failure %s without a second run",async(n)=>{
    const {db,modules,plan,http,fallback}=pipelineFixture(n);
    await expect(modules.executeValidation("once",plan)).rejects.toThrow();
    expect(http).toHaveBeenCalledTimes(n);expect(fallback).not.toHaveBeenCalled();
    const ledger=new ValidationSession(db.connection,"once");expect(ledger.row().state).toBe("FAILED");
    expect(ledger.row().opportunities_started).toBe(n===4?1:0);
    expect(ledger.row().problems_version_id!==null).toBe(n===4);
    await expect(modules.executeValidation("once",plan)).rejects.toThrow();expect(http).toHaveBeenCalledTimes(n);
  });
  it("records a rejected MAP response with its exact invalid IDs and stops before request 2",async()=>{
    const invalid="not-an-allowed-evidence-id";
    const {db,modules,plan,http}=pipelineFixture(0,0,invalid);
    await expect(modules.executeValidation("once",plan)).rejects.toThrow("MAP_EVIDENCE_OUTSIDE_FROZEN_BATCH");
    expect(http).toHaveBeenCalledTimes(1);
    const request=new ValidationSession(db.connection,"once").requests()[0]!;
    expect(request.outcome).toBe("rejected");
    expect(JSON.parse(String(request.invalid_evidence_ids_json))).toEqual([invalid]);
    expect(JSON.parse(String(request.returned_evidence_ids_json))).toEqual([invalid]);
    expect(JSON.parse(String(request.response_json)).items[0].evidenceIds).toEqual([invalid]);
    const body=JSON.parse(String(http.mock.calls[0]![1]?.body));
    expect(body.messages.find((message:any)=>message.role==="system").content).toContain("CONTRATO MAP ESTRICTO");
  });
  it("concurrent duplicate submit cannot spend another request",async()=>{
    const {modules,plan,http}=pipelineFixture();
    const results=await Promise.allSettled([modules.executeValidation("once",plan),modules.executeValidation("other-id",plan)]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(http).toHaveBeenCalledTimes(4);
  });
  it.each([1,3,4])("snapshot conflict at request %s never publishes obsolete results",async(n)=>{
    const {db,modules,plan,http}=pipelineFixture(0,n);
    await expect(modules.executeValidation("once",plan)).rejects.toThrow("VALIDATION_SNAPSHOT_CONFLICT");
    expect(http).toHaveBeenCalledTimes(n);
    const row=new ValidationSession(db.connection,"once").row();
    expect(row.opportunities_version_id).toBeNull();if(n<=3)expect(row.problems_version_id).toBeNull();
  });
});

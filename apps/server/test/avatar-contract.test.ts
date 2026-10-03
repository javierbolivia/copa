import type {ModuleResult} from "@our-platform/shared";
import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it,vi} from "vitest";
import {createApp} from "../src/app.js";
import {createDemoOutput} from "../src/domain/demo-outputs.js";
describe("Avatar evidence and draft contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  async function setup(options:Partial<Parameters<typeof createApp>[0]>={}){
    app=await createApp({databasePath:":memory:",serveFrontend:false,...options});
    const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();
    const base=`/api/projects/${project.id}/modules/avatar`;
    const result=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results[0]!;
    return {base,result};
  }
  it("rejects nonexistent evidence and empty profile sections",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as Record<string,unknown>;
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,pains:[{text:"Texto inventado",provenance:"EVIDENCE_BACKED",evidenceIds:["foreign-evidence"]}]}}});
    expect(response.statusCode).toBe(409);
    expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,currentSituation:[],desiredOutcome:[]}}})).statusCode).toBe(409);
  });
  it("rejects a fabricated verbatim quote attached to a real evidence id",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {currentSituation:Array<{evidenceIds:string[]}>};
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,language:[{text:"Compraría tres mil cursos cada semana",provenance:"EVIDENCE_BACKED",evidenceIds:output.currentSituation[0]!.evidenceIds}]}}});
    expect(response.statusCode).toBe(409);
  });
  it("blocks dependent generation while a current Avatar draft awaits review",async()=>{
    const {base,result}=await setup();
    const draft=await app.inject({method:"POST",url:`${base}/drafts`,payload:{expectedBaseVersionId:result.versionId,sourceVersionId:result.versionId,outputData:result.outputData}});
    expect(draft.statusCode).toBe(201);

    const mechanism=await app.inject({method:"POST",url:`${base.replace("/modules/avatar","/modules/mechanism")}/run`,payload:{provider:"mock"}});

    expect(mechanism.statusCode).toBe(409);
    expect(mechanism.json().message).toContain("Avatar tiene un borrador vigente pendiente de aprobación");
  });
  it("does not publish a dependent result if Avatar becomes a pending draft during provider work",async()=>{
    let releaseResponse!:(response:Response)=>void;
    let markStarted!:()=>void;
    const started=new Promise<void>(resolve=>{markStarted=resolve;});
    const fetchMock=vi.fn(async()=>{
      markStarted();
      return await new Promise<Response>(resolve=>{releaseResponse=resolve;});
    });
    const {base,result}=await setup({deepSeek:{apiKey:"isolated-race-key",fetch:fetchMock as typeof fetch}});
    const projectId=base.split("/")[3]!;
    const previousMechanism=(await app.inject({method:"GET",url:`/api/projects/${projectId}/modules/mechanism`})).json<{results:Array<{versionId:string}>}>().results[0]!;
    const run=app.inject({method:"POST",url:`${base.replace("/modules/avatar","/modules/mechanism")}/run`,payload:{provider:"deepseek"}});
    await started;

    const avatarDraft=await app.inject({method:"POST",url:`${base}/drafts`,payload:{expectedBaseVersionId:result.versionId,sourceVersionId:result.versionId,outputData:result.outputData}});
    expect(avatarDraft.statusCode).toBe(201);
    const output={...createDemoOutput("mechanism",[]),evidenceIds:[]};
    releaseResponse(new Response(JSON.stringify({model:"deepseek-v4-flash",choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200,headers:{"content-type":"application/json"}}));

    const response=await run;
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("Avatar tiene un borrador vigente pendiente de aprobación");
    const after=(await app.inject({method:"GET",url:`/api/projects/${projectId}/modules/mechanism`})).json<{results:Array<{versionId:string}>}>().results[0]!;
    expect(after.versionId).toBe(previousMechanism.versionId);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("cannot approve an older profile draft after a newer profile",async()=>{
    const {base,result}=await setup();
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json<ModuleResult>();
    expect(draft.status).toBe("draft");
    const newer=(await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).json<ModuleResult>();
    expect(newer.status).toBe("draft");
    expect((await app.inject({method:"POST",url:`${base}/versions/${newer.versionId}/approve`})).statusCode).toBe(200);
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);
  });
  it("saves an explicit inference as draft, preserves all other claims and approves it",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as Record<string,unknown>;
    const draft=await app.inject({method:"POST",url:`${base}/drafts`,payload:{expectedBaseVersionId:result.versionId,sourceVersionId:result.versionId,outputData:{...output,desires:[{text:"Hipótesis por contrastar",provenance:"AI_INFERENCE",evidenceIds:[]}]}}});
    expect(draft.statusCode).toBe(201);
    expect(draft.json().outputData.currentSituation).toEqual(output.currentSituation);
    expect(draft.json().outputData.avatarValidationAudit.ok).toBe(true);
    const approval=await app.inject({method:"POST",url:`${base}/versions/${draft.json().versionId}/approve`});
    expect(approval.statusCode).toBe(200);
    const versions=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results;
    expect(versions.find(version=>version.versionId===result.versionId)?.status).toBe("superseded");
    expect(versions.find(version=>version.versionId===draft.json().versionId)?.outputData).toMatchObject({desires:[{text:"Hipótesis por contrastar",provenance:"AI_INFERENCE",evidenceIds:[]}]});
  });
  it("keeps an unsupported provider profile in draft and permits an explicit corrected revision",async()=>{
    let generated:unknown;
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({model:"deepseek-v4-flash",choices:[{finish_reason:"stop",message:{content:JSON.stringify(generated)}}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200,headers:{"content-type":"application/json"}}));
    const {base,result}=await setup({deepSeek:{apiKey:"isolated-test",fetch:fetchMock as typeof fetch}});
    const output=result.outputData as Record<string,unknown>;
    generated={...output,language:[{text:"Una cita inexistente",provenance:"EVIDENCE_BACKED",evidenceIds:["foreign"]}]};
    const response=await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"deepseek"}});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({status:"draft",outputData:{avatarValidationAudit:{ok:false}}});
    expect((await app.inject({method:"POST",url:`${base}/versions/${response.json().versionId}/approve`})).statusCode).toBe(409);
    const corrected=await app.inject({method:"POST",url:`${base}/drafts`,payload:{sourceVersionId:response.json().versionId,expectedBaseVersionId:result.versionId,outputData:{...output,language:[]}}});
    expect(corrected.statusCode).toBe(201);
    expect((await app.inject({method:"POST",url:`${base}/versions/${corrected.json().versionId}/approve`})).statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

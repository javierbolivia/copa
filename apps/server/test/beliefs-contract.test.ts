import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it,vi} from "vitest";
import {createApp} from "../src/app.js";
import type {ModuleResult} from "@our-platform/shared";
import {createDemoOutput} from "../src/domain/demo-outputs.js";

describe("Beliefs review contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});

  it("keeps generated beliefs in review until explicitly approved",async()=>{
    app=await createApp({databasePath:":memory:",serveFrontend:false});
    const demo=await app.inject({method:"POST",url:"/api/demo/projects"});
    expect(demo.statusCode).toBe(201);
    const projectId=demo.json<{project:{id:string}}>().project.id;
    const generated=await app.inject({method:"POST",url:`/api/projects/${projectId}/modules/beliefs/run`,payload:{provider:"mock"}});
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({status:"draft",outputData:{beliefsValidationAudit:{ok:true}}});
    const versionId=generated.json<{versionId:string}>().versionId;
    const approved=await app.inject({method:"POST",url:`/api/projects/${projectId}/modules/beliefs/versions/${versionId}/approve`});
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({status:"approved",versionId});
  });

  it("blocks dependent generation while a current Beliefs draft awaits review",async()=>{
    app=await createApp({databasePath:":memory:",serveFrontend:false});
    const demo=await app.inject({method:"POST",url:"/api/demo/projects"});
    const projectId=demo.json<{project:{id:string}}>().project.id;
    const base=`/api/projects/${projectId}/modules/beliefs`;
    const selected=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results[0]!;
    const draft=await app.inject({method:"POST",url:`${base}/drafts`,payload:{expectedBaseVersionId:selected.versionId,sourceVersionId:selected.versionId,outputData:selected.outputData}});
    expect(draft.statusCode).toBe(201);

    const offer=await app.inject({method:"POST",url:`/api/projects/${projectId}/modules/offer/run`,payload:{provider:"mock"}});

    expect(offer.statusCode).toBe(409);
    expect(offer.json().message).toContain("Creencias tiene un borrador vigente pendiente de aprobación");
  });

  it("does not publish an Offer if Beliefs becomes a pending draft during provider work",async()=>{
    let releaseResponse!:(response:Response)=>void;
    let markStarted!:()=>void;
    const started=new Promise<void>(resolve=>{markStarted=resolve;});
    const fetchMock=vi.fn(async()=>{
      markStarted();
      return await new Promise<Response>(resolve=>{releaseResponse=resolve;});
    });
    app=await createApp({databasePath:":memory:",serveFrontend:false,deepSeek:{apiKey:"isolated-beliefs-race-key",fetch:fetchMock as typeof fetch}});
    const demo=await app.inject({method:"POST",url:"/api/demo/projects"});
    const projectId=demo.json<{project:{id:string}}>().project.id;
    const beliefsBase=`/api/projects/${projectId}/modules/beliefs`;
    const selected=(await app.inject({method:"GET",url:beliefsBase})).json<{results:ModuleResult[]}>().results[0]!;
    const offerBase=`/api/projects/${projectId}/modules/offer`;
    const previousOffer=(await app.inject({method:"GET",url:offerBase})).json<{results:ModuleResult[]}>().results[0]!;
    const run=app.inject({method:"POST",url:`${offerBase}/run`,payload:{provider:"deepseek"}});
    await started;

    const draft=await app.inject({method:"POST",url:`${beliefsBase}/drafts`,payload:{expectedBaseVersionId:selected.versionId,sourceVersionId:selected.versionId,outputData:selected.outputData}});
    expect(draft.statusCode).toBe(201);
    const output={...createDemoOutput("offer",[]),evidenceIds:[]};
    releaseResponse(new Response(JSON.stringify({model:"deepseek-v4-flash",choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200,headers:{"content-type":"application/json"}}));

    const response=await run;
    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain("Creencias tiene un borrador vigente pendiente de aprobación");
    const after=(await app.inject({method:"GET",url:offerBase})).json<{results:Array<{versionId:string}>}>().results[0]!;
    expect(after.versionId).toBe(previousOffer.versionId);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

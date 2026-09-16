import type {ModuleResult} from "@our-platform/shared";
import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";

describe("Opportunity decisions",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  const setup=async()=>{
    app=await createApp({databasePath:":memory:",serveFrontend:false,logger:false});
    const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();
    const base=`/api/projects/${project.id}/modules/opportunities`;
    const result=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results[0]!;
    return {base,result};
  };
  it("preserves decision rationale while recalculating the total",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {items:Array<Record<string,unknown>>};
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,items:output.items.map(item=>({...item,total:999,rationale:"La evidencia cubre el dolor; falta validar compra."}))}}});
    expect(response.statusCode).toBe(201);
    expect(response.json().outputData.items[0].rationale).toBe("La evidencia cubre el dolor; falta validar compra.");
    expect(response.json().outputData.items[0].total).toBeLessThanOrEqual(100);
  });
  it("rejects saving against a base replaced while the user reviews it",async()=>{
    const {base,result}=await setup();
    expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData,expectedBaseVersionId:result.versionId}});
    expect(response.statusCode).toBe(409);
  });
  it("does not let an old selection draft replace a newer approved decision",async()=>{
    const {base,result}=await setup();
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json<ModuleResult>();
    expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);
  });
  it("keeps selection changes in a draft until explicit approval",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {items:Array<Record<string,unknown>>;selectedId:string};
    const alternative={...output.items[0],id:"alternative",name:"Alternativa por contrastar"};
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{expectedBaseVersionId:result.versionId,outputData:{...output,items:[...output.items,alternative],selectedId:alternative.id}}})).json<ModuleResult>();
    expect(draft.status).toBe("draft");
    let versions=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results;
    expect(versions.find(version=>version.versionId===result.versionId)?.status).toBe("approved");
    const response=await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`});
    expect(response.statusCode).toBe(200);
    expect(response.json().outputData.selectedId).toBe("alternative");
    versions=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results;
    expect(versions.find(version=>version.versionId===result.versionId)?.status).toBe("superseded");
  });
  it("rejects incomplete criterion explanations when supplied",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {items:Array<Record<string,unknown>>};
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,items:output.items.map(item=>({...item,scoreRationales:{frequency:"Solo una razón"}}))}}});
    expect(response.statusCode).toBe(409);
  });
});

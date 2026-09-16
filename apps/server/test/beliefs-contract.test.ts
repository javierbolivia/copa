import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";
describe("Beliefs review contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  async function setup(){app=await createApp({databasePath:":memory:",serveFrontend:false});const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();const base=`/api/projects/${project.id}/modules/beliefs`;return {base,result:(await app.inject({method:"GET",url:base})).json().results[0]};}
  it("rejects an empty thesis and malformed arguments",async()=>{const {base,result}=await setup();for(const patch of [{centralThesis:""},{arguments:[{}]}])expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...result.outputData,...patch}}})).statusCode).toBe(409);});
  it("rejects an older draft after another interpretation becomes active",async()=>{const {base,result}=await setup();const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json();expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);});
  it("keeps bridge beliefs, arguments and limiting beliefs distinct after approval",async()=>{
    const {base,result}=await setup();
    const output={...result.outputData,bridgeBeliefs:["Perspectiva intermedia"],arguments:["Razón propuesta"],limitingBeliefs:["Límite declarado"]};
    const draft=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:output,sourceVersionId:result.versionId,expectedBaseVersionId:result.versionId}});
    expect(draft.statusCode).toBe(201);
    expect(draft.json().outputData.beliefsValidationAudit.ok).toBe(true);
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.json().versionId}/approve`})).statusCode).toBe(200);
    const latest=(await app.inject({method:"GET",url:base})).json().results.find((item:{versionId:string})=>item.versionId===draft.json().versionId);
    expect(latest).toMatchObject({status:"approved",outputData:output});
  });

});

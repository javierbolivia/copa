import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";
describe("Offer review contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  async function setup(){app=await createApp({databasePath:":memory:",serveFrontend:false});const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();const base=`/api/projects/${project.id}/modules/offer`;return {base,result:(await app.inject({method:"GET",url:base})).json().results[0]};}
  it("rejects negative price and empty deliverables",async()=>{const {base,result}=await setup();for(const patch of [{pricingSuggestion:{amount:-1,currency:"USD"}},{deliverables:[]}])expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...result.outputData,...patch}}})).statusCode).toBe(409);});
  it("rejects an older offer draft after another version becomes active",async()=>{const {base,result}=await setup();const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json();expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);});
  it.each([null,0,25.5])("preserves price %s, bonus descriptions and removal through approval and reload",async amount=>{
    const {base,result}=await setup();
    const output={...result.outputData,pricingSuggestion:{amount,currency:"USD",rationale:"Decisión propuesta",terms:"Un pago"},bonuses:["Plantilla"],bonusDetails:[{name:"Plantilla",description:"Detalle persistente"}],orderBump:null};
    const draft=await app.inject({method:"POST",url:`${base}/drafts`,payload:{sourceVersionId:result.versionId,expectedBaseVersionId:result.versionId,outputData:output}});
    expect(draft.statusCode).toBe(201);
    expect(draft.json().outputData.offerValidationAudit.ok).toBe(true);
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.json().versionId}/approve`})).statusCode).toBe(200);
    const latest=(await app.inject({method:"GET",url:base})).json().results.find((item:{versionId:string})=>item.versionId===draft.json().versionId);
    expect(latest).toMatchObject({status:"approved",outputData:output});
  });

});

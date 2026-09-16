import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";
describe("Landing review contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  async function setup(){app=await createApp({databasePath:":memory:",serveFrontend:false});const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();const base=`/api/projects/${project.id}/modules/landing`;return {base,result:(await app.inject({method:"GET",url:base})).json().results[0]};}
  it("rejects an empty document and incomplete FAQ",async()=>{const {base,result}=await setup();for(const sections of [[],[{type:"faq",items:[{q:"Pregunta",a:""}]}]])expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...result.outputData,sections}}})).statusCode).toBe(409);});
  it("does not approve a draft based on a superseded landing",async()=>{const {base,result}=await setup();const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json();expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);});
});

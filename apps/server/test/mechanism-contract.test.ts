import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";
describe("Mechanism draft contract",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  async function setup(){
    app=await createApp({databasePath:":memory:",serveFrontend:false});
    const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();
    const base=`/api/projects/${project.id}/modules/mechanism`;
    const result=(await app.inject({method:"GET",url:base})).json().results[0];
    return {base,result};
  }
  it("rejects empty causal hypotheses and fabricated context references",async()=>{
    const {base,result}=await setup();
    for(const patch of [{rootCauseHypothesis:""},{evidenceIds:["fabricated"]}])expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...result.outputData,...patch}}})).statusCode).toBe(409);
  });
  it("rejects approval of an older mechanism after a newer interpretation",async()=>{
    const {base,result}=await setup();
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json();
    const generated=await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}});
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({status:"draft"});
    expect((await app.inject({method:"POST",url:`${base}/versions/${generated.json<{versionId:string}>().versionId}/approve`})).statusCode).toBe(200);
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);
  });
  it("keeps generated mechanisms in review until explicitly approved",async()=>{
    const {base}=await setup();
    const generated=await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}});
    expect(generated.statusCode).toBe(200);
    expect(generated.json()).toMatchObject({status:"draft",outputData:{mechanismValidationAudit:{ok:true}}});
    const versionId=generated.json<{versionId:string}>().versionId;
    expect((await app.inject({method:"POST",url:`${base}/versions/${versionId}/approve`})).statusCode).toBe(200);
  });
  it("blocks dependent generations while the current mechanism has an unapproved draft",async()=>{
    const {base,result}=await setup();
    const saved=await app.inject({method:"POST",url:`${base}/drafts`,payload:{sourceVersionId:result.versionId,expectedBaseVersionId:result.versionId,outputData:result.outputData}});
    expect(saved.statusCode).toBe(201);
    const projectId=base.split("/")[3]!;
    const before=(await app.inject({method:"GET",url:`/api/projects/${projectId}/generations`})).json<{generations:unknown[]}>().generations.length;
    const blocked=await app.inject({method:"POST",url:`/api/projects/${projectId}/modules/beliefs/run`,payload:{provider:"mock"}});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({error:"module_blocked",message:expect.stringContaining("Mecanismo tiene un borrador vigente")});
    const after=(await app.inject({method:"GET",url:`/api/projects/${projectId}/generations`})).json<{generations:unknown[]}>().generations.length;
    expect(after).toBe(before);
  });
  it("persists separate explanations and optional steps through approval and reload",async()=>{
    const {base,result}=await setup();
    const output={...result.outputData,simpleExplanation:"Resumen editado",detailedExplanation:"Desarrollo independiente",steps:["Paso nuevo"],alternatives:["Otra opción"]};
    const saved=await app.inject({method:"POST",url:`${base}/drafts`,payload:{sourceVersionId:result.versionId,expectedBaseVersionId:result.versionId,outputData:output}});
    expect(saved.statusCode).toBe(201);
    expect(saved.json()).toMatchObject({status:"draft",outputData:{mechanismValidationAudit:{ok:true}}});
    expect((await app.inject({method:"POST",url:`${base}/versions/${saved.json().versionId}/approve`})).statusCode).toBe(200);
    const versions=(await app.inject({method:"GET",url:base})).json().results;
    expect(versions.find((item:{versionId:string})=>item.versionId===saved.json().versionId)).toMatchObject({status:"approved",outputData:output});
    expect(versions.find((item:{versionId:string})=>item.versionId===result.versionId).status).toBe("superseded");
  });

});

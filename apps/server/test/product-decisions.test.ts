import type {ModuleResult} from "@our-platform/shared";
import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {AppDatabase} from "../src/database/database.js";

describe("Product draft decisions",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  const setup=async()=>{
    app=await createApp({databasePath:":memory:",serveFrontend:false,logger:false});
    const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();
    const base=`/api/projects/${project.id}/modules/product`;
    const result=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results[0]!;
    return {base,result};
  };
  it("cannot approve an old draft over a more recent Product",async()=>{
    const {base,result}=await setup();
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json<ModuleResult>();
    expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(409);
    expect((await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:draft.outputData,sourceVersionId:draft.versionId}})).statusCode).toBe(409);
  });
  it("keeps a proposal selection in draft until explicit approval",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {proposals:Array<Record<string,unknown>>;selectedId:string};
    const alternative={...output.proposals[0],id:"alternative",name:"Guía alternativa"};
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{expectedBaseVersionId:result.versionId,outputData:{...output,proposals:[...output.proposals,alternative],selectedId:"alternative"}}});
    expect(response.statusCode).toBe(201);
    const draft=response.json<ModuleResult>();
    expect(draft.status).toBe("draft");
    const history=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results;
    expect(history.find(version=>version.status==="approved")?.versionId).toBe(result.versionId);
    const approval=await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`});
    expect(approval.statusCode).toBe(200);
    expect(approval.json().outputData.selectedId).toBe("alternative");
  });
  it("can explicitly revise the first Product draft when no approved Product exists",async()=>{
    const directory=mkdtempSync(join(tmpdir(),"hallazia-product-first-draft-"));
    const databasePath=join(directory,"qa.sqlite");
    try{
      app=await createApp({databasePath,serveFrontend:false});
      const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();
      const base=`/api/projects/${project.id}/modules/product`;
      const result=(await app.inject({method:"GET",url:base})).json<{results:ModuleResult[]}>().results[0]!;
      await app.close();
      const database=new AppDatabase(databasePath);
      try{
        database.connection.prepare("UPDATE artifacts SET active_version_id=NULL WHERE id=?").run(result.artifactId);
        database.connection.prepare("UPDATE artifact_versions SET status='draft',input_snapshot=? WHERE id=?").run(JSON.stringify({activeVersionIdAtStart:null,evidenceIds:[]}),result.versionId);
      }finally{database.close();}
      app=await createApp({databasePath,serveFrontend:false});
      const output=structuredClone(result.outputData) as {proposals:Array<Record<string,unknown>>};
      output.proposals.forEach(proposal=>{proposal.evidenceIds=[];});
      const saved=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:output,sourceVersionId:result.versionId}});
      expect(saved.statusCode).toBe(201);
      expect(saved.json().versionId).not.toBe(result.versionId);
      expect((await app.inject({method:"POST",url:`${base}/versions/${saved.json().versionId}/approve`})).statusCode).toBe(200);
    }finally{
      await app.close();
      if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw new Error("Unexpected test directory");
      rmSync(directory,{recursive:true,force:true});
    }
  });
});

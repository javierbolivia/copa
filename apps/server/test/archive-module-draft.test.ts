import {describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";

describe("archiving an unused module draft",()=>{
  it("preserves the approved Avatar, keeps the draft in history and unblocks downstream generation",async()=>{
    const app=await createApp({databasePath:":memory:",serveFrontend:false});
    try{
      const demo=(await app.inject({method:"POST",url:"/api/demo/projects"})).json<{project:{id:string}}>();
      const id=demo.project.id;
      const before=(await app.inject({method:"GET",url:`/api/projects/${id}/modules/avatar`})).json<{results:Array<{versionId:string;status:string}>}>().results;
      const approved=before.find(item=>item.status==="approved")!;
      const generated=await app.inject({method:"POST",url:`/api/projects/${id}/modules/avatar/run`,payload:{provider:"mock"}});
      expect(generated.statusCode).toBe(200);
      const draft=generated.json<{versionId:string;status:string}>();expect(draft.status).toBe("draft");
      const blocked=await app.inject({method:"POST",url:`/api/projects/${id}/modules/content/run`,payload:{provider:"mock"}});
      expect(blocked.statusCode).toBe(409);

      const archived=await app.inject({method:"POST",url:`/api/projects/${id}/modules/avatar/versions/${draft.versionId}/archive`,payload:{}});
      expect(archived.statusCode,archived.body).toBe(200);
      expect(archived.json()).toMatchObject({versionId:draft.versionId,status:"archived"});
      const after=(await app.inject({method:"GET",url:`/api/projects/${id}/modules/avatar`})).json<{results:Array<{versionId:string;status:string}>}>().results;
      expect(after.find(item=>item.versionId===approved.versionId)?.status).toBe("approved");
      expect(after.find(item=>item.versionId===draft.versionId)?.status).toBe("archived");
      const allowed=await app.inject({method:"POST",url:`/api/projects/${id}/modules/content/run`,payload:{provider:"mock"}});
      expect(allowed.statusCode,allowed.body).toBe(200);
      const cannotArchiveActive=await app.inject({method:"POST",url:`/api/projects/${id}/modules/avatar/versions/${approved.versionId}/archive`,payload:{}});
      expect(cannotArchiveActive.statusCode).toBe(409);
    }finally{await app.close();}
  });
});

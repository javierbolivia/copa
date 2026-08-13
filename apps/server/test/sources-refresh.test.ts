import type { Project } from "@our-platform/shared";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("refresh de dependencia Sources",()=>{
  const apps:Awaited<ReturnType<typeof createApp>>[]=[];afterEach(async()=>{await Promise.all(apps.splice(0).map(app=>app.close()));});
  it("materializa Sources vigente antes de Problemas cuando una importación dejó el artefacto stale",async()=>{
    const app=await createApp({databasePath:":memory:",serveFrontend:false});apps.push(app);
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"P",niche:"Fotos"}})).json<Project>();
    await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",text:"No sé cómo organizar mis fotos."}});
    expect((await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/sources/run`,payload:{provider:"mock"}})).statusCode).toBe(200);
    await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",text:"Tengo miedo de perder fotos."}});
    const stale=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/sources`})).json<{results:Array<{freshness:string}>}>().results[0];expect(stale?.freshness).toBe("stale");
    const response=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/problems/run`,payload:{provider:"mock"}});
    expect(response.statusCode).toBe(200);const sources=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/sources`})).json<{results:Array<{freshness:string}>}>().results[0];expect(sources?.freshness).toBe("fresh");
  });
});

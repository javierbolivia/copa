import type {ModuleResult,Project} from "@our-platform/shared";
import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";

describe("Problems draft quality boundary",()=>{
  let app:FastifyInstance;
  afterEach(async()=>{await app?.close();});
  const setup=async()=>{
    app=await createApp({databasePath:":memory:",serveFrontend:false,logger:false});
    const project=(await app.inject({method:"POST",url:"/api/demo/projects"})).json<{project:Project}>().project;
    const result=(await app.inject({method:"GET",url:`/api/projects/${project.id}/modules/problems`})).json<{results:ModuleResult[]}>().results[0]!;
    return {base:`/api/projects/${project.id}/modules/problems`,result};
  };
  it("rejects an invented evidence reference before creating a draft",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {items:Array<Record<string,unknown>>};
    expect(output.items.length).toBeGreaterThan(0);
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,items:[{...output.items[0],evidenceIds:[crypto.randomUUID()]}]}}});
    expect(response.statusCode).toBe(409);
    expect((await app.inject({method:"GET",url:base})).json().results).toHaveLength(1);
  });
  it("recomputes claimed support and strength instead of trusting editable metrics",async()=>{
    const {base,result}=await setup();
    const output=result.outputData as {items:Array<Record<string,unknown>>};
    const response=await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:{...output,analysisMetrics:{commentsSelectedForSemanticAnalysis:999999,candidateInsights:999999},items:output.items.map(item=>({...item,problemStrengthScore:999,evidenceCount:999,uniqueAuthors:999,evidence:[{quote:"invented quote"}]}))}}});
    expect(response.statusCode).toBe(201);
    const draft=response.json<ModuleResult>();
    const items=(draft.outputData as typeof output).items;
    expect(items.every(item=>Number(item.problemStrengthScore)<=100&&Number(item.evidenceCount)<999)).toBe(true);
    expect(JSON.stringify(items)).not.toContain("invented quote");
    expect(JSON.stringify(draft.outputData)).not.toContain("999999");
    expect((await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`})).statusCode).toBe(200);
  });
  it("prevents an older edited draft replacing a newer active interpretation",async()=>{
    const {base,result}=await setup();
    const draft=(await app.inject({method:"POST",url:`${base}/drafts`,payload:{outputData:result.outputData}})).json<ModuleResult>();
    expect((await app.inject({method:"POST",url:`${base}/run`,payload:{provider:"mock"}})).statusCode).toBe(200);
    const approval=await app.inject({method:"POST",url:`${base}/versions/${draft.versionId}/approve`});
    expect(approval.statusCode).toBe(409);
  });
});

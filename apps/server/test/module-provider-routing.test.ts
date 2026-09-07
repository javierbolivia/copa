import type { ModuleKey, Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { createDemoOutput } from "../src/domain/demo-outputs.js";
import { MODULES } from "../src/domain/module-registry.js";
import { DEEPSEEK_DEFAULT_MODEL } from "../src/integrations/deepseek-provider.js";
import { GEMINI_ANALYSIS_MODEL } from "../src/services/module-service.js";

const providerModules=MODULES.map(module=>module.key).filter((key):key is Exclude<ModuleKey,"sources">=>key!=="sources");

function canonicalOutput(key:Exclude<ModuleKey,"sources">,input:Record<string,unknown>={}):Record<string,unknown>{
  const output:Record<string,unknown>={...createDemoOutput(key,[]),evidenceIds:[]};
  if(key==="problems"){
    const candidates=Array.isArray(input.candidates)?input.candidates:undefined;
    const evidence=Array.isArray(input.evidence)?input.evidence.filter((item):item is {id:string;quoteText:string}=>typeof item==="object"&&item!==null&&typeof (item as {id?:unknown}).id==="string"&&typeof (item as {quoteText?:unknown}).quoteText==="string"):[];
    output.items=candidates??evidence.map((item,index)=>({id:`provider-problem-${index+1}`,name:"Organización de fotografías digitales",category:"pain",summary:item.quoteText,evidenceIds:[item.id],researchRelevanceScore:100}));
  }
  if(key==="opportunities"&&Array.isArray(output.items)){
    const parentOutputs=typeof input.parentOutputs==="object"&&input.parentOutputs!==null?input.parentOutputs as Record<string,unknown>:{};
    const problems=typeof parentOutputs.problems==="object"&&parentOutputs.problems!==null?parentOutputs.problems as {items?:Array<{id?:unknown;evidenceIds?:unknown}>}:{};
    const problem=problems.items?.[0];
    output.items=output.items.map((item)=>({...item as Record<string,unknown>,problemId:problem?.id,evidenceIds:Array.isArray(problem?.evidenceIds)?problem.evidenceIds:[]}));
  }
  if(key==="product"&&Array.isArray(output.proposals))output.proposals=output.proposals.map((proposal:unknown)=>({...proposal as Record<string,unknown>,evidenceIds:[]}));
  return output;
}

function requestedModule(input:string):Exclude<ModuleKey,"sources">|undefined{
  try{
    const parsed=JSON.parse(input) as {moduleKey?:ModuleKey};
    return parsed.moduleKey&&parsed.moduleKey!=="sources"?parsed.moduleKey:undefined;
  }catch{return undefined;}
}

function deepSeekResponse(output:unknown){
  return new Response(JSON.stringify({model:DEEPSEEK_DEFAULT_MODEL,choices:[{finish_reason:"stop",message:{content:JSON.stringify(output)}}],usage:{prompt_tokens:21,completion_tokens:13}}),{status:200,headers:{"content-type":"application/json"}});
}

function geminiResponse(output:unknown){
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}],usageMetadata:{promptTokenCount:21,candidatesTokenCount:13}}),{status:200,headers:{"content-type":"application/json"}});
}

describe("matriz compartida de proveedores de módulos",()=>{
  let app:FastifyInstance|undefined;
  afterEach(async()=>{await app?.close();app=undefined;});

  it("enruta y persiste DeepSeek en todos los módulos generativos",async()=>{
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
      const input=JSON.parse(body.messages[1]!.content) as Record<string,unknown>;
      const key=requestedModule(body.messages[1]!.content);
      return deepSeekResponse(canonicalOutput(key??"research",input));
    });
    app=await createApp({databasePath:":memory:",serveFrontend:false,deepSeek:{apiKey:"deepseek-matrix-key",fetch:fetchMock as typeof fetch}});
    const demo=(await app.inject({method:"POST",url:"/api/demo/projects"})).json<{project:Project}>();

    for(const key of providerModules){
      const response=await app.inject({method:"POST",url:`/api/projects/${demo.project.id}/modules/${key}/run`,payload:{provider:"deepseek"}});
      expect(response.statusCode,`${key}: ${response.body}`).toBe(200);
      expect(response.json()).toMatchObject({moduleKey:key});
    }

    const generations=(await app.inject({method:"GET",url:`/api/projects/${demo.project.id}/generations`})).json<{generations:Array<{provider:string;model:string;status:string;artifactVersionId:string|null;versionNumber:number|null}>}>().generations.filter(generation=>generation.provider==="deepseek"&&generation.artifactVersionId!==null);
    expect(generations).toHaveLength(providerModules.length);
    expect(generations.every(generation=>generation.model===DEEPSEEK_DEFAULT_MODEL&&generation.status==="COMPLETED"&&generation.versionNumber!==null)).toBe(true);
    const requestBodies=(fetchMock.mock.calls as unknown as Array<[unknown,RequestInit]>).map(([,init])=>JSON.parse(String(init.body)) as {thinking:unknown;response_format:unknown;messages:Array<{content:string}>});
    for(const body of requestBodies)expect(body).toMatchObject({thinking:{type:"disabled"},response_format:{type:"json_object"}});
    const moduleInputs=requestBodies.flatMap(body=>{try{return[JSON.parse(body.messages[1]!.content) as {moduleKey?:ModuleKey;parentOutputs?:Record<string,Record<string,unknown>>}];}catch{return[];}});
    const mechanismRequest=moduleInputs.find(input=>input.moduleKey==="mechanism");
    expect(mechanismRequest?.parentOutputs?.problems).toMatchObject({items:expect.any(Array)});
    expect(mechanismRequest?.parentOutputs?.problems).not.toHaveProperty("analysisAudit");
  });

  it("enruta y persiste Gemini en la misma matriz de módulos",async()=>{
    const fetchMock=vi.fn(async(_url:unknown,init?:RequestInit)=>{
      const body=JSON.parse(String(init?.body)) as {contents:Array<{parts:Array<{text:string}>}>};
      const input=JSON.parse(body.contents[0]!.parts[0]!.text) as Record<string,unknown>;
      const key=requestedModule(body.contents[0]!.parts[0]!.text);
      return geminiResponse(canonicalOutput(key??"research",input));
    });
    app=await createApp({databasePath:":memory:",serveFrontend:false,gemini:{apiKey:"gemini-matrix-key",fetch:fetchMock as typeof fetch}});
    const demo=(await app.inject({method:"POST",url:"/api/demo/projects"})).json<{project:Project}>();

    for(const key of providerModules){
      const response=await app.inject({method:"POST",url:`/api/projects/${demo.project.id}/modules/${key}/run`,payload:{provider:"gemini"}});
      expect(response.statusCode,`${key}: ${response.body}`).toBe(200);
      expect(response.json()).toMatchObject({moduleKey:key});
    }

    const generations=(await app.inject({method:"GET",url:`/api/projects/${demo.project.id}/generations`})).json<{generations:Array<{provider:string;model:string;status:string;artifactVersionId:string|null;versionNumber:number|null}>}>().generations.filter(generation=>generation.provider==="gemini"&&generation.artifactVersionId!==null);
    expect(generations).toHaveLength(providerModules.length);
    expect(generations.every(generation=>generation.model===GEMINI_ANALYSIS_MODEL&&generation.status==="COMPLETED"&&generation.versionNumber!==null)).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});

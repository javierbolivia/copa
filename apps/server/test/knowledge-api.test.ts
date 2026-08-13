import type { ArtifactVersion, KnowledgeChunkResult, KnowledgeDocument, KnowledgeLibrary, ModuleResult, Project } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";

describe("Knowledge API end-to-end",()=>{
  let app:FastifyInstance;
  beforeEach(async()=>{app=await createApp({databasePath:":memory:",logger:false,serveFrontend:false});});
  afterEach(async()=>app.close());

  it("crea biblioteca privada, importa manual, busca y responde con citas",async()=>{
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Proyecto Knowledge",niche:"Educación financiera"}})).json<Project>();
    const libraryResponse=await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/libraries`,payload:{name:"Principios internos",scope:"PROJECT",domain:"MARKETING",category:"Frameworks",tags:["copy","ética"],priority:80}});
    expect(libraryResponse.statusCode).toBe(201);
    const library=libraryResponse.json<KnowledgeLibrary>();
    expect(library).toMatchObject({scope:"PROJECT",projectId:project.id,category:"Frameworks",tags:["copy","ética"],enabled:true});

    const imported=await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/libraries/${library.id}/documents`,payload:{title:"Guía responsable",description:"Regla editorial interna",category:"Compliance",tags:["riesgo","claridad"],priority:90,fileType:"manual",text:"La educación financiera responsable empieza con un presupuesto realista. Nunca se deben prometer ganancias garantizadas. La evidencia y los riesgos deben explicarse con claridad."}});
    expect(imported.statusCode).toBe(201);
    expect(imported.json<KnowledgeDocument>()).toMatchObject({status:"READY",chunkCount:1,fileType:"manual",description:"Regla editorial interna"});

    const search=await app.inject({method:"GET",url:`/api/projects/${project.id}/knowledge/search?q=presupuesto+realista`});
    expect(search.statusCode).toBe(200);
    const results=search.json<{results:KnowledgeChunkResult[]}>().results;
    expect(results[0]).toMatchObject({documentTitle:"Guía responsable",libraryName:"Principios internos",sourceKind:"document"});
    expect(results[0]!.content).toContain("presupuesto realista");

    const ask=await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/ask`,payload:{question:"¿Qué dice sobre presupuesto y riesgos?"}});
    expect(ask.statusCode).toBe(200);
    expect(ask.json<{grounded:boolean;citations:KnowledgeChunkResult[]}>()).toMatchObject({grounded:true});
    expect(ask.json<{citations:KnowledgeChunkResult[]}>().citations.length).toBeGreaterThan(0);
    expect(ask.json<{mode:string}>().mode).toBe("extractive");

    const disabled=await app.inject({method:"PUT",url:`/api/projects/${project.id}/knowledge/libraries/${library.id}/selection`,payload:{enabled:false}});
    expect(disabled.json<KnowledgeLibrary>().enabled).toBe(false);
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/knowledge/search?q=presupuesto`})).json<{results:unknown[]}>().results).toHaveLength(0);
  });

  it("usa OpenAI configurado para Ask y sólo devuelve citas conocidas",async()=>{
    await app.close();
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({status:"completed",model:"ask-test",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({answer:"Un presupuesto realista reduce decisiones impulsivas [K1].",citationIds:["K1","K999"]})}]}],usage:{input_tokens:20,output_tokens:12}}),{status:200,headers:{"content-type":"application/json"}}));
    app=await createApp({databasePath:":memory:",logger:false,serveFrontend:false,openAI:{apiKey:"test-key",fetch:fetchMock as typeof fetch}});
    const project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Ask OpenAI",niche:"Finanzas"}})).json<Project>();
    await app.inject({method:"PUT",url:`/api/projects/${project.id}/settings`,payload:{language:"es",targetMarket:null,currency:"USD",generalNotes:null,preferredLlmProvider:"openai",economyModel:"ask-economy",powerfulModel:null,maxBudget:null,contentLanguage:"es",knowledgeEnabled:true}});
    const library=(await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/libraries`,payload:{name:"Base",scope:"PROJECT"}})).json<KnowledgeLibrary>();
    await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/libraries/${library.id}/documents`,payload:{title:"Presupuesto",fileType:"manual",text:"Un presupuesto realista ayuda a priorizar gastos y reduce decisiones impulsivas."}});
    const ask=await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/ask`,payload:{question:"¿Para qué sirve un presupuesto realista?"}});
    expect(ask.statusCode).toBe(200);
    expect(ask.json<{mode:string;citations:KnowledgeChunkResult[]}>()).toMatchObject({mode:"openai",citations:[{documentTitle:"Presupuesto"}]});
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody=JSON.parse(String((fetchMock.mock.calls as unknown as Array<[unknown,RequestInit]>)[0]![1].body));
    expect(requestBody.model).toBe("ask-economy");
    expect(requestBody.text.format.name).toBe("knowledge_answer");

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({status:"completed",model:"ask-test",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify({answer:"Afirmación no fundamentada [K999].",citationIds:["K1"]})}]}]}),{status:200,headers:{"content-type":"application/json"}}));
    expect((await app.inject({method:"POST",url:`/api/projects/${project.id}/knowledge/ask`,payload:{question:"¿Para qué sirve un presupuesto realista?"}})).statusCode).toBe(502);
  });

  it("aísla privadas e inyecta Knowledge con trace en una generación",async()=>{
    const demo=(await app.inject({method:"POST",url:"/api/demo/projects"})).json<{project:Project}>().project;
    const stranger=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Otro",niche:"Otro nicho"}})).json<Project>();
    const library=(await app.inject({method:"POST",url:`/api/projects/${demo.id}/knowledge/libraries`,payload:{name:"Voz aprobada",scope:"PROJECT"}})).json<KnowledgeLibrary>();
    await app.inject({method:"POST",url:`/api/projects/${demo.id}/knowledge/libraries/${library.id}/documents`,payload:{title:"Regla editorial",fileType:"manual",text:"Toda propuesta debe ser específica, comprobable y evitar urgencia artificial. Usar lenguaje claro y sobrio."}});

    const outsider=await app.inject({method:"GET",url:`/api/projects/${stranger.id}/knowledge/libraries`});
    expect(outsider.json<{libraries:KnowledgeLibrary[]}>().libraries.some(item=>item.id===library.id)).toBe(false);

    const run=await app.inject({method:"POST",url:`/api/projects/${demo.id}/modules/product/run`,payload:{provider:"mock",instructions:"propuesta específica comprobable"}});
    expect(run.statusCode).toBe(200);
    const generation=(await app.inject({method:"GET",url:`/api/projects/${demo.id}/generations`})).json<{generations:Array<{id:string}>}>().generations[0]!;
    const used=await app.inject({method:"GET",url:`/api/projects/${demo.id}/generations/${generation.id}/knowledge`});
    expect(used.statusCode).toBe(200);
    expect(JSON.stringify(used.json())).toContain("Regla editorial");

    const product=run.json<ModuleResult>();
    const trace=await app.inject({method:"GET",url:`/api/projects/${demo.id}/versions/${product.versionId}/traceability`});
    expect(trace.statusCode).toBe(200);
    expect(trace.json<{knowledgeCount:number}>().knowledgeCount).toBeGreaterThan(0);
    const memory=await app.inject({method:"PUT",url:`/api/projects/${demo.id}/knowledge/memory/${product.versionId}`,payload:{decision:"APPROVED",reusable:true,preferred:true,editedOutput:{guidance:"memoria unicornio aprobada para propuesta específica"}}});
    expect(memory.statusCode).toBe(200);
    await app.inject({method:"POST",url:`/api/projects/${demo.id}/modules/product/run`,payload:{provider:"mock",instructions:"memoria unicornio propuesta específica"}});
    const latest=(await app.inject({method:"GET",url:`/api/projects/${demo.id}/generations`})).json<{generations:Array<{id:string}>}>().generations[0]!;
    const memoryUsed=(await app.inject({method:"GET",url:`/api/projects/${demo.id}/generations/${latest.id}/knowledge`})).json<{contextTokenEstimate:number;items:Array<{kind:string;content:string|null;title:string|null}>}>();
    expect(memoryUsed.contextTokenEstimate).toBeLessThanOrEqual(2300);
    expect(memoryUsed.items).toEqual(expect.arrayContaining([expect.objectContaining({kind:"APPROVED_MEMORY",title:"Memoria aprobada · product",content:expect.stringContaining("memoria unicornio")})]));
    const versions=(await app.inject({method:"GET",url:`/api/projects/${demo.id}/artifacts`})).json<{versions:ArtifactVersion[]}>().versions;
    const latestProduct=versions.filter(item=>item.artifactType==="product").sort((a,b)=>b.versionNumber-a.versionNumber)[0]!;
    const sent=(latestProduct.inputSnapshot as {knowledgeUsed:Array<{content:string}>}).knowledgeUsed;
    expect(memoryUsed.items).toHaveLength(sent.length);
    expect(memoryUsed.items.map(item=>item.content)).toEqual(sent.map(item=>item.content));
  });

  it("protege documentos globales, acepta payloads >1 MiB y conserva búsquedas de frase",async()=>{
    const first=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Global A",niche:"A"}})).json<Project>();
    const second=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Global B",niche:"B"}})).json<Project>();
    const library=(await app.inject({method:"POST",url:`/api/projects/${first.id}/knowledge/libraries`,payload:{name:"Pack global QA",scope:"GLOBAL"}})).json<KnowledgeLibrary>();
    const largeText=`propuesta de valor exacta. ${"contenido local seguro ".repeat(55_000)}`;
    const exact=(await app.inject({method:"POST",url:`/api/projects/${first.id}/knowledge/libraries/${library.id}/documents`,payload:{title:"Exacto",fileType:"manual",text:largeText}})).json<KnowledgeDocument>();
    await app.inject({method:"POST",url:`/api/projects/${first.id}/knowledge/libraries/${library.id}/documents`,payload:{title:"Disperso",fileType:"manual",text:"propuesta con ruido intermedio y finalmente valor, sin ser una frase exacta."}});
    await app.inject({method:"PUT",url:`/api/projects/${second.id}/knowledge/libraries/${library.id}/selection`,payload:{enabled:true}});
    const destructive=await app.inject({method:"DELETE",url:`/api/projects/${second.id}/knowledge/documents/${exact.id}`});
    expect(destructive.statusCode).toBe(409);
    const phrase=await app.inject({method:"GET",url:`/api/projects/${first.id}/knowledge/search?q=${encodeURIComponent('"propuesta de valor"')}`});
    expect(phrase.statusCode).toBe(200);
    expect(phrase.json<{results:KnowledgeChunkResult[]}>().results.map(item=>item.documentTitle)).toContain("Exacto");
    expect(phrase.json<{results:KnowledgeChunkResult[]}>().results.map(item=>item.documentTitle)).not.toContain("Disperso");
  });
});

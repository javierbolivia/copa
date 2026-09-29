import type { Project, SourceBundle } from "@our-platform/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { JobRepository } from "../src/repositories/job-repository.js";
import { extractYouTubeVideoId } from "../src/services/youtube-import-service.js";
import { YouTubeImportService } from "../src/services/youtube-import-service.js";
import { YouTubeAdapter, type YouTubeComment, type YouTubeThread } from "../src/integrations/youtube-adapter.js";

describe("Sources API",()=>{
  let app:FastifyInstance; let project:Project;
  beforeEach(async()=>{app=await createApp({databasePath:":memory:",logger:false,serveFrontend:false});project=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Demo",niche:"Fotos"}})).json<Project>();});
  afterEach(async()=>app.close());

  it("crea fixture demo, evidencia y habilita Problemas",async()=>{
    const response=await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"demo"}});
    expect(response.statusCode).toBe(201);const bundle=response.json<SourceBundle>();expect(bundle.sources).toHaveLength(1);expect(bundle.sources[0]?.metadata).toMatchObject({demo:true});expect(bundle.comments).toHaveLength(10);expect(bundle.comments.every(c=>c.isDemo)).toBe(true);
    const comments=await app.inject({method:"GET",url:`/api/projects/${project.id}/comments?query=duplicados&minLikes=10`});expect(comments.json().comments).toHaveLength(1);
    const workflow=await app.inject({method:"GET",url:`/api/projects/${project.id}/workflow`});expect(workflow.json().steps.find((s:{stepKey:string})=>s.stepKey==="sources").state).toBe("COMPLETED");expect(workflow.json().steps.find((s:{stepKey:string})=>s.stepKey==="problems").state).toBe("READY");
  });

  it("pagina comentarios y conserva totales y filtros de análisis",async()=>{
    const bundle=(await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"demo"}})).json<SourceBundle>();
    const first=await app.inject({method:"GET",url:`/api/projects/${project.id}/comments?limit=3&offset=0`});
    expect(first.json()).toMatchObject({total:10,eligibleIncluded:10});expect(first.json().comments).toHaveLength(3);
    await app.inject({method:"PUT",url:`/api/projects/${project.id}/sources/${bundle.sources[0]!.id}/analysis`,payload:{included:false}});
    const included=await app.inject({method:"GET",url:`/api/projects/${project.id}/comments?analysis=included&limit=3`});
    const excluded=await app.inject({method:"GET",url:`/api/projects/${project.id}/comments?analysis=excluded&limit=3`});
    expect(included.json()).toMatchObject({total:0,eligibleIncluded:0});expect(included.json().comments).toEqual([]);
    expect(excluded.json()).toMatchObject({total:10,eligibleIncluded:0});expect(excluded.json().comments).toHaveLength(3);
  });

  it("persiste include/exclude, conserva datos y marca Sources stale",async()=>{
    const bundle=(await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"demo"}})).json<SourceBundle>();
    const source=bundle.sources[0]!;
    await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/sources/run`,payload:{provider:"mock"}});
    const response=await app.inject({method:"PUT",url:`/api/projects/${project.id}/sources/${source.id}/analysis`,payload:{included:false}});
    expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({id:source.id,includeInAnalysis:false});
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/analysis-set`})).json().comments).toEqual([]);
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/comments`})).json().comments).toHaveLength(10);
    const workflow=(await app.inject({method:"GET",url:`/api/projects/${project.id}/workflow`})).json();
    expect(workflow.steps.find((step:{stepKey:string})=>step.stepKey==="sources").state).toBe("STALE");
  });

  it("segmenta texto manual, filtra y elimina en cascada",async()=>{
    const created=await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",title:"Entrevista","text":"Primer hallazgo.\n\nSegundo hallazgo."}});expect(created.statusCode).toBe(201);const bundle=created.json<SourceBundle>();expect(bundle.comments.map(c=>c.text)).toEqual(["Primer hallazgo.","Segundo hallazgo."]);
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/sources?sourceType=manual&query=Entrevista`})).json().sources).toHaveLength(1);
    expect((await app.inject({method:"DELETE",url:`/api/projects/${project.id}/sources/${bundle.sources[0]!.id}`})).statusCode).toBe(200);
    expect((await app.inject({method:"GET",url:`/api/projects/${project.id}/comments`})).json().comments).toEqual([]);
  });

  it("elimina una fuente con comentarios sin afectar otras fuentes",async()=>{
    const demo=(await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"demo"}})).json<SourceBundle>();
    const created=await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",title:"Eliminar",text:"Uno.\n\nDos."}});
    const removed=created.json<SourceBundle>().sources[0]!;
    expect((await app.inject({method:"DELETE",url:`/api/projects/${project.id}/sources/${removed.id}`})).statusCode).toBe(200);
    const remaining=(await app.inject({method:"GET",url:`/api/projects/${project.id}/sources`})).json().sources;
    expect(remaining).toHaveLength(1);expect(remaining[0].id).toBe(demo.sources[0]!.id);
    const comments=(await app.inject({method:"GET",url:`/api/projects/${project.id}/comments`})).json().comments;
    expect(comments).toHaveLength(10);expect(comments.every((comment:{sourceId:string})=>comment.sourceId===demo.sources[0]!.id)).toBe(true);
  });

  it("no crea import YouTube sin clave y no acepta URLs ajenas",async()=>{
    expect((await app.inject({method:"GET",url:"/api/integrations/youtube/status"})).json()).toEqual({configured:false});
    const response=await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"youtube",url:"https://youtu.be/dQw4w9WgXcQ"}});expect(response.statusCode).toBe(503);expect(response.json()).toMatchObject({error:"youtube_not_configured"});
    expect(extractYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();expect(extractYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("aísla fuentes por proyecto y valida campos condicionales",async()=>{
    const other=(await app.inject({method:"POST",url:"/api/projects",payload:{name:"Otro",niche:"N"}})).json<Project>();
    const bundle=(await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"demo"}})).json<SourceBundle>();
    expect((await app.inject({method:"GET",url:`/api/projects/${other.id}/sources/${bundle.sources[0]!.id}`})).statusCode).toBe(404);
    expect((await app.inject({method:"POST",url:`/api/projects/${project.id}/sources`,payload:{sourceType:"manual",text:"  "}})).statusCode).toBe(400);
  });

  it("rechaza búsquedas vacías y proyectos inexistentes antes de consultar YouTube",async()=>{
    for(const q of ["  ", " x "]){
      const response=await app.inject({method:"GET",url:`/api/projects/${project.id}/youtube/search?q=${encodeURIComponent(q)}`});
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("invalid_youtube_query");
    }
    const response=await app.inject({method:"POST",url:`/api/projects/${crypto.randomUUID()}/youtube/import`,payload:{videoId:"dQw4w9WgXcQ",title:"Video",topLevelLimit:10}});
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("not_found");
  });

  it("limita a 500 hilos top-level y conserva las replies de esos hilos",async()=>{
    const top=(page:number,index:number):YouTubeComment=>({commentId:`top-${page}-${index}`,parentCommentId:null,author:"Autor",text:"Top",likes:0,publishedAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",isReply:false});
    const reply=(parent:string):YouTubeComment=>({commentId:`reply-${parent}`,parentCommentId:parent,author:"Reply",text:"Respuesta",likes:0,publishedAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",isReply:true});
    class FakeYouTube extends YouTubeAdapter {
      calls:Array<{maxResults?:number}>=[];
      constructor(){super({apiKey:"demo"});}
      override async getVideo(){return {videoId:"dQw4w9WgXcQ",title:"Video",channelId:"channel",channelTitle:"Canal",publishedAt:"2026-01-01T00:00:00Z",commentCount:900};}
      override async listCommentThreads(input:{videoId:string;pageToken?:string;maxResults?:number}){this.calls.push(input);const page=Number(input.pageToken??"0"),items=Array.from({length:100},(_,index):YouTubeThread=>{const comment=top(page,index);return {threadId:`thread-${page}-${index}`,topLevelComment:comment,totalReplyCount:index===0?1:0,embeddedReplies:index===0?[reply(comment.commentId)]:[]};});return {items,nextPageToken:String(page+1)};}
    }
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),jobs=new JobRepository(db),adapter=new FakeYouTube(),project=projects.create({name:"YT cap",niche:"N"}),service=new YouTubeImportService(sources,jobs,"demo",adapter),queued=service.queue(project.id,"https://youtu.be/dQw4w9WgXcQ");
    for(let i=0;i<100&&jobs.get(project.id,queued.job.id)?.status!=="COMPLETED";i++)await new Promise(resolve=>setImmediate(resolve));
    expect(jobs.get(project.id,queued.job.id)?.status).toBe("COMPLETED");
    expect(sources.listComments(project.id,{sourceId:queued.source.id,replies:false,limit:1000})).toHaveLength(500);
    expect(sources.listComments(project.id,{sourceId:queued.source.id,replies:true,limit:1000})).toHaveLength(5);
    expect(adapter.calls).toHaveLength(5);expect(adapter.calls.every(call=>call.maxResults===100)).toBe(true);db.close();
  });
});

describe("constraints Sources",()=>{
  it("excludes incomplete and failed sources from the analysis set without hiding raw comments",()=>{
    const db=new AppDatabase(":memory:");
    try{
      const projects=new ProjectRepository(db),sources=new SourceRepository(db);
      const project=projects.create({name:"Readiness",niche:"N"});
      const bundle=sources.createManual(project.id,{sourceType:"manual",text:"Una experiencia suficientemente detallada para analizar."});
      const source=bundle.sources[0]!;
      for(const status of ["pending","importing","failed","cancelled"]){
        db.connection.prepare("UPDATE sources SET status=? WHERE id=?").run(status,source.id);
        expect(sources.analysisSet(project.id),status).toEqual([]);
        expect(sources.listComments(project.id)).toHaveLength(1);
      }
      for(const status of ["ready"]){
        db.connection.prepare("UPDATE sources SET status=? WHERE id=?").run(status,source.id);
        expect(sources.analysisSet(project.id),status).toHaveLength(1);
      }
    }finally{db.close();}
  });
  it("preserves manual noise but excludes it from analysis using the same rules as YouTube",()=>{
    const db=new AppDatabase(":memory:");
    try{
      const project=new ProjectRepository(db).create({name:"Manual quality",niche:"N"});
      const sources=new SourceRepository(db);
      const bundle=sources.createManual(project.id,{sourceType:"manual",text:"😀😀\n\nhttps://example.test\n\nUna experiencia relevante y detallada del problema."});
      expect(bundle.comments).toHaveLength(3);
      expect(sources.analysisSet(project.id).map(comment=>comment.text)).toEqual(["Una experiencia relevante y detallada del problema."]);
      expect(bundle.comments.filter(comment=>!comment.analysisEligible)).toHaveLength(2);
    }finally{db.close();}
  });
  it("crea evidence por comentario, deduplica IDs de plataforma y bloquea relaciones cruzadas",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db);const a=projects.create({name:"A",niche:"N"}),b=projects.create({name:"B",niche:"N"});const bundle=sources.createDemo(a.id);
    expect(db.connection.prepare("SELECT count(*) count FROM evidence_snippets WHERE project_id=?").get(a.id)).toMatchObject({count:10});
    const sourceId=bundle.sources[0]!.id,now=new Date().toISOString();expect(()=>db.connection.prepare(`INSERT INTO comments(id,project_id,source_id,platform_comment_id,author,text,created_at) VALUES(?,?,?,?,?,?,?)`).run("01911111-1111-7111-8111-111111111111",b.id,sourceId,"foreign","X","Y",now)).toThrow();
    expect(()=>db.connection.prepare(`INSERT INTO comments(id,project_id,source_id,platform_comment_id,author,text,created_at) VALUES(?,?,?,?,?,?,?)`).run("01922222-2222-7222-8222-222222222222",a.id,sourceId,"demo-1","X","Y",now)).toThrow();db.close();
  });

  it("borra enlaces de evidencia derivados sin dejar huérfanos",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"A",niche:"N"});
    const preserved=sources.createDemo(project.id),removed=sources.createManual(project.id,{sourceType:"manual",title:"Eliminar",text:"Fuente descartada."});
    const evidence=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? AND source_id=? LIMIT 1").get(project.id,removed.sources[0]!.id) as {id:string};
    db.connection.prepare("INSERT INTO evidence_links(id,project_id,target_type,target_id,source_type,source_id,relation,created_at) VALUES(?,?,?,?,?,?,?,?)").run("01933333-3333-7333-8333-333333333333",project.id,"artifact_version","derived-artifact","evidence_snippet",evidence.id,"supports",new Date().toISOString());
    expect(sources.delete(project.id,removed.sources[0]!.id)).toBe(true);
    expect(sources.list(project.id)).toHaveLength(1);expect(sources.list(project.id)[0]!.id).toBe(preserved.sources[0]!.id);
    expect(db.connection.prepare("SELECT count(*) count FROM comments WHERE project_id=? AND source_id=?").get(project.id,removed.sources[0]!.id)).toMatchObject({count:0});
    expect(db.connection.prepare("SELECT count(*) count FROM evidence_snippets WHERE project_id=? AND source_id=?").get(project.id,removed.sources[0]!.id)).toMatchObject({count:0});
    expect(db.connection.prepare("SELECT count(*) count FROM evidence_links WHERE project_id=? AND source_type='evidence_snippet' AND source_id=?").get(project.id,evidence.id)).toMatchObject({count:0});
    expect(db.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);db.close();
  });

  it("pagina YouTube, recupera replies faltantes y deduplica antes de persistir",async()=>{
    const top=(id:string,text:string):YouTubeComment=>({commentId:id,parentCommentId:null,author:"Autor",text,likes:1,publishedAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",isReply:false});
    const reply=(id:string,parent:string):YouTubeComment=>({commentId:id,parentCommentId:parent,author:"Reply",text:id,likes:0,publishedAt:"2026-01-01T00:00:00Z",updatedAt:"2026-01-01T00:00:00Z",isReply:true});
    const thread1:YouTubeThread={threadId:"thread-1",topLevelComment:top("comment001a","Uno"),totalReplyCount:2,embeddedReplies:[reply("reply00001a","comment001a")]};
    const thread2:YouTubeThread={threadId:"thread-2",topLevelComment:top("comment002a","Dos"),totalReplyCount:0,embeddedReplies:[]};
    class FakeYouTube extends YouTubeAdapter {
      constructor(){super({apiKey:"demo"});}
      override async getVideo(){return {videoId:"dQw4w9WgXcQ",title:"Video",channelId:"channel",channelTitle:"Canal",publishedAt:"2026-01-01T00:00:00Z",commentCount:4};}
      override async listCommentThreads(input:{videoId:string;pageToken?:string}){return input.pageToken?{items:[thread2]}:{items:[thread1],nextPageToken:"page-2"};}
      override async listReplies(){return {items:[reply("reply00001a","comment001a"),reply("reply00002a","comment001a")]};}
    }
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),jobs=new JobRepository(db);const project=projects.create({name:"YT",niche:"N"});const service=new YouTubeImportService(sources,jobs,"demo",new FakeYouTube());const queued=service.queue(project.id,"https://youtu.be/dQw4w9WgXcQ");
    for(let i=0;i<20&&jobs.get(project.id,queued.job.id)?.status!=="COMPLETED";i++)await new Promise(resolve=>setImmediate(resolve));
    expect(jobs.get(project.id,queued.job.id)?.status).toBe("COMPLETED");expect(sources.listComments(project.id,{limit:100})).toHaveLength(4);expect(sources.get(project.id,queued.source.id)?.status).toBe("ready");
    expect(()=>service.queue(project.id,"https://youtu.be/dQw4w9WgXcQ")).toThrow(/ya fue añadido/);db.close();
  });
});

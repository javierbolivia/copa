import { describe, expect, it } from "vitest";
import { YouTubeAdapter } from "../src/integrations/youtube-adapter.js";
import { scoreYouTubeResearch } from "../src/services/youtube-research-score.js";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";

const response=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}});
describe("YouTube research",()=>{
  it("busca y enriquece en lote sin N+1",async()=>{
    const calls:URL[]=[];const adapter=new YouTubeAdapter({apiKey:"test",fetch:async(input)=>{const url=new URL(String(input));calls.push(url);return url.pathname.endsWith("/search")?response({items:[{id:{videoId:"abcdefghijk"},snippet:{title:"Organizar fotos",description:"Miles de fotos",channelId:"channel",channelTitle:"Canal",publishedAt:"2026-01-01T00:00:00Z",thumbnails:{default:{url:"https://img"}}}}]}):response({items:[{id:"abcdefghijk",snippet:{title:"Organizar fotos",channelId:"channel",channelTitle:"Canal",publishedAt:"2026-01-01T00:00:00Z",description:"Miles de fotos"},contentDetails:{duration:"PT10M"},statistics:{viewCount:"2000",likeCount:"30",commentCount:"120"}}]});}});
    const hits=await adapter.searchVideos("organizar fotos"),videos=await adapter.getVideos(hits.items.map(item=>item.videoId));
    expect(hits.items).toHaveLength(1);expect(videos[0]).toMatchObject({videoId:"abcdefghijk",duration:"PT10M",commentCount:120});expect(calls.map(url=>url.pathname)).toEqual(["/youtube/v3/search","/youtube/v3/videos"]);
  });
  it("puntúa relevancia y conversación por encima de vistas",()=>{
    const high=scoreYouTubeResearch("organizar fotos",{videoId:"abcdefghijk",title:"Cómo organizar fotos",channelId:"c",channelTitle:"c",publishedAt:"2026-01-01T00:00:00Z",viewCount:10000,commentCount:800});
    const low=scoreYouTubeResearch("organizar fotos",{videoId:"lmnopqrstuv",title:"Vídeo viral",channelId:"c",channelTitle:"c",publishedAt:"2020-01-01T00:00:00Z",viewCount:10000000,commentCount:2});
    expect(high.researchScore).toBeGreaterThan(low.researchScore);
  });
  it("preserva RAW y separa ruido del Analysis Set",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"P",niche:"N"});
    const bundle=sources.createManual(project.id,{sourceType:"manual",text:"Hallazgo útil.\n\nhttps://spam.example"});
    db.connection.prepare("UPDATE comments SET analysis_eligible=0,noise_reason='URL sin contexto' WHERE id=?").run(bundle.comments[1]!.id);
    expect(sources.listComments(project.id,{limit:10})).toHaveLength(2);expect(sources.analysisSet(project.id)).toHaveLength(1);expect(sources.setIncludedInAnalysis(project.id,bundle.sources[0]!.id,false)?.includeInAnalysis).toBe(false);expect(sources.analysisSet(project.id)).toHaveLength(0);db.close();
  });
});

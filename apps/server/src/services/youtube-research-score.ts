import type { YouTubeVideo } from "../integrations/youtube-adapter.js";

export interface ResearchScoredVideo extends YouTubeVideo { readonly researchScore:number; readonly scoreExplanation:string; }

/** Deterministic local heuristic: relevance and discussion outweigh raw reach. */
export function scoreYouTubeResearch(query:string,video:YouTubeVideo):ResearchScoredVideo{
  const terms=query.toLocaleLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu,"").split(/\s+/).filter(term=>term.length>2);
  const corpus=`${video.title} ${video.description??""}`.toLocaleLowerCase();
  const relevance=terms.length?Math.round(35*terms.filter(term=>corpus.includes(term)).length/terms.length):0;
  const comments=Math.min(30,Math.round(Math.log10((video.commentCount??0)+1)*10));
  const engagement=video.viewCount&&video.commentCount?Math.min(15,Math.round((video.commentCount/video.viewCount)*15000)):0;
  const reach=Math.min(8,Math.round(Math.log10((video.viewCount??0)+1)*1.2));
  const ageDays=Math.max(0,(Date.now()-Date.parse(video.publishedAt))/86_400_000);
  const recency=ageDays<180?12:ageDays<730?7:3;
  const researchScore=Math.max(0,Math.min(100,relevance+comments+engagement+reach+recency));
  const label=researchScore>=85?"Excelente para investigar":researchScore>=65?"Buena fuente":researchScore>=45?"Evidencia media":"Poco útil";
  return {...video,researchScore,scoreExplanation:`${label} · ${relevance>=20?"alta relevancia":"relevancia parcial"} · ${video.commentCount??0} comentarios`};
}

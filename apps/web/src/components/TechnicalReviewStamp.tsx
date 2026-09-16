import {useEffect,useState} from "react";
import {api} from "../api/client";
const reviewedSections=new Set(["overview","research","sources","problems","opportunities","product","avatar","mechanism"]);
export function TechnicalReviewStamp({section}:{section:string}){
  const [date,setDate]=useState<string|null>(null),[error,setError]=useState(false);
  useEffect(()=>{
    let alive=true;setDate(null);setError(false);
    if(!reviewedSections.has(section))return;
    const refresh=()=>{void api.technicalReviews().then(result=>{if(alive){setDate(result.sections[section]?.reviewedAt??null);setError(false);}}).catch(()=>{if(alive)setError(true);});};
    refresh();const interval=window.setInterval(refresh,30000);window.addEventListener("focus",refresh);
    return()=>{alive=false;window.clearInterval(interval);window.removeEventListener("focus",refresh);};
  },[section]);
  if(!reviewedSections.has(section))return null;
  const formatted=date?new Intl.DateTimeFormat("es-ES",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(date)).replace(",",""):null;
  return <aside className="technical-review-stamp" aria-label="Revisión técnica de la sección"><span><span className="technical-review-dot"/>Última revisión técnica: <strong>{formatted?<time dateTime={date!}>{formatted}</time>:error?"No disponible":"Consultando…"}</strong></span><small>Revisión del código · independiente de la fecha de las versiones</small></aside>;
}

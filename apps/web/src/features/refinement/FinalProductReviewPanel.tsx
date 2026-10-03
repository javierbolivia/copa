import {useState} from "react";
import type {FinalProductReviewInput} from "@our-platform/shared";

interface Reference {id:string;title:string;url:string}
export function FinalProductReviewPanel({references,review,disabled,readOnly,onReview}:{
  references:Reference[];review:Record<string,unknown>;disabled:boolean;readOnly:boolean;
  onReview:(input:FinalProductReviewInput)=>Promise<boolean>;
}){
  const [sourcesOpened,setSourcesOpened]=useState(false),[reviewedAllClaims,setReviewedAllClaims]=useState(false),[notes,setNotes]=useState("");
  const [checks,setChecks]=useState(()=>references.map(ref=>({referenceId:ref.id,sourceUrl:ref.url,sourceExcerpt:"",manuscriptClaim:""})));
  const update=(index:number,key:"sourceExcerpt"|"manuscriptClaim",value:string)=>setChecks(current=>current.map((check,i)=>i===index?{...check,[key]:value}:check));
  const ready=sourcesOpened&&reviewedAllClaims&&notes.trim().length>=20&&checks.length>=2&&checks.every(check=>check.sourceExcerpt.trim().length>=40&&check.manuscriptClaim.trim().length>=20);
  return <section className="detail-card" aria-label="Revisión factual del manuscrito">
    <h3>{review.status==="RECORDED"?"Revisión humana registrada":"Revisión factual pendiente"}</h3>
    <p>La auditoría estructural no comprueba que las fuentes existan ni que respalden el texto. Abre cada fuente, contrasta todas las afirmaciones y registra los extractos utilizados. Este registro acredita una revisión humana; no constituye certificación científica ni profesional.</p>
    {review.status==="RECORDED"?<><p>{String(review.notes??"")}</p><p>La revisión corresponde al contenido guardado. Cualquier edición requiere una nueva revisión.</p></>:readOnly?<p>Actualiza las dependencias y guarda una versión vigente para registrar su revisión.</p>:<>
      {references.map((reference,index)=><fieldset key={reference.id} disabled={disabled}>
        <legend>{reference.id} · {reference.title}</legend>
        <a href={reference.url} target="_blank" rel="noreferrer">Abrir fuente {reference.id}</a>
        <label className="final-product-field">Extracto de la fuente {reference.id}<textarea rows={4} value={checks[index]?.sourceExcerpt??""} onChange={event=>update(index,"sourceExcerpt",event.target.value)}/></label>
        <label className="final-product-field">Afirmación contrastada del manuscrito para {reference.id}<textarea rows={3} value={checks[index]?.manuscriptClaim??""} onChange={event=>update(index,"manuscriptClaim",event.target.value)}/></label>
      </fieldset>)}
      <label className="final-product-field">Notas y límites de la revisión<textarea disabled={disabled} rows={3} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
      <label><input type="checkbox" disabled={disabled} checked={sourcesOpened} onChange={event=>setSourcesOpened(event.target.checked)}/>He abierto y comprobado todas las fuentes listadas.</label>
      <label><input type="checkbox" disabled={disabled} checked={reviewedAllClaims} onChange={event=>setReviewedAllClaims(event.target.checked)}/>He contrastado todas las afirmaciones factuales y corregido o señalado las que no tienen respaldo.</label>
      <p>Guarda primero cualquier cambio al manuscrito. Registrar la revisión crea un nuevo borrador; la aprobación es una acción posterior.</p>
      <button className="button primary" type="button" disabled={disabled||!ready} onClick={()=>void onReview({sourcesOpened:true,reviewedAllClaims:true,notes,checks})}>Registrar revisión factual</button>
    </>}
  </section>;
}

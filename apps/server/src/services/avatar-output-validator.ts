import {AVATAR_FIELDS} from "@our-platform/shared";
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const cleanBoundaryPunctuation=(value:string)=>value.trim().replace(/^[.,;:¿?¡!"'\s]+|[.,;:¿?¡!"'\s]+$/gu,"");
const normalized=(value:string)=>cleanBoundaryPunctuation(value.replace(/\s+/gu," ")).toLowerCase();

export function validateAvatarOutput(input:unknown,evidence:readonly {id:string;quoteText:string}[]){
  const source=record(input),output:Record<string,unknown>={...source,schemaVersion:2};
  const allowed=new Map(evidence.map(item=>[item.id,item.quoteText]));
  const errors:string[]=[];const cited=new Set<string>();
  if(typeof source.name!=="string"||!source.name.trim()||source.name.length>240)errors.push("El perfil necesita un nombre breve y concreto.");
  for(const [key,label] of AVATAR_FIELDS){
    const items=source[key];
    if(!Array.isArray(items)){errors.push(`${label}: falta la lista estructurada.`);continue;}
    if(items.length>40)errors.push(`${label}: máximo 40 afirmaciones.`);
    if((key==="currentSituation"||key==="desiredOutcome")&&items.length===0)errors.push(`${label}: incluye al menos una afirmación.`);
    output[key]=items.map((raw,index)=>{
      const item=record(raw),path=`${label} ${index+1}`;
      const text=typeof item.text==="string"?item.text.trim():"";
      if(!text||text.length>4000)errors.push(`${path}: texto vacío o demasiado largo.`);
      const refs=Array.isArray(item.evidenceIds)?item.evidenceIds:[];
      if(!Array.isArray(item.evidenceIds)||refs.length>20||refs.some(id=>typeof id!=="string"))errors.push(`${path}: referencias no válidas.`);
      const validRefs=refs.filter((id):id is string=>typeof id==="string");
      if(validRefs.some(id=>!allowed.has(id)))errors.push(`${path}: referencia fuera de la evidencia disponible al generar.`);
      for(const id of validRefs)if(allowed.has(id))cited.add(id);
      if(item.provenance!=="EVIDENCE_BACKED"&&item.provenance!=="AI_INFERENCE")errors.push(`${path}: clasifica como evidencia o inferencia.`);
      if(item.provenance==="EVIDENCE_BACKED"&&!validRefs.some(id=>allowed.has(id)))errors.push(`${path}: la afirmación necesita evidencia válida.`);
      if(item.provenance==="AI_INFERENCE"&&validRefs.length)errors.push(`${path}: una inferencia no debe presentarse con citas de respaldo.`);
      if(key==="language"&&(item.provenance!=="EVIDENCE_BACKED"||!validRefs.some(id=>normalized(allowed.get(id)??"").includes(normalized(text)))))errors.push(`${path}: el lenguaje textual debe ser un fragmento literal de una cita vinculada.`);
      return {...item,text,evidenceIds:[...new Set(validRefs)]};
    });
  }
  const audit={schemaVersion:2,ok:errors.length===0,inputEvidenceCount:evidence.length,citedEvidenceCount:cited.size,errors};
  return {output:{...output,avatarValidationAudit:audit},audit};
}

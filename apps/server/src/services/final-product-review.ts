import {createHash} from "node:crypto";
import type {FinalProductReviewInput} from "@our-platform/shared";
import {validateFinalProductOutput} from "./final-product-output-validator.js";

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const normalized=(value:string)=>value.replace(/\s+/gu," ").trim();
function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));
  return value;
}
export function manuscriptHash(output:unknown):string{
  const {finalProductValidationAudit:structural,finalProductFactualReview:review,...content}=record(output);
  return createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
}
export type FinalProductReviewKind="HUMAN_ATTESTATION"|"ASSISTANT_SOURCE_AUDIT";

export function recordFinalProductReview(output:unknown,input:FinalProductReviewInput,kind:FinalProductReviewKind="HUMAN_ATTESTATION"){
  if(!validateFinalProductOutput(output).audit.ok)throw new Error("Corrige la estructura del manuscrito antes de registrar la revisión factual.");
  if(input.sourcesOpened!==true||input.reviewedAllClaims!==true||input.notes.trim().length<20)throw new Error("Confirma la revisión completa de fuentes y afirmaciones y registra sus límites.");
  const guide=record(record(output).guide);
  const references=(guide.references as unknown[]).map(record);
  const sections=[guide.introduction,...(guide.chapters as unknown[]).map(item=>record(item).content),guide.conclusion].filter((item):item is string=>typeof item==="string");
  const paragraphs=sections.flatMap(text=>text.split(/\n\s*\n/gu)).map(normalized);
  const checked=new Set<string>();
  const assistantCoverage=new Set<string>();
  const citedParagraphs=paragraphs.flatMap(paragraph=>[...paragraph.matchAll(/\((R[^()\r\n]*)\)/gu)].flatMap(match=>match[1]!.split(",").map(id=>({id:id.trim(),paragraph}))));
  for(const check of input.checks){
    const ref=references.find(item=>item.id===check.referenceId);
    if(!ref||ref.url!==check.sourceUrl)throw new Error("Cada comprobación debe corresponder a una referencia y URL del manuscrito guardado.");
    if(check.sourceExcerpt.trim().length<40||check.manuscriptClaim.trim().length<20)throw new Error("Incluye un extracto de la fuente y la afirmación concreta contrastada.");
    const claim=normalized(check.manuscriptClaim);
    const matched=citedParagraphs.filter(item=>item.id===check.referenceId&&item.paragraph.includes(claim));
    if(matched.length===0)throw new Error(`La afirmación revisada para ${check.referenceId} debe aparecer en un párrafo que cite esa referencia.`);
    for(const item of matched)assistantCoverage.add(`${item.id}|${item.paragraph}`);
    checked.add(check.referenceId);
  }
  if(references.some(ref=>!checked.has(String(ref.id))))throw new Error("Revisa todas las referencias del manuscrito.");
  if(kind==="ASSISTANT_SOURCE_AUDIT"&&citedParagraphs.some(item=>!assistantCoverage.has(`${item.id}|${item.paragraph}`)))throw new Error("La revisión asistida debe documentar cada pasaje citado del manuscrito.");
  return {...input,kind,contentHash:manuscriptHash(output),reviewedAt:new Date().toISOString()};
}
export function finalProductReviewStatus(output:unknown,snapshot:unknown){
  const data=record(snapshot),review=record(data.finalProductFactualReview);
  const valid=data.source==="user"&&(review.kind==="HUMAN_ATTESTATION"||review.kind==="ASSISTANT_SOURCE_AUDIT")&&review.contentHash===manuscriptHash(output);
  return valid?{status:"RECORDED" as const,kind:review.kind as FinalProductReviewKind,reviewedAt:review.reviewedAt,notes:review.notes,checks:review.checks}
    :{status:"PENDING" as const,kind:"HUMAN_ATTESTATION",notes:"La estructura no verifica la existencia de las fuentes ni el respaldo de sus afirmaciones."};
}

const fields=["perceivedProblem","apparentCause","rootCauseHypothesis","mechanism","solutionMechanism","differentiation","simpleExplanation","detailedExplanation"] as const;
export function validateMechanismOutput(input:unknown,evidence:readonly {id:string}[]){
  const source=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
  const errors:string[]=[],allowed=new Set(evidence.map(item=>item.id));
  for(const field of fields)if(typeof source[field]!=="string"||!source[field].trim()||source[field].length>8000)errors.push(`${field}: se requiere un texto concreto de hasta 8000 caracteres.`);
  for(const field of ["steps","alternatives","limitations","validationPlan"])if(source[field]!==undefined&&(!Array.isArray(source[field])||source[field].length>40||source[field].some(item=>typeof item!=="string"||!item.trim()||item.length>4000)))errors.push(`${field}: lista no válida.`);
  const refs=source.evidenceIds??[];
  if(!Array.isArray(refs)||refs.length>20||refs.some(id=>typeof id!=="string"||!allowed.has(id)))errors.push("Las referencias de contexto deben pertenecer a la evidencia disponible al generar.");
  if(source.provenance!=="AI_INFERENCE"&&source.provenance!=="EVIDENCE_BACKED")errors.push("Clasifica el origen como evidencia o inferencia.");
  if(source.provenance==="EVIDENCE_BACKED"&&(!Array.isArray(refs)||!refs.length))errors.push("El contexto basado en evidencia necesita referencias válidas.");
  const audit={ok:!errors.length,errors,inputEvidenceCount:evidence.length};
  const schemaVersion=typeof source.schemaVersion==="number"?source.schemaVersion:1;
  const output:Record<string,unknown>={...source,schemaVersion,mechanismValidationAudit:audit};
  return {output,audit};
}

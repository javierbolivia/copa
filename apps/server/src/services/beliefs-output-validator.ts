export function validateBeliefsOutput(input:unknown,evidence:readonly {id:string}[]){
  const source=input&&typeof input==="object"&&!Array.isArray(input)?input as Record<string,unknown>:{};
  const errors:string[]=[];
  if(typeof source.centralThesis!=="string"||!source.centralThesis.trim()||source.centralThesis.length>8000)errors.push("La tesis central necesita un texto concreto de hasta 8000 caracteres.");
  for(const field of ["currentBeliefs","limitingBeliefs","requiredBeliefs","objections","arguments","bridgeBeliefs"]){
    const items=source[field];
    if(field==="bridgeBeliefs"&&items===undefined)continue;
    if(!Array.isArray(items)||items.length>40||items.some(item=>typeof item!=="string"||!item.trim()||item.length>4000))errors.push(`${field}: se requiere una lista de textos válidos.`);
  }
  if(Array.isArray(source.requiredBeliefs)&&!source.requiredBeliefs.length)errors.push("Incluye al menos una creencia propuesta para contrastar.");
  const allowed=new Set(evidence.map(item=>item.id));
  if(source.evidenceIds!==undefined&&(!Array.isArray(source.evidenceIds)||source.evidenceIds.length>20||source.evidenceIds.some(id=>typeof id!=="string"||!allowed.has(id))))errors.push("Las referencias deben pertenecer al contexto disponible al generar.");
  const audit={ok:!errors.length,errors};
  return {output:{...source,beliefsValidationAudit:audit},audit};
}

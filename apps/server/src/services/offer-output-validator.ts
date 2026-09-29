const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function validateOfferOutput(input:unknown,evidence:readonly {id:string}[]){
  const source=record(input),errors:string[]=[];
  for(const field of ["name","promise","cta"])if(typeof source[field]!=="string"||!source[field].trim()||source[field].length>4000)errors.push(`${field}: incluye un texto concreto de hasta 4000 caracteres.`);
  for(const field of ["benefits","deliverables","bonuses"]){const items=field==="bonuses"&&source[field]===undefined?[]:source[field];if(!Array.isArray(items)||items.length>40||items.some(item=>typeof item!=="string"||!item.trim()||item.length>4000)||(field!=="bonuses"&&!items.length))errors.push(`${field}: lista incompleta o no válida.`);}
  const price=record(source.pricingSuggestion);
  if(source.pricingSuggestion!==undefined){
    if(price.amount!==null&&(typeof price.amount!=="number"||!Number.isFinite(price.amount)||price.amount<0))errors.push("El precio debe ser un número mayor o igual a cero, o null si no está definido.");
    if(price.amount!==null&&(typeof price.currency!=="string"||!/^[A-Z]{3}$/.test(price.currency)))errors.push("Indica una moneda de tres letras para el precio propuesto.");
  }
  for(const field of ["orderBump","upsell","downsell"]){const item=source[field];if(item!=null&&!(typeof item==="string"&&item.trim())&&!(typeof record(item).name==="string"&&String(record(item).name).trim()))errors.push(`${field}: define un nombre o elimina el complemento.`);}
  if(source.bonusDetails!==undefined&&(!Array.isArray(source.bonusDetails)||source.bonusDetails.length>40||source.bonusDetails.some(item=>typeof record(item).name!=="string"||typeof record(item).description!=="string")))errors.push("Las descripciones de bonos no son válidas.");
  const allowed=new Set(evidence.map(item=>item.id));
  if(source.evidenceIds!==undefined&&(!Array.isArray(source.evidenceIds)||source.evidenceIds.length>20||source.evidenceIds.some(id=>typeof id!=="string"||!allowed.has(id))))errors.push("Las referencias deben pertenecer al contexto disponible al generar.");
  const audit={ok:!errors.length,errors};
  const schemaVersion=typeof source.schemaVersion==="number"?source.schemaVersion:1;
  const bonuses=Array.isArray(source.bonuses)?source.bonuses:[];
  const output:Record<string,unknown>={...source,schemaVersion,bonuses,offerValidationAudit:audit};
  return {output,audit};
}

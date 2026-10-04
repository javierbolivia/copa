import {landingCheckoutUrl,landingImageUrl} from "@our-platform/shared";
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const nonempty=(value:unknown)=>typeof value==="string"&&value.trim().length>0&&value.length<=12000;
export function validateLandingOutput(input:unknown,evidence:readonly {id:string}[]){
  const source=record(input),errors:string[]=[],allowed=new Set(evidence.map(item=>item.id));
  const references=(value:unknown)=>{if(value!==undefined&&(!Array.isArray(value)||value.length>40||value.some(id=>typeof id!=="string"||!allowed.has(id))))errors.push("Las referencias deben pertenecer al contexto disponible al generar.");};
  if(!nonempty(source.title))errors.push("Define el nombre de la landing.");
  if(!Array.isArray(source.sections)||!source.sections.length||source.sections.length>40)errors.push("La landing necesita entre 1 y 40 secciones con contenido.");
  else for(const [index,raw] of source.sections.entries()){
    const section=record(raw),prefix=`Sección ${index+1}`;
    if(!nonempty(section.type))errors.push(`${prefix}: falta el tipo.`);
    for(const field of ["eyebrow","headline","subheadline","body","cta"])if(section[field]!==undefined&&(typeof section[field]!=="string"||String(section[field]).length>12000))errors.push(`${prefix}: ${field} debe ser texto de hasta 12000 caracteres.`);
    if(section.imageUrl!==undefined&&section.imageUrl!==""&&!landingImageUrl(section.imageUrl))errors.push(`${prefix}: la imagen necesita una URL HTTPS o ruta local válida.`);
    if(section.imageUrl&&(!nonempty(section.imageAlt)||String(section.imageAlt).length>250))errors.push(`${prefix}: describe la imagen con texto alternativo breve.`);
    const items=section.items;
    if(items!==undefined&&(!Array.isArray(items)||items.length>60))errors.push(`${prefix}: lista de elementos no válida.`);
    if(Array.isArray(items))for(const item of items){const object=record(item);if(section.type==="faq"||object.q!==undefined){if(!nonempty(object.q)||!nonempty(object.a))errors.push(`${prefix}: completa cada pregunta y respuesta.`);}else if(!(nonempty(item)||nonempty(object.name)||nonempty(object.title)||nonempty(object.description)||nonempty(object.text)))errors.push(`${prefix}: hay un elemento vacío.`);}
    if(![section.headline,section.subheadline,section.body,section.cta].some(nonempty)&&!(Array.isArray(items)&&items.length))errors.push(`${prefix}: añade contenido o retira la sección vacía.`);
    references(section.evidenceIds);
  }
  if(source.footerNote!==undefined&&(typeof source.footerNote!=="string"||source.footerNote.length>12000))errors.push("La nota al pie debe ser texto de hasta 12000 caracteres.");
  if(source.externalCheckout!==undefined){
    const checkout=record(source.externalCheckout);
    if(!["none","hotmart","skool","custom"].includes(String(checkout.platform)))errors.push("Selecciona una plataforma de pago válida.");
    if(checkout.platform!=="none"&&!landingCheckoutUrl(checkout.checkoutUrl))errors.push("El checkout necesita una URL HTTPS completa y válida.");
    if(checkout.checkoutUrl!==undefined&&typeof checkout.checkoutUrl!=="string")errors.push("La URL del checkout debe ser texto.");
  }
  references(source.evidenceIds);
  const audit={ok:!errors.length,errors};
  return {output:{...source,landingValidationAudit:audit},audit};
}

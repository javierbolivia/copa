import type {OfferComponent,OfferEditorValue} from "./types";
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==="string"?value:"";
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
function component(value:unknown):OfferComponent {const item=record(value);return {...item,name:typeof value==="string"?value:text(item.name),description:text(item.description)};}
export function toOffer(value:Record<string,unknown>):OfferEditorValue{
  const price=record(value.pricingSuggestion),details=Array.isArray(value.bonusDetails)?value.bonusDetails:[];
  return {name:text(value.name),mainOffer:text(value.promise),benefits:strings(value.benefits),deliverables:strings(value.deliverables),cta:text(value.cta),pricing:{amount:price.amount==null?"":String(price.amount),currency:text(price.currency),terms:text(price.terms),rationale:text(price.rationale)},bonuses:(Array.isArray(value.bonuses)?value.bonuses:[]).map((item,index)=>{const bonus=component(item);const detail=details.find(raw=>record(raw).name===bonus.name)??details[index];return detail?component({...bonus,...record(detail)}):bonus;}),guarantee:text(value.guaranteeSuggestion),orderBump:component(value.orderBump),upsell:component(value.upsell),downsell:component(value.downsell)};
}
export function fromOffer(original:Record<string,unknown>,value:OfferEditorValue){
  const priceText=value.pricing.amount.trim(),amount=priceText?Number(priceText):null;
  if(priceText&&(!/^\d+(?:[.]\d{1,2})?$/.test(priceText)||!Number.isFinite(amount)||(amount!==null&&amount<0)))throw new Error("Introduce un precio válido, mayor o igual a cero, con punto decimal; déjalo vacío si aún no está definido.");
  return {...original,name:value.name,promise:value.mainOffer,benefits:[...value.benefits],deliverables:[...value.deliverables],cta:value.cta,pricingSuggestion:{...record(original.pricingSuggestion),amount,currency:value.pricing.currency,rationale:value.pricing.rationale,terms:value.pricing.terms},bonuses:value.bonuses.map(item=>item.name),bonusDetails:structuredClone(value.bonuses),guaranteeSuggestion:value.guarantee,orderBump:value.orderBump.name.trim()?value.orderBump:null,upsell:value.upsell.name.trim()?value.upsell:null,downsell:value.downsell.name.trim()?value.downsell:null};
}

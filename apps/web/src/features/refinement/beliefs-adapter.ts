import type {BeliefsEditorValue} from "./types";
export const BELIEF_LISTS=[
  ["currentBeliefs","Creencias actuales"],["limitingBeliefs","Creencias limitantes"],
  ["bridgeBeliefs","Creencias puente"],["requiredBeliefs","Creencias necesarias"],
  ["objections","Objeciones"],["arguments","Argumentos propuestos"],
] as const;
export function toBeliefs(value:Record<string,unknown>):BeliefsEditorValue {
  const lists=Object.fromEntries(BELIEF_LISTS.map(([key])=>[key,Array.isArray(value[key])?value[key].map(item=>typeof item==="string"?item:typeof item==="object"&&item?String(item.text??""):"").filter(Boolean):[]]));
  return {bigIdea:typeof value.centralThesis==="string"?value.centralThesis:"",...lists} as BeliefsEditorValue;
}
export function fromBeliefs(original:Record<string,unknown>,value:BeliefsEditorValue){
  const {bigIdea,...lists}=structuredClone(value);
  const result:Record<string,unknown>={...original,...lists,centralThesis:bigIdea};
  if(!("bridgeBeliefs" in original)&&!value.bridgeBeliefs.length)delete result.bridgeBeliefs;
  return result;
}

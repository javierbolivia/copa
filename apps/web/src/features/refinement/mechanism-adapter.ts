import type {MechanismEditorValue} from "./types";
export const MECHANISM_FIELDS = [
  ["perceivedProblem","Problema percibido"], ["apparentCause","Causa aparente"],
  ["rootCauseHypothesis","Hipótesis de causa raíz"], ["mechanism","Nombre del mecanismo"],
  ["solutionMechanism","Proceso de solución propuesto"], ["differentiation","Diferenciación"],
  ["simpleExplanation","Explicación breve"], ["detailedExplanation","Explicación detallada"],
] as const;
export function toMechanism(value:Record<string,unknown>):MechanismEditorValue {
  const result:Record<string,unknown>={};
  for(const [key] of MECHANISM_FIELDS)result[key]=typeof value[key]==="string"?value[key]:"";
  for(const key of ["steps","alternatives","limitations","validationPlan","evidenceIds"])result[key]=Array.isArray(value[key])?value[key].filter((item):item is string=>typeof item==="string"):[];
  return result as unknown as MechanismEditorValue;
}
export function fromMechanism(original:Record<string,unknown>,value:MechanismEditorValue){
  const result={...original,...structuredClone(value),evidenceIds:original.evidenceIds};
  for(const key of ["steps","alternatives","limitations","validationPlan"] as const)if(!(key in original)&&!value[key].length)delete result[key];
  if(!("evidenceIds" in original))delete result.evidenceIds;
  return result;
}

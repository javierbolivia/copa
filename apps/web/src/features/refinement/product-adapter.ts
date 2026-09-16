import type {ProductEditorValue} from "./types";
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown):string[]=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const text=(value:unknown)=>typeof value==="string"?value:"";
export function toProduct(value:Record<string,unknown>):ProductEditorValue{
  const proposals=(Array.isArray(value.proposals)?value.proposals:[]).map(record);
  const proposal=proposals.find(item=>item.id===value.selectedId)??proposals[0]??value;
  const outcomes=Array.isArray(proposal.moduleOutcomes)?proposal.moduleOutcomes:[];
  return{proposalId:text(proposal.id),name:text(proposal.name),concept:text(proposal.concept),problem:text(proposal.problem),outcome:text(proposal.outcome),promise:text(proposal.promise),format:text(proposal.format),modules:strings(proposal.modules).map((name,index)=>({id:`module-${index}`,name,outcome:text(outcomes[index])})),deliverables:strings(proposal.deliverables),checklists:strings(proposal.checklists),templates:strings(proposal.templates),resources:strings(proposal.resources),bonuses:strings(proposal.bonuses)};
}
export function fromProduct(original:Record<string,unknown>,value:ProductEditorValue){
  const proposals=Array.isArray(original.proposals)?[...original.proposals]:[];
  const index=proposals.findIndex(item=>record(item).id===value.proposalId);
  if(index<0)throw new Error("La propuesta editada ya no existe en esta versión.");
  proposals[index]={...record(proposals[index]),name:value.name,concept:value.concept,problem:value.problem,outcome:value.outcome,promise:value.promise,format:value.format,modules:value.modules.map(item=>item.name),moduleOutcomes:value.modules.map(item=>item.outcome),deliverables:value.deliverables,checklists:value.checklists,templates:value.templates,resources:value.resources,bonuses:value.bonuses};
  return{...original,proposals};
}

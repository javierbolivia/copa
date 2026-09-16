import type {EvidenceSnippet} from "@our-platform/shared";
import {useCallback} from "react";
import {EditorScaffold,Field,StringListField,type EditorSection} from "./EditorScaffold";
import {MECHANISM_FIELDS} from "./mechanism-adapter";
import type {EditorCommonProps,MechanismEditorValue} from "./types";
export type MechanismEditorProps=EditorCommonProps<MechanismEditorValue>&{evidence?:readonly EvidenceSnippet[]|undefined};
const sections:readonly EditorSection[]=[
  {id:"context",label:"Problema e hipótesis"}, {id:"core",label:"Solución propuesta"},
  {id:"explanation",label:"Explicaciones"}, {id:"steps",label:"Pasos y alternativas"},
  {id:"validation",label:"Límites y validación"}, {id:"evidence",label:"Evidencia de contexto"},
];
const cloneMechanism=(value:MechanismEditorValue)=>structuredClone(value);
export function MechanismEditor({value,onSave,saving,readOnly,onOpenTraceability,evidence=[]}:MechanismEditorProps){
  const renderSection=useCallback((sectionId:string,draft:MechanismEditorValue,setDraft:(value:MechanismEditorValue)=>void,editing:boolean)=>{
    const range=sectionId==="context"?[0,3]:sectionId==="core"?[3,6]:sectionId==="explanation"?[6,8]:null;
    if(range)return <div className="rf-field-stack">{MECHANISM_FIELDS.slice(range[0],range[1]).map(([key,label])=><Field key={key} label={label} value={draft[key]} editing={editing} multiline onChange={text=>setDraft({...draft,[key]:text})}/>)}</div>;
    if(sectionId==="evidence")return <div><p>Estas citas describen el contexto del problema. No demuestran causalidad ni eficacia del mecanismo.</p>{!draft.evidenceIds.length&&<p>Sin referencias vinculadas. La propuesta requiere contraste.</p>}{draft.evidenceIds.map(id=><details key={id}><summary>Referencia de contexto</summary><blockquote>{evidence.find(item=>item.id===id)?.quoteText??`Cita no cargada en esta vista (${id})`}</blockquote>{onOpenTraceability&&<button type="button" onClick={()=>onOpenTraceability("evidenceIds")}>Ver origen</button>}</details>)}</div>;
    const lists=sectionId==="steps"?[["steps","Pasos del mecanismo"],["alternatives","Alternativas"]] as const:[["limitations","Límites conocidos"],["validationPlan","Plan de validación"]] as const;
    return <div className="rf-field-stack">{lists.map(([key,label])=><StringListField key={key} label={label} value={draft[key]} editing={editing} onChange={items=>setDraft({...draft,[key]:items})}/>)}</div>;
  },[evidence,onOpenTraceability]);
  return <EditorScaffold title="Mecanismo de solución" description="Hipótesis propuesta: contrasta la causa y el proceso antes de afirmar que funcionan." value={value} sections={sections} cloneValue={cloneMechanism} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

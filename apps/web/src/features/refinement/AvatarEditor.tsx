import {AVATAR_FIELDS,type AvatarField,type AvatarClaim,type EvidenceSnippet} from "@our-platform/shared";
import {useCallback} from "react";
import {EditorScaffold,Field,type EditorSection} from "./EditorScaffold";
import {reviseAvatarClaim} from "./avatar-adapter";
import type {AvatarEditorValue,EditorCommonProps} from "./types";
export type AvatarEditorProps=EditorCommonProps<AvatarEditorValue>&{evidence?:readonly EvidenceSnippet[]|undefined};
const sections:readonly EditorSection[]=AVATAR_FIELDS.map(([id,label])=>({id,label}));
const cloneAvatar=(value:AvatarEditorValue)=>structuredClone(value);

export function AvatarEditor({value,onSave,saving,readOnly,onOpenTraceability,evidence=[]}:AvatarEditorProps){
  const renderSection=useCallback((sectionId:string,draft:AvatarEditorValue,setDraft:(value:AvatarEditorValue)=>void,editing:boolean)=>{
    const field=sectionId as AvatarField;
    const items=draft[field];
    const label=AVATAR_FIELDS.find(([key])=>key===field)?.[1]??field;
    const replace=(index:number,claim:AvatarClaim)=>setDraft({...draft,[field]:items.map((item,itemIndex)=>itemIndex===index?claim:item)});
    return <div className="rf-field-stack">
      {field==="currentSituation"&&<Field label="Nombre del perfil" value={draft.name} editing={editing} onChange={name=>setDraft({...draft,name})}/>}
      {editing&&<p className="form-hint">Al reescribir una afirmación se marca como inferencia y se retiran sus citas. El lenguaje textual conserva la cita original y solo puede retirarse de la selección.</p>}
      {items.length===0&&<p>Sin información registrada. No se inventan respuestas para completar el perfil.</p>}
      {items.map((item,index)=><article className="detail-card" key={index}>
        <span className="status-pill">{item.provenance==="EVIDENCE_BACKED"?"Con evidencia vinculada":item.provenance==="AI_INFERENCE"?"Inferencia por validar":"Sin clasificación"}</span>
        <Field label={`${label} ${index+1}`} value={item.text} editing={editing&&field!=="language"} multiline onChange={text=>replace(index,reviseAvatarClaim(item,text))}/>
        {item.evidenceIds.length>0&&<details><summary>Ver evidencia ({item.evidenceIds.length})</summary>{item.evidenceIds.map(id=>{const quote=evidence.find(item=>item.id===id);return <blockquote key={id}>{quote?<><p>{quote.quoteText}</p><footer>{quote.author} · {quote.sourceTitle}</footer></>:<p>Cita no cargada para esta vista. Referencia: {id}</p>}</blockquote>;})}{onOpenTraceability&&<button className="button secondary" type="button" onClick={()=>onOpenTraceability(field)}>Ver cadena de origen</button>}</details>}
        {editing&&<button type="button" onClick={()=>setDraft({...draft,[field]:items.filter((_,itemIndex)=>itemIndex!==index)})}>Retirar {label.toLowerCase()} {index+1}</button>}
      </article>)}
      {editing&&field!=="language"&&<button className="rf-add-button" type="button" onClick={()=>setDraft({...draft,[field]:[...items,{text:"",provenance:"AI_INFERENCE",evidenceIds:[]}]})}>Añadir {label.toLowerCase()}</button>}
    </div>;
  },[evidence,onOpenTraceability]);
  return <EditorScaffold title="Perfil del cliente" description="Separa situaciones, resultados, motivaciones y fricciones; conserva la procedencia de cada afirmación." value={value} sections={sections} cloneValue={cloneAvatar} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

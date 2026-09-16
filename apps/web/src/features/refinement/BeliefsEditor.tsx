import {useCallback} from "react";
import {EditorScaffold,Field,StringListField,type EditorSection} from "./EditorScaffold";
import {BELIEF_LISTS} from "./beliefs-adapter";
import type {BeliefsEditorValue,EditorCommonProps} from "./types";
export type BeliefsEditorProps=EditorCommonProps<BeliefsEditorValue>;
const sections:readonly EditorSection[]=[{id:"idea",label:"Tesis central"},...BELIEF_LISTS.map(([id,label])=>({id,label}))];
const cloneBeliefs=(value:BeliefsEditorValue)=>structuredClone(value);
export function BeliefsEditor({value,onSave,saving,readOnly,onOpenTraceability}:BeliefsEditorProps){
  const renderSection=useCallback((sectionId:string,draft:BeliefsEditorValue,setDraft:(value:BeliefsEditorValue)=>void,editing:boolean)=>{
    if(sectionId==="idea")return <Field label="Tesis central" value={draft.bigIdea} editing={editing} multiline onChange={bigIdea=>setDraft({...draft,bigIdea})}/>;
    const field=BELIEF_LISTS.find(([key])=>key===sectionId)!;const [key,label]=field;
    return <StringListField label={label} value={draft[key]} editing={editing} onChange={items=>setDraft({...draft,[key]:items})} traceability={onOpenTraceability?()=>onOpenTraceability(key):undefined}/>;
  },[onOpenTraceability]);
  return <EditorScaffold title="Mapa de creencias" description="Interpretaciones y argumentos propuestos para contrastar con el cliente. No son citas literales ni pruebas de eficacia." value={value} sections={sections} cloneValue={cloneBeliefs} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

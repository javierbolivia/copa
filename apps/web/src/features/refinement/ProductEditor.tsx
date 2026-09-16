import { useCallback } from "react";
import { EditorScaffold, Field, StringListField, type EditorSection } from "./EditorScaffold";
import type { EditorCommonProps, ProductEditorValue, ProductModule } from "./types";

export type ProductEditorProps = EditorCommonProps<ProductEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "identity", label: "Definición", summary: "Concepto, problema y resultado"},
  {id: "modules", label: "Capítulos", summary: "Estructura de contenidos del Ebook"},
  {id: "deliverables", label: "Entregables", summary: "Materiales y herramientas"},
  {id: "bonuses", label: "Extras", summary: "Recursos y bonos"},
];

const cloneProduct = (value: ProductEditorValue): ProductEditorValue => ({
  ...value,
  modules: value.modules.map((module) => ({...module})),
  deliverables: [...value.deliverables],
  checklists: [...value.checklists],
  templates: [...value.templates],
  resources: [...value.resources],
  bonuses: [...value.bonuses],
});

export function ProductEditor({value, onSave, saving, readOnly, onEditingChange, onOpenTraceability}: ProductEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: ProductEditorValue, setDraft: (value: ProductEditorValue) => void, editing: boolean) => {
    const trace = (field: string) => { onOpenTraceability?.(field); };
    if (sectionId === "identity") return <div className="rf-field-stack">
      <Field label="Nombre" value={draft.name} editing={editing} placeholder="Título del Ebook" onChange={(name) => setDraft({...draft, name})} traceability={onOpenTraceability ? () => trace("name") : undefined}/>
      <Field label="Concepto" value={draft.concept} editing={editing} multiline onChange={(concept)=>setDraft({...draft,concept})}/>
      <Field label="Problema que aborda" value={draft.problem} editing={editing} multiline onChange={(problem)=>setDraft({...draft,problem})} traceability={onOpenTraceability?()=>trace("problem"):undefined}/>
      <Field label="Resultado esperado" value={draft.outcome} editing={editing} multiline onChange={(outcome)=>setDraft({...draft,outcome})}/>
      <Field label="Promesa" value={draft.promise} editing={editing} multiline placeholder="Transformación concreta y creíble para el lector" onChange={(promise) => setDraft({...draft, promise})} traceability={onOpenTraceability ? () => trace("promise") : undefined}/>
      <Field label="Formato" value={draft.format} editing={editing} placeholder="Ebook digital (PDF/EPUB)" onChange={(format) => setDraft({...draft, format})}/>
    </div>;
    if (sectionId === "modules") return <ModuleList value={draft.modules} editing={editing} onChange={(modules) => setDraft({...draft, modules})}/>;
    if (sectionId === "deliverables") return <div className="rf-field-stack"><StringListField label="Entregables" value={draft.deliverables} editing={editing} placeholder="Ej. Ebook digital (PDF/EPUB)" onChange={(deliverables) => setDraft({...draft, deliverables})}/><StringListField label="Checklists" value={draft.checklists} editing={editing} onChange={(checklists)=>setDraft({...draft,checklists})}/><StringListField label="Plantillas" value={draft.templates} editing={editing} onChange={(templates)=>setDraft({...draft,templates})}/></div>;
    return <div className="rf-field-stack"><StringListField label="Recursos" value={draft.resources} editing={editing} onChange={(resources)=>setDraft({...draft,resources})}/><StringListField label="Bonos" value={draft.bonuses} editing={editing} placeholder="Ej. Material complementario" onChange={(bonuses) => setDraft({...draft, bonuses})}/></div>;
  }, [onOpenTraceability]);

  return <EditorScaffold title="Definición del Ebook" description="Define el problema, la promesa central del libro, sus capítulos temáticos y los materiales complementarios." value={value} sections={sections} cloneValue={cloneProduct} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly} onEditingChange={onEditingChange}/>;
}

function ModuleList({value, editing, onChange}: {value: ProductModule[]; editing: boolean; onChange: (value: ProductModule[]) => void}) {
  const update = (index: number, patch: Partial<ProductModule>) => onChange(value.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
  if (!editing) return value.length ? <div className="rf-card-list">{value.map((module, index) => <article key={module.id || index}><span>{index + 1}</span><div><strong>{module.name || "Capítulo sin título"}</strong><p>{module.outcome || "Sin objetivo definido"}</p></div></article>)}</div> : <p className="rf-field__value is-empty">Sin capítulos</p>;
  return <div className="rf-repeat-editor">
    {value.map((module, index) => <article key={module.id || index}>
      <header><strong>Capítulo {index + 1}</strong><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>Eliminar</button></header>
      <label>Título del capítulo<input value={module.name} onChange={(event) => update(index, {name: event.target.value})}/></label>
      <label>Objetivo y contenido<textarea rows={3} value={module.outcome} onChange={(event) => update(index, {outcome: event.target.value})}/></label>
    </article>)}
    <button className="rf-add-button" type="button" onClick={() => onChange([...value, {id: globalThis.crypto.randomUUID(), name: "", outcome: ""}])}>+ Añadir capítulo</button>
  </div>;
}

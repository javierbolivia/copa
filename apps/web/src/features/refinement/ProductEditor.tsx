import { useCallback } from "react";
import { EditorScaffold, Field, StringListField, type EditorSection } from "./EditorScaffold";
import type { EditorCommonProps, ProductEditorValue, ProductModule } from "./types";

export type ProductEditorProps = EditorCommonProps<ProductEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "identity", label: "Identidad", summary: "Nombre, promesa y formato"},
  {id: "modules", label: "Módulos", summary: "Recorrido del producto"},
  {id: "deliverables", label: "Entregables", summary: "Materiales incluidos"},
  {id: "bonuses", label: "Bonuses", summary: "Valor adicional"},
];

const cloneProduct = (value: ProductEditorValue): ProductEditorValue => ({
  ...value,
  modules: value.modules.map((module) => ({...module})),
  deliverables: [...value.deliverables],
  bonuses: [...value.bonuses],
});

export function ProductEditor({value, onSave, saving, readOnly, onOpenTraceability}: ProductEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: ProductEditorValue, setDraft: (value: ProductEditorValue) => void, editing: boolean) => {
    const trace = (field: string) => { onOpenTraceability?.(field); };
    if (sectionId === "identity") return <div className="rf-field-stack">
      <Field label="Nombre" value={draft.name} editing={editing} placeholder="Nombre del producto" onChange={(name) => setDraft({...draft, name})} traceability={onOpenTraceability ? () => trace("name") : undefined}/>
      <Field label="Promesa" value={draft.promise} editing={editing} multiline placeholder="Transformación concreta y creíble" onChange={(promise) => setDraft({...draft, promise})} traceability={onOpenTraceability ? () => trace("promise") : undefined}/>
      <Field label="Formato" value={draft.format} editing={editing} placeholder="Curso, guía, programa…" onChange={(format) => setDraft({...draft, format})}/>
    </div>;
    if (sectionId === "modules") return <ModuleList value={draft.modules} editing={editing} onChange={(modules) => setDraft({...draft, modules})}/>;
    if (sectionId === "deliverables") return <StringListField label="Entregables" value={draft.deliverables} editing={editing} placeholder="Ej. Workbook de implementación" onChange={(deliverables) => setDraft({...draft, deliverables})}/>;
    return <StringListField label="Bonuses" value={draft.bonuses} editing={editing} placeholder="Ej. Plantillas extra" onChange={(bonuses) => setDraft({...draft, bonuses})}/>;
  }, [onOpenTraceability]);

  return <EditorScaffold title="Product Definition Workspace" description="Define la transformación, la arquitectura modular y los activos que recibirá el cliente." value={value} sections={sections} cloneValue={cloneProduct} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

function ModuleList({value, editing, onChange}: {value: ProductModule[]; editing: boolean; onChange: (value: ProductModule[]) => void}) {
  const update = (index: number, patch: Partial<ProductModule>) => onChange(value.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
  if (!editing) return value.length ? <div className="rf-card-list">{value.map((module, index) => <article key={module.id || index}><span>{index + 1}</span><div><strong>{module.name || "Módulo sin nombre"}</strong><p>{module.outcome || "Sin resultado definido"}</p></div></article>)}</div> : <p className="rf-field__value is-empty">Sin módulos</p>;
  return <div className="rf-repeat-editor">
    {value.map((module, index) => <article key={module.id || index}>
      <header><strong>Módulo {index + 1}</strong><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>Eliminar</button></header>
      <label>Nombre<input value={module.name} onChange={(event) => update(index, {name: event.target.value})}/></label>
      <label>Resultado<textarea rows={3} value={module.outcome} onChange={(event) => update(index, {outcome: event.target.value})}/></label>
    </article>)}
    <button className="rf-add-button" type="button" onClick={() => onChange([...value, {id: globalThis.crypto.randomUUID(), name: "", outcome: ""}])}>+ Añadir módulo</button>
  </div>;
}

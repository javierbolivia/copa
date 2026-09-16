import { useCallback } from "react";
import { EditorScaffold, Field, StringListField, type EditorSection } from "./EditorScaffold";
import type { EditorCommonProps, OfferComponent, OfferEditorValue } from "./types";

export type OfferEditorProps = EditorCommonProps<OfferEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "main", label: "Propuesta", summary: "Nombre y promesa"},
  {id:"scope",label:"Beneficios y entregables",summary:"Qué recibe el cliente"},
  {id:"pricing",label:"Precio y condiciones",summary:"Decisión comercial"},
  {id: "bonuses", label: "Bonuses", summary: "Valor añadido"},
  {id: "guarantee", label: "Garantía", summary: "Reducción de riesgo"},
  {id: "bump", label: "Order bump", summary: "Complemento en checkout"},
  {id: "upsell", label: "Upsell", summary: "Siguiente nivel"},
  {id: "downsell", label: "Downsell", summary: "Alternativa accesible"},
];
const cloneOffer=(value:OfferEditorValue)=>structuredClone(value);

export function OfferEditor({value, onSave, saving, readOnly, onOpenTraceability}: OfferEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: OfferEditorValue, setDraft: (value: OfferEditorValue) => void, editing: boolean) => {
    if(sectionId==="main")return <div className="rf-field-stack"><Field label="Nombre de la oferta" value={draft.name} editing={editing} onChange={name=>setDraft({...draft,name})}/><Field label="Promesa propuesta" value={draft.mainOffer} editing={editing} multiline onChange={mainOffer=>setDraft({...draft,mainOffer})}/><Field label="Llamada a la acción" value={draft.cta} editing={editing} onChange={cta=>setDraft({...draft,cta})}/></div>;
    if(sectionId==="scope")return <div className="rf-field-stack"><StringListField label="Beneficios propuestos" value={draft.benefits} editing={editing} onChange={benefits=>setDraft({...draft,benefits})}/><StringListField label="Entregables incluidos" value={draft.deliverables} editing={editing} onChange={deliverables=>setDraft({...draft,deliverables})}/></div>;
    if(sectionId==="pricing")return <div className="rf-field-stack"><p className="form-hint">Precio propuesto: vacío significa pendiente de definir; cero significa gratuito. Aprobar la versión no activa cobros.</p><div className="rf-inline-fields"><Field label="Precio propuesto" value={draft.pricing.amount} editing={editing} onChange={amount=>setDraft({...draft,pricing:{...draft.pricing,amount}})}/><Field label="Moneda" value={draft.pricing.currency} editing={editing} onChange={currency=>setDraft({...draft,pricing:{...draft.pricing,currency:currency.toUpperCase()}})}/></div><Field label="Motivo del precio" value={draft.pricing.rationale} editing={editing} multiline onChange={rationale=>setDraft({...draft,pricing:{...draft.pricing,rationale}})}/><Field label="Condiciones de pago" value={draft.pricing.terms} editing={editing} multiline onChange={terms=>setDraft({...draft,pricing:{...draft.pricing,terms}})}/></div>;
    if (sectionId === "bonuses") return <OfferComponents value={draft.bonuses} editing={editing} onChange={(bonuses) => setDraft({...draft, bonuses})}/>;
    if (sectionId === "guarantee") return <Field label="Garantía propuesta" value={draft.guarantee} editing={editing} multiline onChange={(guarantee) => setDraft({...draft, guarantee})} traceability={onOpenTraceability ? () => onOpenTraceability("guarantee") : undefined}/>;
    const keyBySection = {bump: "orderBump", upsell: "upsell", downsell: "downsell"} as const;
    const key = keyBySection[sectionId as keyof typeof keyBySection] ?? "orderBump";
    return <><p className="form-hint">Complemento opcional. Deja el nombre vacío para retirarlo de esta propuesta.</p><OfferComponentFields label={sections.find((item) => item.id === sectionId)?.label ?? "Oferta"} value={draft[key]} editing={editing} onChange={(component) => setDraft({...draft, [key]: component})}/></>;
  }, [onOpenTraceability]);
  return <EditorScaffold title="Arquitectura de la oferta" description="Define qué se promete, qué se entrega y bajo qué condiciones. Precio y garantía requieren una decisión explícita del propietario." value={value} sections={sections} cloneValue={cloneOffer} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

function OfferComponentFields({label, value, editing, onChange}: {label: string; value: OfferComponent; editing: boolean; onChange: (value: OfferComponent) => void}) {
  return <div className="rf-field-stack"><Field label={`Nombre de ${label}`} value={value.name} editing={editing} onChange={(name) => onChange({...value, name})}/><Field label="Descripción" value={value.description} editing={editing} multiline onChange={(description) => onChange({...value, description})}/></div>;
}

function OfferComponents({value, editing, onChange}: {value: OfferComponent[]; editing: boolean; onChange: (value: OfferComponent[]) => void}) {
  const update = (index: number, patch: Partial<OfferComponent>) => onChange(value.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
  if (!editing) return value.length ? <div className="rf-card-list">{value.map((item, index) => <article key={`${item.name}-${index}`}><span>+</span><div><strong>{item.name || "Bonus sin nombre"}</strong><p>{item.description || "Sin descripción"}</p></div></article>)}</div> : <p className="rf-field__value is-empty">Sin bonuses</p>;
  return <div className="rf-repeat-editor">{value.map((item, index) => <article key={index}><header><strong>Bonus {index + 1}</strong><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>Eliminar</button></header><label>Nombre<input value={item.name} onChange={(event) => update(index, {name: event.target.value})}/></label><label>Descripción<textarea rows={3} value={item.description} onChange={(event) => update(index, {description: event.target.value})}/></label></article>)}<button className="rf-add-button" type="button" onClick={() => onChange([...value, {name: "", description: ""}])}>+ Añadir bonus</button></div>;
}

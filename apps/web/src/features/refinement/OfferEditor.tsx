import { useCallback } from "react";
import { EditorScaffold, Field, type EditorSection } from "./EditorScaffold";
import type { EditorCommonProps, OfferComponent, OfferEditorValue } from "./types";

export type OfferEditorProps = EditorCommonProps<OfferEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "main", label: "Oferta principal", summary: "Propuesta y precio"},
  {id: "bonuses", label: "Bonuses", summary: "Valor añadido"},
  {id: "guarantee", label: "Garantía", summary: "Reducción de riesgo"},
  {id: "bump", label: "Order bump", summary: "Complemento en checkout"},
  {id: "upsell", label: "Upsell", summary: "Siguiente nivel"},
  {id: "downsell", label: "Downsell", summary: "Alternativa accesible"},
];
const cloneOffer = (value: OfferEditorValue): OfferEditorValue => ({...value, pricing: {...value.pricing}, bonuses: value.bonuses.map((item) => ({...item})), orderBump: {...value.orderBump}, upsell: {...value.upsell}, downsell: {...value.downsell}});

export function OfferEditor({value, onSave, saving, readOnly, onOpenTraceability}: OfferEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: OfferEditorValue, setDraft: (value: OfferEditorValue) => void, editing: boolean) => {
    if (sectionId === "main") return <div className="rf-field-stack"><Field label="Oferta principal" value={draft.mainOffer} editing={editing} multiline onChange={(mainOffer) => setDraft({...draft, mainOffer})} traceability={onOpenTraceability ? () => onOpenTraceability("mainOffer") : undefined}/><div className="rf-inline-fields"><Field label="Precio" value={draft.pricing.amount} editing={editing} onChange={(amount) => setDraft({...draft, pricing: {...draft.pricing, amount}})}/><Field label="Moneda" value={draft.pricing.currency} editing={editing} onChange={(currency) => setDraft({...draft, pricing: {...draft.pricing, currency}})}/></div><Field label="Condiciones" value={draft.pricing.terms} editing={editing} onChange={(terms) => setDraft({...draft, pricing: {...draft.pricing, terms}})}/></div>;
    if (sectionId === "bonuses") return <OfferComponents value={draft.bonuses} editing={editing} onChange={(bonuses) => setDraft({...draft, bonuses})}/>;
    if (sectionId === "guarantee") return <Field label="Garantía" value={draft.guarantee} editing={editing} multiline onChange={(guarantee) => setDraft({...draft, guarantee})} traceability={onOpenTraceability ? () => onOpenTraceability("guarantee") : undefined}/>;
    const keyBySection = {bump: "orderBump", upsell: "upsell", downsell: "downsell"} as const;
    const key = keyBySection[sectionId as keyof typeof keyBySection] ?? "orderBump";
    return <OfferComponentFields label={sections.find((item) => item.id === sectionId)?.label ?? "Oferta"} value={draft[key]} editing={editing} onChange={(component) => setDraft({...draft, [key]: component})}/>;
  }, [onOpenTraceability]);
  return <EditorScaffold title="Offer Architecture Workspace" description="Conecta propuesta, precio, riesgo y extensiones sin mezclar decisiones." value={value} sections={sections} cloneValue={cloneOffer} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

function OfferComponentFields({label, value, editing, onChange}: {label: string; value: OfferComponent; editing: boolean; onChange: (value: OfferComponent) => void}) {
  return <div className="rf-field-stack"><Field label={`Nombre de ${label}`} value={value.name} editing={editing} onChange={(name) => onChange({...value, name})}/><Field label="Descripción" value={value.description} editing={editing} multiline onChange={(description) => onChange({...value, description})}/></div>;
}

function OfferComponents({value, editing, onChange}: {value: OfferComponent[]; editing: boolean; onChange: (value: OfferComponent[]) => void}) {
  const update = (index: number, patch: Partial<OfferComponent>) => onChange(value.map((item, itemIndex) => itemIndex === index ? {...item, ...patch} : item));
  if (!editing) return value.length ? <div className="rf-card-list">{value.map((item, index) => <article key={`${item.name}-${index}`}><span>+</span><div><strong>{item.name || "Bonus sin nombre"}</strong><p>{item.description || "Sin descripción"}</p></div></article>)}</div> : <p className="rf-field__value is-empty">Sin bonuses</p>;
  return <div className="rf-repeat-editor">{value.map((item, index) => <article key={index}><header><strong>Bonus {index + 1}</strong><button type="button" onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>Eliminar</button></header><label>Nombre<input value={item.name} onChange={(event) => update(index, {name: event.target.value})}/></label><label>Descripción<textarea rows={3} value={item.description} onChange={(event) => update(index, {description: event.target.value})}/></label></article>)}<button className="rf-add-button" type="button" onClick={() => onChange([...value, {name: "", description: ""}])}>+ Añadir bonus</button></div>;
}

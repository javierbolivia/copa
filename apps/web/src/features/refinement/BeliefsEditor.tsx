import { useCallback } from "react";
import { EditorScaffold, Field, StringListField, type EditorSection } from "./EditorScaffold";
import type { BeliefsEditorValue, EditorCommonProps } from "./types";

export type BeliefsEditorProps = EditorCommonProps<BeliefsEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "idea", label: "Gran idea", summary: "Tesis central"},
  {id: "current", label: "Creencias actuales", summary: "Punto de partida"},
  {id: "bridge", label: "Creencias puente", summary: "Cambio progresivo"},
  {id: "required", label: "Creencias necesarias", summary: "Antes de comprar"},
  {id: "objections", label: "Objeciones", summary: "Resistencias clave"},
];
const cloneBeliefs = (value: BeliefsEditorValue): BeliefsEditorValue => ({...value, currentBeliefs: [...value.currentBeliefs], bridgeBeliefs: [...value.bridgeBeliefs], requiredBeliefs: [...value.requiredBeliefs], objections: [...value.objections]});

export function BeliefsEditor({value, onSave, saving, readOnly, onOpenTraceability}: BeliefsEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: BeliefsEditorValue, setDraft: (value: BeliefsEditorValue) => void, editing: boolean) => {
    if (sectionId === "idea") return <Field label="Gran idea" value={draft.bigIdea} editing={editing} multiline onChange={(bigIdea) => setDraft({...draft, bigIdea})} traceability={onOpenTraceability ? () => onOpenTraceability("bigIdea") : undefined}/>;
    const keyBySection = {current: "currentBeliefs", bridge: "bridgeBeliefs", required: "requiredBeliefs", objections: "objections"} as const;
    const key = keyBySection[sectionId as keyof typeof keyBySection] ?? "currentBeliefs";
    const labelByKey: Record<typeof key, string> = {currentBeliefs: "Creencias actuales", bridgeBeliefs: "Creencias puente", requiredBeliefs: "Creencias necesarias", objections: "Objeciones"};
    return <StringListField label={labelByKey[key]} value={draft[key]} editing={editing} onChange={(items) => setDraft({...draft, [key]: items})} traceability={onOpenTraceability ? () => onOpenTraceability(key) : undefined}/>;
  }, [onOpenTraceability]);
  return <EditorScaffold title="Belief Progression Workspace" description="Modela el cambio de perspectiva que conecta el problema con la oferta." value={value} sections={sections} cloneValue={cloneBeliefs} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

import { useCallback } from "react";
import { EditorScaffold, Field, StringListField, type EditorSection } from "./EditorScaffold";
import type { EditorCommonProps, MechanismEditorValue } from "./types";

export type MechanismEditorProps = EditorCommonProps<MechanismEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "core", label: "Núcleo", summary: "Nombre y explicación"},
  {id: "contrast", label: "Contraste", summary: "Problema y vieja vía"},
  {id: "steps", label: "Pasos", summary: "Cómo funciona"},
  {id: "proof", label: "Prueba", summary: "Por qué creer"},
];
const cloneMechanism = (value: MechanismEditorValue): MechanismEditorValue => ({...value, steps: [...value.steps], proof: [...value.proof]});

export function MechanismEditor({value, onSave, saving, readOnly, onOpenTraceability}: MechanismEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: MechanismEditorValue, setDraft: (value: MechanismEditorValue) => void, editing: boolean) => {
    const trace = (field: string) => onOpenTraceability ? () => onOpenTraceability(field) : undefined;
    if (sectionId === "core") return <div className="rf-field-stack"><Field label="Nombre del mecanismo" value={draft.name} editing={editing} onChange={(name) => setDraft({...draft, name})}/><Field label="Mecanismo único" value={draft.uniqueMechanism} editing={editing} multiline onChange={(uniqueMechanism) => setDraft({...draft, uniqueMechanism})} traceability={trace("uniqueMechanism")}/><Field label="Por qué funciona" value={draft.whyItWorks} editing={editing} multiline onChange={(whyItWorks) => setDraft({...draft, whyItWorks})}/></div>;
    if (sectionId === "contrast") return <div className="rf-field-stack"><Field label="Problema que resuelve" value={draft.problem} editing={editing} multiline onChange={(problem) => setDraft({...draft, problem})} traceability={trace("problem")}/><Field label="Por qué falla la vieja vía" value={draft.oldWay} editing={editing} multiline onChange={(oldWay) => setDraft({...draft, oldWay})}/></div>;
    if (sectionId === "steps") return <StringListField label="Pasos del mecanismo" value={draft.steps} editing={editing} onChange={(steps) => setDraft({...draft, steps})}/>;
    return <StringListField label="Pruebas y razones para creer" value={draft.proof} editing={editing} onChange={(proof) => setDraft({...draft, proof})} traceability={trace("proof")}/>;
  }, [onOpenTraceability]);
  return <EditorScaffold title="Mechanism Design Workspace" description="Diseña qué cambia, cómo funciona y por qué esta vía es diferente." value={value} sections={sections} cloneValue={cloneMechanism} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}

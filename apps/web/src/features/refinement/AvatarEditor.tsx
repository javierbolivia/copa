import { useCallback } from "react";
import { EditorScaffold, Field, StringListField, type EditorSection } from "./EditorScaffold";
import type { AvatarEditorValue, EditorCommonProps } from "./types";

export type AvatarEditorProps = EditorCommonProps<AvatarEditorValue>;

const sections: readonly EditorSection[] = [
  {id: "situation", label: "Situación", summary: "Contexto actual"},
  {id: "pains", label: "Dolores", summary: "Problemas vividos"},
  {id: "desires", label: "Deseos", summary: "Resultados buscados"},
  {id: "objections", label: "Objeciones", summary: "Fricciones de compra"},
  {id: "language", label: "Lenguaje", summary: "Palabras del avatar"},
  {id: "evidence", label: "Evidencia", summary: "Señales observadas"},
];

const cloneAvatar = (value: AvatarEditorValue): AvatarEditorValue => ({...value, pains: [...value.pains], desires: [...value.desires], objections: [...value.objections], language: [...value.language], evidence: [...value.evidence]});

export function AvatarEditor({value, onSave, saving, readOnly, onOpenTraceability}: AvatarEditorProps) {
  const renderSection = useCallback((sectionId: string, draft: AvatarEditorValue, setDraft: (value: AvatarEditorValue) => void, editing: boolean) => {
    if (sectionId === "situation") return <Field label="Situación actual" value={draft.situation} editing={editing} multiline placeholder="¿Qué vive hoy esta persona?" onChange={(situation) => setDraft({...draft, situation})} traceability={onOpenTraceability ? () => onOpenTraceability("situation") : undefined}/>;
    const key = sectionId as Exclude<keyof AvatarEditorValue, "situation">;
    const labels: Record<typeof key, string> = {pains: "Dolores", desires: "Deseos", objections: "Objeciones", language: "Lenguaje textual", evidence: "Evidencia"};
    return <StringListField label={labels[key]} value={draft[key]} editing={editing} onChange={(items) => setDraft({...draft, [key]: items})} traceability={onOpenTraceability ? () => onOpenTraceability(key) : undefined}/>;
  }, [onOpenTraceability]);
  return <EditorScaffold title="Avatar" description="Organiza la voz, motivaciones y fricciones del cliente ideal por secciones." value={value} sections={sections} cloneValue={cloneAvatar} renderSection={renderSection} onSave={onSave} saving={saving} readOnly={readOnly}/>;
}


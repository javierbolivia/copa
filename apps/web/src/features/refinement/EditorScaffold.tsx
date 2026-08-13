import { useEffect, useState, type ReactNode } from "react";
import "./refinement.css";

export interface EditorSection {
  id: string;
  label: string;
  summary?: string | undefined;
}

interface EditorScaffoldProps<T> {
  title: string;
  description: string;
  value: T;
  sections: readonly EditorSection[];
  cloneValue: (value: T) => T;
  renderSection: (sectionId: string, value: T, setValue: (value: T) => void, editing: boolean) => ReactNode;
  onSave: (value: T) => void | Promise<void>;
  saving?: boolean | undefined;
  readOnly?: boolean | undefined;
}

export function EditorScaffold<T>({
  title,
  description,
  value,
  sections,
  cloneValue,
  renderSection,
  onSave,
  saving = false,
  readOnly = false,
}: EditorScaffoldProps<T>) {
  const firstSection = sections[0]?.id ?? "";
  const [activeSection, setActiveSection] = useState(firstSection);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => cloneValue(value));

  useEffect(() => {
    if (!editing) setDraft(cloneValue(value));
  }, [value, editing, cloneValue]);

  const cancel = () => {
    setDraft(cloneValue(value));
    setEditing(false);
  };

  const save = async () => {
    await onSave(cloneValue(draft));
    setEditing(false);
  };

  return (
    <section className="rf-editor" aria-label={`Editor de ${title}`}>
      <header className="rf-editor__header">
        <div>
          <span className="rf-eyebrow">EDITOR ESPECIALIZADO</span>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="rf-actions">
          {editing ? (
            <>
              <button className="rf-button rf-button--quiet" type="button" disabled={saving} onClick={cancel}>Cancelar</button>
              <button className="rf-button rf-button--primary" type="button" disabled={saving} onClick={() => void save()}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </>
          ) : (
            <button className="rf-button rf-button--primary" type="button" disabled={readOnly} onClick={() => setEditing(true)}>Editar</button>
          )}
        </div>
      </header>

      <div className="rf-editor__body">
        <nav className="rf-section-nav" aria-label={`Secciones de ${title}`}>
          {sections.map((section) => (
            <button
              className={activeSection === section.id ? "is-active" : ""}
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
            >
              <strong>{section.label}</strong>
              {section.summary && <small>{section.summary}</small>}
            </button>
          ))}
        </nav>
        <div className="rf-section-panel">
          {renderSection(activeSection, draft, setDraft, editing)}
        </div>
      </div>
    </section>
  );
}

export function Field({label, value, editing, multiline = false, placeholder, onChange, traceability}: {
  label: string;
  value: string;
  editing: boolean;
  multiline?: boolean | undefined;
  placeholder?: string | undefined;
  onChange: (value: string) => void;
  traceability?: (() => void) | undefined;
}) {
  return (
    <div className="rf-field">
      <div className="rf-field__label">
        <label>{label}</label>
        {traceability && <button type="button" onClick={traceability}>¿De dónde sale esto?</button>}
      </div>
      {editing ? (
        multiline
          ? <textarea rows={5} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
          : <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : <p className={value.trim() ? "rf-field__value" : "rf-field__value is-empty"}>{value.trim() || "Sin completar"}</p>}
    </div>
  );
}

export function StringListField({label, value, editing, placeholder, onChange, traceability}: {
  label: string;
  value: string[];
  editing: boolean;
  placeholder?: string | undefined;
  onChange: (value: string[]) => void;
  traceability?: (() => void) | undefined;
}) {
  const update = (index: number, next: string) => onChange(value.map((item, itemIndex) => itemIndex === index ? next : item));
  return (
    <div className="rf-field">
      <div className="rf-field__label">
        <label>{label}</label>
        {traceability && <button type="button" onClick={traceability}>¿De dónde sale esto?</button>}
      </div>
      {editing ? (
        <div className="rf-list-editor">
          {value.map((item, index) => (
            <div key={index}>
              <input value={item} placeholder={placeholder} onChange={(event) => update(index, event.target.value)} />
              <button type="button" aria-label={`Eliminar elemento ${index + 1}`} onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}>×</button>
            </div>
          ))}
          <button className="rf-add-button" type="button" onClick={() => onChange([...value, ""])}>+ Añadir</button>
        </div>
      ) : value.length ? (
        <ul className="rf-value-list">{value.map((item, index) => <li key={`${item}-${index}`}>{item || "Sin completar"}</li>)}</ul>
      ) : <p className="rf-field__value is-empty">Sin elementos</p>}
    </div>
  );
}

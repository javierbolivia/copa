import { useEffect, useMemo, useState } from "react";
import { Field, StringListField } from "./EditorScaffold";
import type { LandingEditorValue, LandingPreviewMode, LandingSection, LandingVersion } from "./types";
import "./refinement.css";

export interface LandingBuilderProps {
  value: LandingEditorValue;
  versions: LandingVersion[];
  selectedVersionId?: string | undefined;
  saving?: boolean | undefined;
  exporting?: boolean | undefined;
  readOnly?: boolean | undefined;
  onSave: (value: LandingEditorValue) => void | Promise<void>;
  onSelectVersion?: ((versionId: string) => void) | undefined;
  onExportHtml: (value: LandingEditorValue) => void | Promise<void>;
  onOpenTraceability?: ((field: string) => void) | undefined;
}

type LandingEditorSection = "hero" | "problem" | "solution" | "benefits" | "offer" | "guarantee" | "cta";

const editorSections: ReadonlyArray<{id: LandingEditorSection; label: string}> = [
  {id: "hero", label: "Hero"},
  {id: "problem", label: "Problema"},
  {id: "solution", label: "Solución"},
  {id: "benefits", label: "Beneficios"},
  {id: "offer", label: "Oferta"},
  {id: "guarantee", label: "Garantía"},
  {id: "cta", label: "CTA"},
];

const cloneLanding = (value: LandingEditorValue): LandingEditorValue => ({
  ...value,
  hero: {...value.hero},
  problem: {...value.problem},
  solution: {...value.solution},
  benefits: [...value.benefits],
  offer: {...value.offer},
});

export function LandingBuilder({
  value,
  versions,
  selectedVersionId,
  saving = false,
  exporting = false,
  readOnly = false,
  onSave,
  onSelectVersion,
  onExportHtml,
  onOpenTraceability,
}: LandingBuilderProps) {
  const [draft, setDraft] = useState(() => cloneLanding(value));
  const [editing, setEditing] = useState(false);
  const [activeSection, setActiveSection] = useState<LandingEditorSection>("hero");
  const [previewMode, setPreviewMode] = useState<LandingPreviewMode>("desktop");
  const [compareVersionId, setCompareVersionId] = useState("");

  useEffect(() => {
    if (!editing) setDraft(cloneLanding(value));
  }, [value, editing]);

  const compareVersion = versions.find((version) => version.id === compareVersionId);
  const differences = useMemo(() => compareVersion ? compareLanding(value, compareVersion.value) : [], [compareVersion, value]);
  const previewValue = editing ? draft : value;

  const cancel = () => {
    setDraft(cloneLanding(value));
    setEditing(false);
  };
  const save = async () => {
    await onSave(cloneLanding(draft));
    setEditing(false);
  };

  return <section className="rf-landing-builder">
    <header className="rf-landing-toolbar">
      <div><span className="rf-eyebrow">LANDING BUILDER</span><h2>{value.pageName || "Landing sin nombre"}</h2><p>Copy estructurado y vista previa segura, siempre sincronizados.</p></div>
      <div className="rf-actions">
        {editing ? <><button className="rf-button rf-button--quiet" type="button" disabled={saving} onClick={cancel}>Cancelar</button><button className="rf-button rf-button--primary" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar"}</button></> : <button className="rf-button rf-button--quiet" type="button" disabled={readOnly} onClick={() => setEditing(true)}>Editar</button>}
        <button className="rf-button rf-button--primary" type="button" disabled={exporting} onClick={() => void onExportHtml(previewValue)}>{exporting ? "Exportando…" : "Exportar HTML"}</button>
      </div>
    </header>

    <div className="rf-landing-meta">
      <label>Versión
        <select value={selectedVersionId ?? ""} disabled={!onSelectVersion} onChange={(event) => onSelectVersion?.(event.target.value)}>
          {!selectedVersionId && <option value="">Actual</option>}
          {versions.map((version) => <option key={version.id} value={version.id}>v{version.versionNumber} · {formatDate(version.createdAt)}{version.status ? ` · ${version.status}` : ""}</option>)}
        </select>
      </label>
      <label>Comparar con
        <select value={compareVersionId} onChange={(event) => setCompareVersionId(event.target.value)}>
          <option value="">Sin comparación</option>
          {versions.filter((version) => version.id !== selectedVersionId).map((version) => <option key={version.id} value={version.id}>v{version.versionNumber} · {formatDate(version.createdAt)}</option>)}
        </select>
      </label>
      <div className="rf-preview-toggle" role="group" aria-label="Tamaño de vista previa">
        <button className={previewMode === "desktop" ? "is-active" : ""} type="button" onClick={() => setPreviewMode("desktop")}>Desktop</button>
        <button className={previewMode === "mobile" ? "is-active" : ""} type="button" onClick={() => setPreviewMode("mobile")}>Mobile</button>
      </div>
    </div>

    {compareVersion && <VersionComparison version={compareVersion} differences={differences}/>}

    <div className="rf-landing-grid">
      <div className="rf-landing-editor">
        <nav aria-label="Secciones de la landing">{editorSections.map((section) => <button className={activeSection === section.id ? "is-active" : ""} type="button" key={section.id} onClick={() => setActiveSection(section.id)}>{section.label}</button>)}</nav>
        <div className="rf-landing-editor__panel">
          <LandingSectionEditor sectionId={activeSection} value={draft} editing={editing} onChange={setDraft} onOpenTraceability={onOpenTraceability}/>
        </div>
      </div>
      <div className="rf-preview-stage">
        <div className={`rf-preview-frame rf-preview-frame--${previewMode}`}>
          <LandingPreview value={previewValue} onOpenTraceability={onOpenTraceability}/>
        </div>
      </div>
    </div>
  </section>;
}

function LandingSectionEditor({sectionId, value, editing, onChange, onOpenTraceability}: {sectionId: LandingEditorSection; value: LandingEditorValue; editing: boolean; onChange: (value: LandingEditorValue) => void; onOpenTraceability?: ((field: string) => void) | undefined}) {
  if (sectionId === "benefits") return <StringListField label="Beneficios" value={value.benefits} editing={editing} onChange={(benefits) => onChange({...value, benefits})} traceability={onOpenTraceability ? () => onOpenTraceability("benefits") : undefined}/>;
  if (sectionId === "guarantee") return <Field label="Garantía" value={value.guarantee} editing={editing} multiline onChange={(guarantee) => onChange({...value, guarantee})} traceability={onOpenTraceability ? () => onOpenTraceability("guarantee") : undefined}/>;
  if (sectionId === "cta") return <div className="rf-field-stack"><Field label="Texto del botón" value={value.ctaLabel} editing={editing} onChange={(ctaLabel) => onChange({...value, ctaLabel})}/><Field label="Nota al pie" value={value.footerNote} editing={editing} multiline onChange={(footerNote) => onChange({...value, footerNote})}/></div>;
  const section = value[sectionId];
  const update = (patch: Partial<LandingSection>) => onChange({...value, [sectionId]: {...section, ...patch}});
  return <div className="rf-field-stack">
    {sectionId === "hero" && <Field label="Nombre interno" value={value.pageName} editing={editing} onChange={(pageName) => onChange({...value, pageName})}/>} 
    <Field label="Antetítulo" value={section.eyebrow} editing={editing} onChange={(eyebrow) => update({eyebrow})}/>
    <Field label="Título" value={section.headline} editing={editing} multiline onChange={(headline) => update({headline})} traceability={onOpenTraceability ? () => onOpenTraceability(`${sectionId}.headline`) : undefined}/>
    <Field label="Cuerpo" value={section.body} editing={editing} multiline onChange={(body) => update({body})}/>
  </div>;
}

export function LandingPreview({value, onOpenTraceability}: {value: LandingEditorValue; onOpenTraceability?: ((field: string) => void) | undefined}) {
  return <article className="rf-page-preview" aria-label="Vista previa de landing">
    <section className="rf-page-hero"><PreviewEyebrow value={value.hero.eyebrow}/><h1>{value.hero.headline || "Tu headline aparecerá aquí"}</h1><p>{value.hero.body}</p><button type="button">{value.ctaLabel || "Empezar ahora"}</button>{onOpenTraceability && <TraceButton onClick={() => onOpenTraceability("hero.headline")}/>}</section>
    <PreviewSection section={value.problem} traceability={onOpenTraceability ? () => onOpenTraceability("problem.headline") : undefined}/>
    <PreviewSection section={value.solution} traceability={onOpenTraceability ? () => onOpenTraceability("solution.headline") : undefined}/>
    {value.benefits.length > 0 && <section className="rf-page-benefits"><h2>Lo que conseguirás</h2><div>{value.benefits.map((benefit, index) => <article key={`${benefit}-${index}`}><span>✓</span><p>{benefit}</p></article>)}</div>{onOpenTraceability && <TraceButton onClick={() => onOpenTraceability("benefits")}/>}</section>}
    <PreviewSection section={value.offer} accent traceability={onOpenTraceability ? () => onOpenTraceability("offer.headline") : undefined}/>
    {value.guarantee && <section className="rf-page-guarantee"><strong>Garantía</strong><p>{value.guarantee}</p></section>}
    <section className="rf-page-final"><button type="button">{value.ctaLabel || "Empezar ahora"}</button><small>{value.footerNote}</small></section>
  </article>;
}

function PreviewSection({section, accent = false, traceability}: {section: LandingSection; accent?: boolean | undefined; traceability?: (() => void) | undefined}) {
  return <section className={accent ? "rf-page-section is-accent" : "rf-page-section"}><PreviewEyebrow value={section.eyebrow}/><h2>{section.headline}</h2><p>{section.body}</p>{traceability && <TraceButton onClick={traceability}/>}</section>;
}
function PreviewEyebrow({value}: {value: string}) { return value ? <span>{value}</span> : null; }
function TraceButton({onClick}: {onClick: () => void}) { return <button className="rf-trace-button" type="button" onClick={onClick}>¿De dónde sale esto?</button>; }

function VersionComparison({version, differences}: {version: LandingVersion; differences: string[]}) {
  return <aside className="rf-version-comparison"><div><span className="rf-eyebrow">COMPARACIÓN</span><strong>Actual vs. v{version.versionNumber}</strong></div>{differences.length ? <ul>{differences.map((difference) => <li key={difference}>{difference}</li>)}</ul> : <p>Las versiones no tienen diferencias de contenido.</p>}</aside>;
}

function compareLanding(current: LandingEditorValue, previous: LandingEditorValue): string[] {
  const fields: ReadonlyArray<[string, string, string]> = [
    ["Nombre", current.pageName, previous.pageName],
    ["Hero", JSON.stringify(current.hero), JSON.stringify(previous.hero)],
    ["Problema", JSON.stringify(current.problem), JSON.stringify(previous.problem)],
    ["Solución", JSON.stringify(current.solution), JSON.stringify(previous.solution)],
    ["Beneficios", JSON.stringify(current.benefits), JSON.stringify(previous.benefits)],
    ["Oferta", JSON.stringify(current.offer), JSON.stringify(previous.offer)],
    ["Garantía", current.guarantee, previous.guarantee],
    ["CTA", current.ctaLabel, previous.ctaLabel],
  ];
  return fields.filter(([, a, b]) => a !== b).map(([label]) => `${label} cambió`);
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es");
}

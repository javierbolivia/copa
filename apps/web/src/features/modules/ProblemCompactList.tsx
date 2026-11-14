import { ChevronDown, MessageSquareText } from "lucide-react";
import { useId, useState } from "react";
import { StrengthMeter } from "../../components/ProductUI";
import type { EvidenceSnippet } from "@our-platform/shared";

const EVIDENCE_PAGE_SIZE = 6;
const strengthLabels: Record<string, string> = { SIGNAL: "Señal", EMERGING: "Emergente", PATTERN: "Patrón", STRONG_PATTERN: "Patrón sólido" };
const relevanceLabels: Record<string, string> = { CORE: "Central", RELATED: "Relacionado", TANGENTIAL: "Tangencial", OUT_OF_SCOPE: "Fuera de foco" };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export function ProblemCompactList({ items, onOpenEvidence }: { items: Record<string, unknown>[]; onOpenEvidence: (commentId: string) => void }) {
  const group = useId();
  return <>
    {items.length > 0 && <p className="form-hint problem-list-hint">{items.length} problemas · Abre uno para leer su interpretación y consultar las evidencias. No se elimina contenido.</p>}
    <div className="problem-quality-list compact-problems-list">
      {items.map((item, index) => {
        const evidence = Array.isArray(item.evidence) ? item.evidence.filter(isRecord) : [];
        const strength = typeof item.problemStrengthScore === "number" ? item.problemStrengthScore : null;
        const level = String(item.strengthLevel ?? "signal").toLowerCase();
        const name = String(item.name ?? "Problema");
        const relevance = relevanceLabels[String(item.relevanceLevel)] ?? "No registrada";
        return <details name={group} key={String(item.id ?? index)} className={`problem-quality-card problem-row strength-${level}`}>
          <summary className="problem-row-summary">
            <span className="problem-row-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="problem-row-title">
              <h3>{name}</h3>
              <div className="badge-row">
                <span className={`status-pill ${level}`}>{strengthLabels[String(item.strengthLevel)] ?? "Sin nivel registrado"}</span>
                <span className="problem-row-score">{strength === null ? "Sin puntuación registrada" : `Solidez ${strength}/100`}</span>
                <span className="problem-row-focus">Foco: {relevance}{typeof item.relevanceScore === "number" ? ` · ${item.relevanceScore}/100` : ""}</span>
              </div>
            </div>
            <span className="problem-row-count">{String(item.evidenceCount ?? evidence.length)} evidencias</span>
            <ChevronDown className="problem-row-chevron" size={18} aria-hidden="true"/>
          </summary>
          <div className="problem-row-detail">
            <p>{String(item.summary ?? "")}</p>
            {strength !== null && <span className="signal-strength"><StrengthMeter value={strength}/></span>}
            <p className="problem-detail-metrics">{String(item.evidenceCount ?? "—")} evidencias · {String(item.uniqueAuthors ?? "—")} autores · {String(item.uniqueSources ?? "—")} fuentes<br/>Directas: {String(item.directEvidenceCount ?? "—")} · Inferidas: {String(item.inferredEvidenceCount ?? "—")} · Precisión: {String(item.evidencePrecisionScore ?? "—")}%</p>
            <ProblemEvidenceList key={String(item.id ?? index)} evidence={evidence} problemName={name} onOpenEvidence={onOpenEvidence}/>
          </div>
        </details>;
      })}
    </div>
  </>;
}

export function ProblemLinkedEvidence({ evidence, onOpenEvidence }: { evidence: EvidenceSnippet[]; onOpenEvidence: (commentId: string) => void }) {
  const references = evidence.map(entry => ({ evidenceId: entry.id, commentId: entry.commentId, quote: entry.quoteText, author: entry.author, sourceTitle: entry.sourceTitle, supportType: entry.provenance }));
  return <article className="detail-card jobs-panel problem-linked-evidence">
    <span className="eyebrow">EVIDENCIA VINCULADA · MUESTRA DE HASTA 20</span>
    <p className="form-hint">Esta muestra no sustituye las evidencias de cada problema. Puedes consultar todas desde la lista superior.</p>
    <ProblemEvidenceList evidence={references} problemName="la muestra vinculada" onOpenEvidence={onOpenEvidence}/>
  </article>;
}

function ProblemEvidenceList({ evidence, problemName, onOpenEvidence }: { evidence: Record<string, unknown>[]; problemName: string; onOpenEvidence: (commentId: string) => void }) {
  const group = useId();
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(evidence.length / EVIDENCE_PAGE_SIZE));
  const page = Math.min(pageIndex, pageCount - 1);
  const start = page * EVIDENCE_PAGE_SIZE;
  const visible = evidence.slice(start, start + EVIDENCE_PAGE_SIZE);
  return <details className="problem-evidence-section">
    <summary><MessageSquareText size={15} aria-hidden="true"/><strong>Evidencias disponibles ({evidence.length})</strong><ChevronDown size={16} aria-hidden="true"/></summary>
    {evidence.length === 0 ? <p className="muted-copy">Esta versión no incluye citas desplegables. Se conservan sus métricas y referencias originales.</p> : <>
      <div className="problem-evidence-page">
        {visible.map((entry, index) => <details name={group} className="problem-evidence-row" key={`${page}-${String(entry.evidenceId ?? start + index)}`}>
          <summary><span>Evidencia {start + index + 1}</span><span className="problem-evidence-preview">{String(entry.quote ?? "Sin cita literal registrada")}</span><small>{String(entry.author ?? "")} · {String(entry.sourceTitle ?? "")} · {String(entry.supportType ?? "")}</small></summary>
          <blockquote><MessageSquareText size={15} aria-hidden="true"/><div><p>“{String(entry.quote ?? "")}”</p><footer>{String(entry.author ?? "")} · {String(entry.sourceTitle ?? "")} · {String(entry.supportType ?? "")}{typeof entry.evidenceId === "string" && <><br/>{entry.evidenceId}</>}</footer></div></blockquote>
          {typeof entry.commentId === "string" && <button type="button" className="button secondary" onClick={() => onOpenEvidence(String(entry.commentId))}>Ver evidencia original</button>}
        </details>)}
      </div>
      <nav className="problem-evidence-pagination" aria-label={`Paginación de evidencias de ${problemName}`}>
        <span role="status" aria-live="polite">{start + 1}–{Math.min(start + EVIDENCE_PAGE_SIZE, evidence.length)} de {evidence.length}</span>
        {pageCount > 1 && <><button type="button" className="button secondary" disabled={page === 0} onClick={() => setPageIndex(page - 1)}>Anterior</button><label>Página<select aria-label={`Página de evidencias de ${problemName}`} value={page + 1} onChange={event => setPageIndex(Number(event.target.value) - 1)}>{Array.from({ length: pageCount }, (_, index) => <option key={index} value={index + 1}>{index + 1} / {pageCount}</option>)}</select></label><button type="button" className="button secondary" disabled={page === pageCount - 1} onClick={() => setPageIndex(page + 1)}>Siguiente</button></>}
      </nav>
    </>}
  </details>;
}

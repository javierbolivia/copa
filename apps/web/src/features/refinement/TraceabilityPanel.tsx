import "./campaign.css";

export interface TraceableVersion {
  id: string;
  name: string;
  moduleName: string;
  version: number;
  createdAt: string;
  status: "FRESH" | "STALE" | "DRAFT" | "APPROVED";
}

export interface TraceabilityPanelProps {
  current: TraceableVersion;
  sources: readonly TraceableVersion[];
  descendants?: readonly TraceableVersion[];
  onOpenVersion: (versionId: string) => void;
}

export function TraceabilityPanel({ current, sources, descendants = [], onOpenVersion }: TraceabilityPanelProps) {
  return <aside className="refinement-traceability" aria-labelledby={`trace-${current.id}`}>
    <header><span>TRAZABILIDAD</span><h3 id={`trace-${current.id}`}>Origen de esta versión</h3><p>Nombres y versiones que componen el resultado actual.</p></header>
    <TraceVersion version={current} kind="Resultado actual" onOpen={onOpenVersion} current />
    <div className="refinement-trace-line" aria-hidden="true" />
    <section aria-label="Fuentes utilizadas">
      <h4>Creado a partir de</h4>
      {sources.length === 0 ? <p className="refinement-muted">Sin dependencias registradas.</p> : <div className="refinement-trace-list">{sources.map((source) => <TraceVersion key={source.id} version={source} kind={source.moduleName} onOpen={onOpenVersion} />)}</div>}
    </section>
    {descendants.length > 0 && <section aria-label="Resultados derivados"><h4>Utilizado por</h4><div className="refinement-trace-list">{descendants.map((descendant) => <TraceVersion key={descendant.id} version={descendant} kind={descendant.moduleName} onOpen={onOpenVersion} />)}</div></section>}
  </aside>;
}

function TraceVersion({ version, kind, current = false, onOpen }: { version: TraceableVersion; kind: string; current?: boolean; onOpen: (id: string) => void }) {
  return <button className={`refinement-trace-version${current ? " is-current" : ""}`} onClick={() => onOpen(version.id)} type="button">
    <span className="refinement-trace-dot" aria-hidden="true" />
    <span><small>{kind}</small><strong>{version.name}</strong><em>v{version.version} · {formatDate(version.createdAt)}</em></span>
    <b className={`refinement-status is-${version.status.toLowerCase()}`}>{statusLabel(version.status)}</b>
  </button>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es"); }
function statusLabel(value: TraceableVersion["status"]) { return ({ FRESH: "Vigente", STALE: "Desactualizado", DRAFT: "Borrador", APPROVED: "Aprobado" } as const)[value]; }

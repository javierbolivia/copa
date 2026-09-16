import { useMemo, useState, type DragEvent } from "react";
import type { FunnelEdge } from "@our-platform/shared";
import "./campaign.css";

export interface FunnelNode {
  id: string;
  name: string;
  stage: string;
  description: string;
  active: boolean;
  metricLabel?: string | undefined;
  metricValue?: string | undefined;
  linkedArtifact?: string | undefined;
  externalPlatform?: "hotmart" | "skool" | "custom" | "none" | undefined;
  externalCheckoutUrl?: string | undefined;
  trackingEvent?: "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase" | string | undefined;
}

export interface FunnelWorkspaceProps {
  nodes: readonly FunnelNode[];
  edges?: readonly FunnelEdge[];
  onUpdate: (node: FunnelNode) => void;
  onReorder: (orderedIds: string[]) => void;
  onToggleActive?: (nodeId: string, active: boolean) => void;
  onExport?: () => void;
}

export function FunnelWorkspace({ nodes, edges, onUpdate, onReorder, onToggleActive, onExport }: FunnelWorkspaceProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const reorder = (nodeId: string, direction: -1 | 1) => {
    const ids = nodes.map((node) => node.id);
    const from = ids.indexOf(nodeId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    onReorder(ids);
  };
  const drop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const ids = nodes.map((node) => node.id).filter((id) => id !== draggedId);
    const targetIndex = ids.indexOf(targetId);
    ids.splice(targetIndex < 0 ? ids.length : targetIndex, 0, draggedId);
    onReorder(ids);
    setDraggedId(null);
  };

  return <section className="refinement-workspace" aria-labelledby="funnel-heading">
    <WorkspaceHeading
      eyebrow="FUNNEL FLOW WORKSPACE"
      title="Recorrido comercial y conversión (Meta Ads → Landing → Hotmart / Skool)"
      description="Conecta, activa y ordena cada decisión del recorrido comercial. Integra checkout externo (Hotmart/Skool) y eventos de Meta Pixel (ViewContent, InitiateCheckout, Purchase)."
      id="funnel-heading"
      action={onExport ? <button className="button secondary" onClick={onExport} type="button">Exportar Funnel (.md)</button> : undefined}
    />

    {edges && edges.length > 0 && (
      <div className="refinement-funnel-graph" style={{ marginBottom: 20, padding: 16, background: "rgba(255,255,255,0.025)", borderRadius: 12, border: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--module-accent)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            Mapa de Transiciones ({edges.length} conexiones)
          </span>
          <small style={{ color: "var(--text-muted)", fontSize: 10 }}>Checkout externo (Hotmart/Skool) · Pagos propios deshabilitados</small>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {edges.map((edge, idx) => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            const isAccept = edge.event === "accept";
            const isDecline = edge.event === "decline";
            const badgeClass = isAccept ? "is-ready" : isDecline ? "is-failed" : "is-generating";
            const badgeText = edge.label || (isAccept ? "Acepta" : isDecline ? "Declina" : "Continúa");
            return (
              <div key={idx} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, background: "rgba(0,0,0,0.25)", border: "1px solid var(--border)", fontSize: 11 }}>
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{fromNode?.name || edge.from}</span>
                <span className={`refinement-status ${badgeClass}`} style={{ fontSize: 8, padding: "2px 6px" }}>{badgeText}</span>
                <span style={{ opacity: 0.6 }}>→</span>
                <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{toNode?.name || edge.to}</span>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {nodes.length === 0 ? <Empty message="Todavía no hay nodos en el funnel." /> : <div className="refinement-funnel">
      {nodes.map((node, index) => <article
        className={`refinement-funnel-node${node.active ? " is-active" : ""}`}
        draggable
        key={node.id}
        onDragStart={() => setDraggedId(node.id)}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event: DragEvent<HTMLElement>) => event.preventDefault()}
        onDrop={() => drop(node.id)}
      >
        <div className="refinement-node-index" aria-hidden="true">{index + 1}</div>
        <div className="refinement-node-body">
          <div className="refinement-card-header">
            <input aria-label={`Nombre del paso ${index + 1}`} className="refinement-title-input" value={node.name} onChange={(event) => onUpdate({ ...node, name: event.target.value })} />
            <label className="refinement-switch"><input checked={node.active} type="checkbox" onChange={(event) => onToggleActive ? onToggleActive(node.id, event.target.checked) : onUpdate({ ...node, active: event.target.checked })} /><span>{node.active ? "Activo" : "Inactivo"}</span></label>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
            <input style={{ flex: 1, minWidth: 120 }} aria-label="Etapa" value={node.stage} onChange={(event) => onUpdate({ ...node, stage: event.target.value })} />
            <select
              aria-label="Plataforma de checkout"
              style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", color: "inherit" }}
              value={node.externalPlatform ?? "none"}
              onChange={(e) => onUpdate({ ...node, externalPlatform: e.target.value as any })}
            >
              <option value="none">Sin checkout externo</option>
              <option value="hotmart">Hotmart</option>
              <option value="skool">Skool</option>
              <option value="custom">URL personalizada</option>
            </select>
            <select
              aria-label="Evento Meta Pixel"
              style={{ padding: "4px 8px", fontSize: 12, borderRadius: 6, background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)", color: "inherit" }}
              value={node.trackingEvent ?? ""}
              onChange={(e) => onUpdate({ ...node, trackingEvent: e.target.value || undefined })}
            >
              <option value="">Sin evento Pixel</option>
              <option value="ViewContent">Pixel: ViewContent</option>
              <option value="Lead">Pixel: Lead</option>
              <option value="InitiateCheckout">Pixel: InitiateCheckout</option>
              <option value="Purchase">Pixel: Purchase</option>
            </select>
          </div>
          {node.externalPlatform && node.externalPlatform !== "none" && (
            <input
              aria-label="URL checkout externo"
              placeholder={`URL de pago en ${node.externalPlatform === "hotmart" ? "Hotmart" : node.externalPlatform === "skool" ? "Skool" : "pasarela externa"}`}
              value={node.externalCheckoutUrl ?? ""}
              onChange={(e) => onUpdate({ ...node, externalCheckoutUrl: e.target.value })}
              style={{ marginBottom: 6 }}
            />
          )}
          <textarea aria-label="Descripción" rows={3} value={node.description} onChange={(event) => onUpdate({ ...node, description: event.target.value })} />
          <input aria-label="Artefacto vinculado" placeholder="Oferta o landing vinculada" value={node.linkedArtifact??""} onChange={(event)=>onUpdate({...node,linkedArtifact:event.target.value})}/>
          {(node.metricLabel || node.metricValue) && <div className="refinement-metric"><span>{node.metricLabel ?? "Métrica"}</span><strong>{node.metricValue ?? "—"}</strong></div>}
          <div className="refinement-order-actions">
            <span className="refinement-drag-hint">Arrastrar para ordenar</span>
            <button aria-label={`Mover ${node.name} arriba`} disabled={index === 0} onClick={() => reorder(node.id, -1)} type="button">↑</button>
            <button aria-label={`Mover ${node.name} abajo`} disabled={index === nodes.length - 1} onClick={() => reorder(node.id, 1)} type="button">↓</button>
          </div>
        </div>
      </article>)}
    </div>}
  </section>;
}

export interface CampaignContent {
  id: string;
  title: string;
  format: string;
  channel: string;
  status: "DRAFT" | "READY" | "PUBLISHED";
  body: string;
}

export interface ContentWorkspaceProps {
  items: readonly CampaignContent[];
  versionCreatedAt: string;
  onUpdate: (item: CampaignContent) => void;
  onDuplicate: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onExport: (itemIds: string[]) => void;
}

export function ContentWorkspace({ items, versionCreatedAt, onUpdate, onDuplicate, onDelete, onExport }: ContentWorkspaceProps) {
  const [format, setFormat] = useState("ALL");
  const [channel, setChannel] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const formats = useMemo(() => unique(items.map((item) => item.format)), [items]);
  const channels = useMemo(() => unique(items.map((item) => item.channel)), [items]);
  const filtered = useMemo(() => items.filter((item) => (format === "ALL" || item.format === format) && (channel === "ALL" || item.channel === channel) && (status === "ALL" || item.status === status)), [channel, format, items, status]);
  return <section className="refinement-workspace" aria-labelledby="content-heading">
    <WorkspaceHeading eyebrow="CONTENT OPERATIONS WORKSPACE" title="Contenido de campaña" description="Filtra y administra cada pieza desde una superficie editorial." id="content-heading" action={<button className="button secondary" disabled={filtered.length === 0} onClick={() => onExport(filtered.map((item) => item.id))} type="button">Exportar visibles</button>} />
    <div className="refinement-filters" aria-label="Filtros de contenido">
      <Filter label="Formato" value={format} values={formats} onChange={setFormat} />
      <Filter label="Canal" value={channel} values={channels} onChange={setChannel} />
      <Filter label="Estado" value={status} values={["DRAFT", "READY", "PUBLISHED"]} onChange={setStatus} />
      <span>{filtered.length} de {items.length} piezas</span>
    </div>
    {filtered.length === 0 ? <Empty message="No hay contenido que coincida con los filtros." /> : <div className="refinement-content-grid">
      {filtered.map((item) => <article className="refinement-content-card" key={item.id}>
        <div className="refinement-card-header"><span className="refinement-format">{item.format}</span><span className={`refinement-status is-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span></div>
        {editingId === item.id ? <div className="refinement-inline-editor">
          <Field label="Título"><input value={item.title} onChange={(event) => onUpdate({ ...item, title: event.target.value })} /></Field>
          <Field label="Formato"><input value={item.format} onChange={(event) => onUpdate({ ...item, format: event.target.value })} /></Field>
          <Field label="Canal"><input value={item.channel} onChange={(event) => onUpdate({ ...item, channel: event.target.value })} /></Field>
          <Field label="Estado"><select value={item.status} onChange={(event) => onUpdate({ ...item, status: event.target.value as CampaignContent["status"] })}><option value="DRAFT">Borrador</option><option value="READY">Listo</option><option value="PUBLISHED">Publicado</option></select></Field>
          <Field label="Contenido" wide><textarea rows={7} value={item.body} onChange={(event) => onUpdate({ ...item, body: event.target.value })} /></Field>
        </div> : <><h3>{item.title}</h3><p>{item.body}</p><small>{item.channel} · Fecha de la versión {formatDate(versionCreatedAt)}</small></>}
        <footer className="refinement-card-actions">
          <button onClick={() => setEditingId(editingId === item.id ? null : item.id)} type="button">{editingId === item.id ? "Cerrar edición" : "Editar"}</button>
          <button onClick={() => onDuplicate(item.id)} type="button">Duplicar</button>
          <button onClick={() => onExport([item.id])} type="button">Exportar</button>
          <button className="is-danger" onClick={() => onDelete(item.id)} type="button">Eliminar</button>
        </footer>
      </article>)}
    </div>}
  </section>;
}

export interface ProductFile {
  id: string;
  name: string;
  format: string;
  status: "READY" | "STALE" | "GENERATING" | "FAILED";
  sizeLabel: string;
  updatedAt: string;
  version: number;
}

export interface ProductFinalWorkspaceProps {
  files: readonly ProductFile[];
  onOpen: (fileId: string) => void;
  onRegenerate: (fileId: string) => void;
  onViewSource: (fileId: string) => void;
  onExport: (fileId: string) => void;
}

export function ProductFinalWorkspace({ files, onOpen, onRegenerate, onViewSource, onExport }: ProductFinalWorkspaceProps) {
  return <section className="refinement-workspace" aria-labelledby="product-files-heading">
    <WorkspaceHeading eyebrow="PRODUCTO FINAL" title="Archivos entregables" description="Abre, rastrea, regenera o exporta cada entrega." id="product-files-heading" />
    {files.length === 0 ? <Empty message="Todavía no hay archivos finales." /> : <div className="refinement-file-list">
      {files.map((file) => <article className="refinement-file-card" key={file.id}>
        <div className="refinement-file-icon" aria-hidden="true">{file.format.slice(0, 4).toUpperCase()}</div>
        <div><div className="refinement-card-header"><h3>{file.name}</h3><span className={`refinement-status is-${file.status.toLowerCase()}`}>{statusLabel(file.status)}</span></div><p>v{file.version} · {file.sizeLabel} · Actualizado {formatDate(file.updatedAt)}</p></div>
        <div className="refinement-file-actions">
          <button onClick={() => onOpen(file.id)} type="button">Abrir</button>
          <button disabled={file.status === "GENERATING"} onClick={() => onRegenerate(file.id)} type="button">Regenerar</button>
          <button onClick={() => onViewSource(file.id)} type="button">Ver origen</button>
          <button onClick={() => onExport(file.id)} type="button">Exportar</button>
        </div>
      </article>)}
    </div>}
  </section>;
}

function WorkspaceHeading({ eyebrow, title, description, id, action }: { eyebrow: string; title: string; description: string; id: string; action?: React.ReactNode }) {
  return <header className="refinement-heading"><div><span>{eyebrow}</span><h2 id={id}>{title}</h2><p>{description}</p></div>{action}</header>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "is-wide" : ""}>{label}{children}</label>;
}

function Filter({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="ALL">Todos</option>{values.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>;
}

function Empty({ message }: { message: string }) { return <div className="refinement-empty">{message}</div>; }
function unique(values: readonly string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es")); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es"); }
function statusLabel(value: string) { return ({ DRAFT: "Borrador", READY: "Listo", APPROVED: "Aprobado", PUBLISHED: "Publicado", STALE: "Desactualizado", GENERATING: "Generando", FAILED: "Falló" } as Record<string, string>)[value] ?? value; }

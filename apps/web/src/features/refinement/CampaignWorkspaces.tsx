import { useMemo, useState, type DragEvent } from "react";
import "./campaign.css";

export interface FunnelNode {
  id: string;
  name: string;
  stage: string;
  description: string;
  active: boolean;
  metricLabel?: string;
  metricValue?: string;
  linkedArtifact?: string;
}

export interface FunnelWorkspaceProps {
  nodes: readonly FunnelNode[];
  onUpdate: (node: FunnelNode) => void;
  onReorder: (orderedIds: string[]) => void;
  onToggleActive?: (nodeId: string, active: boolean) => void;
}

export function FunnelWorkspace({ nodes, onUpdate, onReorder, onToggleActive }: FunnelWorkspaceProps) {
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
    <WorkspaceHeading eyebrow="FUNNEL VISUAL" title="Recorrido de campaña" description="Activa, edita y ordena cada paso del recorrido." id="funnel-heading" />
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
          <input aria-label="Etapa" value={node.stage} onChange={(event) => onUpdate({ ...node, stage: event.target.value })} />
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

export interface CampaignEmail {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  body: string;
  cta: string;
  delay: string;
  status: "DRAFT" | "READY" | "APPROVED";
}

export interface EmailsWorkspaceProps {
  emails: readonly CampaignEmail[];
  onUpdate: (email: CampaignEmail) => void;
  onReorder: (orderedIds: string[]) => void;
  onExport: (emailIds: string[]) => void;
}

export function EmailsWorkspace({ emails, onUpdate, onReorder, onExport }: EmailsWorkspaceProps) {
  const [expandedId, setExpandedId] = useState<string | null>(emails[0]?.id ?? null);
  const move = (emailId: string, direction: -1 | 1) => {
    const ids = emails.map((email) => email.id);
    const from = ids.indexOf(emailId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    onReorder(ids);
  };
  return <section className="refinement-workspace" aria-labelledby="emails-heading">
    <WorkspaceHeading eyebrow="SECUENCIA" title="Emails de campaña" description="Edita la secuencia sin salir de las tarjetas." id="emails-heading" action={<button className="button secondary" disabled={emails.length === 0} onClick={() => onExport(emails.map((email) => email.id))} type="button">Exportar secuencia</button>} />
    {emails.length === 0 ? <Empty message="Todavía no hay emails en la secuencia." /> : <div className="refinement-email-list">
      {emails.map((email, index) => {
        const expanded = expandedId === email.id;
        return <article className="refinement-email-card" key={email.id}>
          <header>
            <button className="refinement-expand" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? null : email.id)} type="button"><span>{String(index + 1).padStart(2, "0")}</span><strong>{email.name || "Email sin nombre"}</strong><small>{email.subject || "Sin asunto"}</small></button>
            <span className={`refinement-status is-${email.status.toLowerCase()}`}>{statusLabel(email.status)}</span>
          </header>
          {expanded && <div className="refinement-editor-grid">
            <Field label="Nombre"><input value={email.name} onChange={(event) => onUpdate({ ...email, name: event.target.value })} /></Field>
            <Field label="Estado"><select value={email.status} onChange={(event) => onUpdate({ ...email, status: event.target.value as CampaignEmail["status"] })}><option value="DRAFT">Borrador</option><option value="READY">Listo</option><option value="APPROVED">Aprobado</option></select></Field>
            <Field label="Asunto" wide><input value={email.subject} onChange={(event) => onUpdate({ ...email, subject: event.target.value })} /></Field>
            <Field label="Preencabezado" wide><input value={email.previewText} onChange={(event) => onUpdate({ ...email, previewText: event.target.value })} /></Field>
            <Field label="CTA"><input value={email.cta} onChange={(event)=>onUpdate({...email,cta:event.target.value})}/></Field>
            <Field label="Delay"><input placeholder="Inmediato / +1 día" value={email.delay} onChange={(event)=>onUpdate({...email,delay:event.target.value})}/></Field>
            <Field label="Cuerpo" wide><textarea rows={8} value={email.body} onChange={(event) => onUpdate({ ...email, body: event.target.value })} /></Field>
          </div>}
          <footer className="refinement-card-actions">
            <button disabled={index === 0} onClick={() => move(email.id, -1)} type="button">Subir</button>
            <button disabled={index === emails.length - 1} onClick={() => move(email.id, 1)} type="button">Bajar</button>
            <button onClick={() => onExport([email.id])} type="button">Exportar</button>
          </footer>
        </article>;
      })}
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
  updatedAt: string;
}

export interface ContentWorkspaceProps {
  items: readonly CampaignContent[];
  onUpdate: (item: CampaignContent) => void;
  onDuplicate: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onExport: (itemIds: string[]) => void;
}

export function ContentWorkspace({ items, onUpdate, onDuplicate, onDelete, onExport }: ContentWorkspaceProps) {
  const [format, setFormat] = useState("ALL");
  const [channel, setChannel] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [editingId, setEditingId] = useState<string | null>(null);
  const formats = useMemo(() => unique(items.map((item) => item.format)), [items]);
  const channels = useMemo(() => unique(items.map((item) => item.channel)), [items]);
  const filtered = useMemo(() => items.filter((item) => (format === "ALL" || item.format === format) && (channel === "ALL" || item.channel === channel) && (status === "ALL" || item.status === status)), [channel, format, items, status]);
  return <section className="refinement-workspace" aria-labelledby="content-heading">
    <WorkspaceHeading eyebrow="BIBLIOTECA" title="Contenido de campaña" description="Filtra y administra cada pieza desde una vista editorial." id="content-heading" action={<button className="button secondary" disabled={filtered.length === 0} onClick={() => onExport(filtered.map((item) => item.id))} type="button">Exportar visibles</button>} />
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
        </div> : <><h3>{item.title}</h3><p>{item.body}</p><small>{item.channel} · Actualizado {formatDate(item.updatedAt)}</small></>}
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

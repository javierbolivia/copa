import { useMemo, useState } from "react";
import "./campaign.css";

export interface HistoryResult {
  title: string;
  summary: string;
  fields: readonly { label: string; value: string }[];
}

export interface GenerationHistoryItem {
  id: string;
  projectId: string;
  projectName: string;
  moduleName: string;
  provider: string;
  model: string;
  status: "COMPLETED" | "FAILED" | "RUNNING" | "CANCELLED";
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  costStatus?: "reported" | "estimated" | "unknown" | "not_applicable";
  durationMs: number;
  versionNumber?: number;
  errorCode?: string | null;
  result?: HistoryResult;
}

export interface AnalyticsHistoryProps {
  generations: readonly GenerationHistoryItem[];
  demoMode?: boolean;
  onOpenGeneration?: (generationId: string) => void;
}

export function AnalyticsHistory({ generations, demoMode = false, onOpenGeneration }: AnalyticsHistoryProps) {
  const [moduleName, setModuleName] = useState("ALL");
  const [model, setModel] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const modules = useMemo(() => unique(generations.map((item) => item.moduleName)), [generations]);
  const models = useMemo(() => unique(generations.map((item) => item.model)), [generations]);
  const filtered = useMemo(() => generations.filter((item) => {
    const timestamp = new Date(item.createdAt).getTime();
    const fromTimestamp = from ? new Date(`${from}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const toTimestamp = to ? new Date(`${to}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return (moduleName === "ALL" || item.moduleName === moduleName) && (model === "ALL" || item.model === model) && (status === "ALL" || item.status === status) && timestamp >= fromTimestamp && timestamp <= toTimestamp;
  }), [from, generations, model, moduleName, status, to]);
  const selected = generations.find((item) => item.id === selectedId);
  const totals = useMemo(() => summarize(generations, demoMode), [demoMode, generations]);

  return <section className="refinement-analytics" aria-labelledby="analytics-history-heading">
    <header className="refinement-heading"><div><span>ANALÍTICA E HISTORIAL</span><h2 id="analytics-history-heading">Uso, costes y resultados</h2><p>Importes reportados o estimados; no son una factura. Los costes sin dato se excluyen del subtotal.</p></div>{demoMode && <span className="refinement-demo-badge">DEMO · $0</span>}</header>
    <div className="refinement-kpis">
      <Metric label="Importe con dato" value={formatCost(totals.cost)} hint={demoMode ? "Modo Demo · sin cargo real" : costCoverageHint(totals)} />
      <Metric label="Tokens" value={totals.tokens.toLocaleString("es")} hint={`${totals.inputTokens.toLocaleString("es")} entrada · ${totals.outputTokens.toLocaleString("es")} salida`} />
      <Metric label="Proyectos" value={String(totals.byProject.length)} hint="Con actividad" />
      <Metric label="Tasa completada" value={`${totals.completionRate}%`} hint="Generaciones correctas" />
    </div>
    <div className="refinement-distributions">
      <Distribution title="Importe con dato por proyecto" rows={totals.byProject.map((row) => ({ label: row.label, value: row.cost, display: `${formatCost(row.cost)}${row.unknownCosts ? ` · ${row.unknownCosts} sin dato` : ""}` }))} />
      <Distribution title="Tokens por módulo" rows={totals.byModule.map((row) => ({ label: row.label, value: row.tokens, display: row.tokens.toLocaleString("es") }))} />
      <Distribution title="Tokens por modelo" rows={totals.byModel.map((row) => ({ label: row.label, value: row.tokens, display: row.tokens.toLocaleString("es") }))} />
    </div>
    <div className="refinement-history-layout">
      <article className="refinement-history-panel">
        <div className="refinement-history-filters">
          <SelectFilter label="Módulo" value={moduleName} values={modules} onChange={setModuleName} />
          <SelectFilter label="Modelo" value={model} values={models} onChange={setModel} />
          <SelectFilter label="Estado" value={status} values={["COMPLETED", "FAILED", "RUNNING", "CANCELLED"]} onChange={setStatus} />
          <label><span>Desde</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label><span>Hasta</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
        <div className="refinement-history-count">{filtered.length} resultados</div>
        {filtered.length === 0 ? <div className="refinement-empty">No hay generaciones que coincidan con los filtros.</div> : <div className="refinement-generation-list">
          {filtered.map((item) => <button className={selected?.id === item.id ? "is-selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); onOpenGeneration?.(item.id); }} type="button">
            <span><strong>{item.moduleName}{item.versionNumber?` · v${item.versionNumber}`:""}</strong><small>{item.projectName} · {formatDateTime(item.createdAt)}</small></span>
            <span><b>{item.model}</b><small>{(item.inputTokens + item.outputTokens).toLocaleString("es")} tokens · {formatGenerationCost(item, demoMode)}</small></span>
            <span className={`refinement-status is-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span>
          </button>)}
        </div>}
      </article>
      <HistoryResultPanel item={selected} demoMode={demoMode} />
    </div>
  </section>;
}

export function HistoryResultPanel({ item, demoMode }: { item: GenerationHistoryItem | undefined; demoMode: boolean }) {
  if (!item) return <aside className="refinement-history-result"><div className="refinement-empty">Selecciona una generación para ver su resultado histórico.</div></aside>;
  return <aside className="refinement-history-result">
    <header><span>{item.status === "FAILED" ? "EJECUCIÓN FALLIDA" : "RESULTADO HISTÓRICO"}</span><h3>{item.result?.title ?? item.moduleName}</h3><p {...(item.status === "FAILED" ? { role: "alert" } : {})}>{summaryFor(item)}</p></header>
    <dl><div><dt>Proyecto</dt><dd>{item.projectName}</dd></div>{item.versionNumber&&<div><dt>Versión</dt><dd>v{item.versionNumber}</dd></div>}<div><dt>Proveedor</dt><dd>{item.provider}</dd></div><div><dt>Modelo</dt><dd>{item.model}</dd></div><div><dt>Duración</dt><dd>{formatDuration(item.durationMs)}</dd></div><div><dt>Tokens</dt><dd>{(item.inputTokens + item.outputTokens).toLocaleString("es")}</dd></div><div><dt>Coste</dt><dd>{formatGenerationCost(item, demoMode)}</dd></div></dl>
    {item.status === "FAILED" && item.errorCode && <div className="refinement-result-fields"><section><span>Código de error</span><p>{item.errorCode}</p></section></div>}
    {item.status === "COMPLETED" && item.result && item.result.fields.length > 0 && <div className="refinement-result-fields">{item.result.fields.map((field) => <section key={field.label}><span>{field.label}</span><p>{field.value}</p></section>)}</div>}
  </aside>;
}

function summaryFor(item: GenerationHistoryItem): string {
  if (item.status === "FAILED") {
    if (item.errorCode === "transport_error" || item.errorCode === "network_error") {
      return `No se pudo establecer conexión con ${providerLabel(item.provider)}. No se guardó un resultado.`;
    }
    return `La ejecución falló y no se guardó un resultado${item.errorCode ? ` (código: ${item.errorCode})` : ""}.`;
  }
  if (item.status === "RUNNING") return "La ejecución sigue en curso; todavía no hay un resultado final.";
  if (item.status === "CANCELLED") return "La ejecución se canceló; no hay un resultado final guardado.";
  return item.result?.summary ?? "No hay una vista previa estructurada disponible para esta ejecución.";
}

function providerLabel(value: string): string {
  return ({ deepseek: "DeepSeek", gemini: "Gemini", openai: "OpenAI", groq: "Groq", openrouter: "OpenRouter" } as Record<string, string>)[value.toLowerCase()] ?? value;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) { return <article><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>; }
function Distribution({ title, rows }: { title: string; rows: readonly { label: string; value: number; display: string }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return <article><h3>{title}</h3>{rows.length === 0 ? <p className="refinement-muted">Sin datos.</p> : <div>{rows.map((row) => <div className="refinement-bar-row" key={row.label}><span>{row.label}</span><div><i style={{ width: `${Math.max(row.value / max * 100, row.value > 0 ? 3 : 0)}%` }} /></div><b>{row.display}</b></div>)}</div>}</article>;
}
function SelectFilter({ label, value, values, onChange }: { label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) { return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="ALL">Todos</option>{values.map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}</select></label>; }

function summarize(items: readonly GenerationHistoryItem[], demoMode: boolean) {
  const groups = (key: "projectName" | "moduleName" | "model") => [...items.reduce((map, item) => { const label = item[key]; const current = map.get(label) ?? { label, cost: 0, tokens: 0, unknownCosts: 0 }; const status = costStatusFor(item, demoMode); if (status === "unknown") current.unknownCosts += 1; current.cost += costFor(item, demoMode); current.tokens += item.inputTokens + item.outputTokens; map.set(label, current); return map; }, new Map<string, { label: string; cost: number; tokens: number; unknownCosts: number }>()).values()].sort((a, b) => b.tokens - a.tokens);
  const inputTokens = items.reduce((total, item) => total + item.inputTokens, 0);
  const outputTokens = items.reduce((total, item) => total + item.outputTokens, 0);
  const unknownCostCount = items.filter((item) => costStatusFor(item, demoMode) === "unknown").length;
  const knownCostCount = items.filter((item) => ["reported", "estimated"].includes(costStatusFor(item, demoMode))).length;
  return { cost: items.reduce((total, item) => total + costFor(item, demoMode), 0), tokens: inputTokens + outputTokens, inputTokens, outputTokens, unknownCostCount, knownCostCount, completionRate: items.length === 0 ? 0 : Math.round(items.filter((item) => item.status === "COMPLETED").length / items.length * 100), byProject: groups("projectName"), byModule: groups("moduleName"), byModel: groups("model") };
}
function costStatusFor(item: GenerationHistoryItem, demoMode: boolean) {
  if (demoMode || item.provider === "mock" || item.provider === "local") return "not_applicable";
  if (item.costStatus) return item.costStatus;
  return item.estimatedCost > 0 || item.inputTokens > 0 || item.outputTokens > 0 ? "estimated" : "unknown";
}
function costFor(item: GenerationHistoryItem, demoMode: boolean) { const status = costStatusFor(item, demoMode); return status === "reported" || status === "estimated" ? item.estimatedCost : 0; }
function formatGenerationCost(item: GenerationHistoryItem, demoMode: boolean) {
  const status = costStatusFor(item, demoMode);
  if (status === "unknown") return "No informado";
  if (status === "not_applicable") return demoMode ? "Demo · $0.00" : "$0.00 · Mock/Local";
  return `${formatCost(item.estimatedCost)} · ${status === "reported" ? "reportado" : "estimado"}`;
}
function costCoverageHint(totals: ReturnType<typeof summarize>) {
  const known = `${totals.knownCostCount} importes reportados/estimados`;
  const unknown = totals.unknownCostCount ? ` · ${totals.unknownCostCount} sin dato, excluidos` : "";
  return `${known}${unknown} · no es una factura`;
}
function unique(values: readonly string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es")); }
function formatCost(value: number) { return `$${value.toFixed(value > 0 && value < 0.01 ? 4 : 2)}`; }
function formatDuration(value: number) { return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es"); }
function statusLabel(value: string) { return ({ COMPLETED: "Completada", FAILED: "Falló", RUNNING: "En curso", CANCELLED: "Cancelada" } as Record<string, string>)[value] ?? value; }

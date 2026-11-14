import type { ArtifactVersionSummary, Project, Workflow } from "@our-platform/shared";
import { Activity, ArrowRight, Check, CircleDashed, Clock3, FileOutput, Layers3, Settings2, Sparkles } from "lucide-react";
import { SectionHeader, StatusBadge } from "../../components/ProductUI";

const stateLabel:Record<string,string>={PENDING:"Pendiente",READY:"Lista",IN_PROGRESS:"En curso",COMPLETED:"Ejecutada",STALE:"Revisar",BLOCKED:"Bloqueada"};
const workflowGroups=[
  {label:"Descubrimiento",description:"Señales, evidencia y problemas",keys:["research","sources","problems","opportunities"]},
  {label:"Estrategia",description:"Decisiones y arquitectura",keys:["product","avatar","mechanism","beliefs","offer"]},
  {label:"Activación",description:"Sistemas de adquisición",keys:["landing","funnel","content"]},
  {label:"Entrega",description:"Output final trazable",keys:["final_product"]},
] as const;

export function OverviewView({project,workflow,artifacts,onEdit,onNavigate,loadError,onRetry}:{project:Project;workflow:Workflow|null;artifacts:ArtifactVersionSummary[]|null;onEdit:()=>void;onNavigate:(step:string)=>void;loadError?:string|null;onRetry?:()=>void}) {
  if(!workflow)return <section className="content-section overview-workspace"><h1>{project.name}</h1><div className="detail-card" role={loadError?"alert":"status"}><h2>{loadError?"No se pudo cargar el resumen":"Cargando el resumen…"}</h2><p>{loadError??"Consultando las etapas y versiones guardadas del proyecto."}</p>{loadError&&onRetry&&<button className="button secondary" onClick={onRetry}>Reintentar resumen</button>}</div></section>;
  const steps=[...workflow.steps].sort((a,b)=>a.position-b.position);
  const displayPositionByKey=new Map(steps.map((step,index)=>[step.stepKey,index+1] as const));
  const completed=steps.filter(step=>step.state==="COMPLETED").length;
  const inProgress=steps.filter(step=>step.state==="IN_PROGRESS").length;
  const ready=steps.filter(step=>step.state==="READY").length;
  const needsReview=steps.filter(step=>step.state==="STALE").length;
  const pending=steps.filter(step=>step.state==="PENDING").length;
  const blocked=steps.filter(step=>step.state==="BLOCKED").length;
  const total=steps.length;
  const progress=total?Math.round(completed/total*100):0;
  const pendingStep=steps.find(step=>step.state!=="COMPLETED");
  const currentStep=pendingStep??steps.at(-1);
  const sortedArtifacts=[...(artifacts??[])].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const recentArtifacts=sortedArtifacts.slice(0,5);
  const lastActivity=new Date(Math.max(Date.parse(project.updatedAt),...steps.map(step=>Date.parse(step.updatedAt)),...sortedArtifacts.map(version=>Date.parse(version.createdAt))));
  return <section className="content-section overview-workspace">
    <header className="command-hero">
      <div className="command-hero-glow"/>
      <div className="command-hero-main"><div className="command-hero-meta"><StatusBadge tone="success">Proyecto activo</StatusBadge><span><Clock3 size={13}/>Última actividad {lastActivity.toLocaleString("es")}</span></div><span className="eyebrow">RESUMEN DEL PROYECTO</span><h1>{project.name}</h1><p className="command-hero-niche">{project.niche}</p><p className="command-hero-description">{project.description??"Sin descripción."}</p><div className="command-hero-actions"><button className="button secondary" onClick={onEdit}><Settings2 size={15}/>Configurar</button><button type="button" className="button primary" onClick={()=>{window.sessionStorage.setItem("hallazia:open-studio-pro","1");onNavigate("landing");}}><Sparkles size={15}/>Abrir Creative Studio PRO</button>{currentStep&&<button className="button secondary" onClick={()=>onNavigate(currentStep.stepKey)}>{pendingStep?`Continuar en ${currentStep.label}`:`Revisar ${currentStep.label}`}<ArrowRight size={15}/></button>}</div></div>
      <div className="command-hero-progress"><div className="hero-orbit" style={{background:`conic-gradient(var(--success) ${progress*3.6}deg, rgba(255,255,255,.08) 0deg)`}}><div><strong>{progress}%</strong><span>ejecutado</span></div></div><strong>{completed}/{total}</strong><span>ETAPAS EJECUTADAS</span><p>La ejecución técnica no implica aprobación editorial.</p></div>
    </header>

    <div className="overview-state-legend" aria-label="Resumen de estados"><span><i className="fresh"/>{completed} ejecutadas</span><span><i className="in-progress"/>{inProgress} en curso</span><span><i className="ready"/>{ready} listas</span><span><i className="stale"/>{needsReview} requieren revisión</span><span><i/>{pending} pendientes</span><span><i className="blocked"/>{blocked} bloqueadas</span><small>Los estados corresponden a los datos del proyecto, no al avance de la auditoría de la aplicación.</small></div>
    <div className="overview-command-grid">
      <section className="workflow-command-surface"><SectionHeader eyebrow="PIPELINE" title="Recorrido del proyecto" description="Abre una etapa para revisar su resultado. Revisar indica que sus dependencias cambiaron." aside={<span className="workflow-summary"><Layers3 size={14}/>{total} etapas</span>}/><div className="workflow-journey">{workflowGroups.map((group,groupIndex)=><article className={`workflow-journey-group group-${groupIndex+1}`} key={group.label}><header><span>{String(groupIndex+1).padStart(2,"0")}</span><div><strong>{group.label}</strong><small>{group.description}</small></div></header><div className="workflow-rail">{group.keys.map((key)=>{const step=workflow?.steps.find((item)=>item.stepKey===key);if(!step)return null;const StepIcon=step.state==="COMPLETED"?Check:CircleDashed;return <button className={`workflow-node ${step.state.toLowerCase()}`} key={step.id} onClick={()=>onNavigate(step.stepKey)} title={step.staleReason??step.state}><span className="workflow-node-dot"><StepIcon size={14}/></span><span className="workflow-node-position">{String(displayPositionByKey.get(step.stepKey)??step.position).padStart(2,"0")}</span><strong>{step.label}</strong><small>{step.staleReason?`${stateLabel[step.state]??step.state} · ${step.staleReason}`:stateLabel[step.state]??step.state}</small><ArrowRight size={13}/></button>;})}</div></article>)}</div></section>

      <aside className="overview-side-stack">
        <section className="current-work-panel"><div className="panel-icon violet"><Sparkles size={17}/></div><span className="eyebrow">SIGUIENTE ETAPA</span><h2>{pendingStep?pendingStep.label:total?"Revisión de resultados":"No hay etapas disponibles"}</h2><p>{pendingStep?stateLabel[pendingStep.state]??pendingStep.state:total?`Las ${total} etapas tienen ejecución registrada. Revisa el producto final y la aprobación editorial de sus versiones.`:"No se recibió un workflow para este proyecto."}</p>{pendingStep?.staleReason&&<p>{pendingStep.staleReason}</p>}{currentStep&&<button className="text-action" onClick={()=>onNavigate(currentStep.stepKey)}>Abrir etapa<ArrowRight size={14}/></button>}</section>
        <section className="activity-panel"><SectionHeader eyebrow="ACTIVIDAD" title="Actividad reciente" aside={<Activity size={16}/>}/>{artifacts===null?<p className="muted-copy" role="status">Consultando actividad…</p>:recentArtifacts.length===0?<p className="muted-copy">Aún no hay actividad registrada.</p>:<div className="activity-stream">{recentArtifacts.map(version=><div key={version.id}><span className={`activity-dot ${version.freshness}`}/><div><strong>{humanize(version.artifactType)} · v{version.versionNumber}</strong><small>{humanize(version.status)} · {new Date(version.createdAt).toLocaleString("es")}</small></div></div>)}</div>}</section>
      </aside>
    </div>

    <section className="outputs-section"><SectionHeader eyebrow="VERSIONES GUARDADAS" title="Documentos del proyecto" description="Fechas originales, estado editorial y vigencia de cada documento." aside={artifacts===null?undefined:<span className="output-count"><FileOutput size={14}/>{artifacts.length} versiones</span>}/>{artifacts===null?<div className="empty-state" role={loadError?"alert":"status"}>{loadError?<><p>No se pudieron cargar los documentos: {loadError}</p>{onRetry&&<button className="button secondary" onClick={onRetry}>Reintentar documentos</button>}</>:"Cargando documentos…"}</div>:artifacts.length===0?<div className="empty-state">Aún no hay artefactos. Empieza en Investigación o importa la fuente Demo.</div>:<div className="artifact-output-grid">{sortedArtifacts.map((version)=><article className={`artifact-output ${version.freshness}`} key={version.id}><div className="artifact-output-icon"><FileOutput size={16}/></div><div><span className="eyebrow">{humanize(version.artifactType)}</span><h3>Versión {version.versionNumber}</h3><StatusBadge tone={version.freshness==="fresh"?"success":"warning"}>{humanize(version.status)} · {humanize(version.freshness)}</StatusBadge>{version.staleReason&&<p>{version.staleReason}</p>}</div><time>{new Date(version.createdAt).toLocaleString("es")}</time></article>)}</div>}</section>
  </section>;
}

function humanize(value:string){const labels:Record<string,string>={research:"Investigación",sources:"Fuentes",problems:"Problemas",opportunities:"Oportunidades",product:"Producto",approved:"Aprobada",draft:"Borrador",superseded:"Reemplazada",archived:"Archivada",fresh:"Vigente",stale:"Requiere revisión"};return labels[value]??value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}

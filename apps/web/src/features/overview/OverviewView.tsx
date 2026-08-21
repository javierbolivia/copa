import type { ArtifactVersion, Project, Workflow } from "@our-platform/shared";
import { Activity, ArrowRight, Check, CircleDashed, Clock3, FileOutput, Layers3, Settings2, Sparkles } from "lucide-react";
import { SectionHeader, StatusBadge } from "../../components/ProductUI";

const stateLabel:Record<string,string>={PENDING:"Pendiente",READY:"Lista",IN_PROGRESS:"En curso",COMPLETED:"Ejecutada",STALE:"Revisar",BLOCKED:"Bloqueada"};
const workflowGroups=[
  {label:"Descubrimiento",description:"Señales, evidencia y problemas",keys:["research","sources","problems","opportunities"]},
  {label:"Estrategia",description:"Decisiones y arquitectura",keys:["product","avatar","mechanism","beliefs","offer"]},
  {label:"Activación",description:"Sistemas de adquisición",keys:["landing","funnel","emails","content"]},
  {label:"Entrega",description:"Output final trazable",keys:["final_product"]},
] as const;

export function OverviewView({project,workflow,artifacts,onEdit,onNavigate}:{project:Project;workflow:Workflow|null;artifacts:ArtifactVersion[];onEdit:()=>void;onNavigate:(step:string)=>void}) {
  const progress=project.workflowTotalSteps?Math.round(project.workflowCompletedSteps/project.workflowTotalSteps*100):0;
  const pendingStep=workflow?.steps.find((step)=>step.state!=="COMPLETED");
  const currentStep=pendingStep??workflow?.steps[0];
  const recentArtifacts=artifacts.slice(0,6);
  return <section className="content-section overview-workspace">
    <header className="command-hero">
      <div className="command-hero-glow"/>
      <div className="command-hero-main"><div className="command-hero-meta"><StatusBadge tone="success">Proyecto activo</StatusBadge><span><Clock3 size={13}/>Actualizado {new Date(project.updatedAt).toLocaleString("es")}</span></div><span className="eyebrow">PROJECT COMMAND CENTER</span><h1>{project.name}</h1><p className="command-hero-niche">{project.niche}</p><p className="command-hero-description">{project.description??"Sin descripción."}</p><div className="command-hero-actions"><button className="button secondary" onClick={onEdit}><Settings2 size={15}/>Configurar</button>{currentStep&&<button className="button primary" onClick={()=>onNavigate(currentStep.stepKey)}>{pendingStep?`Continuar en ${currentStep.label}`:`Revisar ${currentStep.label}`}<ArrowRight size={15}/></button>}</div></div>
      <div className="command-hero-progress"><div className="hero-orbit" style={{background:`conic-gradient(var(--success) ${progress*3.6}deg, rgba(255,255,255,.08) 0deg)`}}><div><strong>{progress}%</strong><span>ejecutado</span></div></div><strong>{project.workflowCompletedSteps}/{project.workflowTotalSteps}</strong><span>ETAPAS EJECUTADAS</span><p>La ejecución técnica no implica aprobación editorial.</p></div>
    </header>

    <div className="overview-command-grid">
      <section className="workflow-command-surface"><SectionHeader eyebrow="PIPELINE" title="Journey del proyecto" description="Cada nodo conserva su estado y acceso directo." aside={<span className="workflow-summary"><Layers3 size={14}/>{project.workflowTotalSteps} etapas</span>}/><div className="workflow-journey">{workflowGroups.map((group,groupIndex)=><article className={`workflow-journey-group group-${groupIndex+1}`} key={group.label}><header><span>{String(groupIndex+1).padStart(2,"0")}</span><div><strong>{group.label}</strong><small>{group.description}</small></div></header><div className="workflow-rail">{group.keys.map((key)=>{const step=workflow?.steps.find((item)=>item.stepKey===key);if(!step)return null;const StepIcon=step.state==="COMPLETED"?Check:CircleDashed;return <button className={`workflow-node ${step.state.toLowerCase()}`} key={step.id} onClick={()=>onNavigate(step.stepKey)} title={step.staleReason??step.state}><span className="workflow-node-dot"><StepIcon size={14}/></span><span className="workflow-node-position">{String(step.position).padStart(2,"0")}</span><strong>{step.label}</strong><small>{stateLabel[step.state]??step.state}</small><ArrowRight size={13}/></button>;})}</div></article>)}</div></section>

      <aside className="overview-side-stack">
        <section className="current-work-panel"><div className="panel-icon violet"><Sparkles size={17}/></div><span className="eyebrow">CURRENT WORK</span><h2>{pendingStep?pendingStep.label:"Revisión de resultados"}</h2><p>{pendingStep?stateLabel[pendingStep.state]??pendingStep.state:"Las 14 etapas tienen ejecución registrada. Puedes revisar cualquier output sin alterar su estado."}</p>{currentStep&&<button className="text-action" onClick={()=>onNavigate(currentStep.stepKey)}>Abrir etapa<ArrowRight size={14}/></button>}</section>
        <section className="activity-panel"><SectionHeader eyebrow="ACTIVIDAD" title="Últimos outputs" aside={<Activity size={16}/>}/>{recentArtifacts.length===0?<p className="muted-copy">Aún no hay actividad registrada.</p>:<div className="activity-stream">{recentArtifacts.slice(0,5).map(version=><div key={version.id}><span className={`activity-dot ${version.freshness}`}/><div><strong>{humanize(version.artifactType)} · v{version.versionNumber}</strong><small>{humanize(version.status)} · {new Date(version.createdAt).toLocaleString("es")}</small></div></div>)}</div>}</section>
      </aside>
    </div>

    <section className="outputs-section"><SectionHeader eyebrow="ARTIFACTS / OUTPUTS" title="Outputs del proyecto" description="Versiones recientes y su vigencia dentro del lineage." aside={<span className="output-count"><FileOutput size={14}/>{artifacts.length} versiones</span>}/>{artifacts.length===0?<div className="empty-state">Aún no hay artefactos. Empieza en Investigación o importa la fuente Demo.</div>:<div className="artifact-output-grid">{artifacts.map((version)=><article className={`artifact-output ${version.freshness}`} key={version.id}><div className="artifact-output-icon"><FileOutput size={16}/></div><div><span className="eyebrow">{humanize(version.artifactType)}</span><h3>Versión {version.versionNumber}</h3><StatusBadge tone={version.freshness==="fresh"?"success":"warning"}>{humanize(version.status)} · {humanize(version.freshness)}</StatusBadge>{version.staleReason&&<p>{version.staleReason}</p>}</div><time>{new Date(version.createdAt).toLocaleString("es")}</time></article>)}</div>}</section>
  </section>;
}

function humanize(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,(letter)=>letter.toUpperCase());}

import {reviewStateLabel} from "./ModuleReviewSummary";
import type {ModuleResult} from "@our-platform/shared";
import {useEffect,useState} from "react";
import {api} from "../../api/client";
import {useRequestGuard} from "../../api/useRequestGuard";

const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==="string"):[];
const records=(value:unknown)=>Array.isArray(value)?value.map(record):[];
const CRITERIA=[
  ["frequency","Frecuencia observada"],["urgency","Urgencia"],["emotionalIntensity","Intensidad emocional"],
  ["willingnessToPay","Disposición a pagar"],["solutionFeasibility","Viabilidad de solución"],["competition","Espacio competitivo"],
  ["differentiation","Diferenciación"],["commercialPotential","Potencial comercial"],["evidenceConfidence","Confianza en evidencia"],
] as const;
const hasScores=(item:Record<string,unknown>)=>CRITERIA.every(([key])=>{const value=record(item.scores)[key];return typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=100;});

interface CommonProps {
  selected:ModuleResult;results:ModuleResult[];versionProviders:Record<string,{provider:string;model:string}>;
  onSelectVersion:(id:string)=>void;
}
export function OpportunityWorkspace(props:CommonProps&{projectId:string;onVersionCreated:(version:ModuleResult)=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[reload,setReload]=useState(0);
  const [context,setContext]=useState<{loading:boolean;items:Record<string,unknown>[];version:number|null}>({loading:true,items:[],version:null});
  const requests=useRequestGuard(`${props.projectId}:${props.selected.versionId}`);
  useEffect(()=>{
    let active=true;setContext({loading:true,items:[],version:null});setError(null);
    void api.artifacts(props.projectId).then(({versions})=>{
      if(!active)return;
      const current=versions.find(version=>version.id===props.selected.versionId);
      const parents=strings(record(current?.inputSnapshot).parentVersionIds);
      const parent=versions.find(version=>version.artifactType==="problems"&&parents.includes(version.id));
      setContext({loading:false,items:records(record(parent?.outputData).items),version:parent?.versionNumber??null});
    }).catch(reason=>{if(active){setError(reason instanceof Error?reason.message:"No se pudo leer el origen.");setContext({loading:false,items:[],version:null});}});
    return()=>{active=false;};
  },[props.projectId,props.selected.versionId,reload]);
  const save=async(selectedId:string)=>{
    const current=requests.begin();setBusy(true);setError(null);
    try{const draft=await api.saveModuleDraft(props.projectId,"opportunities",{...record(props.selected.outputData),selectedId},props.selected.versionId);if(current())props.onVersionCreated(draft);}
    catch(reason){if(current())setError(reason instanceof Error?reason.message:"No se pudo guardar la selección.");}
    finally{if(current())setBusy(false);}
  };
  const approve=async()=>{
    const current=requests.begin();setBusy(true);setError(null);
    try{const approved=await api.approveModuleVersion(props.projectId,"opportunities",props.selected.versionId);if(current())props.onVersionCreated(approved);}
    catch(reason){if(current())setError(reason instanceof Error?reason.message:"No se pudo aprobar la selección.");}
    finally{if(current())setBusy(false);}
  };
  return <>{error&&<div className="detail-card" role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={()=>setReload(value=>value+1)}>Reintentar lectura del origen</button></div>}{context.loading&&<p role="status">Cargando el problema de origen…</p>}<OpportunityOutput key={props.selected.versionId} {...props} problemItems={context.items} parentVersionNumber={context.version} busy={busy||context.loading} onSave={id=>void save(id)} onApprove={()=>void approve()}/></>;
}

export function OpportunityOutput({selected,results,versionProviders,onSelectVersion,problemItems,parentVersionNumber,busy,onSave,onApprove}:CommonProps&{
  problemItems:Record<string,unknown>[];parentVersionNumber:number|null;busy:boolean;onSave:(id:string)=>void;onApprove:()=>void;
}){
  const output=record(selected.outputData),items=records(output.items);
  const storedId=typeof output.selectedId==="string"?output.selectedId:"";
  const [inspectedId,setInspectedId]=useState(storedId);
  const inspected=items.find(item=>item.id===inspectedId)??items[0];
  const legacy=items.some(item=>!hasScores(item));
  const ranked=legacy?items:[...items].sort((a,b)=>Number(b.total??-1)-Number(a.total??-1));
  const problem=problemItems.find(item=>item.id===inspected?.problemId);
  const quotes=records(problem?.evidence);
  const evidenceIds=strings(inspected?.evidenceIds);
  const generation=versionProviders[selected.versionId];
  const editable=selected.freshness==="fresh"&&selected.status==="approved"&&!legacy;
  const scores=record(inspected?.scores),reasons=record(inspected?.scoreRationales),formula=record(inspected?.scoreFormula),weights=record(formula.weights);
  const uniqueEvidence=new Set(items.flatMap(item=>strings(item.evidenceIds))).size;
  return <div className="opportunity-workspace">
    <header className="detail-card result-heading"><div><span className="eyebrow">DECISIÓN DE OPORTUNIDAD</span><h2>Oportunidades · v{selected.versionNumber}</h2><p>{generation?.provider??"Proveedor no registrado"} · {new Date(selected.createdAt).toLocaleString("es")}</p></div><div className="badge-row"><span className={`status-pill ${reviewStateLabel(selected.freshness)}`}>{reviewStateLabel(selected.freshness)}</span><span className="status-pill">{reviewStateLabel(selected.status)}</span></div></header>
    <p className="form-hint">Los scores comparan hipótesis y no son probabilidades de éxito. Las citas respaldan problemas observados; no autorizan capacidades, garantías ni prueban intención de compra.</p>
    {legacy&&<p className="detail-card" role="status">Versión histórica sin scores completos. Puedes consultarla; para editarla, regenera Oportunidades desde Problemas vigente. No se asignarán scores automáticamente al histórico.</p>}
    <p>{items.length} oportunidades · {uniqueEvidence} evidencias únicas · Selección guardada: {String(items.find(item=>item.id===storedId)?.name??"Sin selección")}</p>
    <nav className="version-strip" aria-label="Versiones de Oportunidades">{results.map(version=><button type="button" key={version.versionId} className={selected.versionId===version.versionId?"active":""} onClick={()=>onSelectVersion(version.versionId)}>Versión {version.versionNumber}</button>)}</nav>
    {items.length===0?<div className="compact-empty">No hay oportunidades en esta versión. Revisa primero los problemas admitidos y su evidencia.</div>:<div className="opportunity-master-detail">
      <section className="opportunity-master"><h3>{legacy?"Opciones guardadas":"Comparación por puntuación"}</h3><div className="opportunity-grid">{ranked.map(item=><article className={`opportunity-card opportunity-decision-card${inspected?.id===item.id?" selected":""}`} key={String(item.id)}><div className="opportunity-card-main"><div className="badge-row">{item.id===storedId&&<span className="status-pill fresh">Selección guardada</span>}<strong>{hasScores(item)&&typeof item.total==="number"?`${item.total}/100`:"Sin puntuación registrada"}</strong></div><h3>{String(item.name??"Oportunidad")}</h3><p>{strings(item.evidenceIds).length} citas vinculadas</p><button className="button secondary" type="button" aria-pressed={inspected?.id===item.id} onClick={()=>setInspectedId(String(item.id))}>Examinar oportunidad</button></div></article>)}</div></section>
      <aside className="opportunity-detail-card" aria-label="Detalle de la oportunidad examinada">
        <span className="eyebrow">EXAMINAR ANTES DE DECIDIR</span><h3>{String(inspected?.name??"")}</h3>
        <p><strong>Problema de origen{parentVersionNumber!==null?` · v${parentVersionNumber}`:""}:</strong> {String(problem?.name??inspected?.problemId??"No registrado")}</p>
        {typeof problem?.summary==="string"&&<p>{problem.summary}</p>}
        {!problem&&<p className="form-hint">El texto del problema padre no está disponible en esta vista; se conserva su identificador.</p>}
        <p>{typeof inspected?.rationale==="string"?inspected.rationale:"Esta versión no registró una justificación de la oportunidad."}</p>
        {hasScores(inspected??{})?<details className="analysis-details" open><summary>Scoring auditable · fórmula {String(formula.version??"no registrada")}</summary><p className="form-hint">En nuevas evaluaciones, Espacio competitivo alto significa menor presión o un hueco mejor sustentado. El histórico conserva sus valores originales.</p><div className="structured-output">{CRITERIA.map(([key,label])=><section className="output-section" key={key}><div className="output-field"><span>{label}</span><strong>{String(scores[key])}/100{typeof weights[key]==="number"?` · peso ${Math.round(weights[key]*100)}%`:""}</strong></div><p>{typeof reasons[key]==="string"?reasons[key]:"Sin justificación por criterio registrada; tratar como estimación por contrastar."}</p></section>)}</div></details>:<p>Sin puntuación registrada</p>}
        <h4>Datos pendientes y validación</h4>{strings(inspected?.missingData).length>0?<ul>{strings(inspected?.missingData).map((text,index)=><li key={index}>{text}</li>)}</ul>:<p>No se registraron las incógnitas. No equivale a ausencia de incertidumbre.</p>}
        {strings(inspected?.validationPlan).length>0?<ol>{strings(inspected?.validationPlan).map((text,index)=><li key={index}>{text}</li>)}</ol>:<p>No hay un plan de validación registrado.</p>}
        <details className="analysis-details"><summary>Citas del problema ({evidenceIds.length})</summary>{evidenceIds.map(id=>{const quote=quotes.find(item=>item.evidenceId===id);return <blockquote key={id}>{quote?<><p>“{String(quote.quote??"")}”</p><footer>{String(quote.author??"")} · {String(quote.sourceTitle??"")}</footer></>:<p>Cita no cargada en esta vista: {id}</p>}</blockquote>;})}</details>
        {editable&&<><p className="form-hint">Guardar crea un borrador. Producto seguirá usando la selección aprobada hasta que apruebes la nueva versión.</p><button type="button" className="button primary" disabled={busy||!inspected||inspected.id===storedId} onClick={()=>onSave(String(inspected?.id))}>Guardar selección como borrador</button></>}
        {selected.status==="draft"&&selected.freshness==="fresh"&&!legacy&&<><p>Se aprobará la selección guardada: {String(items.find(item=>item.id===storedId)?.name??"Sin selección")}. Examínala antes de aprobar.</p><button type="button" className="button primary" disabled={busy||inspected?.id!==storedId} onClick={onApprove}>Aprobar selección</button></>}
        {selected.freshness!=="fresh"&&<p className="form-hint">Solo lectura: esta versión depende de información reemplazada.</p>}
      </aside>
    </div>}
  </div>;
}

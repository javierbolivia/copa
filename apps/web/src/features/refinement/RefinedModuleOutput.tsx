import {renderLandingHtml, renderLandingReactCode, renderFunnelMarkdown} from "@our-platform/shared";
import type { FunnelEdge } from "@our-platform/shared";
import {toLanding,fromLanding} from "./landing-adapter";
export {toLanding,fromLanding} from "./landing-adapter";
import {reviewStateLabel} from "../modules/ModuleReviewSummary";
import {toOffer,fromOffer} from "./offer-adapter";
export {toOffer,fromOffer} from "./offer-adapter";
import {toBeliefs,fromBeliefs} from "./beliefs-adapter";
export {toBeliefs,fromBeliefs} from "./beliefs-adapter";
import {toMechanism,fromMechanism} from "./mechanism-adapter";
export {toMechanism,fromMechanism} from "./mechanism-adapter";
import {toAvatar,fromAvatar} from "./avatar-adapter";
export {toAvatar,fromAvatar} from "./avatar-adapter";
import type { EvidenceSnippet, GeneratedFile, ModuleKey, ModuleResult } from "@our-platform/shared";
import { BookmarkCheck, CheckCircle2, GitBranch, Globe2, ShieldX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { TraceabilityGraph } from "../../api/client";
import { api } from "../../api/client";
import { useRequestGuard } from "../../api/useRequestGuard";
import { AvatarEditor, BeliefsEditor, LandingBuilder, MechanismEditor, OfferEditor, ProductEditor } from "./index";
import type { AvatarEditorValue, BeliefsEditorValue, LandingEditorValue, LandingVersion, MechanismEditorValue, OfferEditorValue, ProductEditorValue } from "./types";
import { ContentWorkspace, FunnelWorkspace, ProductFinalWorkspace, type CampaignContent, type FunnelNode, type ProductFile } from "./CampaignWorkspaces";
export {toProduct,fromProduct} from "./product-adapter";
import {ProductWorkspace} from "./ProductWorkspace";
import { ProductStudio } from "../product-studio/ProductStudio";
import {FinalProductReviewPanel} from "./FinalProductReviewPanel";
import type {FinalProductReviewInput} from "@our-platform/shared";

export interface RefinedModuleOutputProps {
  projectId:string;
  moduleKey:ModuleKey;
  selected:ModuleResult;
  versions:ModuleResult[];
  files:GeneratedFile[];
  evidence?:EvidenceSnippet[];
  onVersionCreated:(version:ModuleResult)=>void;
  onSelectVersion:(versionId:string)=>void;
  onRegenerate:(instructions?:string)=>Promise<void>;
}

export function RefinedModuleOutput(props:RefinedModuleOutputProps) {
  const {moduleKey,selected}=props;
  const requests=useRequestGuard(`${props.projectId}:${moduleKey}:${selected.versionId}`);
  const [saving,setSaving]=useState(false),[message,setMessage]=useState<string|null>(null),[trace,setTrace]=useState<TraceabilityGraph|null>(null),[finalProductHasUnsavedEdits,setFinalProductHasUnsavedEdits]=useState(false);
  useEffect(()=>setFinalProductHasUnsavedEdits(false),[selected.versionId]);
  const save=async(outputData:unknown)=>{const current=requests.begin();setSaving(true);setMessage(null);try{const base=selected.status==="draft"?props.versions.find(version=>version.status==="approved")?.versionId:selected.versionId;const draft=await api.saveModuleDraft(props.projectId,moduleKey,outputData,base,moduleKey==="product"||moduleKey==="avatar"||moduleKey==="mechanism"||moduleKey==="beliefs"||moduleKey==="offer"||moduleKey==="landing"||moduleKey==="funnel"||moduleKey==="content"||moduleKey==="final_product"?selected.versionId:undefined);if(!current())return false;if(moduleKey==="final_product")setFinalProductHasUnsavedEdits(false);props.onVersionCreated(draft);setMessage("Borrador guardado. Revísalo y apruébalo cuando esté listo.");return true;}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo guardar el borrador.");return false;}finally{if(current())setSaving(false);}};
  const reviewFinalProduct=async(input:FinalProductReviewInput)=>{const current=requests.begin();setSaving(true);setMessage(null);try{const reviewed=await api.reviewFinalProduct(props.projectId,selected.versionId,input);if(!current())return false;props.onVersionCreated(reviewed);setMessage("Revisión factual registrada en un nuevo borrador; revisa su estado antes de aprobar.");return true;}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo registrar la revisión.");return false;}finally{if(current())setSaving(false);}};
  const approve=async()=>{const current=requests.begin();setSaving(true);setMessage(null);try{const approved=await api.approveModuleVersion(props.projectId,moduleKey,selected.versionId);if(!current())return;props.onVersionCreated(approved);setMessage("Versión aprobada y disponible para módulos posteriores.");}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo aprobar la versión.");}finally{if(current())setSaving(false);}};
  const archiveDraft=async()=>{const current=requests.begin();setSaving(true);setMessage(null);try{const archived=await api.archiveModuleDraft(props.projectId,moduleKey,selected.versionId);if(!current())return;props.onVersionCreated(archived);setMessage("Borrador archivado en el historial. La versión aprobada sigue activa.");}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo archivar el borrador.");}finally{if(current())setSaving(false);}};
  const remember=async(decision:"APPROVED"|"REJECTED",visibility:"PROJECT"|"GLOBAL"="PROJECT")=>{const current=requests.begin();setSaving(true);setMessage(null);try{await api.saveMemoryDecision(props.projectId,selected.versionId,{decision,reusable:decision==="APPROVED",preferred:decision==="APPROVED",visibility,editedOutput:selected.outputData});if(!current())return;setMessage(decision==="APPROVED"?visibility==="GLOBAL"?"Guardado explícitamente como ejemplo futuro global.":"Guardado como ejemplo futuro preferido para este proyecto.":"Marcado como ejemplo rechazado; nunca se usará como referencia positiva.");}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo guardar la decisión de memoria.");}finally{if(current())setSaving(false);}};
  const rememberGlobally=()=>{
    if(window.confirm("Esta decisión se compartirá como referencia global para futuros proyectos. ¿Quieres continuar?"))void remember("APPROVED","GLOBAL");
  };
  const openTrace=async()=>{try{setTrace(await api.traceability(props.projectId,selected.versionId));}catch(error){setMessage(error instanceof Error?error.message:"No se pudo cargar la trazabilidad.");}};
  return <div className={`refined-module-shell refined-module-shell--${moduleKey}`}>
    {message&&<div className="refinement-feedback" role="status">{message}</div>}
    <section className="refinement-decision-bar" aria-label="Decisiones de la versión">
      <div className="refinement-version-state"><span>{selected.status==="superseded"||selected.status==="archived"?"VERSIÓN HISTÓRICA":"VERSIÓN SELECCIONADA"}</span><strong>v{selected.versionNumber}</strong><small>{reviewStateLabel(selected.status)} · {reviewStateLabel(selected.freshness)}</small></div>
      <div className="refinement-decision-actions">
        <button className="refinement-decision refinement-decision--origin" type="button" onClick={()=>void openTrace()}><GitBranch size={15}/><span><strong>Ver origen</strong><small>Cadena de evidencia</small></span></button>
        <button className="refinement-decision refinement-decision--reject" disabled={saving} type="button" onClick={()=>void remember("REJECTED")}><ShieldX size={15}/><span><strong>Marcar rechazado</strong><small>Excluir como referencia</small></span></button>
        {selected.status==="approved"&&<>
          <button className="refinement-decision refinement-decision--future" disabled={saving} type="button" onClick={()=>void remember("APPROVED")}><BookmarkCheck size={15}/><span><strong>Ejemplo futuro</strong><small>Solo este proyecto</small></span></button>
          <button className="refinement-decision refinement-decision--global" disabled={saving} type="button" onClick={rememberGlobally}><Globe2 size={15}/><span><strong>Usar globalmente</strong><small>Requiere confirmación</small></span></button>
        </>}
        {selected.status==="draft"&&<button className="refinement-decision refinement-decision--approve" disabled={saving||selected.freshness!=="fresh"||(moduleKey==="final_product"&&(finalProductHasUnsavedEdits||record(record(selected.outputData).finalProductFactualReview).status!=="RECORDED"))||((moduleKey==="product"&&record(record(selected.outputData).productValidationAudit).ok===false)||(moduleKey==="avatar"&&record(record(selected.outputData).avatarValidationAudit).ok===false)||(moduleKey==="mechanism"&&record(record(selected.outputData).mechanismValidationAudit).ok===false)||(moduleKey==="beliefs"&&record(record(selected.outputData).beliefsValidationAudit).ok===false)||(moduleKey==="offer"&&record(record(selected.outputData).offerValidationAudit).ok===false)||(moduleKey==="landing"&&record(record(selected.outputData).landingValidationAudit).ok===false)||(moduleKey==="funnel"&&record(record(selected.outputData).funnelValidationAudit).ok===false)||(moduleKey==="final_product"&&record(record(selected.outputData).finalProductValidationAudit).ok===false))} type="button" onClick={()=>void approve()}><CheckCircle2 size={15}/><span><strong>Aprobar versión</strong><small>Habilitar downstream</small></span></button>}
        {selected.status==="draft"&&<button className="refinement-decision" disabled={saving} type="button" onClick={()=>void archiveDraft()}><span><strong>Archivar borrador</strong><small>Conservar en historial; no activar</small></span></button>}
      </div>
    </section>
    {(moduleKey==="product"||moduleKey==="avatar"||moduleKey==="mechanism"||moduleKey==="beliefs"||moduleKey==="offer"||moduleKey==="funnel"||moduleKey==="content"||moduleKey==="final_product")&&<nav className="version-strip" aria-label={`Versiones de ${moduleKey==="product"?"Producto":moduleKey==="avatar"?"Avatar":moduleKey==="mechanism"?"Mecanismo":moduleKey==="beliefs"?"Creencias":moduleKey==="offer"?"Oferta":moduleKey==="content"?"Contenido":moduleKey==="final_product"?"Producto final":"Funnel"}`}>{props.versions.map(version=><button type="button" key={version.versionId} className={selected.versionId===version.versionId?"active":""} disabled={saving} aria-pressed={selected.versionId===version.versionId} title={`${reviewStateLabel(version.status)} · ${new Date(version.createdAt).toLocaleString("es")}`} onClick={()=>props.onSelectVersion(version.versionId)}>Versión {version.versionNumber}<small>{reviewStateLabel(version.status)} · {new Date(version.createdAt).toLocaleDateString("es")}</small></button>)}</nav>}
    {moduleKey==="funnel"&&record(record(selected.outputData).funnelValidationAudit).ok===false&&<div role="alert"><h3>Funnel comercial pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).funnelValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="landing"&&record(record(selected.outputData).landingValidationAudit).ok===false&&<div role="alert"><h3>Landing pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).landingValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="offer"&&record(record(selected.outputData).offerValidationAudit).ok===false&&<div role="alert"><h3>Oferta pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).offerValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="beliefs"&&record(record(selected.outputData).beliefsValidationAudit).ok===false&&<div role="alert"><h3>Creencias pendientes de corrección</h3><ul>{strings(record(record(selected.outputData).beliefsValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="mechanism"&&record(record(selected.outputData).mechanismValidationAudit).ok===false&&<div role="alert"><h3>Mecanismo pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).mechanismValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="avatar"&&<section className="detail-card"><h2>Perfil basado en un corpus limitado</h2><p>Las inferencias requieren contraste. Una referencia válida no prueba representatividad, capacidad de compra ni características demográficas.</p>{record(record(selected.outputData).avatarValidationAudit).ok===false&&<div role="alert"><h3>Perfil pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).avatarValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}</section>}
    <Specialized evidence={props.evidence??[]} projectId={props.projectId} moduleKey={moduleKey} selected={selected} versions={props.versions} files={props.files} saving={saving} onSave={save} onSelectVersion={props.onSelectVersion} onTrace={()=>void openTrace()} onRegenerate={props.onRegenerate} onDirtyChange={setFinalProductHasUnsavedEdits} onReview={reviewFinalProduct} />
    {trace&&<TraceDialog graph={trace} onClose={()=>setTrace(null)}/>} 
  </div>;
}

function Specialized({evidence,projectId,moduleKey,selected,versions,files,saving,onSave,onSelectVersion,onTrace,onRegenerate,onDirtyChange,onReview}:{evidence:EvidenceSnippet[];projectId:string;moduleKey:ModuleKey;selected:ModuleResult;versions:ModuleResult[];files:GeneratedFile[];saving:boolean;onSave:(value:unknown)=>Promise<boolean>;onSelectVersion:(id:string)=>void;onTrace:()=>void;onRegenerate:(instructions?:string)=>Promise<void>;onDirtyChange:(dirty:boolean)=>void;onReview:(input:FinalProductReviewInput)=>Promise<boolean>}) {
  const output=record(selected.outputData);
  if(moduleKey==="product")return <ProductWorkspace selected={selected} saving={saving} onSave={onSave} onTrace={onTrace}/>;
  if(moduleKey==="avatar")return <AvatarEditor evidence={evidence} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toAvatar(output)} onSave={(value)=>onSave(fromAvatar(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="mechanism")return <MechanismEditor evidence={evidence} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toMechanism(output)} onSave={(value)=>onSave(fromMechanism(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="beliefs")return <BeliefsEditor readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toBeliefs(output)} onSave={(value)=>onSave(fromBeliefs(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="offer")return <OfferEditor readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toOffer(output)} onSave={(value)=>onSave(fromOffer(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="landing"){
    const landingVersions:LandingVersion[]=versions.map(item=>({id:item.versionId,versionNumber:item.versionNumber,createdAt:item.createdAt,status:item.status,value:toLanding(record(item.outputData))}));
    return <LandingBuilder value={toLanding(output)} versions={landingVersions} selectedVersionId={selected.versionId} saving={saving} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} onSave={(value)=>onSave(fromLanding(output,value))} onSelectVersion={onSelectVersion} onExportHtml={exportLandingHtml} onExportReact={exportLandingReact} onRegenerate={onRegenerate} onOpenTraceability={onTrace}/>;
  }
  if(moduleKey==="funnel")return <FunnelAdapter output={output} onSave={onSave}/>;
  if(moduleKey==="content")return <ContentAdapter output={output} versionCreatedAt={selected.createdAt} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} onSave={onSave}/>;
  if(moduleKey==="final_product")return <FinalProductViews projectId={projectId} output={output} selected={selected} saving={saving} onSave={onSave} onDirtyChange={onDirtyChange} onReview={onReview}/>;
  return null;
}

function FinalProductViews({projectId,output,selected,saving,onSave,onDirtyChange,onReview}:{projectId:string;output:Record<string,unknown>;selected:ModuleResult;saving:boolean;onSave:(value:unknown)=>Promise<boolean>;onDirtyChange:(dirty:boolean)=>void;onReview:(input:FinalProductReviewInput)=>Promise<boolean>}){
  const [view,setView]=useState<"manuscript"|"studio">("manuscript");
  const [draftOutput,setDraftOutput]=useState(output);
  useEffect(()=>setDraftOutput(output),[selected.versionId]);
  const guide=record(output.guide),draftGuide=record(draftOutput.guide),chapters=Array.isArray(guide.chapters)?guide.chapters.map(record):[];
  const draftChapters=Array.isArray(draftGuide.chapters)?draftGuide.chapters.map(record):[];
  const references=Array.isArray(guide.references)?guide.references.map(record):[];
  const audit=record(output.finalProductValidationAudit);
  const auditErrors=strings(audit.errors);
  const reviewNote=text(output.reviewNote);
  const readOnly=selected.freshness!=="fresh"||(selected.status!=="draft"&&selected.status!=="approved");
  const dirty=JSON.stringify(draftOutput)!==JSON.stringify(output);
  const applyDraft=(next:Record<string,unknown>)=>{setDraftOutput(next);onDirtyChange(JSON.stringify(next)!==JSON.stringify(output));};
  const updateGuide=(field:string,value:unknown)=>applyDraft({...draftOutput,guide:{...record(draftOutput.guide),[field]:value}});
  const updateList=(field:"checklist"|"workbook",value:string)=>applyDraft({...draftOutput,[field]:value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean)});
  const updateChapter=(index:number,field:"title"|"content",value:string)=>applyDraft({...draftOutput,guide:{...record(draftOutput.guide),chapters:(Array.isArray(record(draftOutput.guide).chapters)?record(draftOutput.guide).chapters as unknown[]:[]).map((item,chapterIndex)=>chapterIndex===index?{...record(item),[field]:value}:item)}});
  return <div className="final-product-views">
    <div className="final-product-tabs" role="tablist" aria-label="Vistas del producto final">
      <button id="final-product-tab-manuscript" role="tab" aria-selected={view==="manuscript"} aria-controls="final-product-panel-manuscript" type="button" onClick={()=>setView("manuscript")}>{selected.freshness==="stale"?"Manuscrito por revisar":selected.status==="superseded"||selected.status==="archived"?"Manuscrito histórico":"Manuscrito vigente"} <small>v{selected.versionNumber} · {reviewStateLabel(selected.status)}</small></button>
      <button id="final-product-tab-studio" role="tab" aria-selected={view==="studio"} aria-controls="final-product-panel-studio" type="button" onClick={()=>setView("studio")}>Product Studio <small>Documento independiente</small></button>
    </div>
    {view==="manuscript"?<section id="final-product-panel-manuscript" className="final-product-manuscript" role="tabpanel" aria-labelledby="final-product-tab-manuscript">
      <header className="detail-card"><span className="eyebrow">{selected.status==="draft"?"BORRADOR CANÓNICO":"VERSIÓN APROBADA"} · VERSIÓN {selected.versionNumber}</span><h2>{text(draftGuide.title)||"Manuscrito sin título"}</h2>{readOnly?<p className="final-product-copy">{text(guide.introduction)}</p>:<><label className="final-product-field">Título del manuscrito<input disabled={saving} value={text(draftGuide.title)} onChange={event=>updateGuide("title",event.target.value)}/></label><label className="final-product-field">Introducción<textarea disabled={saving} rows={7} value={text(draftGuide.introduction)} onChange={event=>updateGuide("introduction",event.target.value)}/></label></>}<div className="final-product-audit" aria-label="Resumen de validación"><span>{draftChapters.length} capítulos</span><span>{typeof audit.totalWords==="number"?audit.totalWords:0} palabras de la versión guardada</span><span>{references.length} referencias</span><span>{dirty?"Cambios pendientes de revalidación":audit.ok===true?"Auditoría estructural aprobada":"Auditoría pendiente de revisión"}</span></div></header>
      <FinalProductReviewPanel key={selected.versionId} references={references.map(ref=>({id:text(ref.id),title:text(ref.title),url:text(ref.url)}))} review={record(output.finalProductFactualReview)} disabled={saving||dirty||audit.ok!==true} readOnly={readOnly} onReview={onReview}/>
      {reviewNote&&<aside className="detail-card final-product-review-note" role="note"><h3>Nota de revisión</h3><p>{reviewNote}</p></aside>}
      {audit.ok===false&&<div className="detail-card" role="alert"><h3>Manuscrito pendiente de corrección</h3>{auditErrors.length>0?<ul>{auditErrors.map((error,index)=><li key={index}>{error}</li>)}</ul>:<p>La auditoría estructural no está aprobada. Corrige el manuscrito y guárdalo como una nueva versión para volver a validar.</p>}</div>}
      {draftChapters.length>0?<div className="final-product-chapters">{draftChapters.map((chapter,index)=><article className="detail-card" key={`${text(chapter.title)}-${index}`}>{readOnly?<><span className="eyebrow">CAPÍTULO {index+1}</span><h3>{text(chapter.title)||`Capítulo ${index+1}`}</h3><p className="final-product-copy">{text(chapter.content)}</p></>:<details className="final-product-chapter-editor"><summary><span>CAPÍTULO {index+1}</span><strong>{text(chapter.title)||`Capítulo ${index+1}`}</strong></summary><label className="final-product-field">Título<input disabled={saving} value={text(chapter.title)} onChange={event=>updateChapter(index,"title",event.target.value)}/></label><label className="final-product-field">Contenido<textarea disabled={saving} rows={18} value={text(chapter.content)} onChange={event=>updateChapter(index,"content",event.target.value)}/></label></details>}</article>)}</div>:<section className="detail-card"><p>No hay capítulos en esta versión.</p></section>}
      {text(draftGuide.conclusion)&&<section className="detail-card">{readOnly?<><h3>Conclusión</h3><p className="final-product-copy">{text(guide.conclusion)}</p></>:<label className="final-product-field">Conclusión<textarea disabled={saving} rows={6} value={text(draftGuide.conclusion)} onChange={event=>updateGuide("conclusion",event.target.value)}/></label>}</section>}
      {!readOnly&&strings(draftOutput.checklist).length>0&&<section className="detail-card"><label className="final-product-field">Checklist<textarea disabled={saving} rows={7} value={strings(draftOutput.checklist).join("\n")} onChange={event=>updateList("checklist",event.target.value)}/></label></section>}
      {readOnly&&strings(output.checklist).length>0&&<section className="detail-card"><h3>Checklist</h3><ul>{strings(output.checklist).map((item,index)=><li key={index}>{item}</li>)}</ul></section>}
      {!readOnly&&strings(draftOutput.workbook).length>0&&<section className="detail-card"><label className="final-product-field">Workbook<textarea disabled={saving} rows={9} value={strings(draftOutput.workbook).join("\n")} onChange={event=>updateList("workbook",event.target.value)}/></label></section>}
      {readOnly&&strings(output.workbook).length>0&&<section className="detail-card"><h3>Workbook</h3><ul>{strings(output.workbook).map((item,index)=><li key={index}>{item}</li>)}</ul></section>}
      {references.length>0&&<section className="detail-card"><h3>Referencias</h3><ol>{references.map((reference,index)=><li key={text(reference.id)||index}><strong>{text(reference.id)}{text(reference.organization)?`. ${text(reference.organization)}`:""}</strong>{text(reference.title)?`. ${text(reference.title)}`:""}{text(reference.url)&&<> — <a href={text(reference.url)} target="_blank" rel="noreferrer">Abrir fuente</a></>}</li>)}</ol></section>}
      {!readOnly&&<div className="final-product-save"><p className="muted-copy">Los cambios se guardan como una versión nueva. El servidor vuelve a validar estructura, citas y referencias al guardar.</p><button className="button primary" type="button" disabled={saving||!dirty} onClick={()=>void onSave(draftOutput)}>{saving?"Guardando…":"Guardar cambios como borrador"}</button></div>}
      {readOnly&&<p className="muted-copy">Vista histórica de solo lectura. La aprobación y exportación siguen sujetas al flujo normal del módulo.</p>}
    </section>:<section id="final-product-panel-studio" role="tabpanel" aria-labelledby="final-product-tab-studio"><p className="muted-copy">Product Studio administra un documento independiente y conserva su propio historial y estado de vigencia.</p><ProductStudio projectId={projectId}/></section>}
  </div>;
}

function FunnelAdapter({output,onSave}:{output:Record<string,unknown>;onSave:(value:unknown)=>Promise<boolean>}){
  const initial=toFunnel(output),[nodes,setNodes]=useState(initial);useEffect(()=>setNodes(initial),[JSON.stringify(output)]);
  const edges:FunnelEdge[]=useMemo(()=>(Array.isArray(output.edges)?output.edges:[]).map(record).map(edge=>({from:text(edge.from),to:text(edge.to),event:text(edge.event)||"continue",label:text(edge.label)||undefined})),[output.edges]);
  const update=(node:FunnelNode)=>setNodes(current=>current.map(item=>item.id===node.id?node:item));
  const exportMarkdown=()=>downloadText("funnel.md",renderFunnelMarkdown({...output,nodes:nodes.map(n=>({id:n.id,type:n.stage,label:n.name,description:n.description,active:n.active,linkedArtifact:n.linkedArtifact,metricLabel:n.metricLabel,metricValue:n.metricValue,price:n.metricValue})),edges}));
  return <><FunnelWorkspace nodes={nodes} edges={edges} onUpdate={update} onReorder={(ids)=>setNodes(ids.map(id=>nodes.find(item=>item.id===id)!).filter(Boolean))} onExport={exportMarkdown}/><SaveBar onSave={()=>onSave({...output,nodes:nodes.map(node=>({id:node.id,type:node.stage,label:node.name,description:node.description,active:node.active,linkedArtifact:node.linkedArtifact,metricLabel:node.metricLabel,metricValue:node.metricValue})),edges:output.edges||edges})}/></>;
}
function ContentAdapter({output,versionCreatedAt,readOnly,onSave}:{output:Record<string,unknown>;versionCreatedAt:string;readOnly:boolean;onSave:(value:unknown)=>Promise<boolean>}){
  const initial=toContent(output),[items,setItems]=useState(initial);useEffect(()=>setItems(initial),[JSON.stringify(output)]);
  const exportItems=(ids:string[])=>downloadText("content.md",items.filter(item=>ids.includes(item.id)).map(item=>`# ${item.title}\n\n- Canal: ${item.channel}\n- CTA: ${item.cta||"No registrado (versión histórica)"}\n\n${item.body}`).join("\n\n---\n\n"));
  return <><ContentWorkspace items={items} versionCreatedAt={versionCreatedAt} readOnly={readOnly} onUpdate={(item)=>setItems(current=>current.map(value=>value.id===item.id?item:value))} onDuplicate={(id)=>setItems(current=>{const source=current.find(item=>item.id===id);return source?[...current,{...source,id:crypto.randomUUID(),title:`${source.title} (copia)`}]:current;})} onDelete={(id)=>setItems(current=>current.filter(item=>item.id!==id))} onExport={exportItems}/>{!readOnly&&<SaveBar onSave={()=>onSave({...output,calendar:items.map((item,index)=>({day:index+1,type:item.format,channel:item.channel,hook:item.title,body:item.body,cta:item.cta}))})}/>}</>;
}
function SaveBar({onSave}:{onSave:()=>Promise<boolean>}){return <div className="refinement-save-bar"><span>Los cambios se guardan como una nueva versión draft.</span><button className="button primary" type="button" onClick={()=>void onSave()}>Guardar cambios</button></div>}

function TraceDialog({graph,onClose}:{graph:TraceabilityGraph;onClose:()=>void}){const artifacts=graph.nodes.filter(node=>node.kind==="artifact"),evidence=graph.nodes.filter(node=>node.kind==="evidence"),sources=graph.nodes.filter(node=>node.kind==="source");return <div className="refinement-dialog-backdrop" onMouseDown={onClose}><section className="refinement-dialog" role="dialog" aria-modal="true" aria-label="Trazabilidad" onMouseDown={event=>event.stopPropagation()}><header><div><span className="eyebrow">TRACEABILITY</span><h2>¿De dónde sale esto?</h2><p>{artifacts.length} versiones · {graph.evidenceCount} evidencias · {graph.sourceCount} fuentes</p></div><button aria-label="Cerrar" onClick={onClose}>×</button></header><div className="refinement-trace-chain">{artifacts.map(node=><article className={node.id===graph.rootId?"current":""} key={node.id}><span>{node.artifactType}</span><strong>{node.label}</strong><small>{node.status} · {node.freshness}</small></article>)}</div>{sources.length>0&&<div className="refinement-trace-sources"><h3>Fuentes</h3>{sources.map(node=><p key={node.id}><strong>{node.label}</strong> · {node.subtitle}</p>)}</div>}{evidence.length>0&&<div className="refinement-trace-evidence"><h3>Evidencia vinculada</h3>{evidence.slice(0,20).map(node=><blockquote key={node.id}>“{node.label}”<footer>{node.subtitle}</footer></blockquote>)}</div>}</section></div>}

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown):string[]=>Array.isArray(value)?value.map(item=>typeof item==="string"?item:typeof item==="object"&&item!==null?String((item as Record<string,unknown>).text??(item as Record<string,unknown>).name??""):String(item)).filter(Boolean):[];
const text=(value:unknown)=>typeof value==="string"?value:"";
function component(value:unknown){const item=record(value);return{name:text(item.name),description:text(item.description)}}
function section(value:Record<string,unknown>,type:string){const item=(Array.isArray(value.sections)?value.sections:[]).map(record).find(entry=>entry.type===type)??{};return{eyebrow:type.toUpperCase(),headline:text(item.headline)||text(item.subheadline),body:text(item.body)}}
function toFunnel(value:Record<string,unknown>):FunnelNode[]{return (Array.isArray(value.nodes)?value.nodes:[]).map(record).map((node,index)=>({id:text(node.id)||`node-${index}`,name:text(node.label)||text(node.type),stage:text(node.type),description:text(node.description),active:node.active!==false,linkedArtifact:text(node.linkedArtifact),metricLabel:text(node.metricLabel)||undefined,metricValue:text(node.metricValue)||text(node.price)||undefined}))}
export function toContent(value:Record<string,unknown>):CampaignContent[]{return (Array.isArray(value.calendar)?value.calendar:[]).map(record).map((item,index)=>({id:`content-${index}`,title:text(item.hook)||`Contenido ${index+1}`,format:text(item.type)||"Educational",channel:text(item.channel)||"Canal no registrado",status:"READY",body:text(item.body),cta:text(item.cta)}))}
function toFiles(files:GeneratedFile[],version:number):ProductFile[]{return files.map(file=>({id:file.id,name:file.fileRole.replaceAll("_"," "),format:file.format,status:"READY",sizeLabel:`${file.bytes.toLocaleString("es")} bytes`,updatedAt:file.createdAt,version}))}
function openFile(files:GeneratedFile[],id:string){const file=files.find(item=>item.id===id);if(file)window.open(file.downloadUrl,"_blank","noopener,noreferrer")}
function downloadText(name:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:"text/plain;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url);}
function exportLandingHtml(value:LandingEditorValue){const html=renderLandingHtml(fromLanding({},value));const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download="landing.html";anchor.click();URL.revokeObjectURL(url)}
function exportLandingReact(value:LandingEditorValue){const code=renderLandingReactCode(fromLanding({},value));downloadText("landing.tsx",code);}

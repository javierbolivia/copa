import {renderLandingHtml} from "@our-platform/shared";
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
import { ContentWorkspace, EmailsWorkspace, FunnelWorkspace, ProductFinalWorkspace, type CampaignContent, type CampaignEmail, type FunnelNode, type ProductFile } from "./CampaignWorkspaces";
export {toProduct,fromProduct} from "./product-adapter";
import {ProductWorkspace} from "./ProductWorkspace";
import { ProductStudio } from "../product-studio/ProductStudio";

export interface RefinedModuleOutputProps {
  projectId:string;
  moduleKey:ModuleKey;
  selected:ModuleResult;
  versions:ModuleResult[];
  files:GeneratedFile[];
  evidence?:EvidenceSnippet[];
  onVersionCreated:(version:ModuleResult)=>void;
  onSelectVersion:(versionId:string)=>void;
  onRegenerate:()=>Promise<void>;
}

export function RefinedModuleOutput(props:RefinedModuleOutputProps) {
  const {moduleKey,selected}=props;
  const requests=useRequestGuard(`${props.projectId}:${moduleKey}:${selected.versionId}`);
  const [saving,setSaving]=useState(false),[message,setMessage]=useState<string|null>(null),[trace,setTrace]=useState<TraceabilityGraph|null>(null);
  const save=async(outputData:unknown)=>{const current=requests.begin();setSaving(true);setMessage(null);try{const base=selected.status==="draft"?props.versions.find(version=>version.status==="approved")?.versionId:selected.versionId;const draft=await api.saveModuleDraft(props.projectId,moduleKey,outputData,base,moduleKey==="product"||moduleKey==="avatar"||moduleKey==="mechanism"||moduleKey==="beliefs"||moduleKey==="offer"||moduleKey==="landing"?selected.versionId:undefined);if(!current())return false;props.onVersionCreated(draft);setMessage("Borrador guardado. Revísalo y apruébalo cuando esté listo.");return true;}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo guardar el borrador.");return false;}finally{if(current())setSaving(false);}};
  const approve=async()=>{const current=requests.begin();setSaving(true);setMessage(null);try{const approved=await api.approveModuleVersion(props.projectId,moduleKey,selected.versionId);if(!current())return;props.onVersionCreated(approved);setMessage("Versión aprobada y disponible para módulos posteriores.");}catch(error){if(current())setMessage(error instanceof Error?error.message:"No se pudo aprobar la versión.");}finally{if(current())setSaving(false);}};
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
        {selected.status==="draft"&&<button className="refinement-decision refinement-decision--approve" disabled={saving||selected.freshness!=="fresh"||((moduleKey==="product"&&record(record(selected.outputData).productValidationAudit).ok===false)||(moduleKey==="avatar"&&record(record(selected.outputData).avatarValidationAudit).ok===false)||(moduleKey==="mechanism"&&record(record(selected.outputData).mechanismValidationAudit).ok===false)||(moduleKey==="beliefs"&&record(record(selected.outputData).beliefsValidationAudit).ok===false)||(moduleKey==="offer"&&record(record(selected.outputData).offerValidationAudit).ok===false)||(moduleKey==="landing"&&record(record(selected.outputData).landingValidationAudit).ok===false))} type="button" onClick={()=>void approve()}><CheckCircle2 size={15}/><span><strong>Aprobar versión</strong><small>Habilitar downstream</small></span></button>}
      </div>
    </section>
    {(moduleKey==="product"||moduleKey==="avatar"||moduleKey==="mechanism"||moduleKey==="beliefs"||moduleKey==="offer")&&<nav className="version-strip" aria-label={`Versiones de ${moduleKey==="product"?"Producto":moduleKey==="avatar"?"Avatar":moduleKey==="mechanism"?"Mecanismo":moduleKey==="beliefs"?"Creencias":"Oferta"}`}>{props.versions.map(version=><button type="button" key={version.versionId} className={selected.versionId===version.versionId?"active":""} disabled={saving} aria-pressed={selected.versionId===version.versionId} title={`${reviewStateLabel(version.status)} · ${new Date(version.createdAt).toLocaleString("es")}`} onClick={()=>props.onSelectVersion(version.versionId)}>Versión {version.versionNumber}<small>{new Date(version.createdAt).toLocaleDateString("es")}</small></button>)}</nav>}
    {moduleKey==="landing"&&record(record(selected.outputData).landingValidationAudit).ok===false&&<div role="alert"><h3>Landing pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).landingValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="offer"&&record(record(selected.outputData).offerValidationAudit).ok===false&&<div role="alert"><h3>Oferta pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).offerValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="beliefs"&&record(record(selected.outputData).beliefsValidationAudit).ok===false&&<div role="alert"><h3>Creencias pendientes de corrección</h3><ul>{strings(record(record(selected.outputData).beliefsValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="mechanism"&&record(record(selected.outputData).mechanismValidationAudit).ok===false&&<div role="alert"><h3>Mecanismo pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).mechanismValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}
    {moduleKey==="avatar"&&<section className="detail-card"><h2>Perfil basado en un corpus limitado</h2><p>Las inferencias requieren contraste. Una referencia válida no prueba representatividad, capacidad de compra ni características demográficas.</p>{record(record(selected.outputData).avatarValidationAudit).ok===false&&<div role="alert"><h3>Perfil pendiente de corrección</h3><ul>{strings(record(record(selected.outputData).avatarValidationAudit).errors).map((error,index)=><li key={index}>{error}</li>)}</ul></div>}</section>}
    <Specialized evidence={props.evidence??[]} projectId={props.projectId} moduleKey={moduleKey} selected={selected} versions={props.versions} files={props.files} saving={saving} onSave={save} onSelectVersion={props.onSelectVersion} onTrace={()=>void openTrace()} onRegenerate={props.onRegenerate} />
    {trace&&<TraceDialog graph={trace} onClose={()=>setTrace(null)}/>} 
  </div>;
}

function Specialized({evidence,projectId,moduleKey,selected,versions,files,saving,onSave,onSelectVersion,onTrace,onRegenerate}:{evidence:EvidenceSnippet[];projectId:string;moduleKey:ModuleKey;selected:ModuleResult;versions:ModuleResult[];files:GeneratedFile[];saving:boolean;onSave:(value:unknown)=>Promise<boolean>;onSelectVersion:(id:string)=>void;onTrace:()=>void;onRegenerate:()=>Promise<void>}) {
  const output=record(selected.outputData);
  if(moduleKey==="product")return <ProductWorkspace selected={selected} saving={saving} onSave={onSave} onTrace={onTrace}/>;
  if(moduleKey==="avatar")return <AvatarEditor evidence={evidence} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toAvatar(output)} onSave={(value)=>onSave(fromAvatar(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="mechanism")return <MechanismEditor evidence={evidence} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toMechanism(output)} onSave={(value)=>onSave(fromMechanism(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="beliefs")return <BeliefsEditor readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toBeliefs(output)} onSave={(value)=>onSave(fromBeliefs(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="offer")return <OfferEditor readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} value={toOffer(output)} onSave={(value)=>onSave(fromOffer(output,value))} saving={saving} onOpenTraceability={onTrace}/>;
  if(moduleKey==="landing"){
    const landingVersions:LandingVersion[]=versions.map(item=>({id:item.versionId,versionNumber:item.versionNumber,createdAt:item.createdAt,status:item.status,value:toLanding(record(item.outputData))}));
    return <LandingBuilder value={toLanding(output)} versions={landingVersions} selectedVersionId={selected.versionId} saving={saving} readOnly={selected.freshness!=="fresh"||selected.status==="superseded"||selected.status==="archived"} onSave={(value)=>onSave(fromLanding(output,value))} onSelectVersion={onSelectVersion} onExportHtml={exportLandingHtml} onOpenTraceability={onTrace}/>;
  }
  if(moduleKey==="funnel")return <FunnelAdapter output={output} onSave={onSave}/>;
  if(moduleKey==="emails")return <EmailsAdapter output={output} onSave={onSave}/>;
  if(moduleKey==="content")return <ContentAdapter output={output} onSave={onSave}/>;
  if(moduleKey==="final_product")return <ProductStudio projectId={projectId}/>;
  return null;
}

function FunnelAdapter({output,onSave}:{output:Record<string,unknown>;onSave:(value:unknown)=>Promise<boolean>}){
  const initial=toFunnel(output),[nodes,setNodes]=useState(initial);useEffect(()=>setNodes(initial),[JSON.stringify(output)]);
  const update=(node:FunnelNode)=>setNodes(current=>current.map(item=>item.id===node.id?node:item));
  return <><FunnelWorkspace nodes={nodes} onUpdate={update} onReorder={(ids)=>setNodes(ids.map(id=>nodes.find(item=>item.id===id)!).filter(Boolean))}/><SaveBar onSave={()=>onSave({...output,nodes:nodes.map(node=>({id:node.id,type:node.stage,label:node.name,description:node.description,active:node.active,linkedArtifact:node.linkedArtifact}))})}/></>;
}
function EmailsAdapter({output,onSave}:{output:Record<string,unknown>;onSave:(value:unknown)=>Promise<boolean>}){
  const initial=toEmails(output),[items,setItems]=useState(initial);useEffect(()=>setItems(initial),[JSON.stringify(output)]);
  const exportItems=(ids:string[])=>downloadText("emails.md",items.filter(item=>ids.includes(item.id)).map((item,index)=>`# Email ${index+1}: ${item.subject}\n\nDelay: ${item.delay}\n\n${item.body}\n\nCTA: ${item.cta}`).join("\n\n---\n\n"));
  return <><EmailsWorkspace emails={items} onUpdate={(item)=>setItems(current=>current.map(value=>value.id===item.id?item:value))} onReorder={(ids)=>setItems(ids.map(id=>items.find(item=>item.id===id)!).filter(Boolean))} onExport={exportItems}/><SaveBar onSave={()=>onSave({...output,sequences:items.map(item=>({type:item.name,emails:[{subject:item.subject,preheader:item.previewText,body:item.body,cta:item.cta,delay:item.delay}]}))})}/></>;
}
function ContentAdapter({output,onSave}:{output:Record<string,unknown>;onSave:(value:unknown)=>Promise<boolean>}){
  const initial=toContent(output),[items,setItems]=useState(initial);useEffect(()=>setItems(initial),[JSON.stringify(output)]);
  const exportItems=(ids:string[])=>downloadText("content.md",items.filter(item=>ids.includes(item.id)).map(item=>`# ${item.title}\n\n${item.body}`).join("\n\n---\n\n"));
  return <><ContentWorkspace items={items} onUpdate={(item)=>setItems(current=>current.map(value=>value.id===item.id?item:value))} onDuplicate={(id)=>setItems(current=>{const source=current.find(item=>item.id===id);return source?[...current,{...source,id:crypto.randomUUID(),title:`${source.title} (copia)`}]:current;})} onDelete={(id)=>setItems(current=>current.filter(item=>item.id!==id))} onExport={exportItems}/><SaveBar onSave={()=>onSave({...output,calendar:items.map((item,index)=>({day:index+1,type:item.format,hook:item.title,body:item.body,channel:item.channel}))})}/></>;
}
function SaveBar({onSave}:{onSave:()=>Promise<boolean>}){return <div className="refinement-save-bar"><span>Los cambios se guardan como una nueva versión draft.</span><button className="button primary" type="button" onClick={()=>void onSave()}>Guardar cambios</button></div>}

function TraceDialog({graph,onClose}:{graph:TraceabilityGraph;onClose:()=>void}){const artifacts=graph.nodes.filter(node=>node.kind==="artifact"),evidence=graph.nodes.filter(node=>node.kind==="evidence"),sources=graph.nodes.filter(node=>node.kind==="source");return <div className="refinement-dialog-backdrop" onMouseDown={onClose}><section className="refinement-dialog" role="dialog" aria-modal="true" aria-label="Trazabilidad" onMouseDown={event=>event.stopPropagation()}><header><div><span className="eyebrow">TRACEABILITY</span><h2>¿De dónde sale esto?</h2><p>{artifacts.length} versiones · {graph.evidenceCount} evidencias · {graph.sourceCount} fuentes</p></div><button aria-label="Cerrar" onClick={onClose}>×</button></header><div className="refinement-trace-chain">{artifacts.map(node=><article className={node.id===graph.rootId?"current":""} key={node.id}><span>{node.artifactType}</span><strong>{node.label}</strong><small>{node.status} · {node.freshness}</small></article>)}</div>{sources.length>0&&<div className="refinement-trace-sources"><h3>Fuentes</h3>{sources.map(node=><p key={node.id}><strong>{node.label}</strong> · {node.subtitle}</p>)}</div>}{evidence.length>0&&<div className="refinement-trace-evidence"><h3>Evidencia vinculada</h3>{evidence.slice(0,20).map(node=><blockquote key={node.id}>“{node.label}”<footer>{node.subtitle}</footer></blockquote>)}</div>}</section></div>}

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const strings=(value:unknown):string[]=>Array.isArray(value)?value.map(item=>typeof item==="string"?item:typeof item==="object"&&item!==null?String((item as Record<string,unknown>).text??(item as Record<string,unknown>).name??""):String(item)).filter(Boolean):[];
const text=(value:unknown)=>typeof value==="string"?value:"";
function component(value:unknown){const item=record(value);return{name:text(item.name),description:text(item.description)}}
function section(value:Record<string,unknown>,type:string){const item=(Array.isArray(value.sections)?value.sections:[]).map(record).find(entry=>entry.type===type)??{};return{eyebrow:type.toUpperCase(),headline:text(item.headline)||text(item.subheadline),body:text(item.body)}}
function toFunnel(value:Record<string,unknown>):FunnelNode[]{return (Array.isArray(value.nodes)?value.nodes:[]).map(record).map((node,index)=>({id:text(node.id)||`node-${index}`,name:text(node.label)||text(node.type),stage:text(node.type),description:text(node.description),active:node.active!==false,linkedArtifact:text(node.linkedArtifact)}))}
function toEmails(value:Record<string,unknown>):CampaignEmail[]{const result:CampaignEmail[]=[];(Array.isArray(value.sequences)?value.sequences:[]).map(record).forEach((sequence,sequenceIndex)=>(Array.isArray(sequence.emails)?sequence.emails:[]).map(record).forEach((email,index)=>result.push({id:`${sequenceIndex}-${index}`,name:text(sequence.type)||`Email ${index+1}`,subject:text(email.subject),previewText:text(email.preheader),body:text(email.body),cta:text(email.cta),delay:text(email.delay)||(index===0?"Inmediato":`+${index} día`),status:"READY"})));return result}
function toContent(value:Record<string,unknown>):CampaignContent[]{return (Array.isArray(value.calendar)?value.calendar:[]).map(record).map((item,index)=>({id:`content-${index}`,title:text(item.hook)||`Contenido ${index+1}`,format:text(item.type)||"Educational",channel:text(item.channel)||"Facebook",status:"READY",body:text(item.body),updatedAt:new Date().toISOString()}))}
function toFiles(files:GeneratedFile[],version:number):ProductFile[]{return files.map(file=>({id:file.id,name:file.fileRole.replaceAll("_"," "),format:file.format,status:"READY",sizeLabel:`${file.bytes.toLocaleString("es")} bytes`,updatedAt:file.createdAt,version}))}
function openFile(files:GeneratedFile[],id:string){const file=files.find(item=>item.id===id);if(file)window.open(file.downloadUrl,"_blank","noopener,noreferrer")}
function downloadText(name:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:"text/markdown;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url)}
function exportLandingHtml(value:LandingEditorValue){const html=renderLandingHtml(fromLanding({},value));const url=URL.createObjectURL(new Blob([html],{type:"text/html;charset=utf-8"}));const anchor=document.createElement("a");anchor.href=url;anchor.download="landing.html";anchor.click();URL.revokeObjectURL(url)}

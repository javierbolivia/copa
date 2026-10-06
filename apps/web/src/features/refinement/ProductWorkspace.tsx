import type {ModuleResult} from "@our-platform/shared";
import {useState} from "react";
import {ProductEditor} from "./ProductEditor";
import {fromProduct,toProduct} from "./product-adapter";

const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==="string"?value:"";

export function ProductWorkspace({selected,saving,readOnly=false,onSave,onTrace}:{selected:ModuleResult;saving:boolean;readOnly?:boolean;onSave:(output:unknown)=>Promise<boolean>;onTrace:()=>void}){
  const output=record(selected.outputData);
  const proposals=(Array.isArray(output.proposals)?output.proposals:[]).map(record);
  const [inspectedId,setInspectedId]=useState(text(output.selectedId)||text(proposals[0]?.id));
  const [editing,setEditing]=useState(false);
  const inspected=proposals.find(proposal=>proposal.id===inspectedId);
  const chosen=proposals.find(proposal=>proposal.id===output.selectedId);
  const writable=!readOnly&&selected.freshness==="fresh"&&(selected.status==="approved"||selected.status==="draft");
  const audit=record(output.productValidationAudit);
  const errors=Array.isArray(audit.errors)?audit.errors.filter((item):item is string=>typeof item==="string"):[];
  const unsupported=(Array.isArray(audit.unsupportedClaims)?audit.unsupportedClaims:[]).map(record);
  return <>
    <section className="detail-card" aria-label="Decisión de producto">
      <h2>Producto seleccionado: {text(chosen?.name)||"Sin selección válida"}</h2>
      <p>Define qué recibirá el cliente y qué resultado se propone. Las citas respaldan el problema; no prueban la eficacia de la solución ni autorizan garantías.</p>
      <p>{selected.status==="draft"?"Selección en borrador: requiere aprobación antes de sustituir el producto activo.":"Esta selección pertenece a la versión que estás consultando."}</p>
      <label>Propuesta que estás revisando<select value={inspectedId} disabled={saving||editing} onChange={event=>setInspectedId(event.target.value)}>{proposals.map(proposal=><option value={text(proposal.id)} key={text(proposal.id)}>{text(proposal.name)||"Sin nombre"}</option>)}</select></label>
      {writable&&inspected&&inspectedId!==output.selectedId&&<button className="button secondary" type="button" disabled={saving} onClick={()=>void onSave({...output,selectedId:inspectedId})}>Guardar selección como borrador</button>}
      {!writable&&<p role="status">Versión histórica u obsoleta: consulta sus datos y actualiza primero las dependencias antes de regenerar.</p>}
      <p>Editar y guardar registra tus decisiones explícitas sobre el producto; revisa especialmente promesas, servicios, acceso y garantías antes de aprobar.</p>
    </section>
    <section className="detail-card" aria-label="Validación de Producto">
      <h3>{audit.ok===true?"Contrato y referencias verificados":audit.ok===false?"Producto pendiente de corrección":"Sin auditoría registrada"}</h3>
      {errors.length>0&&<ul>{errors.map((error,index)=><li key={index}>{error==="Product contains unsupported commercial or operational claims"?"Hay promesas o servicios sin autorización explícita en el contexto de esta versión.":error==="Product references evidence outside the generation snapshot"?"La generación usó referencias ajenas a la evidencia disponible.":error}</li>)}</ul>}
      {unsupported.length>0&&<details><summary>Revisar afirmaciones sin respaldo ({unsupported.length})</summary>{unsupported.map((claim,index)=><blockquote key={index}><p>{text(claim.claim)}</p><footer>{text(claim.path)} · {text(claim.category)}</footer></blockquote>)}</details>}
      <p>La validación técnica no certifica resultados comerciales. Aprobar habilita esta definición para los módulos posteriores.</p>
    </section>
    {inspected&&<ProductEditor key={inspectedId} value={toProduct({...output,selectedId:inspectedId})} onSave={value=>onSave(fromProduct(output,value))} saving={saving} readOnly={!writable||inspectedId!==output.selectedId} onEditingChange={setEditing} onOpenTraceability={onTrace}/>}
  </>;
}

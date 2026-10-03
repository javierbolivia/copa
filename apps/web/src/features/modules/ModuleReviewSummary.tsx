import type {ModuleKey,ModuleResult} from "@our-platform/shared";
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
export const reviewStateLabel=(value:string)=>({approved:"Aprobada",draft:"Borrador",superseded:"Reemplazada",archived:"Archivada",fresh:"Vigente",stale:"Requiere revisión"}[value]??value);
export function ModuleReviewSummary({moduleKey,selected,versionCount,evidenceCount}:{moduleKey:ModuleKey;selected:ModuleResult;versionCount:number;evidenceCount:number}){
  const output=record(selected.outputData),audit=record(output[moduleKey==="research"?"validationAudit":`${moduleKey}ValidationAudit`]);
  const items=Array.isArray(output.items)?output.items:[];
  const auditLabel=moduleKey==="avatar"
    ?audit.ok===true?"Formato y citas válidos; sentido por revisar":audit.ok===false?"Citas o estructura por corregir":"Sin auditoría registrada"
    :audit.ok===true?"Contrato verificado":audit.ok===false?"Requiere corrección":moduleKey==="problems"?`${items.length} problemas admitidos`:moduleKey==="opportunities"?(items.every(item=>Object.keys(record(record(item).scores)).length===9)&&items.length?"9 criterios disponibles":"Histórico sin scores completos"):"Sin auditoría registrada";
  return <section className={`review-summary ${selected.freshness==="stale"?"needs-review":""}`} aria-label="Estado y trazabilidad de la versión">
    <div className="review-summary-heading"><div><span className="eyebrow">ESTADO DEL DOCUMENTO</span><h2>Versión {selected.versionNumber} <span className={`status-pill ${selected.freshness}`}>{reviewStateLabel(selected.freshness)}</span></h2></div><div><strong>{reviewStateLabel(selected.status)}</strong><time dateTime={selected.createdAt}>Fecha de la versión: {new Date(selected.createdAt).toLocaleString("es")}</time></div></div>
    <dl className="review-summary-metrics"><div><dt>Historial conservado</dt><dd>{versionCount} {versionCount===1?"versión":"versiones"}</dd></div><div><dt>Referencias vinculadas</dt><dd>{evidenceCount} {evidenceCount===1?"cita":"citas"}</dd></div><div><dt>{moduleKey==="avatar"?"Alcance de auditoría":"Revisión del contenido"}</dt><dd>{auditLabel}</dd></div></dl>
    {moduleKey==="avatar"&&<p className="review-next-step"><strong>Revisión necesaria:</strong> esta auditoría comprueba el formato y que las citas pertenezcan a la muestra; no determina si cada cita respalda semánticamente su afirmación. Revisa el borrador antes de aprobarlo.</p>}
    {selected.freshness==="stale"&&<p className="review-next-step"><strong>Antes de continuar:</strong> revisa las fuentes y dependencias anteriores. Esta versión conserva sus datos y su fecha original.</p>}
  </section>;
}

export function StrategyEmptyState({moduleKey}:{moduleKey:"avatar"|"mechanism"}){
  const avatar=moduleKey==="avatar";
  const groups=avatar?["Situación actual","Resultado deseado","Dolores","Frustraciones","Deseos","Objeciones","Motivaciones","Lenguaje textual","Preocupaciones de compra"]:["Problema percibido","Causa aparente","Hipótesis de causa raíz","Mecanismo de solución","Diferenciación","Explicación breve y detallada"];
  return <section className="strategy-empty" aria-label={avatar?"Preparar Avatar":"Preparar Mecanismo"}>
    <header><span className="status-pill">Sin versiones guardadas</span><span className="eyebrow">{avatar?"PERFIL DEL CLIENTE":"HIPÓTESIS DE SOLUCIÓN"}</span><h2>{avatar?"Comprende a quién ayudas":"Explica cómo podría ayudar la solución"}</h2><p>{avatar?"Un perfil que separa lo que las personas dicen de lo que todavía necesitas contrastar.":"Relaciona el problema observado con una causa propuesta y un proceso concreto, sin presentar hipótesis como eficacia demostrada."}</p></header>
    <div className="strategy-empty-grid"><article><span className="eyebrow">01 · PUNTO DE PARTIDA</span><h3>{avatar?"Problemas + Producto":"Problemas + Producto + Avatar"}</h3><p>Se necesitan versiones vigentes de estos módulos. Generar comprobará sus dependencias; abrir esta pantalla no crea datos.</p></article><article><span className="eyebrow">02 · CONTENIDO DEL DOCUMENTO</span><h3>{avatar?"Nueve dimensiones del perfil":"Del problema al proceso"}</h3><ul className="strategy-field-chips">{groups.map(label=><li key={label}>{label}</li>)}</ul></article><article><span className="eyebrow">03 · REVISIÓN Y EVIDENCIA</span><h3>{avatar?"Citas e inferencias separadas":"Contexto, límites y validación"}</h3><p>{avatar?"Las citas literales conservan su origen. Una afirmación que reescribas se convierte en inferencia para contrastar.":"Las citas explican el problema, no prueban la solución. Pasos, alternativas y plan de validación se revisan por separado."}</p><p>Los cambios se guardan como borrador y se aprueban de forma explícita. El historial anterior se conserva.</p></article></div>
    <footer>Cuando las dependencias estén listas, usa <strong>Generar con Demo</strong> arriba para crear un ejemplo, o elige un proveedor configurado para generar con IA.</footer>
  </section>;
}

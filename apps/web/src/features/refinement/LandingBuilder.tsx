import {lazy,Suspense,useEffect,useState} from "react";
import {
  renderLandingHtml,
  renderLandingReactCode,
  LANDING_THEME_PRESETS,
  CANONICAL_LANDING_LABELS,
  type CanonicalLandingBlockType,
  type LandingContentSection,
  type LandingDesignTokens
} from "@our-platform/shared";
import {Field} from "./EditorScaffold";
import {fromLanding} from "./landing-adapter";
import type {LandingEditorValue,LandingPreviewMode,LandingVersion} from "./types";
import "./refinement.css";

export interface LandingBuilderProps {
  value:LandingEditorValue;
  versions:LandingVersion[];
  selectedVersionId?:string|undefined;
  saving?:boolean|undefined;
  exporting?:boolean|undefined;
  readOnly?:boolean|undefined;
  onSave:(value:LandingEditorValue)=>void|boolean|Promise<void|boolean>;
  onSelectVersion?:((versionId:string)=>void)|undefined;
  onExportHtml:(value:LandingEditorValue)=>void|Promise<void>;
  onExportReact?:((value:LandingEditorValue)=>void|Promise<void>)|undefined;
  onRegenerate?:((instructions?:string)=>void|Promise<void>)|undefined;
  onOpenTraceability?:((field:string)=>void)|undefined;
}

const LandingVisualEditor=lazy(()=>import("./LandingVisualEditor"));

const labels:Record<string,string>={
  hero:"Apertura (Hero)",
  problem:"Problema",
  agitation:"Agitación",
  mechanism:"Solución / Mecanismo",
  benefits:"Beneficios",
  product:"Producto",
  deliverables:"Entregables",
  bonuses:"Bonos",
  proof:"Prueba y Evidencia",
  objections:"Objeciones",
  faq:"FAQ",
  offer:"Oferta",
  guarantee:"Garantía",
  cta:"Llamada a la Acción",
  footer:"Pie de Página"
};

const text=(value:unknown)=>typeof value==="string"?value:"";

function blockRegenerationContent(type:string,current:LandingContentSection):Partial<LandingContentSection>{
  switch(type){
    case "hero":
      return {
        eyebrow:"NUEVA PROPUESTA ACCIONABLE",
        headline:"Transforma tu enfoque con una secuencia validada paso a paso",
        subheadline:"Elimina la improvisación y aplica un método comprobado desde el primer día.",
        cta:"Comenzar de inmediato"
      };
    case "problem":
      return {
        eyebrow:"EL OBSTÁCULO REAL",
        headline:"El ciclo de prueba y error te está costando tiempo valioso",
        body:"La mayoría de intentos fallan no por falta de esfuerzo, sino por no contar con una secuencia clara de ejecución."
      };
    case "agitation":
      return {
        eyebrow:"CONSECUENCIAS",
        headline:"Lo que ocurre si continúas postergando la decisión",
        body:"Cada semana sin una metodología estructurada aumenta el desgaste y aleja los resultados que buscas.",
        items:["Pérdida de foco en tareas secundarias.","Sensación constante de estar empezando de cero.","Resultados impredecibles que no se pueden escalar."]
      };
    case "mechanism":
      return {
        eyebrow:"EL MÉTODO",
        headline:"Un proceso verificable en 4 fases concretas",
        subheadline:"De la claridad conceptual a la implementación práctica sin fricción.",
        body:"1. Diagnóstico objetivo. 2. Selección de palancas críticas. 3. Ejecución directa. 4. Medición continua.",
        items:[
          {name:"Fase 1: Diagnóstico de precisión",description:"Identifica exactamente qué ajustar sin perder tiempo."},
          {name:"Fase 2: Plan de acción inmediato",description:"Pasos ordenados por impacto y facilidad de ejecución."},
          {name:"Fase 3: Implementación guiada",description:"Uso de recursos y plantillas listas para aplicar."},
          {name:"Fase 4: Consolidación",description:"Asegura que los resultados sean sostenibles en el tiempo."}
        ]
      };
    case "benefits":
      return {
        eyebrow:"VENTAJAS DIRECTAS",
        headline:"Lo que vas a lograr de forma tangible",
        items:[
          {name:"Ahorro masivo de tiempo",description:"Elimina semanas de dudas con una ruta clara."},
          {name:"Decisiones fundamentadas",description:"Avanza sabiendo exactamente por qué cada paso funciona."},
          {name:"Control total del proceso",description:"Métricas observables para evaluar tu progreso real."}
        ]
      };
    case "product":
      return {
        headline:current.headline||"Sistema Integral de Implementación",
        subheadline:"El conjunto completo de herramientas, guías y estrategias para dominar tu área.",
        body:"Estructurado en módulos progresivos pensados para aplicar inmediatamente.",
        items:[
          {name:"Módulo 1: Fundamentos y Estrategia",description:"La base necesaria para no cometer los errores típicos."},
          {name:"Módulo 2: Secuencia Operativa",description:"Paso a paso detallado con ejemplos reales."},
          {name:"Módulo 3: Optimización Avanzada",description:"Cómo mantener y escalar los resultados logrados."}
        ]
      };
    case "deliverables":
      return {
        headline:"Todos los materiales que recibirás",
        items:[
          {name:"Guía de Estudio y Ejecución",description:"Manual completo con explicaciones directas y sin relleno."},
          {name:"Cuadernos de Trabajo (Workbooks)",description:"Ejercicios prácticos para completar tu propio plan."},
          {name:"Plantillas y Listas de Cotejo",description:"Recursos descargables listos para usar."}
        ]
      };
    case "bonuses":
      return {
        eyebrow:"REGALOS DE ACCIÓN RÁPIDA",
        headline:"Bonos exclusivos incluidos con tu acceso",
        items:[
          {name:"Bono 1: Sesión de Preguntas Frecuentes",description:"Respuestas a los casos más comunes de implementación."},
          {name:"Bono 2: Plantilla Rápida de Lanzamiento",description:"Acelera tu puesta en marcha en menos de 24 horas."}
        ]
      };
    case "proof":
      return {
        eyebrow:"EVIDENCIA",
        headline:"Principios respaldados por investigación y validación de campo",
        body:"Cada herramienta y concepto incluido ha sido contrastado con necesidades reales observadas en el mercado."
      };
    case "objections":
      return {
        eyebrow:"RESOLVIENDO TUS DUDAS",
        headline:"Lo que necesitas saber antes de dar el paso",
        items:[
          {q:"¿Cuánto tiempo necesito para leer y aplicar el libro?",a:"El ebook está diseñado para avanzar en lecturas y prácticas de 20 minutos al día."},
          {q:"¿Es aplicable si nunca antes he hecho esto?",a:"Sí, parte desde los fundamentos y cada paso incluye instrucciones paso a paso."}
        ]
      };
    case "faq":
      return {
        eyebrow:"PREGUNTAS FRECUENTES",
        headline:"Respuestas rápidas a preguntas habituales",
        items:[
          {q:"¿El acceso es inmediato?",a:"Sí, tan pronto confirmes tu compra recibirás acceso de descarga digital a todo el libro y complementos."},
          {q:"¿Los materiales son descargables?",a:"El libro en PDF y EPUB, junto con plantillas y hojas de trabajo, se descargan para leer offline."},
          {q:"¿Qué nivel técnico requiere?",a:"Ninguno: el libro explica la metodología desde cero con casos claros."}
        ]
      };
    case "offer":
      return {
        eyebrow:"OFERTA ESPECIAL",
        headline:"Accede al Ebook completo hoy mismo",
        subheadline:"Invierte en una solución comprobada con todos los entregables y bonos digitales incluidos.",
        cta:"Comprar el Ebook ahora"
      };
    case "guarantee":
      return {
        eyebrow:"RIESGO CERO",
        headline:"Garantía de satisfacción incondicional",
        body:"Prueba el material durante los primeros días. Si sientes que no te aporta un valor tangible y una ruta clara, dispones de una política de satisfacción total."
      };
    case "cta":
      return {
        headline:"No dejes pasar otro día sin un plan claro",
        subheadline:"Da el primer paso hacia una ejecución estructurada y resultados predecibles.",
        cta:"Comenzar hoy mismo"
      };
    case "footer":
      return {
        body:`© ${new Date().getFullYear()} Todos los derechos reservados. Información presentada con fines educativos y de implementación.`
      };
    default:
      return {};
  }
}

export function LandingBuilder({
  value,
  versions,
  selectedVersionId,
  saving=false,
  exporting=false,
  readOnly=false,
  onSave,
  onSelectVersion,
  onExportHtml,
  onExportReact,
  onRegenerate,
  onOpenTraceability
}:LandingBuilderProps){
  const [visual,setVisual]=useState(false);
  const [draft,setDraft]=useState(()=>structuredClone(value));
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [mode,setMode]=useState<LandingPreviewMode>("desktop");
  const [compareId,setCompareId]=useState("");
  const [newType,setNewType]=useState("faq");
  const [showRegenPrompt,setShowRegenPrompt]=useState(false);
  const [regenInstruction,setRegenInstruction]=useState("");
  const [regenerating,setRegenerating]=useState(false);

  useEffect(()=>{if(!editing)setDraft(structuredClone(value));},[value,editing]);
  const shown=editing?draft:value;
  const section=draft.sections[index];
  const comparison=versions.find(item=>item.id===compareId);

  const replace=(updated:LandingContentSection)=>setDraft(current=>({
    ...current,
    sections:current.sections.map((item,i)=>i===index?updated:item)
  }));

  const move=(delta:number)=>{
    const target=index+delta;
    if(target<0||target>=draft.sections.length)return;
    const sections=[...draft.sections];
    [sections[index],sections[target]]=[sections[target]!,sections[index]!];
    setDraft({...draft,sections});
    setIndex(target);
  };

  const save=async()=>{
    setError(null);
    try{
      if(await onSave(structuredClone(draft))===false){
        setError("No se guardó el borrador. Tus cambios permanecen en el editor.");
        return;
      }
      setEditing(false);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"No se pudo guardar. Tus cambios permanecen en el editor.");
    }
  };

  const handleExportReact=()=>{
    if(onExportReact){
      void onExportReact(shown);
    }else{
      const code=renderLandingReactCode(fromLanding({},shown));
      const url=URL.createObjectURL(new Blob([code],{type:"text/typescript;charset=utf-8"}));
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download="landing.tsx";
      anchor.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleRegenerateBlock=()=>{
    if(!section)return;
    const fresh=blockRegenerationContent(section.type,section);
    replace({...section,...fresh});
  };

  const handleRunRegenerateFull=async()=>{
    if(!onRegenerate)return;
    setShowRegenPrompt(false);
    setRegenerating(true);
    setError(null);
    try{
      await onRegenerate(regenInstruction.trim()||undefined);
    }catch(err){
      setError(err instanceof Error?err.message:"Error al regenerar la landing.");
    }finally{
      setRegenerating(false);
    }
  };

  return <section className="rf-landing-builder">
    <header className="rf-landing-toolbar">
      <div>
        <span className="rf-eyebrow">DOCUMENTO Y VISTA PREVIA</span>
        <h2>{value.pageName||"Landing sin título"}</h2>
        <p>15 bloques canónicos, diseño con tokens/themes y generación con IA. Puck disponible para refinamiento visual libre.</p>
      </div>
      <div className="rf-actions">
        {onRegenerate&&<button className="rf-button" disabled={readOnly||regenerating||saving} onClick={()=>setShowRegenPrompt(true)} title="Regenerar con IA usando una instrucción corta">
          {regenerating?"Generando con IA…":"⚡ Regenerar con IA"}
        </button>}
        <button className="rf-button rf-button--primary" disabled={readOnly||editing} onClick={()=>setVisual(true)}>
          Abrir constructor visual (Puck)
        </button>
        {editing?<><button className="rf-button" disabled={saving} onClick={()=>{setDraft(structuredClone(value));setEditing(false);setError(null);}}>Cancelar</button><button className="rf-button rf-button--primary" disabled={saving} onClick={()=>void save()}>{saving?"Guardando…":"Guardar borrador"}</button></>:<button className="rf-button" disabled={readOnly} onClick={()=>setEditing(true)}>Editar</button>}
        <button className="rf-button" disabled={exporting} onClick={()=>void onExportHtml(shown)}>
          Exportar HTML
        </button>
        <button className="rf-button rf-button--primary" disabled={exporting} onClick={handleExportReact} title="Descargar componente React independiente (sin Puck)">
          Exportar React (.tsx)
        </button>
      </div>
    </header>

    {showRegenPrompt&&<div className="refinement-dialog-backdrop" onMouseDown={()=>setShowRegenPrompt(false)}>
      <section className="refinement-dialog" role="dialog" aria-modal="true" aria-label="Regenerar landing" onMouseDown={e=>e.stopPropagation()}>
        <header>
          <div>
            <span className="rf-eyebrow">GENERACIÓN AUTOMÁTICA CON IA</span>
            <h2>Regenerar toda la Landing</h2>
            <p>Hallazia recopila todo el contexto aprobado del proyecto (Investigación, Problemas, Producto, Avatar, Mecanismo, Creencias y Oferta).</p>
          </div>
          <button aria-label="Cerrar" onClick={()=>setShowRegenPrompt(false)}>×</button>
        </header>
        <div style={{padding:"20px 0"}}>
          <label style={{display:"block",fontWeight:700,marginBottom:"8px"}}>
            Instrucción para la IA (opcional):
            <textarea
              rows={3}
              value={regenInstruction}
              onChange={e=>setRegenInstruction(e.target.value)}
              placeholder="Ej: Crea una landing premium de alta conversión para vender este ebook con tono directo y enfocado en profesionales."
              style={{width:"100%",marginTop:"6px",padding:"10px",borderRadius:"8px",border:"1px solid #cbd5e1",boxSizing:"border-box"}}
            />
          </label>
          <small style={{display:"block",color:"#64748b"}}>Prioriza nuestro proveedor Gemini configurado (Free Tier / gemini-3.5-flash-lite).</small>
        </div>
        <div style={{display:"flex",gap:"12px",justifyContent:"flex-end"}}>
          <button className="rf-button" onClick={()=>setShowRegenPrompt(false)}>Cancelar</button>
          <button className="rf-button rf-button--primary" onClick={()=>void handleRunRegenerateFull()}>Generar ahora</button>
        </div>
      </section>
    </div>}

    {visual&&<Suspense fallback={<p role="status">Cargando constructor visual…</p>}><LandingVisualEditor value={value} onSave={onSave} saving={saving} onClose={()=>setVisual(false)}/></Suspense>}
    {error&&<p role="alert" className="refinement-feedback">{error}</p>}

    <div className="rf-landing-meta">
      <label>Versión
        <select value={selectedVersionId??""} disabled={!onSelectVersion||editing||saving} onChange={event=>onSelectVersion?.(event.target.value)}>
          {!selectedVersionId&&<option value="">Actual</option>}
          {versions.map(version=><option key={version.id} value={version.id}>v{version.versionNumber} · {new Date(version.createdAt).toLocaleString("es")}</option>)}
        </select>
      </label>
      <label>Comparar con
        <select value={compareId} onChange={event=>setCompareId(event.target.value)}>
          <option value="">Sin comparación</option>
          {versions.filter(version=>version.id!==selectedVersionId).map(version=><option key={version.id} value={version.id}>v{version.versionNumber} · {new Date(version.createdAt).toLocaleDateString("es")}</option>)}
        </select>
      </label>
      <div className="rf-preview-toggle" role="group" aria-label="Tamaño de vista previa">
        <button className={mode==="desktop"?"is-active":""} aria-pressed={mode==="desktop"} onClick={()=>setMode("desktop")}>Escritorio</button>
        <button className={mode==="mobile"?"is-active":""} aria-pressed={mode==="mobile"} onClick={()=>setMode("mobile")}>Móvil</button>
      </div>
    </div>

    {comparison&&<aside className="rf-version-comparison"><strong>Comparación con v{comparison.versionNumber}</strong><p>{JSON.stringify(value)===JSON.stringify(comparison.value)?"Mismo contenido y estilo.":"Hay diferencias en el documento. Consulta cada versión desde el selector; sus fechas originales se conservan."}</p></aside>}

    <div className="rf-landing-grid">
      <div className="rf-landing-editor">
        <nav aria-label="Secciones de la landing">
          <button className={index===-1?"is-active":""} onClick={()=>setIndex(-1)}>🎨 Estilo y Tokens</button>
          {draft.sections.map((item,i)=><button key={i} className={index===i?"is-active":""} onClick={()=>setIndex(i)}>
            {i+1}. {labels[item.type]??item.type} {item.enabled===false?"(oculto)":""}
          </button>)}
        </nav>
        <div className="rf-landing-editor__panel">
          {index===-1?<LandingStyleEditor value={draft} editing={editing} onChange={setDraft}/>:section?<><div className="rf-field-stack">
            <div style={{display:"flex",alignItems:"center",gap:"12px",justifyContent:"space-between",flexWrap:"wrap"}}>
              <span className="rf-eyebrow">{labels[section.type]??section.type}</span>
              {editing&&<label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",cursor:"pointer"}}>
                <input type="checkbox" checked={section.enabled!==false} onChange={e=>replace({...section,enabled:e.target.checked})}/>
                Visible en página
              </label>}
            </div>

            {editing&&<div className="rf-actions" style={{marginBottom:"12px"}}>
              <button className="rf-button" disabled={index===0} onClick={()=>move(-1)}>Subir</button>
              <button className="rf-button" disabled={index===draft.sections.length-1} onClick={()=>move(1)}>Bajar</button>
              <button className="rf-button" onClick={handleRegenerateBlock} title="Generar una variación de copy para este bloque sin tocar los demás">
                ⚡ Regenerar bloque
              </button>
              <button className="rf-button" onClick={()=>{setDraft({...draft,sections:draft.sections.filter((_,i)=>i!==index)});setIndex(Math.max(0,index-1));}}>
                Retirar bloque
              </button>
            </div>}

            {([["eyebrow","Antetítulo"],["headline","Título"],["subheadline","Subtítulo"],["body","Cuerpo"],["cta","Texto del botón"]] as const).map(([key,label])=><Field key={key} label={label} value={text(section[key])} editing={editing} multiline={key!=="eyebrow"&&key!=="cta"} onChange={content=>replace({...section,[key]:content})}/>)}
            <LandingItems section={section} editing={editing} onChange={replace}/>
            {onOpenTraceability&&<button className="rf-button" onClick={()=>onOpenTraceability(`sections.${index}`)}>Ver origen de la versión</button>}
          </div></>:<p>No hay una sección seleccionada.</p>}

          {editing&&<div className="landing-add-section">
            <label>Añadir bloque
              <select value={newType} onChange={event=>setNewType(event.target.value)}>
                {Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <button className="rf-button" onClick={()=>{
              const created:LandingContentSection={id:`${newType}-${Date.now()}`,type:newType,enabled:true,...blockRegenerationContent(newType,{type:newType})};
              setDraft({...draft,sections:[...draft.sections,created]});
              setIndex(draft.sections.length);
            }}>
              Añadir bloque
            </button>
          </div>}
        </div>
      </div>

      <div className="rf-preview-stage">
        <p className="form-hint">{editing?"Vista previa de los cambios sin guardar":"Vista previa de la versión guardada"} · Sin publicación ni checkout.</p>
        <div className={`rf-preview-frame rf-preview-frame--${mode}`}>
          <LandingPreview value={shown}/>
        </div>
      </div>
    </div>
  </section>;
}

function LandingItems({section,editing,onChange}:{section:LandingContentSection;editing:boolean;onChange:(value:LandingContentSection)=>void}){
  const items=section.items??[];
  const update=(index:number,value:string|Record<string,unknown>)=>onChange({...section,items:items.map((item,i)=>i===index?value:item)});
  return <div className="rf-field-stack">
    <h3>{section.type==="faq"||section.type==="objections"?"Preguntas y respuestas / Objeciones":"Elementos del bloque"}</h3>
    {items.length===0&&!editing&&<p className="form-hint">Sin elementos registrados.</p>}
    {items.map((item,i)=><article className="landing-item" key={i}>
      {typeof item==="string"?<Field label={`Elemento ${i+1}`} value={item} editing={editing} multiline onChange={content=>update(i,content)}/>:<>{(item.q!==undefined||section.type==="faq"||section.type==="objections"?[["q",section.type==="objections"?"Objeción":"Pregunta"],["a","Respuesta"]]:[["name","Nombre / Título"],["description","Descripción"]]).map(([key,label])=><Field key={key} label={`${label} ${i+1}`} value={text(item[key!])} editing={editing} multiline onChange={content=>update(i,{...item,[key!]:content})}/>)}</>}
      {editing&&<button className="rf-button" onClick={()=>onChange({...section,items:items.filter((_,j)=>i!==j)})}>Eliminar elemento {i+1}</button>}
    </article>)}
    {editing&&<button className="rf-button" onClick={()=>onChange({...section,items:[...items,section.type==="faq"||section.type==="objections"?{q:"",a:""}:{name:"",description:""}]})}>
      Añadir elemento
    </button>}
  </div>;
}

function LandingStyleEditor({value,editing,onChange}:{value:LandingEditorValue;editing:boolean;onChange:(value:LandingEditorValue)=>void}){
  const tokens=value.designTokens;
  const setToken=(key:keyof LandingDesignTokens,content:string)=>onChange({...value,designTokens:{...tokens,[key]:content}});
  const applyTheme=(themeKey:string)=>{
    const preset=LANDING_THEME_PRESETS[themeKey];
    if(preset)onChange({...value,designTokens:{...tokens,...preset,theme:themeKey}});
  };

  return <div className="rf-field-stack">
    <Field label="Nombre de la página" value={value.pageName} editing={editing} onChange={pageName=>onChange({...value,pageName})}/>
    <Field label="Nota al pie" value={value.footerNote} editing={editing} multiline onChange={footerNote=>onChange({...value,footerNote})}/>

    <h3>Temas de diseño predefinidos</h3>
    <p className="form-hint">Cambia colores, tipografía y estilo sin perder ningún contenido ni bloque.</p>
    <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"16px"}}>
      {([["modern","Moderno (Azul cobalto)"],["warm","Cálido (Ámbar / Serif)"],["dark","Oscuro / Tech (Cian)"],["editorial","Editorial (Esmeralda / Serif)"],["minimal","Minimal (Negro / Blanco)"]] as const).map(([key,label])=>(
        <button
          key={key}
          type="button"
          className={`rf-button ${tokens.theme===key?"rf-button--primary":""}`}
          disabled={!editing}
          onClick={()=>applyTheme(key)}
        >
          {label}
        </button>
      ))}
    </div>

    <h3>Ajustes manuales de estilo</h3>
    {([["accent","Color de acento"],["background","Color de fondo"],["text","Color del texto"]] as const).map(([key,label])=><label key={key}>{label}<input aria-label={label} type="color" value={tokens[key]} disabled={!editing} onChange={event=>setToken(key,event.target.value)}/></label>)}
    <label>Tipografía
      <select disabled={!editing} value={tokens.font} onChange={event=>setToken("font",event.target.value)}>
        <option value="sans">Sans serif</option>
        <option value="serif">Serif editorial</option>
      </select>
    </label>
    <label>Ancho
      <select disabled={!editing} value={tokens.width} onChange={event=>setToken("width",event.target.value)}>
        <option value="compact">Lectura compacta (880px)</option>
        <option value="wide">Amplio (1160px)</option>
      </select>
    </label>
    <label>Espaciado
      <select disabled={!editing} value={tokens.spacing} onChange={event=>setToken("spacing",event.target.value)}>
        <option value="compact">Compacto</option>
        <option value="relaxed">Amplio</option>
      </select>
    </label>
  </div>;
}

export function LandingPreview({value}:{value:LandingEditorValue;onOpenTraceability?:((field:string)=>void)|undefined}){
  return <iframe title="Vista previa de landing" sandbox="" srcDoc={renderLandingHtml(fromLanding({},value))} style={{width:"100%",height:760,border:0,background:value.designTokens.background}}/>;
}

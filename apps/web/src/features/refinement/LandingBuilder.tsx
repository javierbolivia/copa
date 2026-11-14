import {lazy,Suspense,useEffect,useMemo,useRef,useState} from "react";
import {
  auditLandingQuality,
  landingCheckoutUrl,
  renderLandingHtml,
  renderLandingReactCode,
  LANDING_THEME_PRESETS,
  CANONICAL_LANDING_LABELS,
  type CanonicalLandingBlockType,
  type LandingContentSection,
  type LandingDesignTokens
} from "@our-platform/shared";
import {Field} from "./EditorScaffold";
import {api,type ProductAsset} from "../../api/client";
import {useRequestGuard} from "../../api/useRequestGuard";
import {applyLandingSectionImage,createLandingSectionId,fromLanding,withStableLandingSectionIds} from "./landing-adapter";
import {LandingStudioPro} from "./LandingStudioPro";
import type {LandingEditorValue,LandingPreviewMode,LandingVersion} from "./types";
import "./refinement.css";

export interface LandingBuilderProps {
  projectId:string;
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

export function LandingBuilder({
  projectId,
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
  const [studioPro,setStudioPro]=useState(false);
  const [draft,setDraft]=useState(()=>withStableLandingSectionIds(structuredClone(value)));
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [index,setIndex]=useState(0);
  const [mode,setMode]=useState<LandingPreviewMode>("desktop");
  const [compareId,setCompareId]=useState("");
  const [newType,setNewType]=useState("faq");
  const [showRegenPrompt,setShowRegenPrompt]=useState(false);
  const [regenInstruction,setRegenInstruction]=useState("");
  const [regenerating,setRegenerating]=useState(false);
  const [assets,setAssets]=useState<ProductAsset[]>([]);
  const [uploading,setUploading]=useState(false);
  const [imageConfigured,setImageConfigured]=useState<boolean|null>(null);
  const [imagePrompt,setImagePrompt]=useState("");
  const [imageAspectRatio,setImageAspectRatio]=useState<"16:9"|"4:3"|"1:1">("16:9");
  const [generatingImage,setGeneratingImage]=useState(false);
  const imageRequests=useRequestGuard(`${projectId}:${selectedVersionId??""}`);

  useEffect(()=>{
    imageRequests.invalidate();
    setDraft(withStableLandingSectionIds(structuredClone(value)));
    const shouldAutoOpen =
      typeof window !== "undefined" &&
      (window.sessionStorage.getItem("hallazia:open-studio-pro") === "1" ||
        new URLSearchParams(window.location.search).get("studio") === "pro");
    if (shouldAutoOpen && typeof window !== "undefined") {
      window.sessionStorage.removeItem("hallazia:open-studio-pro");
    }
    setEditing(false);setVisual(false);setStudioPro(shouldAutoOpen);setIndex(0);setCompareId("");setError(null);setImagePrompt("");
    setUploading(false);setGeneratingImage(false);
  },[projectId,selectedVersionId]);

  useEffect(()=>{
    const handleOpenStudio = () => {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("hallazia:open-studio-pro");
      }
      setVisual(false);
      setStudioPro(true);
    };
    window.addEventListener("hallazia:open-studio-pro", handleOpenStudio);
    return () => window.removeEventListener("hallazia:open-studio-pro", handleOpenStudio);
  },[]);
  useEffect(()=>setAssets([]),[projectId]);

  useEffect(()=>{let current=true;void api.productAssets(projectId).then(result=>{if(current)setAssets(result.assets.filter(asset=>asset.kind==="image"));}).catch(()=>{});return()=>{current=false;};},[projectId]);
  useEffect(()=>{let current=true;setImageConfigured(null);void api.landingImageStatus(projectId).then(result=>{if(current)setImageConfigured(result.configured);}).catch(()=>{if(current)setImageConfigured(false);});return()=>{current=false;};},[projectId]);

  useEffect(()=>{if(!editing)setDraft(withStableLandingSectionIds(structuredClone(value)));},[value,editing]);
  const shown=editing?draft:value;
  const liveQuality=useMemo(()=>auditLandingQuality(fromLanding({},shown)),[shown]);
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
    imageRequests.invalidate();
    const current=imageRequests.begin();
    setUploading(false);setGeneratingImage(false);
    setError(null);
    try{
      if(await onSave(structuredClone(draft))===false){
        if(!current())return;
        setError("No se guardó el borrador. Tus cambios permanecen en el editor.");
        return;
      }
      if(!current())return;
      setEditing(false);
    }catch(reason){
      if(current())setError(reason instanceof Error?reason.message:"No se pudo guardar. Tus cambios permanecen en el editor.");
    }
  };

  const uploadImage=(file:File)=>{
    if(saving||!section?.id)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){setError("Usa PNG, JPEG o WebP para la imagen.");return;}
    const targetId=section.id;
    const current=imageRequests.begin();
    setUploading(true);setError(null);
    const reader=new FileReader();
    reader.onerror=()=>{if(current()){setUploading(false);setError("No se pudo leer la imagen.");}};
    reader.onload=()=>{if(!current())return;void api.uploadProductAsset(projectId,{title:file.name.replace(/\.[^.]+$/,""),filename:file.name,mimeType:file.type,contentBase64:String(reader.result).split(",")[1]??""}).then(asset=>{if(!current())return;setAssets(assets=>[asset,...assets]);setDraft(draft=>({...draft,sections:applyLandingSectionImage(draft.sections,targetId,asset.url,file.name.replace(/\.[^.]+$/,"" ))}));}).catch(reason=>{if(current())setError(reason instanceof Error?reason.message:"No se pudo guardar la imagen.");}).finally(()=>{if(current())setUploading(false);});};
    reader.readAsDataURL(file);
  };

  const generateImage=async()=>{
    if(saving||generatingImage||uploading||!imageConfigured||!section?.id||imagePrompt.trim().length<12)return;
    const targetId=section.id,prompt=imagePrompt.trim(),title=`Landing · ${section.headline||section.type}`.slice(0,160);
    const current=imageRequests.begin();
    setGeneratingImage(true);setError(null);
    try{
      const asset=await api.generateLandingImage(projectId,{title,prompt,aspectRatio:imageAspectRatio});
      if(!current())return;
      setAssets(assets=>[asset,...assets]);
      setDraft(draft=>({...draft,sections:applyLandingSectionImage(draft.sections,targetId,asset.url,prompt.slice(0,160))}));
    }catch(reason){if(current())setError(reason instanceof Error?reason.message:"Gemini no pudo generar la imagen.");}
    finally{if(current())setGeneratingImage(false);}
  };

  const exportReactValue=(target:LandingEditorValue)=>{
    if(onExportReact){
      void onExportReact(target);
      return;
    }
    const code=renderLandingReactCode(fromLanding({},target));
    const url=URL.createObjectURL(new Blob([code],{type:"text/typescript;charset=utf-8"}));
    const anchor=document.createElement("a");
    anchor.href=url;
    anchor.download="landing.tsx";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExportReact=()=>exportReactValue(shown);

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
        <p>Hasta 15 tipos de bloques, imágenes originales, temas y edición visual. Revisa el contenido antes de aprobar.</p>
      </div>
      <div className="rf-actions">
        <button className="rf-button rf-button--primary" disabled={saving} onClick={()=>setStudioPro(true)} title="Abrir Creative Studio PRO conectado a los datos de tu proyecto">
          ✨ Abrir Studio PRO
        </button>
        {onRegenerate&&<button className="rf-button" disabled={readOnly||regenerating||saving} onClick={()=>setShowRegenPrompt(true)} title="Regenerar con IA usando una instrucción corta">
          {regenerating?"Generando con IA…":"⚡ Regenerar con IA"}
        </button>}
        <button className="rf-button rf-button--primary" disabled={readOnly||editing} onClick={()=>setVisual(true)}>
          Abrir constructor visual (Puck)
        </button>
        {editing?<><button className="rf-button" disabled={saving} onClick={()=>{imageRequests.invalidate();setUploading(false);setGeneratingImage(false);setDraft(withStableLandingSectionIds(structuredClone(value)));setEditing(false);setError(null);}}>Cancelar</button><button className="rf-button rf-button--primary" disabled={saving} onClick={()=>void save()}>{saving?"Guardando…":"Guardar borrador"}</button></>:<button className="rf-button" disabled={readOnly} onClick={()=>setEditing(true)}>Editar</button>}
        <button className="rf-button" disabled={exporting} onClick={()=>void onExportHtml(shown)}>
          Exportar HTML
        </button>
        <button className="rf-button rf-button--primary" disabled={exporting} onClick={handleExportReact} title="Descargar componente React independiente (sin Puck)">
          Exportar React (.tsx)
        </button>
      </div>
    </header>

    <div className="hl-studio-pro-banner">
      <div>
        <span className="rf-eyebrow">CREATIVE STUDIO PRO · CALIDAD {liveQuality.score}/100 (GRADO {liveQuality.grade})</span>
        <p>Auditoría en vivo: {liveQuality.metrics.sections} bloques · {liveQuality.metrics.layouts} diseños · {liveQuality.metrics.images} fotos · {liveQuality.metrics.ctas} CTAs. Abre Studio PRO para diseñar con layouts avanzados o usa DeepSeek/Gemini con auto-refinamiento (la vista inferior muestra la versión guardada hasta que apliques o guardes).</p>
      </div>
      <button type="button" className="rf-button rf-button--primary" disabled={saving} onClick={()=>setStudioPro(true)}>
        ✨ Abrir Studio PRO
      </button>
    </div>

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
    {studioPro&&<LandingStudioPro projectId={projectId} selectedVersionId={selectedVersionId} value={shown} readOnly={readOnly} saving={saving} assets={assets} imageConfigured={imageConfigured} onSave={onSave} onApplyToEditor={nextValue=>{setDraft(withStableLandingSectionIds(structuredClone(nextValue)));setEditing(true);setError(null);}} onExportHtml={onExportHtml} onExportReact={exportReactValue} onRegenerate={onRegenerate} onClose={()=>setStudioPro(false)}/>}
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
              <button className="rf-button" onClick={()=>{setDraft({...draft,sections:draft.sections.filter((_,i)=>i!==index)});setIndex(Math.max(0,index-1));}}>
                Retirar bloque
              </button>
            </div>}

            {([["eyebrow","Antetítulo"],["headline","Título"],["subheadline","Subtítulo"],["body","Cuerpo"],["cta","Texto del botón"]] as const).map(([key,label])=><Field key={key} label={label} value={text(section[key])} editing={editing} multiline={key!=="eyebrow"&&key!=="cta"} onChange={content=>replace({...section,[key]:content})}/>)}
            <Field label="Imagen · URL HTTPS o ruta local" value={text(section.imageUrl)} editing={editing} onChange={content=>replace({...section,imageUrl:content})}/>
            <Field label="Descripción accesible de la imagen" value={text(section.imageAlt)} editing={editing} onChange={content=>replace({...section,imageAlt:content})}/>
            {editing&&<label>Subir imagen del producto<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving||uploading||generatingImage} onChange={event=>{const file=event.target.files?.[0];if(file)uploadImage(file);event.target.value="";}}/></label>}
            {editing&&assets.length>0&&<label>Usar imagen existente<select value="" onChange={event=>{const asset=assets.find(item=>item.id===event.target.value);if(asset)replace({...section,imageUrl:asset.url,imageAlt:section.imageAlt||asset.title});}}><option value="">Elegir de la biblioteca del proyecto</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.title}</option>)}</select></label>}
            {editing&&<div className="landing-image-generator">
              <h3>Generar imagen original con Gemini</h3>
              <p className="form-hint">El servidor añadirá instrucciones de formato y seguridad a tu descripción antes de enviarla a Gemini; la solicitud puede consumir cuota y tener costo según la facturación de Google. Una pulsación genera una imagen. No se envía el corpus ni se genera automáticamente.</p>
              <label>Descripción de la escena
                <textarea value={imagePrompt} onChange={event=>setImagePrompt(event.target.value)} maxLength={1200} rows={3} placeholder="Ej.: Fotografía editorial de una persona paseando con su perro por un parque al atardecer, luz cálida, composición horizontal, sin texto"/>
              </label>
              <label>Formato
                <select value={imageAspectRatio} onChange={event=>setImageAspectRatio(event.target.value as "16:9"|"4:3"|"1:1")}><option value="16:9">Horizontal 16:9</option><option value="4:3">Horizontal 4:3</option><option value="1:1">Cuadrado 1:1</option></select>
              </label>
              <button type="button" className="rf-button rf-button--primary" disabled={saving||!imageConfigured||generatingImage||uploading||imagePrompt.trim().length<12} onClick={()=>void generateImage()}>{generatingImage?"Generando una imagen…":"Generar una imagen con Gemini"}</button>
              {imageConfigured===false&&<p className="form-hint">Configura GEMINI_API_KEY para habilitar esta función. La subida y la biblioteca siguen disponibles.</p>}
              <p className="form-hint">Revisa el texto alternativo y el resultado antes de guardar el borrador.</p>
            </div>}
            {editing&&<p className="form-hint">Para compartir el HTML fuera de Hallazia, usa una URL HTTPS pública.</p>}
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
              const created:LandingContentSection={id:createLandingSectionId(draft.sections.flatMap(item=>typeof item.id==="string"?[item.id]:[])),type:newType,enabled:true,headline:"Nuevo bloque",body:"Describe aquí el contenido respaldado por el proyecto."};
              setDraft({...draft,sections:[...draft.sections,created]});
              setIndex(draft.sections.length);
            }}>
              Añadir bloque
            </button>
          </div>}
        </div>
      </div>

      <div className="rf-preview-stage">
        <p className="form-hint">{editing?"Vista previa de los cambios sin guardar":"Vista previa de la versión guardada"} · Sin publicación · {shown.externalCheckout?.platform&&shown.externalCheckout.platform!=="none"&&landingCheckoutUrl(shown.externalCheckout.checkoutUrl)?"Checkout externo configurado":"Sin checkout"}.</p>
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

    <h3>Pago externo</h3>
    <p className="form-hint">Solo enlaza un checkout real de tu producto. Sin URL válida, los botones siguen llevando a la oferta dentro de la página; Hallazia no cobra ni publica por sí mismo.</p>
    <label>Plataforma
      <select disabled={!editing} value={value.externalCheckout?.platform??"none"} onChange={event=>onChange({...value,externalCheckout:{...value.externalCheckout,platform:event.target.value as "none"|"hotmart"|"skool"|"custom"}})}>
        <option value="none">Sin checkout</option><option value="hotmart">Hotmart</option><option value="skool">Skool</option><option value="custom">Otra plataforma</option>
      </select>
    </label>
    <Field label="URL HTTPS del checkout" value={value.externalCheckout?.checkoutUrl??""} editing={editing} onChange={checkoutUrl=>onChange({...value,externalCheckout:{...value.externalCheckout,platform:value.externalCheckout?.platform??"none",checkoutUrl}})}/>
    {value.externalCheckout?.platform!=="none"&&value.externalCheckout?.platform&&value.externalCheckout.checkoutUrl&&!landingCheckoutUrl(value.externalCheckout.checkoutUrl)&&<p className="refinement-feedback" role="alert">Usa una URL HTTPS completa y válida para activar la compra.</p>}

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
  const previewFrame=useRef<HTMLIFrameElement>(null);
  const handlePreviewLoad=()=>{
    const document=previewFrame.current?.contentDocument;
    if(!document)return;
    document.addEventListener("click",event=>{
      const link=(event.target as Element|null)?.closest?.('a[href^="#section-"]');
      const id=link?.getAttribute("href")?.slice(1);
      const destination=id?document.getElementById(id):null;
      if(!destination)return;
      event.preventDefault();
      destination.scrollIntoView({behavior:"smooth",block:"start"});
    });
  };
  return <iframe ref={previewFrame} onLoad={handlePreviewLoad} title="Vista previa de landing" sandbox="allow-popups allow-same-origin" srcDoc={renderLandingHtml(fromLanding({},value))} style={{width:"100%",height:760,border:0,background:value.designTokens.background}}/>;
}

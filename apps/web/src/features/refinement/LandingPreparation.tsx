import {lazy,Suspense,useState} from 'react';
import {toLanding} from './landing-adapter';
import {Sparkles,Layers,Eye,ArrowRight} from 'lucide-react';

const VisualEditor=lazy(()=>import('./LandingVisualEditor'));

export interface LandingPreparationProps {
  onGenerate?:(instructions?:string)=>void|Promise<void>;
  running?:boolean;
  provider?:"mock"|"openai"|"gemini"|"deepseek";
  onProviderChange?:(provider:"mock"|"openai"|"gemini"|"deepseek")=>void;
  openAiConfigured?:boolean|null;
  geminiConfigured?:boolean|null;
  deepSeekConfigured?:boolean|null;
}

export function LandingPreparation({
  onGenerate,
  running=false,
  provider="gemini",
  onProviderChange,
  openAiConfigured=false,
  geminiConfigured=true,
  deepSeekConfigured=false
}:LandingPreparationProps){
  const [instructions,setInstructions]=useState('');
  const [open,setOpen]=useState(false);
  const [saved,setSaved]=useState(false);
  const [demo,setDemo]=useState(()=>toLanding({
    title:'Laboratorio visual · ejemplo',
    sections:[
      {type:'hero',eyebrow:'DATOS DE EJEMPLO',headline:'Una propuesta clara merece una página clara.',subheadline:'Prueba bloques, composición y estilo dentro de Hallazia.',body:'Este laboratorio usa datos sintéticos. No guarda versiones ni cambia tus proyectos.',cta:'Explorar la propuesta'},
      {type:'benefits',headline:'Contenido, diseño y versiones',items:['Bloques React reutilizables','Temas y vista responsive','Datos estructurados bajo tu control']},
      {type:'faq',headline:'Antes de empezar',items:[{q:'¿Esto modifica mi proyecto?',a:'No. Los cambios del laboratorio solo viven en esta pantalla.'}]},
      {type:'footer',body:'Hallazia · Laboratorio visual'}
    ]
  }));

  const handleGenerate=()=>{
    if(onGenerate){
      void onGenerate(instructions.trim()||undefined);
    }
  };

  return <section className="strategy-empty" style={{maxWidth:"960px",margin:"0 auto"}}>
    <div className="detail-card" style={{padding:"32px",border:"2px solid var(--primary-accent,#2563eb)",borderRadius:"16px",background:"rgba(37,99,235,0.02)",marginBottom:"32px"}}>
      <span className="status-pill fresh" style={{marginBottom:"12px",display:"inline-block"}}>Flujo Principal</span>
      <span className="eyebrow" style={{display:"block",color:"#2563eb",fontWeight:700,letterSpacing:".1em"}}>PROMPT → LANDING COMPLETA AUTOMÁTICA</span>
      <h2 style={{fontSize:"1.85rem",lineHeight:1.2,margin:"8px 0 12px"}}>Generar Landing completa a partir de la estrategia</h2>
      <p style={{fontSize:"1.05rem",lineHeight:1.65,color:"#475569",margin:"0 0 20px"}}>
        Hallazia recopila automáticamente todo el contexto aprobado del proyecto (<strong>Investigación</strong>, <strong>Problemas</strong>, <strong>Oportunidades</strong>, <strong>Producto</strong>, <strong>Avatar</strong>, <strong>Mecanismo</strong>, <strong>Creencias</strong> y <strong>Oferta</strong>) y genera una página completa de alta conversión con los 15 bloques canónicos.
      </p>

      <div style={{marginBottom:"20px"}}>
        <label style={{display:"block",fontWeight:700,fontSize:"0.95rem",marginBottom:"8px",color:"#1e293b"}}>
          Instrucción para la IA (opcional):
          <textarea
            value={instructions}
            onChange={e=>setInstructions(e.target.value)}
            disabled={running}
            placeholder="Ej: Crea una landing premium de alta conversión para vender este ebook enfocado en dueños de perros reactivos."
            rows={3}
            style={{width:"100%",boxSizing:"border-box",padding:"12px 14px",fontSize:"15px",borderRadius:"10px",border:"1px solid #cbd5e1",marginTop:"6px",fontFamily:"inherit"}}
          />
        </label>
        <span className="form-hint" style={{display:"block",fontSize:"0.82rem",color:"#64748b"}}>
          Puedes escribir algo simple o dejarlo vacío para usar la promesa central y el producto aprobado. Proveedor prioritario: <strong>Gemini (Free Tier / gemini-3.5-flash-lite)</strong>.
        </span>
      </div>

      <div style={{display:"flex",gap:"16px",alignItems:"center",flexWrap:"wrap"}}>
        {onProviderChange&&(
          <label style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"0.9rem"}}>
            <span style={{fontWeight:600}}>Proveedor:</span>
            <select
              value={provider}
              disabled={running}
              onChange={e=>onProviderChange(e.target.value as any)}
              style={{padding:"8px 12px",borderRadius:"8px",border:"1px solid #cbd5e1"}}
            >
              <option value="gemini" disabled={!geminiConfigured}>Gemini (Recomendado)</option>
              <option value="openai" disabled={!openAiConfigured}>OpenAI</option>
              <option value="deepseek" disabled={!deepSeekConfigured}>DeepSeek</option>
              <option value="mock">Demo / Sintético</option>
            </select>
          </label>
        )}

        <button
          className="button primary"
          style={{padding:"12px 28px",fontSize:"1rem",fontWeight:700,borderRadius:"8px",cursor:running?"wait":"pointer"}}
          disabled={running||!onGenerate}
          onClick={handleGenerate}
        >
          {running?"Generando Landing Completa con IA…":"🚀 Generar Landing Completa con IA"}
        </button>
      </div>
    </div>

    <div className="strategy-empty-grid" style={{marginBottom:"32px"}}>
      <article>
        <h3>1. Generación Automática</h3>
        <p>Escribe tu prompt o genera directo: la IA produce datos estructurados (LandingSpec) para los 15 bloques canónicos.</p>
      </article>
      <article>
        <h3>2. Renderers Profesionales</h3>
        <p>Componentes React con diseño editorial o moderno, responsive nativo, temas y tokens sin depender del formato del LLM.</p>
      </article>
      <article>
        <h3>3. Edición Visual con Puck</h3>
        <p>Usa Puck como editor visual posterior para arrastrar, reordenar, activar/desactivar y ajustar textos a tu gusto.</p>
      </article>
    </div>

    <header style={{padding:"20px",border:"1px solid #e2e8f0",borderRadius:"12px",background:"#fff"}}>
      <span className="eyebrow" style={{display:"block",marginBottom:"4px"}}>HERRAMIENTA SECUNDARIA</span>
      <h3 style={{margin:"0 0 8px"}}>Laboratorio visual aislado</h3>
      <p style={{margin:"0 0 16px",fontSize:"0.9rem",color:"#64748b"}}>Prueba Puck y bloques React interactivos con datos sintéticos en memoria sin tocar ningún proyecto.</p>
      <button className="button secondary" onClick={()=>setOpen(true)}>Explorar constructor con datos sintéticos</button>
      {saved&&<p role="status" style={{fontSize:"0.85rem",color:"#10b981",marginTop:"8px"}}>Ejemplo actualizado en memoria.</p>}
    </header>

    {open&&<Suspense fallback={<p role="status">Cargando constructor…</p>}><VisualEditor demo value={demo} onSave={value=>{setDemo(value);setSaved(true);return true;}} onClose={()=>setOpen(false)}/></Suspense>}
  </section>;
}

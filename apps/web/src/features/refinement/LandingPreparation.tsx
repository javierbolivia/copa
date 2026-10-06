import {useState} from 'react';
import type {GenerationProvider} from '../../api/client';

export interface LandingPreparationProps {
  onGenerate?:(instructions?:string)=>void|Promise<void>;
  running?:boolean;
  provider?:GenerationProvider;
  onProviderChange?:(provider:GenerationProvider)=>void;
  openAiConfigured?:boolean|null;
  geminiConfigured?:boolean|null;
  deepSeekConfigured?:boolean|null;
  groqConfigured?:boolean|null;
  openRouterConfigured?:boolean|null;
}

export function LandingPreparation({
  onGenerate,
  running=false,
  provider="gemini",
  onProviderChange,
  openAiConfigured=false,
  geminiConfigured=true,
  deepSeekConfigured=false,
  groqConfigured=false,
  openRouterConfigured=false
}:LandingPreparationProps){
  const [instructions,setInstructions]=useState('');

  const handleGenerate=()=>{
    if(onGenerate&&provider!=="mock"){
      void onGenerate(instructions.trim()||undefined);
    }
  };

  return <section className="strategy-empty" style={{maxWidth:"960px",margin:"0 auto"}}>
    <div className="detail-card" style={{padding:"32px",border:"2px solid var(--primary-accent,#2563eb)",borderRadius:"16px",background:"rgba(37,99,235,0.02)",marginBottom:"32px"}}>
      <span className="status-pill fresh" style={{marginBottom:"12px",display:"inline-block"}}>Flujo Principal</span>
      <span className="eyebrow" style={{display:"block",color:"#2563eb",fontWeight:700,letterSpacing:".1em"}}>PROMPT → LANDING COMPLETA AUTOMÁTICA</span>
      <h2 style={{fontSize:"1.85rem",lineHeight:1.2,margin:"8px 0 12px"}}>Generar Landing completa a partir de la estrategia</h2>
      <p style={{fontSize:"1.05rem",lineHeight:1.65,color:"#475569",margin:"0 0 20px"}}>
        Hallazia recopila el contexto aprobado del proyecto (<strong>Investigación</strong>, <strong>Problemas</strong>, <strong>Oportunidades</strong>, <strong>Producto</strong>, <strong>Avatar</strong>, <strong>Mecanismo</strong>, <strong>Creencias</strong> y <strong>Oferta</strong>) para proponer una página con hasta 15 tipos de bloques editables.
      </p>

      <div style={{marginBottom:"20px"}}>
        <label style={{display:"block",fontWeight:700,fontSize:"0.95rem",marginBottom:"8px",color:"#1e293b"}}>
          Instrucción para la IA (opcional):
          <textarea
            value={instructions}
            onChange={e=>setInstructions(e.target.value)}
            disabled={running}
            placeholder="Ej.: Presenta este producto digital con un hero editorial, beneficios respaldados, una imagen relevante y un CTA claro."
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
              onChange={e=>onProviderChange(e.target.value as GenerationProvider)}
              style={{padding:"8px 12px",borderRadius:"8px",border:"1px solid #cbd5e1"}}
            >
              <option value="gemini" disabled={!geminiConfigured}>Gemini (Recomendado)</option>
              <option value="openai" disabled={!openAiConfigured}>OpenAI{openAiConfigured?"":" · No configurado"}</option>
              <option value="deepseek" disabled={!deepSeekConfigured}>DeepSeek{deepSeekConfigured?"":" · No configurado"}</option>
              <option value="groq" disabled={!groqConfigured}>Groq{groqConfigured?"":" · No configurado"}</option>
              <option value="openrouter" disabled={!openRouterConfigured}>OpenRouter{openRouterConfigured?"":" · No configurado"}</option>
              {provider==="mock"&&<option value="mock" disabled>Demo / Mock no disponible para esta Landing</option>}
            </select>
          </label>
        )}

        <button
          className="button primary"
          style={{padding:"12px 28px",fontSize:"1rem",fontWeight:700,borderRadius:"8px",cursor:running?"wait":"pointer"}}
          disabled={running||!onGenerate||provider==="mock"||(provider==="gemini"&&!geminiConfigured)||(provider==="openai"&&!openAiConfigured)||(provider==="deepseek"&&!deepSeekConfigured)||(provider==="groq"&&!groqConfigured)||(provider==="openrouter"&&!openRouterConfigured)}
          onClick={handleGenerate}
        >
          {running?"Generando Landing Completa con IA…":"🚀 Generar Landing Completa con IA"}
        </button>
        {provider==="mock"&&<p role="alert">Selecciona un proveedor real configurado para generar la Landing.</p>}
      </div>
    </div>

    <div className="strategy-empty-grid" style={{marginBottom:"32px"}}>
      <article>
        <h3>1. Generación Automática</h3>
        <p>Escribe tu indicación o genera desde el contexto aprobado. La IA propone contenido estructurado que puedes revisar antes de aprobar.</p>
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

  </section>;
}

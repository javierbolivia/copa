import {createPortal} from "react-dom";
import {useState} from 'react';
import {Puck,type Config,type Data} from '@puckeditor/core';
import {landingDesignTokens,type LandingContentSection} from '@our-platform/shared';
import {LANDING_BLOCKS,toLandingCanvas,fromLandingCanvas,type LandingCanvasData} from './landing-puck-adapter';
import type {LandingEditorValue} from './types';
import '@puckeditor/core/no-external.css';
import './landing-visual.css';
type Props=Record<string,unknown>;
const txt=(v:unknown)=>typeof v==='string'?v:'';
export function LandingReactBlock({section,editing=false}:{section:LandingContentSection;editing?:boolean}){
  if(section.enabled===false&&!editing)return null;
  const title=txt(section.headline),hero=section.type==='hero';
  const centered=section.variant==='centered'||['hero','offer','guarantee','cta','footer'].includes(section.type);
  return <section className={`hl-block hl-block--${section.type} hl-block--${centered?'centered':'editorial'}`} style={{opacity:section.enabled===false?.4:1}}>
    {section.enabled===false&&<small className="hl-disabled">DESACTIVADO · Conservado en la versión</small>}
    {section.eyebrow&&<p className="hl-eyebrow">{section.eyebrow}</p>}
    {title&&(hero?<h1>{title}</h1>:<h2>{title}</h2>)}{section.subheadline&&<p className="hl-lead">{section.subheadline}</p>}{section.body&&<div className="hl-body"><p>{section.body}</p></div>}
    {section.items?.length?<div className={`hl-items hl-items--${section.type}`}>{section.items.map((raw,index)=>{
      const item=typeof raw==='object'&&raw!==null?(raw as Record<string,unknown>):{};
      return <article key={index} className="hl-item">{typeof raw==='string'?<p>{raw}</p>:item.q!==undefined?<>
        <div className="hl-q-badge">{section.type==='objections'?'Objeción':'Pregunta'}</div>
        <h3>{txt(item.q)}</h3><p>{txt(item.a)}</p>
      </>:<>
        {section.type==='mechanism'&&<div className="hl-step-num">PASO {String(index+1).padStart(2,'0')}</div>}
        {section.type==='bonuses'&&<div className="hl-bonus-badge">BONO EXCLUSIVO</div>}
        {section.type==='benefits'&&<div className="hl-check-badge">✓</div>}
        <h3>{txt(item.name??item.title)}</h3><p>{txt(item.description??item.text)}</p>
      </>}</article>;
    })}</div>:null}
    {section.cta&&<div className="hl-cta-wrap"><span className="hl-cta">{section.cta}</span></div>}
  </section>;
}
function ItemsField({value,onChange}:{value:unknown;onChange:(v:unknown)=>void}){const items=Array.isArray(value)?value:[];return <div className="hl-items-field">{items.map((item,index)=><div key={index}>{typeof item==='string'?<textarea aria-label={`Elemento ${index+1}`} value={item} onChange={e=>onChange(items.map((v,i)=>i===index?e.target.value:v))}/>:Object.entries(item??{}).filter(([key])=>['q','a','name','title','description','text'].includes(key)).map(([key,v])=><label key={key}>{key==='q'?'Pregunta':key==='a'?'Respuesta':key}<textarea value={txt(v)} onChange={e=>onChange(items.map((v,i)=>i===index?{...v,[key]:e.target.value}:v))}/></label>)}<button onClick={()=>onChange(items.filter((_,i)=>i!==index))}>Retirar elemento {index+1}</button></div>)}<button onClick={()=>onChange([...items,''])}>Añadir elemento</button><button onClick={()=>onChange([...items,{q:'',a:''}])}>Añadir pregunta</button></div>}
const config:Config<{components:Record<string,Props>;root:Props}>={
  root:{fields:{
    title:{type:'text',label:'Nombre de la página'},
    theme:{type:'select',label:'Tema de diseño',options:[{label:'Moderno (Azul cobalto)',value:'modern'},{label:'Cálido (Ámbar / Serif)',value:'warm'},{label:'Oscuro / Tech (Cian)',value:'dark'},{label:'Editorial (Esmeralda / Serif)',value:'editorial'},{label:'Minimal (Negro / Blanco)',value:'minimal'}]},
    footerNote:{type:'textarea',label:'Nota al pie'},
    accent:{type:'text',label:'Acento · #RRGGBB'},
    background:{type:'text',label:'Fondo · #RRGGBB'},
    text:{type:'text',label:'Texto · #RRGGBB'},
    font:{type:'select',label:'Tipografía',options:[{label:'Sans serif',value:'sans'},{label:'Serif editorial',value:'serif'}]},
    width:{type:'select',label:'Ancho',options:[{label:'Lectura compacta',value:'compact'},{label:'Amplio',value:'wide'}]},
    spacing:{type:'select',label:'Espaciado',options:[{label:'Compacto',value:'compact'},{label:'Amplio',value:'relaxed'}]}
  },render:({children,...root})=>{const t=landingDesignTokens(root);return <div className="hl-page" style={{background:t.background,color:t.text,fontFamily:t.font==='serif'?'Georgia,serif':'system-ui,sans-serif','--hl-accent':t.accent,'--hl-width':t.width==='wide'?'1160px':'880px','--hl-space':t.spacing==='compact'?'36px':'64px'} as React.CSSProperties}>{children}{txt(root.footerNote)&&<footer>{txt(root.footerNote)}</footer>}</div>;}},
  categories:{strategy:{title:'Narrativa',components:['hero','problem','agitation','mechanism','benefits','product','deliverables']},conversion:{title:'Decisión y cierre',components:['bonuses','proof','objections','faq','offer','guarantee','cta','footer']}},
  components:Object.fromEntries(Object.entries({...LANDING_BLOCKS,custom:'Bloque conservado'}).map(([type,label])=>[type,{label,fields:{enabled:{type:'radio',label:'Visible en página',options:[{label:'Activo',value:true},{label:'Desactivado',value:false}]},eyebrow:{type:'text',label:'Antetítulo'},headline:{type:'text',label:'Título'},subheadline:{type:'textarea',label:'Subtítulo'},body:{type:'textarea',label:'Contenido'},cta:{type:'text',label:'Texto del botón'},variant:{type:'select',label:'Composición',options:[{label:'Editorial',value:'editorial'},{label:'Centrada',value:'centered'}]},items:{type:'custom',label:'Elementos / preguntas',render:({value,onChange}: {value:unknown;onChange:(v:unknown)=>void})=><ItemsField value={value} onChange={onChange}/>}},defaultProps:{headline:'',enabled:true,variant:'editorial'},render:({puck,...section}:Props&{puck:{isEditing:boolean}})=><LandingReactBlock section={{...section,type:type==='custom'?txt(section.originalType):type}} editing={puck.isEditing}/>}]))
};
export default function LandingVisualEditor({value,onSave,onClose,saving=false,demo=false}:{value:LandingEditorValue;onSave:(v:LandingEditorValue)=>Promise<boolean|void>|boolean|void;onClose:()=>void;saving?:boolean;demo?:boolean}){
  const [data,setData]=useState(()=>toLandingCanvas(value)),[error,setError]=useState('');
  const save=async()=>{try{setError('');const result=await onSave(fromLandingCanvas(value,data));if(result!==false)onClose();else setError('No se guardó. Los cambios siguen en el editor.');}catch(e){setError(e instanceof Error?e.message:'No se guardó.');}};
  return createPortal(<div className="hl-visual-dialog" role="dialog" aria-modal="true" aria-label="Constructor visual de Landing"><div className="hl-visual-notice"><strong>Hallazia · Constructor visual</strong><span>{demo?"Laboratorio: solo datos sintéticos en esta pantalla. No modifica el proyecto.":"Guardar crea un borrador. No publica la página."}</span><button disabled={saving} onClick={onClose}>Volver sin guardar</button>{error&&<span role="alert">{error}</span>}</div><Puck config={config} data={data as Data} onChange={v=>setData(v as LandingCanvasData)} height="calc(100vh - 52px)" headerTitle={value.pageName||'Landing'} headerPath="Bloques · Capas · Diseño" overrides={{headerActions:()=> <button className="hl-save" disabled={saving} onClick={()=>void save()}>{saving?'Guardando…':demo?'Aplicar al ejemplo':'Guardar borrador'}</button>}}/></div>,document.body);
}

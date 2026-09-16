import type {LandingContentSection} from '@our-platform/shared';
import type {LandingEditorValue} from './types';
export const LANDING_BLOCKS={hero:'Hero',problem:'Problema',agitation:'Agitación',mechanism:'Solución / Mecanismo',benefits:'Beneficios',product:'Producto',deliverables:'Entregables',bonuses:'Bonos',proof:'Prueba',objections:'Objeciones',faq:'FAQ',offer:'Oferta',guarantee:'Garantía',cta:'CTA',footer:'Footer'};
export interface LandingCanvasData {root:{props:Record<string,unknown>};content:Array<{type:string;props:Record<string,unknown>&{id:string}}>}
export function toLandingCanvas(value:LandingEditorValue):LandingCanvasData{
  return {root:{props:{title:value.pageName,footerNote:value.footerNote,...value.designTokens}},content:value.sections.map((section,index)=>({type:section.type in LANDING_BLOCKS?section.type:'custom',props:{...structuredClone(section),id:typeof section.id==='string'?section.id:`legacy-${index}`,originalType:section.type}}))};
}
export function fromLandingCanvas(value:LandingEditorValue,data:LandingCanvasData):LandingEditorValue{
  const root=data.root.props;
  return {...value,pageName:typeof root.title==='string'?root.title:value.pageName,footerNote:typeof root.footerNote==='string'?root.footerNote:value.footerNote,designTokens:{accent:String(root.accent??value.designTokens.accent),background:String(root.background??value.designTokens.background),text:String(root.text??value.designTokens.text),font:root.font==='serif'?'serif':'sans',width:root.width==='wide'?'wide':'compact',spacing:root.spacing==='compact'?'compact':'relaxed',...(typeof root.theme==='string'?{theme:root.theme}:{})},sections:data.content.map(block=>{const {originalType,...props}=structuredClone(block.props);const original=value.sections.find((section,index)=>(section.id??`legacy-${index}`)===props.id);const result={...props,type:block.type==='custom'?String(originalType??original?.type??'custom'):block.type} as LandingContentSection;return result;})};
}

import type {LandingContentSection} from '@our-platform/shared';
import type {LandingEditorValue} from './types';
export const LANDING_BLOCKS={hero:'Hero',problem:'Problema',agitation:'Agitación',mechanism:'Solución / Mecanismo',benefits:'Beneficios',product:'Producto',deliverables:'Entregables',bonuses:'Bonos',proof:'Prueba',objections:'Objeciones',faq:'FAQ',offer:'Oferta',guarantee:'Garantía',cta:'CTA',footer:'Footer'};
export interface LandingCanvasData {root:{props:Record<string,unknown>};content:Array<{type:string;props:Record<string,unknown>&{id:string}}>}
export function hasVisibleOffer(data:LandingCanvasData):boolean{
  return data.content.some(block=>block.props.enabled!==false&&(block.type==='offer'||(block.type==='custom'&&block.props.originalType==='offer')));
}
export function toLandingCanvas(value:LandingEditorValue):LandingCanvasData{
  return {root:{props:{title:value.pageName,footerNote:value.footerNote,...value.designTokens,checkoutPlatform:value.externalCheckout?.platform??'none',checkoutUrl:value.externalCheckout?.checkoutUrl??''}},content:value.sections.map((section,index)=>({type:section.type in LANDING_BLOCKS?section.type:'custom',props:{...structuredClone(section),id:typeof section.id==='string'?section.id:`legacy-${index}`,originalType:section.type}}))};
}
export function fromLandingCanvas(value:LandingEditorValue,data:LandingCanvasData):LandingEditorValue{
  const root=data.root.props;
  const platform:'hotmart'|'skool'|'custom'|'none'=['hotmart','skool','custom'].includes(String(root.checkoutPlatform))?root.checkoutPlatform as 'hotmart'|'skool'|'custom':'none';
  const externalCheckout:LandingEditorValue['externalCheckout']=platform==='none'&&!root.checkoutUrl&&!value.externalCheckout?undefined:{...value.externalCheckout,platform,checkoutUrl:typeof root.checkoutUrl==='string'?root.checkoutUrl:''};
  return {...value,pageName:typeof root.title==='string'?root.title:value.pageName,footerNote:typeof root.footerNote==='string'?root.footerNote:value.footerNote,externalCheckout,designTokens:{accent:String(root.accent??value.designTokens.accent),background:String(root.background??value.designTokens.background),text:String(root.text??value.designTokens.text),font:root.font==='serif'?'serif':'sans',width:root.width==='wide'?'wide':'compact',spacing:root.spacing==='compact'?'compact':'relaxed',...(typeof root.theme==='string'?{theme:root.theme}:{})},sections:data.content.map(block=>{const {originalType,...props}=structuredClone(block.props);const original=value.sections.find((section,index)=>(section.id??`legacy-${index}`)===props.id);const result={...props,type:block.type==='custom'?String(originalType??original?.type??'custom'):block.type} as LandingContentSection;return result;})};
}

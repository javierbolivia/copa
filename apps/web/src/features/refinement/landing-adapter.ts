import {DEFAULT_LANDING_TOKENS,landingDesignTokens,type ExternalCheckoutConfig,type LandingContentSection} from "@our-platform/shared";
import type {LandingEditorValue} from "./types";

let sectionIdFallback=0;
export function createLandingSectionId(existingIds:readonly string[]=[]):string {
  let id="";
  do{
    const token=globalThis.crypto?.randomUUID?.()??`${Date.now().toString(36)}-${(++sectionIdFallback).toString(36)}`;
    id=`landing-${token}`;
  }while(existingIds.includes(id));
  return id;
}

export function withStableLandingSectionIds(value:LandingEditorValue):LandingEditorValue {
  const used:string[]=[];
  const sections=value.sections.map(section=>{
    const current=typeof section.id==="string"?section.id.trim():"";
    const id=current&&!used.includes(current)?current:createLandingSectionId(used);
    used.push(id);
    return id===section.id?section:{...section,id};
  });
  return {...value,sections};
}

export function applyLandingSectionImage(sections:LandingContentSection[],targetId:string,imageUrl:string,imageAlt:string):LandingContentSection[] {
  return sections.map(section=>section.id===targetId?{...section,imageUrl,imageAlt:section.imageAlt||imageAlt}:section);
}

export function toLanding(value:Record<string,unknown>):LandingEditorValue {
  const checkout=value.externalCheckout&&typeof value.externalCheckout==="object"&&!Array.isArray(value.externalCheckout)?structuredClone(value.externalCheckout) as ExternalCheckoutConfig:undefined;
  return {pageName:typeof value.title==="string"?value.title:"",footerNote:typeof value.footerNote==="string"?value.footerNote:"",sections:structuredClone(Array.isArray(value.sections)?value.sections.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)):[]) as LandingContentSection[],designTokens:landingDesignTokens(value.designTokens),externalCheckout:checkout};
}
export function fromLanding(original:Record<string,unknown>,value:LandingEditorValue){
  const result:Record<string,unknown>={...original,title:value.pageName,sections:structuredClone(value.sections),footerNote:value.footerNote,designTokens:{...value.designTokens}};
  if(value.externalCheckout)result.externalCheckout=structuredClone(value.externalCheckout);
  else delete result.externalCheckout;
  if(!("footerNote" in original)&&!value.footerNote)delete result.footerNote;
  if(!("designTokens" in original)&&JSON.stringify(value.designTokens)===JSON.stringify(DEFAULT_LANDING_TOKENS))delete result.designTokens;
  return result;
}

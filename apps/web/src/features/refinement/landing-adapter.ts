import {DEFAULT_LANDING_TOKENS,landingDesignTokens,type LandingContentSection} from "@our-platform/shared";
import type {LandingEditorValue} from "./types";
export function toLanding(value:Record<string,unknown>):LandingEditorValue {
  return {pageName:typeof value.title==="string"?value.title:"",footerNote:typeof value.footerNote==="string"?value.footerNote:"",sections:structuredClone(Array.isArray(value.sections)?value.sections.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)):[]) as LandingContentSection[],designTokens:landingDesignTokens(value.designTokens)};
}
export function fromLanding(original:Record<string,unknown>,value:LandingEditorValue){
  const result:Record<string,unknown>={...original,title:value.pageName,sections:structuredClone(value.sections),footerNote:value.footerNote,designTokens:{...value.designTokens}};
  if(!("footerNote" in original)&&!value.footerNote)delete result.footerNote;
  if(!("designTokens" in original)&&JSON.stringify(value.designTokens)===JSON.stringify(DEFAULT_LANDING_TOKENS))delete result.designTokens;
  return result;
}

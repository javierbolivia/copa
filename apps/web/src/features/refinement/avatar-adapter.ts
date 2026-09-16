import {AVATAR_FIELDS,type AvatarClaim,type AvatarProfile} from "@our-platform/shared";
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const text=(value:unknown)=>typeof value==="string"?value:"";
export function toAvatar(value:Record<string,unknown>):AvatarProfile{
  return {name:text(value.name),...Object.fromEntries(AVATAR_FIELDS.map(([key])=>[key,(Array.isArray(value[key])?value[key]:[]).map((raw:unknown)=>{
    const item=record(raw);
    return {...item,text:typeof raw==="string"?raw:text(item.text),provenance:text(item.provenance)||"AI_INFERENCE",evidenceIds:Array.isArray(item.evidenceIds)?item.evidenceIds.filter((id):id is string=>typeof id==="string"):[]};
  })]))} as AvatarProfile;
}
export function fromAvatar(original:Record<string,unknown>,value:AvatarProfile){return {...original,...structuredClone(value)};}
export function reviseAvatarClaim(claim:AvatarClaim,text:string):AvatarClaim{return text===claim.text?claim:{...claim,text,provenance:"AI_INFERENCE",evidenceIds:[]};}

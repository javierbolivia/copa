export interface LandingContentSection extends Record<string,unknown>{type:string;eyebrow?:string;headline?:string;subheadline?:string;body?:string;cta?:string;items?:Array<string|Record<string,unknown>>;}
export interface LandingDesignTokens {accent:string;background:string;text:string;font:"sans"|"serif";width:"compact"|"wide";spacing:"compact"|"relaxed";}
export const DEFAULT_LANDING_TOKENS:LandingDesignTokens={accent:"#2563eb",background:"#f8fafc",text:"#172033",font:"sans",width:"compact",spacing:"relaxed"};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function landingDesignTokens(input:unknown):LandingDesignTokens {
  const value=record(input),color=(key:"accent"|"background"|"text")=>typeof value[key]==="string"&&/^#[0-9a-f]{6}$/i.test(value[key])?value[key]:DEFAULT_LANDING_TOKENS[key];
  return {accent:color("accent"),background:color("background"),text:color("text"),font:value.font==="serif"?"serif":"sans",width:value.width==="wide"?"wide":"compact",spacing:value.spacing==="compact"?"compact":"relaxed"};
}
/** Static, escaped HTML used by both preview and server export. No network assets or scripts. */
export function renderLandingHtml(input:unknown):string {
  const output=record(input),tokens=landingDesignTokens(output.designTokens);
  const sections=(Array.isArray(output.sections)?output.sections:[]).map(record).filter(section=>section.enabled!==false);
  const offerIndex=sections.findIndex(item=>item.type==="offer"),target=`section-${offerIndex<0?0:offerIndex}`;
  const content=sections.map((section,index)=>{
    const hero=section.type==="hero",tag=hero?"h1":"h2";
    const items=Array.isArray(section.items)?section.items:[];
    return `<section id="section-${index}" class="${hero?"hero":"content"}${section.variant==="centered"?" centered":""}">${section.eyebrow?`<p class="eyebrow">${escape(section.eyebrow)}</p>`:""}${section.headline?`<${tag}>${escape(section.headline)}</${tag}>`:""}${section.subheadline?`<p class="lead">${escape(section.subheadline)}</p>`:""}${section.body?`<p class="body">${escape(section.body)}</p>`:""}${items.length?`<ul>${items.map(raw=>{const item=record(raw);return `<li>${typeof raw==="string"?escape(raw):item.q!==undefined?`<strong>${escape(item.q)}</strong><p>${escape(item.a)}</p>`:`<strong>${escape(item.name??item.title??"")}</strong><p>${escape(item.description??item.text??"")}</p>`}</li>`;}).join("")}</ul>`:""}${section.cta?`<a class="cta" href="#${target}">${escape(section.cta)}</a>`:""}</section>`;
  }).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(output.title)}</title><style>*{box-sizing:border-box}body{margin:0;font:16px/1.7 ${tokens.font==="serif"?"Georgia,serif":"system-ui,sans-serif"};color:${tokens.text};background:${tokens.background}}main,footer{max-width:${tokens.width==="wide"?"1160":"880"}px;margin:auto}section{padding:${tokens.spacing==="compact"?"32":"64"}px clamp(20px,5vw,56px);border-bottom:1px solid #94a3b844}.centered{text-align:center}.hero{border-top:6px solid ${tokens.accent}}h1,h2{line-height:1.15;overflow-wrap:anywhere}h1{font-size:clamp(2rem,6vw,3.6rem)}h2{font-size:clamp(1.5rem,4vw,2.4rem)}.eyebrow{color:${tokens.accent};font-size:.8rem;font-weight:700;letter-spacing:.08em}.lead{font-size:1.2rem}.body{white-space:pre-wrap}ul{padding-left:24px}li{margin:12px 0}.cta{display:inline-block;padding:12px 20px;border:2px solid ${tokens.accent};border-radius:8px;color:${tokens.text};text-decoration:none;font-weight:700}footer{padding:24px;font-size:.85rem}p,li{overflow-wrap:anywhere}@media(max-width:600px){section{padding:32px 20px}}</style></head><body><main>${content}</main>${output.footerNote?`<footer>${escape(output.footerNote)}</footer>`:""}</body></html>`;
}

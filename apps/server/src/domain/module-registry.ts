import type { ModuleKey } from "@our-platform/shared";

export interface ModuleDefinition { key:ModuleKey; label:string; parents:readonly ModuleKey[]; optionalParents?:readonly ModuleKey[]; }
export const MODULES:readonly ModuleDefinition[]=[
  {key:"research",label:"Investigación",parents:[]},
  {key:"sources",label:"Fuentes",parents:[],optionalParents:["research"]},
  {key:"problems",label:"Problemas",parents:["sources"]},
  {key:"opportunities",label:"Oportunidades",parents:["problems"]},
  {key:"product",label:"Producto",parents:["opportunities"]},
  {key:"avatar",label:"Avatar",parents:["problems","product"]},
  {key:"mechanism",label:"Mecanismo",parents:["problems","product","avatar"]},
  {key:"beliefs",label:"Creencias",parents:["product","avatar","mechanism"]},
  {key:"offer",label:"Oferta",parents:["product","avatar","mechanism","beliefs"]},
  {key:"landing",label:"Landing",parents:["offer","product","avatar","mechanism","beliefs"],optionalParents:["research","problems","opportunities"]},
  {key:"funnel",label:"Funnel",parents:["landing","offer"]},
  {key:"content",label:"Contenido",parents:["offer","avatar","mechanism","beliefs"],optionalParents:["landing","funnel"]},
  {key:"final_product",label:"Producto final",parents:["product","offer"],optionalParents:["research","sources","problems","opportunities","avatar","mechanism","beliefs","landing","funnel","content"]},
];
export const getModule=(key:string):ModuleDefinition|undefined=>MODULES.find(m=>m.key===key);

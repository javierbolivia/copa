import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {ProductWorkspace} from "../../web/src/features/refinement/ProductWorkspace.tsx";
const proposal={id:"p",name:"Guía seleccionada",concept:"Diseño concreto",problem:"Necesidad observada",outcome:"Resultado propuesto",promise:"Promesa prudente",format:"Guía",modules:["Paso"],deliverables:["Documento"],checklists:[],templates:[],resources:[],bonuses:[]};
const selected={versionId:"v",versionNumber:1,status:"approved",freshness:"fresh",outputData:{selectedId:"p",proposals:[{...proposal,id:"other",name:"Primera propuesta"},proposal],productValidationAudit:{ok:true,errors:[]}}};
const render=(overrides={})=>renderToStaticMarkup(createElement(ProductWorkspace,{selected:{...selected,...overrides},saving:false,onSave:async()=>true,onTrace:()=>{}}));
describe("Product decision UI",()=>{
  it("opens the persisted selection and exposes concept, problem and result",()=>{
    const html=render();expect(html).toContain("Producto seleccionado: Guía seleccionada");expect(html).toContain("Diseño concreto");expect(html).toContain("Necesidad observada");expect(html).toContain("Resultado propuesto");expect(html).toContain("no prueban la eficacia");
  });
  it("keeps historical versions read-only and exposes validation reasons",()=>{
    const html=render({freshness:"stale",outputData:{...selected.outputData,productValidationAudit:{ok:false,errors:["Falta formato"]}}});
    expect(html).toContain("Falta formato");expect(html).toContain("disabled=\"\">Editar");expect(html).not.toContain("Guardar selección como borrador");
  });
  it("makes a draft selection distinct from the approved product",()=>{expect(render({status:"draft"})).toContain("requiere aprobación antes de sustituir el producto activo");});
});

import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {OpportunityOutput} from "../../web/src/features/modules/ModuleView.tsx";
const scores={frequency:80,urgency:70,emotionalIntensity:60,willingnessToPay:50,solutionFeasibility:90,competition:40,differentiation:55,commercialPotential:65,evidenceConfidence:75};
const item={id:"o",name:"Guía por validar",problemId:"p",evidenceIds:["e"],scores,total:68,scoreFormula:{version:"1.0",weights:{frequency:.15}},rationale:"Falta validar la compra"};
const selected={versionId:"v",versionNumber:1,status:"approved",freshness:"fresh",createdAt:"2026-01-01T00:00:00Z",outputData:{items:[item],selectedId:"o"}};
const props={selected,results:[selected],versionProviders:{},onSelectVersion:()=>{},onSave:()=>{},onApprove:()=>{},busy:false,problemItems:[{id:"p",name:"Dificultad concreta",summary:"Contexto de origen",evidence:[{evidenceId:"e",quote:"Experiencia original",author:"Autora",sourceTitle:"Entrevista"}]}],parentVersionNumber:1};
const render=(overrides={})=>renderToStaticMarkup(createElement(OpportunityOutput,{...props,...overrides}));
describe("Opportunity decision surface",()=>{
  it("shows authoritative total, all criteria, original problem and exact quote",()=>{
    const html=render();
    expect(html).toContain("68/100");
    expect(html).toContain("Disposición a pagar");
    expect(html).toContain("Dificultad concreta");
    expect(html).toContain("Experiencia original");
    expect(html).toContain("Falta validar la compra");
    expect(html).toContain("Guardar selección como borrador");
  });
  it("does not fabricate scores or offer writes on historical incomplete records",()=>{
    const html=render({selected:{...selected,freshness:"stale",outputData:{items:[{...item,scores:undefined,total:undefined}],selectedId:"o"}}});
    expect(html).toContain("Sin puntuación registrada");
    expect(html).not.toContain("Guardar selección como borrador");
    expect(html).not.toContain("0/100");
  });
  it("keeps draft approval explicit and distinguishes hypotheses from proven market demand",()=>{
    const html=render({selected:{...selected,status:"draft"}});
    expect(html).toContain("Aprobar selección");
    expect(html).toContain("no son probabilidades de éxito");
  });
});

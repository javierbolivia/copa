import {describe,expect,it} from "vitest";
import {toProduct,fromProduct} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
const proposal=(id)=>({id,name:id,concept:"Concepto",problem:"Problema",outcome:"Resultado",promise:"Promesa",format:"Guía",modules:["Preparación"],moduleOutcomes:["Reconocer el contexto"],deliverables:["Guía"],checklists:["Revisión"],templates:["Registro"],resources:["Lecturas"],bonuses:[],evidenceIds:["original"],custom:{preserve:true}});
describe("Product editor persisted contract",()=>{
  it("opens the selected proposal and restores all required design fields and module outcomes",()=>{
    const value=toProduct({proposals:[proposal("first"),proposal("selected")],selectedId:"selected"});
    expect(value.name).toBe("selected");
    expect(value.concept).toBe("Concepto");
    expect(value.problem).toBe("Problema");
    expect(value.outcome).toBe("Resultado");
    expect(value.modules[0].outcome).toBe("Reconocer el contexto");
    expect(value.templates).toEqual(["Registro"]);
    expect(value.resources).toEqual(["Lecturas"]);
  });
  it("edits only the selected proposal and retains untouched fields and other proposals",()=>{
    const original={proposals:[proposal("first"),proposal("selected")],selectedId:"selected"};
    const edited=fromProduct(original,{...toProduct(original),name:"Renombrado",concept:"Concepto revisado"});
    expect(edited.proposals[0]).toEqual(original.proposals[0]);
    expect(edited.proposals[1]).toMatchObject({name:"Renombrado",concept:"Concepto revisado",evidenceIds:["original"],custom:{preserve:true}});
    expect(edited.selectedId).toBe("selected");
    expect(toProduct(edited).modules[0].outcome).toBe("Reconocer el contexto");
    expect(original.proposals[1].name).toBe("selected");
  });
});

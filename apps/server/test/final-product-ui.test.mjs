// @vitest-environment happy-dom
import {act, createElement} from "react";
import {createRoot} from "react-dom/client";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {RefinedModuleOutput} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
import {FinalProductReviewPanel} from "../../web/src/features/refinement/FinalProductReviewPanel.tsx";

const output={
  guide:{title:"Guía de prueba",introduction:"Introducción",chapters:[],conclusion:"Conclusión",references:[]},
  checklist:[],
  workbook:[],
  miniTool:{title:"Planificador",fields:[]},
};
const props={
  projectId:"project-a",
  moduleKey:"final_product",
  selected:{versionId:"v1",versionNumber:1,status:"draft",freshness:"fresh",createdAt:"2026-10-03T00:00:00.000Z",outputData:output},
  versions:[],
  files:[],
  onVersionCreated:()=>{},
  onSelectVersion:()=>{},
  onRegenerate:async()=>{},
};
const render=(overrides={})=>renderToStaticMarkup(createElement(RefinedModuleOutput,{
  ...props,
  ...(overrides.versions?{versions:overrides.versions}:{}),
  selected:{...props.selected,...overrides.selected,outputData:{...output,...overrides.outputData,...overrides.selected?.outputData}},
}));

describe("Final Product approval UI",()=>{
  it("shows historical and current manuscript versions for explicit review",()=>{
    const html=render({versions:[{...props.selected,versionId:"v15",versionNumber:15,status:"draft",freshness:"fresh"},{...props.selected,versionId:"v13",versionNumber:13,status:"approved",freshness:"stale"}]});
    expect(html).toContain('aria-label="Versiones de Producto final"');
    expect(html).toContain("Versión 15");
    expect(html).toContain("Versión 13");
  });
  it("requires source checks and explicit confirmations before submitting a human review",async()=>{
    const previous=globalThis.IS_REACT_ACT_ENVIRONMENT;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const container=document.createElement("div");document.body.append(container);const root=createRoot(container);
    const submissions=[];
    const references=[{id:"R1",title:"Primera",url:"https://example.invalid/one"},{id:"R2",title:"Segunda",url:"https://example.invalid/two"}];
    try{
      await act(async()=>root.render(createElement(FinalProductReviewPanel,{references,review:{status:"PENDING"},disabled:false,readOnly:false,onReview:async(input)=>{submissions.push(input);return true;}})));
      const button=container.querySelector("button");expect(button.disabled).toBe(true);
      for(const field of container.querySelectorAll("textarea")){
        await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field),"value").set.call(field,"Texto contrastado suficientemente extenso para registrar esta comprobación humana.");field.dispatchEvent(new Event("input",{bubbles:true}));});
      }
      expect(button.disabled).toBe(true);
      for(const field of container.querySelectorAll('input[type="checkbox"]'))await act(async()=>field.click());
      expect(button.disabled).toBe(false);await act(async()=>button.click());
      expect(submissions).toHaveLength(1);expect(submissions[0]).toMatchObject({sourcesOpened:true,reviewedAllClaims:true,checks:[{referenceId:"R1",sourceUrl:references[0].url},{referenceId:"R2",sourceUrl:references[1].url}]});
    }finally{await act(async()=>root.unmount());container.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=previous;}
  });
  it("labels an obsolete manuscript as requiring review",()=>{
    const html=render({selected:{status:"approved",freshness:"stale"}});
    expect(html).not.toContain("Manuscrito vigente");
    expect(html).toContain("Manuscrito por revisar");
  });
  it("does not label a fresh draft as the current approved manuscript",()=>{
    const html=render();
    expect(html).toContain("Manuscrito en revisión");
    expect(html).not.toContain("Manuscrito vigente");
    expect(html).toContain("BORRADOR · VERSIÓN 1");
    expect(html).not.toContain("BORRADOR CANÓNICO");
  });
  it("does not present an archived draft as an approved manuscript",()=>{
    const html=render({selected:{status:"archived"}});
    expect(html).toContain("VERSIÓN ARCHIVADA · VERSIÓN 1");
    expect(html).not.toContain("VERSIÓN APROBADA · VERSIÓN 1");
  });
  it("blocks approval and explains the validation errors for an incomplete manuscript",()=>{
    const html=render({outputData:{finalProductValidationAudit:{ok:false,errors:["La referencia R2 está listada pero no se cita."]}}});

    expect(html).toMatch(/<button[^>]*class="refinement-decision refinement-decision--approve"[^>]*disabled=""/);
    expect(html).toContain("Manuscrito pendiente de corrección");
    expect(html).toContain("La referencia R2 está listada pero no se cita.");
  });

  it("keeps approval blocked when only the structural audit passes",()=>{
    const html=render({outputData:{finalProductValidationAudit:{ok:true,errors:[]}}});
    expect(html).toMatch(/<button[^>]*class="refinement-decision refinement-decision--approve"[^>]*disabled=""/);
    expect(html).toContain("Revisión factual pendiente");
  });

  it("leaves approval available after structural and factual review",()=>{
    const html=render({outputData:{finalProductValidationAudit:{ok:true,errors:[]},finalProductFactualReview:{status:"RECORDED"}}});

    expect(html).toMatch(/<button[^>]*class="refinement-decision refinement-decision--approve"(?![^>]*disabled)/);
  });
  it("identifies an assistant review without claiming a human reviewed the manuscript",()=>{
    const html=render({outputData:{finalProductValidationAudit:{ok:true,errors:[]},finalProductFactualReview:{status:"RECORDED",kind:"ASSISTANT_SOURCE_AUDIT",notes:"Auditoría documental asistida."}}});
    expect(html).toContain("Revisión editorial asistida registrada");
    expect(html).toContain("no equivale a validación humana o veterinaria");
    expect(html).not.toContain("Revisión humana registrada");
    expect(html).not.toContain("Abre cada fuente, contrasta todas las afirmaciones y registra los extractos utilizados.");
  });

  it("shows the source-check instructions while factual review is pending",()=>{
    const html=render();
    expect(html).toContain("Revisión factual pendiente");
    expect(html).toContain("Abre cada fuente, contrasta todas las afirmaciones y registra los extractos utilizados.");
  });

  it("shows the review scope and remaining release caveat",()=>{
    const html=render({outputData:{reviewNote:"Aprobación interna local; revisión profesional pendiente antes de distribución pública."}});

    expect(html).toContain("Nota de revisión");
    expect(html).toContain("Aprobación interna local; revisión profesional pendiente antes de distribución pública.");
  });

  it("distinguishes a saved editorial note from the current review of an approved manuscript",()=>{
    const note="Las fuentes se revisarán otra vez antes de aprobarla.";
    const html=render({selected:{status:"approved"},outputData:{reviewNote:note,finalProductFactualReview:{status:"RECORDED",kind:"ASSISTANT_SOURCE_AUDIT"}}});

    expect(html).toContain("Revisión editorial asistida registrada");
    expect(html).toContain("Nota editorial guardada");
    expect(html).toContain("puede describir una etapa anterior");
    expect(html).toContain(note);
  });

  it("blocks approval while edited manuscript fields have not been saved",async()=>{
    const previousActEnvironment=globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT=true;
    const container=document.createElement("div");
    document.body.append(container);
    const root=createRoot(container);
    try{
      await act(async()=>root.render(createElement(RefinedModuleOutput,{
        ...props,
        selected:{...props.selected,outputData:{...output,finalProductValidationAudit:{ok:true,errors:[]},finalProductFactualReview:{status:"RECORDED"}}},
      })));
      const approval=container.querySelector("button.refinement-decision--approve");
      const introduction=container.querySelector(".final-product-field textarea");
      expect(approval?.disabled).toBe(false);
      expect(introduction).not.toBeNull();

      const valueSetter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(introduction),"value")?.set;
      await act(async()=>{
        valueSetter?.call(introduction,"Introducción editada sin guardar");
        introduction?.dispatchEvent(new Event("input",{bubbles:true}));
      });
      expect(container.querySelector("button.refinement-decision--approve")?.disabled).toBe(true);

      await act(async()=>{
        valueSetter?.call(introduction,"Introducción");
        introduction?.dispatchEvent(new Event("input",{bubbles:true}));
      });
      expect(container.querySelector("button.refinement-decision--approve")?.disabled).toBe(false);
    }finally{
      await act(async()=>root.unmount());
      container.remove();
      globalThis.IS_REACT_ACT_ENVIRONMENT=previousActEnvironment;
    }
  });
});

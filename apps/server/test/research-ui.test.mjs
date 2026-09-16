import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResearchResultWorkspace } from "../../web/src/features/modules/ModuleView.tsx";

const selected={moduleKey:"research",artifactId:"a",versionId:"v",versionNumber:1,freshness:"fresh",status:"approved",createdAt:"2026-01-01T00:00:00Z",outputData:{schemaVersion:2,summary:"Plan",hypotheses:[{text:"Hipótesis por contrastar",provenance:"EVIDENCE_BACKED",evidenceIds:["e"]}],validationAudit:{ok:true,inputEvidenceCount:20,citedEvidenceCount:1,errors:[]}}};
const evidence=[{id:"e",projectId:"p",sourceId:"s",commentId:"c",quoteText:"Experiencia original",author:"Autora",sourceTitle:"Entrevista",provenance:"EVIDENCE_BACKED"}];
const render=(overrides={})=>renderToStaticMarkup(createElement(ResearchResultWorkspace,{selected,results:[selected],versionProviders:{v:{provider:"mock",model:"demo"}},evidence,onSelectVersion:()=>{},...overrides}));

describe("Research reading and evidence UX",()=>{
  it("distinguishes a bounded brief from validated market conclusions",()=>{
    const html=render();
    expect(html).toContain("muestra de hasta 20 evidencias");
    expect(html).toContain("no prueba causalidad");
    expect(html).toContain("20 evidencias consideradas · 1 citadas");
    expect(html).toContain("no confirma la veracidad de las hipótesis");
  });
  it("places the exact cited quote and source with its claim",()=>{
    const html=render();
    expect(html).toContain("Ver citas (1)");
    expect(html).toContain("Experiencia original");
    expect(html).toContain("Autora · Entrevista");
  });
  it("shows missing citations honestly without inventing a replacement",()=>{
    const html=render({evidence:[]});
    expect(html).toContain("Referencia no disponible en el corpus actual: e");
    expect(html).not.toContain("Experiencia original");
  });
  it("labels superseded versions as historical instead of active",()=>{
    const html=render({selected:{...selected,status:"superseded"}});
    expect(html).toContain("VERSIÓN HISTÓRICA");
    expect(html).not.toContain("DOCUMENTO ACTIVO");
  });
  it("exposes failed validation reasons and never shows a successful badge",()=>{
    const html=render({selected:{...selected,status:"draft",outputData:{...selected.outputData,validationAudit:{ok:false,errors:["Falta evidencia válida"]}}}});
    expect(html).toContain("Requiere corrección");
    expect(html).toContain("Falta evidencia válida");
    expect(html).not.toContain("Contrato y referencias válidos");
  });
  it("does not fabricate coverage metrics for legacy audit records",()=>{
    const html=render({selected:{...selected,outputData:{...selected.outputData,validationAudit:{ok:true,errors:[]}}}});
    expect(html).not.toContain("evidencias consideradas");
  });
});

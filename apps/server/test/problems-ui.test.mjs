import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {ModuleView,ProblemQualityOutput,ProblemsWorkspace} from "../../web/src/features/modules/ModuleView.tsx";
import * as compactProblems from "../../web/src/features/modules/ProblemCompactList.tsx";

describe("Problems honest reading states",()=>{
  it("makes historical versions reachable and distinguishes technical support from market validation",()=>{
    const selected={versionId:"v1",versionNumber:1,createdAt:"2026-01-01T00:00:00Z",status:"superseded",freshness:"stale",outputData:{items:[]}};
    const html=renderToStaticMarkup(createElement(ProblemsWorkspace,{selected,results:[{...selected,versionId:"v2",versionNumber:2},selected],versionProviders:{},onSelectVersion:()=>{},onOpenEvidence:()=>{}}));
    expect(html).toContain("VERSIÓN HISTÓRICA");
    expect(html).toContain("Versión 1");
    expect(html).toContain("Versión 2");
    expect(html).toContain("no equivale a demanda comercial validada");
  });
  it("explains zero admitted candidates instead of leaving a blank validated list",()=>{
    const html=renderToStaticMarkup(createElement(ProblemQualityOutput,{value:{items:[]},onOpenEvidence:()=>{}}));
    expect(html).toContain("No hay problemas que hayan superado los controles");
    expect(html).toContain("no demuestra que el mercado carezca de problemas");
  });
  it("does not fabricate a zero score for legacy items without quality metrics",()=>{
    const html=renderToStaticMarkup(createElement(ProblemQualityOutput,{value:{items:[{id:"old",name:"Histórico",summary:"Consulta original",evidenceIds:[]}]},onOpenEvidence:()=>{}}));
    expect(html).toContain("Sin puntuación registrada");
    expect(html).not.toContain("Strength 0/100");
  });
  it("keeps provider configuration unknown while the initial request loads",()=>{
    const html=renderToStaticMarkup(createElement(ModuleView,{projectId:"p",moduleKey:"problems",onChanged:()=>{},onOpenEvidence:()=>{},evidenceFocus:null}));
    expect(html).toContain("comprobando");
    expect(html).not.toContain("Gemini · no configurado");
  });
  it("starts with compact closed problem rows while retaining strength, relevance and analysis",()=>{
    const html=renderToStaticMarkup(createElement(ProblemQualityOutput,{value:{researchFocus:"Focus",items:[{id:"p",name:"A real problem",summary:"Full problem interpretation",problemStrengthScore:86,strengthLevel:"STRONG_PATTERN",relevanceLevel:"TANGENTIAL",relevanceScore:52,evidenceCount:12,evidence:[]}]},onOpenEvidence:()=>{}}));
    expect(html).toMatch(/<details[^>]*class="problem-quality-card problem-row/);
    expect(html).not.toMatch(/<details[^>]*class="problem-quality-card problem-row[^>]*open=/);
    expect(html).toContain("A real problem");
    expect(html).toContain("Solidez 86/100");
    expect(html).toContain("Tangencial");
    expect(html).toContain("Full problem interpretation");
    expect(html).toContain("Detalles del análisis");
  });
  it("paginates evidence instead of rendering hundreds of original-link buttons at once",()=>{
    const evidence=Array.from({length:12},(_,index)=>({evidenceId:`e${index+1}`,commentId:`c${index+1}`,quote:`Full original quotation ${index+1}`,author:"Original author",sourceTitle:"Original source",supportType:"DIRECT"}));
    const html=renderToStaticMarkup(createElement(ProblemQualityOutput,{value:{items:[{id:"p",name:"Problem",evidenceCount:12,evidence}]},onOpenEvidence:()=>{}}));
    expect(html.match(/Ver evidencia original/g)).toHaveLength(6);
    expect(html).toContain("1–6 de 12");
    expect(html).toContain("Página de evidencias");
    expect(html).toContain("Full original quotation 6");
    expect(html).toContain("Original author");
    expect(html).toContain("Original source");
  });
  it("also collapses and paginates the linked evidence sample without discarding provenance or identifiers",()=>{
    expect(compactProblems.ProblemLinkedEvidence).toBeTypeOf("function");
    const evidence=Array.from({length:20},(_,index)=>({id:`original-e${index+1}`,commentId:`c${index+1}`,quoteText:`Linked quotation ${index+1}`,author:"Author",sourceTitle:"Source",provenance:"EVIDENCE_BACKED"}));
    const html=renderToStaticMarkup(createElement(compactProblems.ProblemLinkedEvidence,{evidence,onOpenEvidence:()=>{}}));
    expect(html).toContain("MUESTRA DE HASTA 20");
    expect(html).toContain("Evidencias disponibles (20)");
    expect(html).toContain("1–6 de 20");
    expect(html.match(/Ver evidencia original/g)).toHaveLength(6);
    expect(html).not.toMatch(/<details[^>]*open=/);
    expect(html).toContain("Linked quotation 6");
    expect(html).toContain("EVIDENCE_BACKED");
    expect(html).toContain("original-e6");
  });
});

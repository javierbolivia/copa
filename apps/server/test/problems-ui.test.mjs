import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {ModuleView,ProblemQualityOutput,ProblemsWorkspace} from "../../web/src/features/modules/ModuleView.tsx";

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
});

import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";
import {ModuleReviewSummary} from "../../web/src/features/modules/ModuleReviewSummary";

const selected={
  artifactId:"artifact-avatar",
  versionId:"version-avatar",
  versionNumber:6,
  status:"draft",
  freshness:"fresh",
  createdAt:"2026-10-03T00:00:00.000Z",
  outputData:{avatarValidationAudit:{ok:true,errors:[],citedEvidenceCount:13}},
};

describe("Avatar review summary",()=>{
  it("distinguishes citation membership from semantic support",()=>{
    const html=renderToStaticMarkup(createElement(ModuleReviewSummary,{moduleKey:"avatar",selected,versionCount:6,evidenceCount:13}));

    expect(html).toContain("Formato y citas válidos; sentido por revisar");
    expect(html).toContain("no determina si cada cita respalda semánticamente su afirmación");
    expect(html).not.toContain("Contrato verificado");
  });

  it("preserves the existing contract label for other modules",()=>{
    const html=renderToStaticMarkup(createElement(ModuleReviewSummary,{moduleKey:"opportunities",selected:{...selected,outputData:{opportunitiesValidationAudit:{ok:true,errors:[]}}},versionCount:1,evidenceCount:0}));

    expect(html).toContain("Contrato verificado");
    expect(html).not.toContain("respalda semánticamente");
  });
});

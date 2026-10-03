import type {FastifyInstance} from "fastify";
import {afterEach,describe,expect,it} from "vitest";
import {createApp} from "../src/app.js";

describe("public copy and final product review gates",()=>{
  let app:FastifyInstance|undefined;
  afterEach(async()=>{await app?.close();app=undefined;});

  it("keeps generated Content in review, blocks Final Product, and defers manuscript export",async()=>{
    app=await createApp({databasePath:":memory:",serveFrontend:false});
    const {project}=(await app.inject({method:"POST",url:"/api/demo/projects"})).json();
    const contentBase=`/api/projects/${project.id}/modules/content`;
    const previousContent=(await app.inject({method:"GET",url:contentBase})).json().results[0];
    const content=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/content/run`,payload:{provider:"mock"}});
    expect(content.statusCode).toBe(200);
    const contentResult=content.json();
    expect(contentResult.status).toBe("draft");

    const blocked=await app.inject({method:"POST",url:`/api/projects/${project.id}/modules/final_product/run`,payload:{provider:"mock"}});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({error:"module_blocked",message:expect.stringContaining("Contenido tiene un borrador vigente pendiente de aprobación")});

    const reviewedContent=await app.inject({method:"POST",url:`${contentBase}/drafts`,payload:{sourceVersionId:contentResult.versionId,expectedBaseVersionId:previousContent.versionId,outputData:{...contentResult.outputData,reviewNote:"Revisión explícita"}}});
    expect(reviewedContent.statusCode).toBe(201);
    expect((await app.inject({method:"POST",url:`${contentBase}/versions/${reviewedContent.json().versionId}/approve`})).statusCode).toBe(200);
    const finalBase=`/api/projects/${project.id}/modules/final_product`;
    const generated=await app.inject({method:"POST",url:`${finalBase}/run`,payload:{provider:"mock"}});
    expect(generated.statusCode).toBe(200);
    const product=generated.json();
    expect(product.status).toBe("draft");
    let files=(await app.inject({method:"GET",url:`/api/projects/${project.id}/files`})).json().files;
    expect(files.some((file:{artifactVersionId:string})=>file.artifactVersionId===product.versionId)).toBe(false);

    expect(product.outputData.finalProductValidationAudit).toMatchObject({ok:false,complete:false});
    const incompleteApproval=await app.inject({method:"POST",url:`${finalBase}/versions/${product.versionId}/approve`});
    expect(incompleteApproval.statusCode).toBe(409);
    expect(incompleteApproval.json()).toMatchObject({error:"approval_blocked",message:expect.stringContaining("no se puede aprobar ni exportar")});
    const section=`${Array.from({length:160},(_,index)=>`paso verificable ${index+1}`).join(" ")} (R1, R2)`;
    const completeOutput={...product.outputData,guide:{...product.outputData.guide,introduction:section,chapters:product.outputData.guide.chapters.map((chapter:{title:string})=>({...chapter,content:section,evidenceIds:[]})),conclusion:section,references:[{id:"R1",organization:"Fixture local",title:"Fuente de prueba uno",url:"https://example.invalid/one"},{id:"R2",organization:"Fixture local",title:"Fuente de prueba dos",url:"https://example.invalid/two"}]},reviewNote:"Revisión editorial"};
    const structuralDraft=await app.inject({method:"POST",url:`${finalBase}/drafts`,payload:{sourceVersionId:product.versionId,outputData:{...completeOutput,finalProductFactualReview:{status:"RECORDED",kind:"HUMAN_ATTESTATION"}}}});
    expect(structuralDraft.statusCode,structuralDraft.body).toBe(201);
    const unchecked=await app.inject({method:"POST",url:`${finalBase}/versions/${structuralDraft.json().versionId}/approve`});
    expect(unchecked.statusCode).toBe(409);
    expect(unchecked.json().message).toContain("revisión factual");
    expect(structuralDraft.json().outputData.finalProductFactualReview.status).toBe("PENDING");
    const reviewInput={sourcesOpened:true,reviewedAllClaims:true,notes:"Revisión humana de todas las afirmaciones; fuentes sintéticas de esta prueba aislada.",checks:completeOutput.guide.references.map((ref:{id:string;url:string})=>({referenceId:ref.id,sourceUrl:ref.url,sourceExcerpt:"Extracto sintético de una fuente revisada; no corresponde a información ni documentos reales.",manuscriptClaim:"paso verificable 1 paso verificable 2"}))};
    const incompleteReview=await app.inject({method:"POST",url:`${finalBase}/versions/${structuralDraft.json().versionId}/factual-review`,payload:{...reviewInput,checks:[reviewInput.checks[0],reviewInput.checks[0]]}});
    expect(incompleteReview.statusCode).toBe(409);
    const reviewedProduct=await app.inject({method:"POST",url:`${finalBase}/versions/${structuralDraft.json().versionId}/factual-review`,payload:reviewInput});
    expect(reviewedProduct.statusCode,reviewedProduct.body).toBe(201);
    expect(reviewedProduct.json().versionId).not.toBe(structuralDraft.json().versionId);
    expect(reviewedProduct.json().outputData.finalProductFactualReview.status).toBe("RECORDED");
    expect((await app.inject({method:"POST",url:`${finalBase}/versions/${reviewedProduct.json().versionId}/approve`})).statusCode).toBe(200);
    files=(await app.inject({method:"GET",url:`/api/projects/${project.id}/files`})).json().files;
    const exported=files.filter((file:{artifactVersionId:string})=>file.artifactVersionId===reviewedProduct.json().versionId);
    expect(exported).toHaveLength(4);
    const originalExportIds=exported.map((file:{id:string})=>file.id).sort();
    const guide=exported.find((file:{fileRole:string})=>file.fileRole==="guide")!;
    const download=await app.inject({method:"GET",url:`/api/projects/${project.id}/files/${guide.id}/download`});
    expect(download.statusCode).toBe(200);
    expect(download.body).toContain("paso verificable 160");
    expect(download.body).toContain("Fuente de prueba uno");
    expect(download.body).toContain("https://example.invalid/one");
    expect(download.body).not.toContain("Contenido de trabajo para completar y editar.");

    const repeatedApproval=await app.inject({method:"POST",url:`${finalBase}/versions/${reviewedProduct.json().versionId}/approve`});
    expect(repeatedApproval.statusCode).toBe(200);
    files=(await app.inject({method:"GET",url:`/api/projects/${project.id}/files`})).json().files;
    const reexported=files.filter((file:{artifactVersionId:string})=>file.artifactVersionId===reviewedProduct.json().versionId);
    expect(reexported).toHaveLength(4);
    expect(reexported.map((file:{id:string})=>file.id).sort()).toEqual(originalExportIds);
    const edited=await app.inject({method:"POST",url:`${finalBase}/drafts`,payload:{sourceVersionId:reviewedProduct.json().versionId,outputData:{...reviewedProduct.json().outputData,reviewNote:"Texto editado después de revisar"}}});
    expect(edited.statusCode,edited.body).toBe(201);
    expect(edited.json().outputData.finalProductFactualReview.status).toBe("PENDING");
    expect((await app.inject({method:"POST",url:`${finalBase}/versions/${edited.json().versionId}/approve`})).statusCode).toBe(409);
    const assistantReviewed=await app.inject({method:"POST",url:`${finalBase}/versions/${edited.json().versionId}/assistant-source-review`,payload:{...reviewInput,notes:"Revisión editorial asistida de las fuentes y afirmaciones en esta prueba local aislada."}});
    expect(assistantReviewed.statusCode,assistantReviewed.body).toBe(201);
    expect(assistantReviewed.json().outputData.finalProductFactualReview).toMatchObject({status:"RECORDED",kind:"ASSISTANT_SOURCE_AUDIT"});
    expect((await app.inject({method:"POST",url:`${finalBase}/versions/${assistantReviewed.json().versionId}/approve`})).statusCode).toBe(200);
    const assistedFiles=(await app.inject({method:"GET",url:`/api/projects/${project.id}/files`})).json().files.filter((file:{artifactVersionId:string})=>file.artifactVersionId===assistantReviewed.json().versionId);
    expect(assistedFiles).toHaveLength(4);
    for(const file of assistedFiles){
      const response=await app.inject({method:"GET",url:`/api/projects/${project.id}/files/${file.id}/download`});
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Revisión editorial asistida por IA");
    }
  });
});

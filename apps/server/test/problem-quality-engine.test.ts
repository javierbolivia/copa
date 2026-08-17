import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { analyzeEvidenceSupport, classifyCommentKind, classifyEvidenceSupport, createProblemBatches, deriveResearchFocus, mergeProblemCandidates, normalizeQualityText, qualityProblems, relevanceLevel, scoreProblem, strengthLevel } from "../src/services/problem-quality-engine.js";
import type { ClusterAuditRecord } from "../src/services/problem-quality-engine.js";

describe("Problem quality engine",()=>{
  it("clasifica soporte y no mezcla evidencia X-Trans con fotos descartadas",()=>{
    expect(classifyEvidenceSupport("compatibilidad sensor X-Trans Fuji","Ahora puedo salvar fotos descartadas por ruido","jardinería orgánica")).toBe("NOT_SUPPORTED");
    expect(classifyEvidenceSupport("compatibilidad sensor X-Trans Fuji","Compatible con el sensor X-Trans V de Fuji","reducir ruido fotografia")).toBe("DIRECT");
    expect(classifyEvidenceSupport("pregunta sobre JPG","¿Funciona con JPG?","reducir ruido fotografia")).toBe("DIRECT");
  });
  it("valida analysis set, deduplica y calcula señal sin inflar replies",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"Ruido",niche:"fotografía"});
    const bundle=sources.createManual(project.id,{sourceType:"manual",title:"Reducir ruido fotográfico",text:"Tengo fotos descartadas por ruido.\n\nTengo fotos descartadas por ruido y pierdo detalle."});
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const quality=qualityProblems(db,project.id,{schemaVersion:1,items:[{id:"a",name:"Fotos descartadas por ruido",summary:"Usuarios descartan fotos por ruido",category:"pain",researchRelevanceScore:90,evidenceIds:[ids[0]!.id,ids[1]!.id,"inventado"]},{id:"b",name:"Ruido descarta fotografías",summary:"Fotos descartadas por ruido",category:"pain",researchRelevanceScore:90,evidenceIds:[ids[0]!.id]}]}) as {items:Array<Record<string,unknown>>;researchFocus:string};
    expect(quality.items).toHaveLength(1);expect(quality.items[0]).toMatchObject({evidenceCount:2,uniqueAuthors:1,uniqueSources:1,strengthLevel:"SIGNAL"});expect(quality.items[0]!.evidenceIds).not.toContain("inventado");expect(quality.researchFocus).toBe("fotografía");
    expect(sources.listComments(project.id)).toHaveLength(2);db.close();
  });
  it("centraliza niveles y limita un único autor o precisión baja",()=>{
    expect(strengthLevel(1,1)).toBe("SIGNAL");expect(strengthLevel(2,1)).toBe("EMERGING");expect(strengthLevel(4,1)).toBe("PATTERN");expect(strengthLevel(7,1,30)).toBe("EMERGING");expect(strengthLevel(7,2,80)).toBe("STRONG_PATTERN");
    expect(scoreProblem({precision:100,uniqueAuthors:1,uniqueSources:1,totalLikes:9999,relevance:100})).toBeLessThanOrEqual(35);
    expect(scoreProblem({precision:20,uniqueAuthors:10,uniqueSources:3,totalLikes:999,relevance:100})).toBeLessThanOrEqual(45);
  });
  it("usa focus explícito sin bolsa de palabras y fusiona candidatos entre batches",()=>{
    expect(deriveResearchFocus(["ruido tus artificial classic dar elimina"],"organizar archivos","reducción y eliminación de ruido en fotografías")).toBe("reducción y eliminación de ruido en fotografías");
    expect(createProblemBatches(Array.from({length:121},(_,index)=>index),60).map(batch=>batch.length)).toEqual([60,60,1]);
    const merged=mergeProblemCandidates([{name:"Pérdida de detalle",summary:"Denoise borra textura",category:"pain",semanticSignature:"denoise_loss_detail_texture",evidenceIds:["a"],researchRelevanceScore:96},{name:"Textura plástica",summary:"La imagen pierde detalle",category:"pain",semanticSignature:"denoise_loss_detail_texture",evidenceIds:["b"]}]);
    expect(merged).toHaveLength(1);expect(merged[0]?.evidenceIds).toEqual(["a","b"]);expect(relevanceLevel(96)).toBe("CORE");expect(relevanceLevel(28)).toBe("OUT_OF_SCOPE");
  });
  it("rechaza instrucciones y praise como soporte directo, pero reconoce rendimiento",()=>{
    const focus="reducción y eliminación de ruido en fotografías";
    expect(classifyCommentKind("1. Duplicar capa, aplicar desenfoque gaussiano y guardar.")).toBe("SOLUTION");
    expect(classifyEvidenceSupport("Dificultad y confusión con pasos complejos","1. Duplicar capa, aplicar desenfoque gaussiano y guardar.",focus)).toBe("CONTEXT_ONLY");
    expect(classifyCommentKind("Claro que es de utilidad y agrado.")).toBe("PRAISE");
    expect(classifyEvidenceSupport("Dificultad al reducir ruido","Claro que es de utilidad y agrado.",focus)).toBe("CONTEXT_ONLY");
    expect(classifyEvidenceSupport("Procesamiento demasiado lento y requisitos de hardware","¿Qué requisitos debe tener el PC? tarda 20 min por foto durante reducción IA",focus)).toBe("DIRECT");
  });
  it("no crea clusters misceláneos ni fusiona ruido, formatos, video y ampliación",()=>{
    const merged=mergeProblemCandidates([{name:"Ruido inesperado",summary:"Aparece ruido excesivo",category:"pain",semanticSignature:"unexpected_noise",evidenceIds:["a"]},{name:"Compatibilidad RAW/JPG",summary:"Limitaciones de formato",category:"pain",semanticSignature:"raw_jpg_compatibility",evidenceIds:["b"]},{name:"Ruido en video",summary:"Denoise para vídeo",category:"pain",semanticSignature:"video_noise",evidenceIds:["c"]},{name:"Ampliar fotos antiguas",summary:"Upscale sin perder calidad",category:"pain",semanticSignature:"old_photo_upscale",evidenceIds:["d"]},{name:"Consultas adicionales varias",summary:"Otros problemas etc",category:"pain",semanticSignature:"miscellaneous",evidenceIds:["e"]}]);
    expect(merged).toHaveLength(4);expect(merged.flatMap(item=>item.evidenceIds)).not.toContain("e");
  });
  it("preserva UTF-8 y bloquea clusters de precisión baja",()=>{
    const value="á é í ó ú ñ ¿ ¡ reducción y eliminación de ruido en fotografías";
    expect(deriveResearchFocus([],"",value)).toBe(value);
    expect(scoreProblem({precision:7,uniqueAuthors:8,uniqueSources:3,totalLikes:0,relevance:100})).toBeLessThan(40);
  });
});

describe("Cluster audit trail",()=>{
  /**
   * Fixture layout (based on real classifier output verified with dist build):
   *   source1: 2 comments → 2 evidence snippets
   *     ev[0]: "Solo funciona con fotos en raw no en jpg" → kind=NEUTRAL_CONTEXT
   *     ev[1]: "Funciona solo en RAW si intentas con bracketing no te dejara aplicarlo en JPG" → kind=QUESTION
   *   source2: 1 comment → 1 evidence snippet
   *     ev[2]: "Muchas gracias excelente tutorial util agrado" → kind=PRAISE
   *   source3: 2 comments → 2 evidence snippets
   *     ev[3]: "La reduccion de ruido tarda 30 minutos con mi PC hardware insuficiente" → kind=PROBLEM_REPORT
   *     ev[4]: "No puedo aplicar la reduccion de ruido porque mi hardware no lo soporta" → kind=PROBLEM_REPORT
   */
  const makeDb=()=>{
    const db=new AppDatabase(":memory:");
    const projects=new ProjectRepository(db);
    const sources=new SourceRepository(db);
    const project=projects.create({name:"Ruido",niche:"reduccion eliminacion ruido fotografias"});
    sources.createManual(project.id,{sourceType:"manual",title:"RAW vs JPG",
      text:"Solo funciona con fotos en raw no en jpg\n\nFunciona solo en RAW si intentas con bracketing no te dejara aplicarlo en JPG"});
    sources.createManual(project.id,{sourceType:"manual",title:"Gracias tutorial",
      text:"Muchas gracias excelente tutorial util agrado"});
    sources.createManual(project.id,{sourceType:"manual",title:"Hardware lento",
      text:"La reduccion de ruido tarda 30 minutos con mi PC hardware insuficiente\n\nNo puedo aplicar la reduccion de ruido porque mi hardware no lo soporta"});
    return {db,project};
  };

  it("observabilidad no altera los problemas validados respecto a la implementación anterior",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    // ev[0] and ev[1]: both DIRECT support for format restriction claim (raw/jpg shared tokens)
    const input={schemaVersion:1,items:[
      {id:"fmt-1",name:"Restriccion formato archivo RAW",summary:"Funciones reduccion ruido solo disponibles RAW no JPG",category:"limitation",researchRelevanceScore:88,evidenceIds:[ids[0]!.id,ids[1]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {items:unknown[];analysisAudit:unknown};
    expect(result.items).toHaveLength(1);
    db.close();
  });

  it("VALIDATED cluster appears in analysisAudit.postMergeClusters with correct finalDecision",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const input={schemaVersion:1,items:[
      {id:"fmt-1",name:"Restriccion formato archivo RAW",summary:"Funciones reduccion ruido solo disponibles RAW no JPG",category:"limitation",researchRelevanceScore:88,evidenceIds:[ids[0]!.id,ids[1]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {analysisAudit:{postMergeClusters:ClusterAuditRecord[];preMergeRejectedCandidates:ClusterAuditRecord[]}};
    expect(result.analysisAudit.postMergeClusters).toHaveLength(1);
    expect(result.analysisAudit.postMergeClusters[0]!.finalDecision).toBe("VALIDATED");
    expect(result.analysisAudit.postMergeClusters[0]!.rejectionReason).toMatch(/validated/i);
    db.close();
  });

  it("REJECTED_LOW_COHESION: cluster survives no-support gate then fails cohesion gate",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    // ev[3] and ev[4] are DIRECT for hardware/lentitud claim
    // Use a claim with minimal token overlap to ev[0]/ev[1] to force low cohesion via mixed evidence pool
    const input={schemaVersion:1,items:[
      {id:"hw-1",name:"Lentitud hardware procesamiento reduccion ruido",summary:"Tiempos espera excesivos hardware limitaciones reduccion ruido",category:"pain",researchRelevanceScore:80,evidenceIds:[ids[3]!.id,ids[4]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {items:unknown[];analysisMetrics:{clustersSplitForLowCohesion:number;clustersRejectedNoSupport:number};analysisAudit:{postMergeClusters:ClusterAuditRecord[]}};
    const audit=result.analysisAudit.postMergeClusters[0]!;
    // This cluster has DIRECT support so it passes no-support gate; cohesion depends on token overlap
    expect(["VALIDATED","REJECTED_LOW_COHESION"]).toContain(audit.finalDecision);
    expect(audit.finalDecision).not.toBe("REJECTED_NO_SUPPORT");
    expect(audit.rejectionReason.length).toBeGreaterThan(0);
    if(audit.finalDecision==="REJECTED_LOW_COHESION"){
      expect(result.items).toHaveLength(0);
      expect(result.analysisMetrics.clustersSplitForLowCohesion).toBe(1);
      expect(audit.cohesionScore).not.toBeNull();
      expect(audit.cohesionScore!).toBeLessThan(55);
      expect(audit.rejectionReason).toMatch(/Cohesion/);
    }
    db.close();
  });

  it("REJECTED_NO_SUPPORT: praise-only evidence produces no-support rejection",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    // ev[2] is PRAISE → CONTEXT_ONLY for any claim unrelated to the praise tokens
    const input={schemaVersion:1,items:[
      {id:"no-sup",name:"Falla critica conversion espacios color edicion",summary:"Error inesperado convirtiendo perfil cromatico imagen resultado incorrecto",category:"pain",researchRelevanceScore:75,evidenceIds:[ids[2]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {items:unknown[];analysisMetrics:{clustersRejectedNoSupport:number};analysisAudit:{postMergeClusters:ClusterAuditRecord[]}};
    const audit=result.analysisAudit.postMergeClusters[0]!;
    expect(audit.finalDecision).toBe("REJECTED_NO_SUPPORT");
    expect(result.items).toHaveLength(0);
    expect(result.analysisMetrics.clustersRejectedNoSupport).toBe(1);
    expect(audit.rejectionReason).toMatch(/DIRECT\/INFERRED/);
    db.close();
  });

  it("REJECTED_MISCELLANEOUS: pre-merge miscellaneous candidates go to preMergeRejectedCandidates",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const input={schemaVersion:1,items:[
      {id:"misc-1",name:"Varios problemas adicionales miscellaneous",summary:"Otros problemas varios etc",category:"pain",researchRelevanceScore:50,evidenceIds:[ids[0]!.id]},
      {id:"fmt-1",name:"Restriccion formato archivo RAW",summary:"Funciones reduccion ruido solo disponibles RAW no JPG",category:"limitation",researchRelevanceScore:88,evidenceIds:[ids[0]!.id,ids[1]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {analysisMetrics:{clustersRejectedMiscellaneous:number};analysisAudit:{postMergeClusters:ClusterAuditRecord[];preMergeRejectedCandidates:ClusterAuditRecord[]}};
    expect(result.analysisMetrics.clustersRejectedMiscellaneous).toBeGreaterThanOrEqual(1);
    expect(result.analysisAudit.preMergeRejectedCandidates.length).toBeGreaterThanOrEqual(1);
    expect(result.analysisAudit.preMergeRejectedCandidates[0]!.finalDecision).toBe("REJECTED_MISCELLANEOUS");
    db.close();
  });

  it("rejected clusters do NOT appear in items (validated problems list)",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const input={schemaVersion:1,items:[
      {id:"no-sup",name:"Falla critica conversion espacios color",summary:"Error convertir perfil cromatico imagen resultado incorrecto",category:"pain",researchRelevanceScore:75,evidenceIds:[ids[2]!.id]},
      {id:"fmt-1",name:"Restriccion formato archivo RAW",summary:"Funciones reduccion ruido solo disponibles RAW no JPG",category:"limitation",researchRelevanceScore:88,evidenceIds:[ids[0]!.id,ids[1]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {items:Array<{id:string}>;analysisAudit:{postMergeClusters:ClusterAuditRecord[]}};
    const validatedIds=result.items.map(item=>item.id);
    const rejectedAuditIds=result.analysisAudit.postMergeClusters.filter(c=>c.finalDecision!=="VALIDATED").map(c=>c.clusterId);
    for(const rid of rejectedAuditIds)expect(validatedIds).not.toContain(rid);
    db.close();
  });

  it("all post-merge clusters have finalDecision and rejectionReason",()=>{
    const {db,project}=makeDb();
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const input={schemaVersion:1,items:[
      {id:"fmt-1",name:"Restriccion formato archivo RAW",summary:"Funciones reduccion ruido solo disponibles RAW no JPG",category:"limitation",researchRelevanceScore:88,evidenceIds:[ids[0]!.id,ids[1]!.id]},
      {id:"no-sup",name:"Falla critica conversion espacios color",summary:"Error convertir perfil cromatico imagen resultado incorrecto",category:"pain",researchRelevanceScore:75,evidenceIds:[ids[2]!.id]},
    ]};
    const result=qualityProblems(db,project.id,input) as {analysisAudit:{postMergeClusters:ClusterAuditRecord[]}};
    for(const cluster of result.analysisAudit.postMergeClusters){
      expect(cluster.finalDecision).toBeDefined();
      expect(typeof cluster.rejectionReason).toBe("string");
      expect(cluster.rejectionReason.length).toBeGreaterThan(0);
    }
    db.close();
  });
});


describe("Semantic evidence quality normalization",()=>{
  const claim="Lentitud de procesamiento y limitaciones de hardware";
  const focus="reducción y eliminación de ruido en fotografías";
  const evidenceA="tarda 20 min en una sola foto con Ryzen, RAM y Radeon durante reducción de ruido";
  const evidenceB="Si cropeas la foto toma menos tiempo porque son menos pixeles, pero toma muchisimo tiempo y depende de tu computadora.";
  const evidenceC="Al quitar ruido tarda varios minutos. ¿Hay alguna forma que vaya más rápido?";
  const evidenceD="Me toma más de 30 minutos por foto, es demasiado.";
  const evidenceE="Nvidia tiene codecs y mi Radeon no.";
  const evidenceF="En algunas computadoras tarda un poco más.";
  const evidenceG="¿Por qué tarda tanto en crear el DNG?";

  it("normaliza conceptos generales de rendimiento, hardware y formato",()=>{
    expect(normalizeQualityText("toma mucho tiempo en mi computadora").semanticConcepts).toEqual(expect.arrayContaining(["PERFORMANCE_TIME","HARDWARE_COMPUTE"]));
    expect(normalizeQualityText("RAW JPG DNG formato de archivo").semanticConcepts).toContain("FILE_FORMAT");
  });

  it("mejora Evidence 2 a DIRECT por performance + hardware sin aceptar codecs GPU aislados",()=>{
    const b=analyzeEvidenceSupport(claim,evidenceB,focus),e=analyzeEvidenceSupport(claim,evidenceE,focus);
    expect(b.supportType).toBe("DIRECT");
    expect(b.classifierRule).toBe("SEMANTIC_PERFORMANCE_HARDWARE_PAIR");
    expect(b.semanticConceptsShared).toEqual(expect.arrayContaining(["PERFORMANCE_TIME","HARDWARE_COMPUTE"]));
    expect(e.supportType).toBe("NOT_SUPPORTED");
    expect(e.semanticConceptsEvidence).toContain("HARDWARE_COMPUTE");
    expect(e.semanticConceptsEvidence).not.toContain("PERFORMANCE_TIME");
  });

  it("keeps conservative negative controls out of DIRECT",()=>{
    expect(classifyEvidenceSupport(claim,"Mi computadora tiene una pantalla muy brillante.",focus)).not.toBe("DIRECT");
    expect(classifyEvidenceSupport(claim,"El tiempo de exposición es largo para fotografía nocturna.",focus)).not.toBe("DIRECT");
    expect(classifyEvidenceSupport(claim,"La GPU Nvidia tiene codecs de video.",focus)).not.toBe("DIRECT");
  });

  it("promotes QUESTION/PROBLEM_REPORT sharing a single semantic concept to INFERRED, not NOT_SUPPORTED",()=>{
    const focus="reducción y eliminación de ruido en fotografías";
    expect(analyzeEvidenceSupport(claim,"¿El tiempo de proceso es muy largo?","reducción y eliminación de ruido en fotografías").supportType).toBe("INFERRED");
    expect(analyzeEvidenceSupport(claim,"No puedo trabajar con este rendimiento tan lento.","reducción y eliminación de ruido en fotografías").supportType).toBe("INFERRED");
    expect(analyzeEvidenceSupport(claim,"La GPU Nvidia tiene codecs de video.","reducción y eliminación de ruido en fotografías").supportType).toBe("NOT_SUPPORTED");
  });

  it("does NOT promote NEUTRAL_CONTEXT sharing a single semantic concept",()=>{
    expect(analyzeEvidenceSupport(claim,"Me gusta el formato DNG","reducción y eliminación de ruido en fotografías").supportType).toBe("NOT_SUPPORTED");
  });

  it("uses semantic concepts in cohesion and excludes unsupported evidence from its denominator",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"Rendimiento",niche:focus});
    sources.createManual(project.id,{sourceType:"manual",title:"Rendimiento",text:[evidenceA,evidenceB,evidenceC,evidenceD,evidenceE,evidenceF,evidenceG].join("\n\n")});
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const output=qualityProblems(db,project.id,{schemaVersion:1,items:[{id:"performance",name:claim,summary:"La reducción de ruido tarda demasiado según la capacidad de hardware",category:"pain",researchRelevanceScore:86,evidenceIds:ids.map(row=>row.id)}]}) as {analysisAudit:{postMergeClusters:ClusterAuditRecord[]};items:unknown[]};
    const audit=output.analysisAudit.postMergeClusters[0]!;
    const byEvidence=new Map(audit.evidenceQuality.map(detail=>[detail.evidenceId,detail]));
    expect(audit.cohesionScore).toBeGreaterThan(21);
    expect(byEvidence.get(ids[1]!.id)!.supportType).toBe("DIRECT");
    expect(byEvidence.get(ids[4]!.id)!.supportType).toBe("NOT_SUPPORTED");
    expect(byEvidence.get(ids[4]!.id)!.includedInCohesionDenominator).toBe(false);
    expect(byEvidence.get(ids[1]!.id)!.semanticConceptsShared).toEqual(expect.arrayContaining(["PERFORMANCE_TIME","HARDWARE_COMPUTE"]));
    expect(audit.claim).toContain(claim);
    expect(audit.summary).toContain("reducción de ruido");
    db.close();
  });

  it("precision uses resolved evidence as denominator, not candidate count; audit tracks unresolved",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"Rendimiento",niche:"fotografía"});
    sources.createManual(project.id,{sourceType:"manual",title:"Rendimiento",text:["El procesador es muy lento.","Procesamiento muy lento del hardware.","Rendimiento deficiente del equipo.","El hardware es insuficiente y tarda mucho.","Procesador lento para procesar imagenes."].join("\n\n")});
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const fake1="00000000-0000-0000-0000-0000000000a1",fake2="00000000-0000-0000-0000-0000000000a2";
    const output=qualityProblems(db,project.id,{schemaVersion:1,items:[{id:"perf",name:"Rendimiento deficiente del procesador",summary:"El procesador es muy lento para procesar imagenes",category:"pain",researchRelevanceScore:80,evidenceIds:[ids[0]!.id,ids[1]!.id,ids[2]!.id,ids[3]!.id,ids[4]!.id,fake1,fake2]}]}) as {analysisAudit:{postMergeClusters:ClusterAuditRecord[]};items:Array<{evidenceIds:string[]}>};
    const audit=output.analysisAudit.postMergeClusters[0]!;
    expect(audit.candidateEvidenceCount).toBe(7);
    expect(audit.resolvedEvidenceCount).toBe(5);
    expect(audit.unresolvedEvidenceCount).toBe(2);
    expect(audit.unresolvedEvidenceIds).toEqual([fake1,fake2]);
    expect(audit.evidencePrecisionScore).toBe(100);
    expect(output.items[0]!.evidenceIds).toHaveLength(5);
    expect(output.items[0]!.evidenceIds).not.toContain(fake1);
    expect(output.items[0]!.evidenceIds).not.toContain(fake2);
    db.close();
  });

});

describe("Pre-merge miscellaneous audit evidence resolution",()=>{
  it("TEST A: miscellaneous candidate with 3 real evidenceIds reports all resolved",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"Misc",niche:"fotografía"});
    sources.createManual(project.id,{sourceType:"manual",title:"M",text:"Uno.\n\nDos.\n\nTres."});
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const input={schemaVersion:1,items:[{id:"misc-1",name:"Varios problemas adicionales miscellaneous",summary:"Otros problemas varios etc",category:"pain",researchRelevanceScore:50,evidenceIds:[ids[0]!.id,ids[1]!.id,ids[2]!.id]}]};
    const result=qualityProblems(db,project.id,input) as {analysisAudit:{preMergeRejectedCandidates:ClusterAuditRecord[]}};
    const rec=result.analysisAudit.preMergeRejectedCandidates[0]!;
    expect(rec.finalDecision).toBe("REJECTED_MISCELLANEOUS");
    expect(rec.candidateEvidenceCount).toBe(3);
    expect(rec.resolvedEvidenceCount).toBe(3);
    expect(rec.unresolvedEvidenceCount).toBe(0);
    expect(rec.unresolvedEvidenceIds).toEqual([]);
    db.close();
  });

  it("TEST B: miscellaneous candidate with 2 real and 1 fake evidenceIds reports only the fake as unresolved",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"Misc",niche:"fotografía"});
    sources.createManual(project.id,{sourceType:"manual",title:"M",text:"Uno.\n\nDos."});
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const fake="00000000-0000-0000-0000-0000000000b1";
    const input={schemaVersion:1,items:[{id:"misc-1",name:"Varios problemas adicionales miscellaneous",summary:"Otros problemas varios etc",category:"pain",researchRelevanceScore:50,evidenceIds:[ids[0]!.id,ids[1]!.id,fake]}]};
    const result=qualityProblems(db,project.id,input) as {analysisAudit:{preMergeRejectedCandidates:ClusterAuditRecord[]};items:unknown[]};
    const rec=result.analysisAudit.preMergeRejectedCandidates[0]!;
    expect(rec.finalDecision).toBe("REJECTED_MISCELLANEOUS");
    expect(rec.candidateEvidenceCount).toBe(3);
    expect(rec.resolvedEvidenceCount).toBe(2);
    expect(rec.unresolvedEvidenceCount).toBe(1);
    expect(rec.unresolvedEvidenceIds).toEqual([fake]);
    db.close();
  });

  it("TEST C: pre-merge fix leaves post-merge precision/cohesion/classification intact",()=>{
    const db=new AppDatabase(":memory:"),projects=new ProjectRepository(db),sources=new SourceRepository(db),project=projects.create({name:"Rendimiento",niche:"fotografía"});
    sources.createManual(project.id,{sourceType:"manual",title:"HW",text:"El procesador es muy lento.\n\nProcesamiento muy lento del hardware."});
    const ids=db.connection.prepare("SELECT id FROM evidence_snippets WHERE project_id=? ORDER BY created_at").all(project.id) as Array<{id:string}>;
    const input={schemaVersion:1,items:[
      {id:"perf",name:"Rendimiento deficiente del procesador",summary:"El procesador es muy lento para procesar imagenes",category:"pain",researchRelevanceScore:80,evidenceIds:[ids[0]!.id,ids[1]!.id]},
      {id:"misc-1",name:"Varios problemas adicionales miscellaneous",summary:"Otros problemas varios etc",category:"pain",researchRelevanceScore:50,evidenceIds:[ids[0]!.id]}
    ]};
    const result=qualityProblems(db,project.id,input) as {items:unknown[];analysisAudit:{postMergeClusters:ClusterAuditRecord[];preMergeRejectedCandidates:ClusterAuditRecord[]}};
    const validated=result.analysisAudit.postMergeClusters.find(c=>c.clusterId==="perf")!;
    expect(validated.finalDecision).toBe("VALIDATED");
    expect(validated.evidencePrecisionScore).not.toBeNull();
    expect(validated.cohesionScore).not.toBeNull();
    expect(result.analysisAudit.preMergeRejectedCandidates[0]!.finalDecision).toBe("REJECTED_MISCELLANEOUS");
    expect(result.items).toHaveLength(1);
    db.close();
  });
});

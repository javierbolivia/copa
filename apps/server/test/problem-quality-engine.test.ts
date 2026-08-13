import { describe, expect, it } from "vitest";
import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import { SourceRepository } from "../src/repositories/source-repository.js";
import { classifyCommentKind, classifyEvidenceSupport, createProblemBatches, deriveResearchFocus, mergeProblemCandidates, qualityProblems, relevanceLevel, scoreProblem, strengthLevel } from "../src/services/problem-quality-engine.js";

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

import type { LlmGenerateResult, ModuleKey, ModuleResult, ProjectSettings } from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import { createDemoOutput } from "../domain/demo-outputs.js";
import { getModule } from "../domain/module-registry.js";
import type { ArtifactRepository } from "../repositories/artifact-repository.js";
import type { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";
import type { OpenAIProvider } from "../integrations/openai-provider.js";
import type { FileExporterService } from "./file-exporter-service.js";
import { MODULE_OUTPUT_SCHEMAS } from "./module-output-schema.js";
import { getModulePrompt, type ModelTier } from "./prompt-registry.js";

export interface ModuleServiceOptions {
  readonly openAI: OpenAIProvider;
  readonly economyModel?: string;
  readonly powerfulModel?: string;
  readonly economyInputCostPerMillion?: number;
  readonly economyOutputCostPerMillion?: number;
  readonly powerfulInputCostPerMillion?: number;
  readonly powerfulOutputCostPerMillion?: number;
}

export class ModuleService {
  constructor(
    private readonly db: AppDatabase,
    private readonly artifacts: ArtifactRepository,
    private readonly workflow: WorkflowRepository,
    private readonly exporter: FileExporterService,
    private readonly settings: ProjectSettingsRepository,
    private readonly options: ModuleServiceOptions,
  ) {}

  providerStatus(projectId?: string): { openai: { configured: boolean; economyModel: string; powerfulModel: string }; defaultProvider: "mock" | "openai" } {
    const projectSettings = projectId ? this.settings.get(projectId) : undefined;
    return {
      openai: {
        configured: this.options.openAI.configured,
        economyModel: projectSettings?.economyModel?.trim() || this.options.economyModel || "gpt-5-mini",
        powerfulModel: projectSettings?.powerfulModel?.trim() || this.options.powerfulModel || "gpt-5",
      },
      defaultProvider: projectSettings?.preferredLlmProvider === "openai" ? "openai" : "mock",
    };
  }

  get(projectId: string, key: ModuleKey): ModuleResult | undefined {
    const row = this.db.connection.prepare(`
      SELECT a.active_version_id
      FROM artifacts a JOIN artifact_versions v ON v.id=a.active_version_id AND v.project_id=a.project_id
      WHERE a.project_id = ? AND a.artifact_type = ?
      ORDER BY a.created_at
      LIMIT 1
    `).get(projectId, key) as { active_version_id: string | null } | undefined;
    if (!row?.active_version_id) return undefined;
    const version = this.artifacts.getVersion(row.active_version_id);
    return version ? this.toResult(version) : undefined;
  }

  history(projectId: string, key: ModuleKey): ModuleResult[] {
    return this.artifacts.list(projectId)
      .filter((version) => version.artifactType === key)
      .map((version) => this.toResult(version));
  }

  list(projectId: string): ModuleResult[] {
    return this.artifacts.list(projectId)
      .filter((version) => {
        const row = this.db.connection.prepare(
          "SELECT active_version_id FROM artifacts WHERE id = ? AND project_id = ?",
        ).get(version.artifactId, projectId) as { active_version_id: string | null } | undefined;
        return row?.active_version_id === version.id;
      })
      .map((version) => this.toResult(version));
  }

  saveDraft(projectId:string,key:ModuleKey,outputData:unknown):ModuleResult {
    const definition=getModule(key);if(!definition)throw new Error("Módulo desconocido.");
    const current=this.get(projectId,key);if(!current)throw new Error("Genera una versión antes de editarla.");
    const parentIds=this.db.connection.prepare("SELECT parent_version_id FROM lineage_edges WHERE project_id=? AND child_version_id=? ORDER BY created_at").all(projectId,current.versionId) as unknown as Array<{parent_version_id:string}>;
    const version=this.artifacts.createVersion({projectId,artifactType:key,name:definition.label,artifactId:current.artifactId,inputSnapshot:{editedFromVersionId:current.versionId,source:"user"},outputData,parentVersionIds:parentIds.map(item=>item.parent_version_id),status:"draft"});
    return this.toResult(version);
  }

  approve(projectId:string,key:ModuleKey,versionId:string):ModuleResult|undefined {
    const version=this.artifacts.getVersion(versionId);if(!version||version.projectId!==projectId||version.artifactType!==key)return undefined;
    const approved=this.artifacts.approveVersion(projectId,versionId);return approved?this.toResult(approved):undefined;
  }

  async run(projectId: string, key: ModuleKey, provider?: string, instructions?:string): Promise<ModuleResult> {
    const definition = getModule(key);
    if (!definition) throw new Error("Módulo desconocido.");
    const projectSettings = this.settings.get(projectId);
    const requestedProvider = provider ?? projectSettings?.preferredLlmProvider ?? "mock";
    if (requestedProvider !== "mock" && requestedProvider !== "openai") {
      throw new Error(`Proveedor LLM no soportado: ${requestedProvider}.`);
    }
    const selectedProvider = key === "sources" ? "mock" : requestedProvider;
    if (selectedProvider === "openai" && !this.options.openAI.configured) {
      throw new Error("OpenAI no esta configurado. Define OPENAI_API_KEY o ejecuta con el proveedor Mock.");
    }
    const startedAt = Date.now();

    const parentIds: string[] = [];const parentOutputs:Partial<Record<ModuleKey,unknown>>={};
    for (const parentKey of definition.parents) {
      let parent = this.get(projectId, parentKey);
      if (!parent && parentKey === "sources") {
        const sourceCount = (this.db.connection.prepare(
          "SELECT COUNT(*) AS total FROM sources WHERE project_id = ? AND status IN ('ready', 'completed')",
        ).get(projectId) as { total: number }).total;
        if (sourceCount > 0) parent = await this.run(projectId, "sources", "mock");
      }
      if (!parent) throw new Error(`Falta completar ${parentKey}.`);
      if (parent.freshness === "stale") throw new Error(`${parentKey} está obsoleto.`);
      parentIds.push(parent.versionId);
      parentOutputs[parentKey]=parent.outputData;
    }
    for (const optional of definition.optionalParents ?? []) {
      const parent = this.get(projectId, optional);
      if (parent && parent.freshness !== "stale") parentIds.push(parent.versionId);
      if(parent&&parent.freshness!=="stale")parentOutputs[optional]=parent.outputData;
    }

    const evidence = this.db.connection.prepare(
      "SELECT id, quote_text AS quoteText FROM evidence_snippets WHERE project_id = ? ORDER BY created_at LIMIT 20",
    ).all(projectId) as unknown as Array<{ id: string; quoteText: string }>;
    const evidenceIds = evidence.map((row) => row.id);
    const project = this.db.connection.prepare("SELECT name,niche FROM projects WHERE id = ?").get(projectId) as { name:string;niche: string };
    const base=project.name.startsWith("DEMO")?createDemoOutput(key,evidenceIds):createContextOutput(key,project.niche,evidence,parentOutputs);
    let output = contextualize(base, key, project.niche, evidence);
    let agentKey: string = key;
    let promptVersion = "demo-v1";
    let promptHash: string | undefined;
    let promptPath: string | undefined;
    let model = "demo-deterministic-v1";
    let usage: LlmGenerateResult<Record<string, unknown>>["usage"] = {
      inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: "USD", usageKind: "estimated",
    };
    let reportedModel: string | undefined;
    let providerInput: Record<string, unknown> | undefined;
    if (selectedProvider === "openai" && key !== "sources") {
      const prompt = getModulePrompt(key);
      if (!prompt) throw new Error(`No existe un prompt activo para el modulo ${key}.`);
      agentKey = prompt.agentKey;
      promptVersion = prompt.versionHash;
      promptHash = prompt.hash;
      promptPath = prompt.relativePath;
      model = resolveModel(prompt.modelTier, projectSettings, this.options);
      providerInput = {
        project: { name: project.name, niche: project.niche }, settings: projectSettings,
        moduleKey: key, parentOutputs, evidence,
        additionalInstructions: instructions?.trim() || null,
      };
      const generated = await this.options.openAI.generate<Record<string, unknown>>({
        provider: "openai",
        model,
        systemInstructions: `${prompt.instructions}\n\nReglas de ejecucion: conserva evidenceIds validos; distingue evidencia de inferencias; no inventes cifras, testimonios, ventas ni credenciales.`,
        input: JSON.stringify(providerInput),
        structuredOutput: { name: `${key}_output`, jsonSchema: MODULE_OUTPUT_SCHEMAS[key] },
        maxOutputTokens: 8_000,
      });
      output = generated.output;
      usage = generated.usage;
      reportedModel = generated.reportedModel;
    } else if(instructions?.trim()) output.additionalInstructionsApplied=instructions.trim();
    if (key === "sources") {
      const counts = this.db.connection.prepare(`
        SELECT
          COUNT(DISTINCT s.id) AS sourceCount,
          COUNT(DISTINCT c.id) AS commentCount,
          COALESCE(MIN(s.source_type = 'demo'), 0) AS allDemo
        FROM sources s
        LEFT JOIN comments c ON c.source_id = s.id AND c.project_id = s.project_id
        WHERE s.project_id = ? AND s.status IN ('ready', 'completed')
      `).get(projectId) as { sourceCount: number; commentCount: number; allDemo: number };
      if (counts.sourceCount === 0) throw new Error("Añade al menos una fuente completada.");
      output.sourceCount = counts.sourceCount;
      output.commentCount = counts.commentCount;
      output.isDemo = counts.allDemo === 1;
    }
    const generationId = uuidv7();
    const inputSnapshot = {
      parentVersionIds: parentIds, evidenceIds, moduleKey: key, provider: selectedProvider, model,
      ...(reportedModel ? { reportedModel } : {}), ...(promptHash ? { promptHash, promptPath } : {}),
      ...(providerInput ? { context: providerInput } : {}),
      ...(instructions?.trim()?{instructions:instructions.trim()}: {}),
    };
    const inputTokens = usage.inputTokens || Math.max(20, Math.ceil(JSON.stringify(inputSnapshot).length / 4));
    const outputTokens = usage.outputTokens || Math.ceil(JSON.stringify(output).length / 4);
    const estimatedCost = usage.estimatedCost ?? estimateCost(modelTierFor(key), inputTokens, outputTokens, this.options);
    const now = new Date().toISOString();

    const existing = this.db.connection.prepare(
      "SELECT id FROM artifacts WHERE project_id = ? AND artifact_type = ? ORDER BY created_at LIMIT 1",
    ).get(projectId, key) as { id: string } | undefined;
    const db=this.db.connection;
    db.exec("BEGIN IMMEDIATE");let createdVersionId:string|undefined;
    try {
    const version = this.artifacts.createVersion({
      projectId,
      artifactType: key,
      name: definition.label,
      ...(existing ? { artifactId: existing.id } : {}),
      inputSnapshot,
      outputData: output,
      parentVersionIds: parentIds,
    });
    createdVersionId=version.id;

    this.db.connection.prepare(`
      INSERT INTO generations (
        id, project_id, agent_key, provider, model, status, input_snapshot,
        output_data, prompt_version, input_tokens, output_tokens,
        estimated_cost, duration_ms, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?,
        ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generationId, projectId, agentKey, selectedProvider, model, JSON.stringify(inputSnapshot), JSON.stringify(output),
      promptVersion, inputTokens, outputTokens, estimatedCost, Date.now() - startedAt, now, now,
    );
    this.db.connection.prepare(`
      INSERT INTO llm_usage (
        id, project_id, generation_id, provider, model, input_tokens,
        output_tokens, estimated_cost, currency, is_estimate, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)
    `).run(uuidv7(), projectId, generationId, selectedProvider, model, inputTokens, outputTokens, estimatedCost, usage.usageKind === "provider_reported" ? 0 : 1, now);

    for(const evidenceId of referencedEvidenceIds(output,evidenceIds)){
      this.db.connection.prepare(`INSERT OR IGNORE INTO evidence_links(id,project_id,target_type,target_id,source_type,source_id,relation,created_at) VALUES(?,?,'artifact_version',?,'evidence_snippet',?,'supports',?)`).run(uuidv7(),projectId,version.id,evidenceId,now);
    }

    this.workflow.update(projectId, key, "COMPLETED");
    if (key === "landing") this.exporter.exportLanding(projectId, version.id, output);
    if (key === "final_product") this.exporter.exportFinalProduct(projectId, version.id, output);
    db.exec("COMMIT");
    return this.toResult(version);
    } catch(error){if(db.isTransaction)db.exec("ROLLBACK");if(createdVersionId)this.exporter.cleanupVersion(projectId,createdVersionId);throw error;}
  }

  private toResult(version: NonNullable<ReturnType<ArtifactRepository["getVersion"]>>): ModuleResult {
    return {
      moduleKey: version.artifactType as ModuleKey,
      artifactId: version.artifactId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      freshness: version.freshness,
      status: version.status,
      outputData: version.outputData,
      createdAt: version.createdAt,
    };
  }
}

function modelTierFor(key: ModuleKey): ModelTier {
  return getModulePrompt(key)?.modelTier ?? "economy";
}

function resolveModel(tier: ModelTier, settings: ProjectSettings | undefined, options: ModuleServiceOptions): string {
  if (tier === "powerful") return settings?.powerfulModel?.trim() || options.powerfulModel || "gpt-5";
  return settings?.economyModel?.trim() || options.economyModel || "gpt-5-mini";
}

function estimateCost(tier: ModelTier, inputTokens: number, outputTokens: number, options: ModuleServiceOptions): number {
  const inputRate = tier === "powerful"
    ? options.powerfulInputCostPerMillion ?? 1.25
    : options.economyInputCostPerMillion ?? 0.25;
  const outputRate = tier === "powerful"
    ? options.powerfulOutputCostPerMillion ?? 10
    : options.economyOutputCostPerMillion ?? 2;
  return Number(((inputTokens * inputRate + outputTokens * outputRate) / 1_000_000).toFixed(8));
}

function contextualize(output:Record<string,unknown>,key:ModuleKey,niche:string,evidence:Array<{id:string;quoteText:string}>):Record<string,unknown>{
  const replacements:[[string,string],[string,string],[string,string]]=[
    ["Fototeca en Orden",`Plan práctico: ${niche}`],
    ["organización de fotografías personales",niche],
    ["organización de fotografías digitales",niche],
  ];
  let contextual=JSON.parse(JSON.stringify(output)) as Record<string,unknown>;
  const replace=(value:unknown):unknown=>typeof value==="string"?replacements.reduce((text,[from,to])=>text.replaceAll(from,to),value):Array.isArray(value)?value.map(replace):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
  contextual=replace(contextual) as Record<string,unknown>;
  if(key==="research"){
    contextual.summary=`Mapa inicial para ${niche}`;
    contextual.insights=evidence.length?[{text:evidence[0]!.quoteText,provenance:"EVIDENCE_BACKED",evidenceIds:[evidence[0]!.id]}]:[{text:`Hipótesis inicial sobre ${niche}; requiere evidencia.`,provenance:"AI_INFERENCE",evidenceIds:[]}];
  }
  if(key==="problems"){
    contextual.items=evidence.slice(0,Math.min(5,evidence.length)).map((item,index)=>({id:`problem-${index+1}`,name:`Patrón observado ${index+1}`,category:"pain",summary:item.quoteText,frequency:Math.round(100/(index+1)),confidence:Math.min(95,55+evidence.length*4),evidenceIds:[item.id],quotes:[item.quoteText]}));
  }
  if(key==="opportunities"&&Array.isArray(contextual.items)){
    contextual.items=contextual.items.map((raw)=>{const item=raw as Record<string,unknown>,scores=item.scores as Record<string,number>;const weights={frequency:.15,urgency:.15,emotionalIntensity:.15,willingnessToPay:.10,solutionFeasibility:.15,competition:.05,differentiation:.10,commercialPotential:.10,evidenceConfidence:.05};const total=Math.round(Object.entries(weights).reduce((sum,[name,weight])=>sum+(scores[name]??0)*weight,0));return {...item,total,scoreFormula:{version:"1.0",weights},rationale:`Puntuación determinista ${total}/100 calculada con pesos versionados.`};});
  }
  return contextual;
}

function createContextOutput(key:ModuleKey,niche:string,evidence:Array<{id:string;quoteText:string}>,parents:Partial<Record<ModuleKey,unknown>>):Record<string,unknown>{
 const ids=evidence.slice(0,5).map(item=>item.id),quote=evidence[0]?.quoteText??`Todavía no existe evidencia para ${niche}.`;
 const parent=(key:ModuleKey)=>parents[key] as Record<string,any>|undefined;
 const selectedProduct=parent("product")?.proposals?.find((item:any)=>item.id===parent("product")?.selectedId)??parent("product")?.proposals?.[0];
 const opportunity=parent("opportunities")?.items?.find((item:any)=>item.id===parent("opportunities")?.selectedId)??parent("opportunities")?.items?.[0];
 const problem=parent("problems")?.items?.[0],avatar=parent("avatar"),mechanism=parent("mechanism"),beliefs=parent("beliefs"),landing=parent("landing"),offer=parent("offer");
 const outputs:Record<ModuleKey,Record<string,unknown>>={
  research:{schemaVersion:1,summary:`Mapa inicial para ${niche}`,subniches:[`Usuarios de ${niche}`],hypotheses:[{text:`Existe una necesidad resoluble en ${niche}.`,provenance:"AI_INFERENCE",evidenceIds:[]}],questions:["¿Qué resultado buscan y qué les impide lograrlo?"],searchSuggestions:[`${niche} problemas`,`${niche} soluciones`],insights:[]},
  sources:{schemaVersion:1,summary:`Corpus local para ${niche}`,sourceCount:0,commentCount:0,isDemo:false},
  problems:{schemaVersion:1,items:[]},
  opportunities:{schemaVersion:1,items:[{id:"opportunity-1",name:`Solución práctica para ${niche}`,problemId:"problem-1",scores:{frequency:60,urgency:55,emotionalIntensity:50,willingnessToPay:40,solutionFeasibility:70,competition:50,differentiation:55,commercialPotential:55,evidenceConfidence:evidence.length?65:20},evidenceIds:ids}],selectedId:"opportunity-1"},
  product:{schemaVersion:1,proposals:[{id:"product-1",name:`Plan práctico: ${niche}`,concept:`Sistema guiado para ${opportunity?.name??niche}`,problem:opportunity?.rationale??problem?.summary??quote,outcome:"Un proceso claro y repetible",promise:"Avanza con una secuencia práctica y verificable",format:"Guía + workbook + checklist",deliverables:["Guía paso a paso","Workbook","Checklist"],modules:["Diagnóstico","Plan","Implementación","Revisión"],resources:["Plantilla de plan"],bonuses:[],evidenceIds:opportunity?.evidenceIds??ids}],selectedId:"product-1"},
  avatar:{schemaVersion:1,name:`Usuario objetivo de ${selectedProduct?.name??niche}`,productContext:selectedProduct?.concept,currentSituation:[{text:problem?.summary??quote,provenance:evidence.length?"EVIDENCE_BACKED":"AI_INFERENCE",evidenceIds:problem?.evidenceIds??(evidence[0]?[evidence[0].id]:[])}],desiredOutcome:[{text:selectedProduct?.outcome??`Lograr un resultado claro en ${niche}`,provenance:"AI_INFERENCE",evidenceIds:[]}],pains:problem?[problem.summary]:[],frustrations:[],desires:[],objections:["Necesita validar que el proceso sea realizable"],motivations:[selectedProduct?.promise].filter(Boolean),language:evidence.slice(0,3).map(item=>({text:item.quoteText,provenance:"EVIDENCE_BACKED",evidenceIds:[item.id]})),purchaseConcerns:[]},
  mechanism:{schemaVersion:1,perceivedProblem:problem?.summary??quote,apparentCause:"Falta de un proceso claro",rootCauseHypothesis:"Las decisiones no están organizadas en una secuencia repetible",mechanism:"Método de diagnóstico, plan, acción y revisión",solutionMechanism:selectedProduct?.concept??"Pasos pequeños con criterios verificables",differentiation:"Trazabilidad entre evidencia y decisión",simpleExplanation:"Convertir un problema amplio en pasos comprobables",detailedExplanation:`El método ordena el trabajo de ${niche} y conserva el origen de cada decisión.`,provenance:"AI_INFERENCE",evidenceIds:problem?.evidenceIds??ids},
  beliefs:{schemaVersion:1,product:selectedProduct?.name,avatar:avatar?.name,mechanism:mechanism?.mechanism,currentBeliefs:(avatar?.currentSituation??[]).map((item:any)=>item.text??item),limitingBeliefs:avatar?.objections??[],requiredBeliefs:[`El mecanismo ${mechanism?.mechanism??"propuesto"} puede aplicarse paso a paso`],objections:avatar?.purchaseConcerns??avatar?.objections??[],arguments:[mechanism?.simpleExplanation??"El sistema empieza con una acción acotada"],centralThesis:`${selectedProduct?.promise??`Un proceso claro mejora ${niche}`} mediante ${mechanism?.solutionMechanism??"pasos verificables"}.`},
  offer:{schemaVersion:1,name:selectedProduct?.name??`Plan práctico: ${niche}`,audience:avatar?.name,mechanism:mechanism?.mechanism,centralThesis:beliefs?.centralThesis,promise:selectedProduct?.promise??`Un sistema guiado para ${niche}`,benefits:[mechanism?.simpleExplanation??"Claridad","Secuencia accionable","Revisión verificable"],deliverables:selectedProduct?.deliverables??["Guía","Workbook","Checklist"],bonuses:selectedProduct?.bonuses??[],guaranteeSuggestion:"Definir por el propietario antes de publicar",pricingSuggestion:{amount:null,currency:"USD",rationale:"Requiere validación humana y de mercado"},orderBump:null,upsell:null,downsell:null,cta:"Comenzar",provenance:"AI_INFERENCE",disclaimer:"Sin testimonios, ventas, estadísticas ni garantías inventadas",evidenceIds:selectedProduct?.evidenceIds??ids},
  landing:{schemaVersion:1,title:offer?.name??`Plan práctico: ${niche}`,sections:[{type:"hero",headline:offer?.promise??`Una ruta clara para ${niche}`,subheadline:"Del problema a un plan accionable",cta:offer?.cta??"Comenzar"},{type:"problem",headline:"El punto de partida",body:problem?.summary??quote,evidenceIds:problem?.evidenceIds??ids},{type:"mechanism",headline:"Un proceso verificable",body:"Diagnostica, planifica, actúa y revisa."},{type:"benefits",items:offer?.benefits??["Claridad","Acción","Seguimiento"]},{type:"faq",items:[{q:"¿Qué incluye?",a:(offer?.deliverables??["Guía","Workbook","Checklist"]).join(", ")+"."}]},{type:"cta",headline:"Empieza con el primer paso",cta:offer?.cta??"Ver el plan"}],evidenceIds:offer?.evidenceIds??ids},
  funnel:{schemaVersion:1,landingVersion:landing?.title,offerName:offer?.name,nodes:[{id:"landing",type:"landing",label:landing?.title??"Landing"},{id:"checkout",type:"checkout_placeholder",label:`Checkout simulado · ${offer?.name??"Oferta"}`},{id:"bump",type:"order_bump",label:offer?.orderBump??"Order bump por definir"},{id:"upsell",type:"upsell",label:offer?.upsell??"Upsell por definir"},{id:"downsell",type:"downsell",label:offer?.downsell??"Downsell por definir"},{id:"thanks",type:"thank_you",label:"Thank You"}],edges:[{from:"landing",to:"checkout",event:"continue"},{from:"checkout",to:"bump",event:"continue"},{from:"bump",to:"upsell",event:"accept"},{from:"upsell",to:"thanks",event:"accept"},{from:"upsell",to:"downsell",event:"decline"},{from:"downsell",to:"thanks",event:"complete"}],paymentsEnabled:false},
  emails:{schemaVersion:1,sequences:[{type:"welcome",emails:[{subject:`Tu primer paso con ${offer?.name??niche}`,preheader:"Empieza con claridad",body:offer?.promise??"Completa el diagnóstico y elige una acción acotada.",cta:offer?.cta??"Abrir la guía"}]},{type:"nurture",emails:[{subject:"Convierte información en una decisión",body:"Usa la evidencia para priorizar el siguiente paso.",cta:"Abrir el workbook"}]}],evidenceIds:offer?.evidenceIds??ids},
  content:{schemaVersion:1,offerName:offer?.name,audience:avatar?.name,mechanism:mechanism?.mechanism,centralThesis:beliefs?.centralThesis,calendar:[{day:1,type:"educational",hook:`El primer paso para ${offer?.promise??niche}`,body:mechanism?.simpleExplanation??"Empieza por definir un resultado observable."},{day:3,type:"objection",hook:(beliefs?.objections??[])[0]??"No necesitas resolver todo hoy",body:(beliefs?.arguments??[])[0]??"Elige una acción acotada y revísala."}],hooks:[beliefs?.centralThesis??`Una forma más clara de abordar ${niche}`],channels:["Facebook"],evidenceIds:offer?.evidenceIds??ids},
  final_product:{schemaVersion:1,files:[],guide:{title:selectedProduct?.name??offer?.name??`Plan práctico: ${niche}`,chapters:selectedProduct?.modules??["Diagnóstico","Plan","Implementación","Revisión"]},checklist:["Definir resultado","Revisar evidencia","Elegir acción","Registrar avance"],workbook:["Situación actual","Objetivo","Plan semanal"],miniTool:{title:`Planificador: ${niche}`,fields:["Objetivo","Próxima acción","Fecha de revisión"]},evidenceIds:selectedProduct?.evidenceIds??offer?.evidenceIds??ids},
 };
 return outputs[key];
}
function referencedEvidenceIds(output:unknown,allowed:string[]):string[]{const allowedSet=new Set(allowed),found=new Set<string>();const visit=(value:unknown)=>{if(typeof value==="string"&&allowedSet.has(value))found.add(value);else if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==="object")Object.values(value).forEach(visit);};visit(output);return [...found];}

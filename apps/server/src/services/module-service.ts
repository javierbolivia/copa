import type { ArtifactVersion, LlmGenerateResult, LlmProvider, ModuleKey, ModuleResult, ProjectSettings } from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import { createDemoOutput } from "../domain/demo-outputs.js";
import { getModule } from "../domain/module-registry.js";
import type { ArtifactRepository } from "../repositories/artifact-repository.js";
import type { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";
import type { OpenAIProvider } from "../integrations/openai-provider.js";
import type { GeminiProvider } from "../integrations/gemini-provider.js";
import { DEEPSEEK_DEFAULT_MODEL, type DeepSeekProvider } from "../integrations/deepseek-provider.js";
import type { FileExporterService } from "./file-exporter-service.js";
import { isCanonicalModuleOutput, MODULE_OUTPUT_SCHEMAS } from "./module-output-schema.js";
import { getModulePrompt, type ModelTier } from "./prompt-registry.js";
import type { KnowledgeRepository } from "../repositories/knowledge-repository.js";
import { SemanticVocabularyRepository } from "../repositories/semantic-vocabulary-repository.js";
import { getAgentKnowledgePolicy } from "./knowledge/index.js";
import {
  type AnalysisSetSnapshot,
  type ProblemPipelineMetrics,
  createProblemBatches,
  deriveResearchFocus,
  qualityProblems,
  analysisSetSnapshot,
} from "./problem-quality-engine.js";
import {
  type SemanticVocabularySnapshot,
  analysisSnapshotHashFromRows,
  researchFocusHash,
} from "./semantic-vocabulary.js";
import {
  type DomainVocabularyDiscoveryResult,
  type DomainVocabularyDiscoverySourceItem,
  DomainVocabularyDiscoveryService,
  providerErrorDiagnostic,
} from "./domain-vocabulary-discovery-service.js";
import { runDomainVocabularyDryRun, type DomainVocabularyDryRunResult } from "./domain-vocabulary-dry-run.js";
import { validateResearchOutput } from "./research-output-validator.js";
import {
  buildProductGroundingSnapshot,
  buildProductStructuredOutputSchema,
  validateProductOutput,
  type ProductGroundingSnapshot,
  type ProductValidationContext,
} from "./product-output-validator.js";

export const GEMINI_ANALYSIS_MODEL = "gemini-3.5-flash-lite";

export interface ModuleServiceOptions {
  readonly openAI: OpenAIProvider;
  readonly gemini: GeminiProvider;
  readonly deepSeek?: DeepSeekProvider;
  readonly economyModel?: string;
  readonly powerfulModel?: string;
  readonly economyInputCostPerMillion?: number;
  readonly economyOutputCostPerMillion?: number;
  readonly powerfulInputCostPerMillion?: number;
  readonly powerfulOutputCostPerMillion?: number;
  /**
   * PHASE 4C — optional LlmProvider used for domain vocabulary discovery.
   *
   * Provider-agnostic: when omitted, ModuleService falls back to the SAME
   * provider abstraction as the current Problems run (gemini for "gemini"
   * runs, openai for "openai" runs). It is never hardcoded to Gemini in the
   * domain services. Tests inject a MockLLMProvider here.
   */
  readonly discoveryProvider?: LlmProvider;
}

export class ModuleService {
  constructor(
    private readonly db: AppDatabase,
    private readonly artifacts: ArtifactRepository,
    private readonly workflow: WorkflowRepository,
    private readonly exporter: FileExporterService,
    private readonly settings: ProjectSettingsRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly vocabulary: SemanticVocabularyRepository,
    private readonly options: ModuleServiceOptions,
  ) {}

  providerStatus(projectId?: string): { openai: { configured: boolean; economyModel: string; powerfulModel: string }; gemini:{configured:boolean;economyModel:string;powerfulModel:string}; deepseek:{configured:boolean;model:string}; defaultProvider: "mock" | "openai" | "gemini" | "deepseek" } {
    const projectSettings = projectId ? this.settings.get(projectId) : undefined;
    return {
      openai: {
        configured: this.options.openAI.configured,
        economyModel: projectSettings?.economyModel?.trim() || this.options.economyModel || "gpt-5-mini",
        powerfulModel: projectSettings?.powerfulModel?.trim() || this.options.powerfulModel || "gpt-5",
      },
      gemini:{configured:this.options.gemini.configured,economyModel:GEMINI_ANALYSIS_MODEL,powerfulModel:GEMINI_ANALYSIS_MODEL},
      deepseek:{configured:this.options.deepSeek?.configured??false,model:this.options.deepSeek?.effectiveModel??DEEPSEEK_DEFAULT_MODEL},
      defaultProvider:projectSettings?.preferredLlmProvider==="gemini"?"gemini":projectSettings?.preferredLlmProvider==="deepseek"?"deepseek":projectSettings?.preferredLlmProvider === "openai" ? "openai" : "mock",
    };
  }

  get(projectId: string, key: ModuleKey): ModuleResult | undefined {
    const version = this.activeVersion(projectId, key);
    if (!version || (key === "product" && !this.validatePersistedProduct(version).audit.ok)) return undefined;
    return this.toResult(version);
  }

  history(projectId: string, key: ModuleKey): ModuleResult[] {
    return this.artifacts.list(projectId)
      .filter((version) => version.artifactType === key)
      .map((version) => this.toResult(version, this.isInvalidApprovedProduct(version)));
  }

  list(projectId: string): ModuleResult[] {
    return this.artifacts.list(projectId)
      .filter((version) => {
        const row = this.db.connection.prepare(
          "SELECT active_version_id FROM artifacts WHERE id = ? AND project_id = ?",
        ).get(version.artifactId, projectId) as { active_version_id: string | null } | undefined;
        return row?.active_version_id === version.id;
      })
      .map((version) => this.toResult(version, this.isInvalidApprovedProduct(version)));
  }

  artifactVersions(projectId:string):ArtifactVersion[] {
    return this.artifacts.list(projectId).map((version)=>this.isInvalidApprovedProduct(version)?{
      ...version,
      status:"draft",
      freshness:"stale",
      staleReason:"Producto incompleto o con claims sin grounding; no es aprobable.",
    }:version);
  }

  saveDraft(projectId:string,key:ModuleKey,outputData:unknown):ModuleResult {
    const definition=getModule(key);if(!definition)throw new Error("Módulo desconocido.");
    if(!isCanonicalModuleOutput(key,outputData))throw new Error("Los cambios no conservan el contrato estructurado del módulo.");
    const active=this.activeVersion(projectId,key);if(!active)throw new Error("Genera una versión antes de editarla.");
    const current=this.toResult(active);
    const parentIds=this.db.connection.prepare("SELECT parent_version_id FROM lineage_edges WHERE project_id=? AND child_version_id=? ORDER BY created_at").all(projectId,current.versionId) as unknown as Array<{parent_version_id:string}>;
    const version=this.artifacts.createVersion({projectId,artifactType:key,name:definition.label,artifactId:current.artifactId,inputSnapshot:{...asRecord(active.inputSnapshot),editedFromVersionId:current.versionId,source:"user"},outputData,parentVersionIds:parentIds.map(item=>item.parent_version_id),status:"draft"});
    return this.toResult(version);
  }

  approve(projectId:string,key:ModuleKey,versionId:string):ModuleResult|undefined {
    const version=this.artifacts.getVersion(versionId);if(!version||version.projectId!==projectId||version.artifactType!==key)return undefined;
    if(key==="product"){
      const validation=this.validatePersistedProduct(version);
      if(!validation.audit.ok)throw new Error(`Producto incompleto o sin grounding suficiente: ${validation.audit.errors.join("; ")}`);
    }
    const approved=this.artifacts.approveVersion(projectId,versionId);if(!approved)return undefined;
    if(key==="landing")this.exporter.exportLanding(projectId,approved.id,approved.outputData);
    if(key==="final_product")this.exporter.exportFinalProduct(projectId,approved.id,approved.outputData);
    this.knowledge.saveMemoryDecision({originProjectId:projectId,artifactVersionId:approved.id,disposition:"APPROVED",visibility:"PROJECT",reusable:false,preferred:false});
    return this.toResult(approved);
  }

  canPromoteToMemory(projectId:string,versionId:string):boolean {
    const version=this.artifacts.getVersion(versionId);
    if(!version||version.projectId!==projectId)return false;
    if(version.artifactType!=="product")return true;
    return version.status==="approved"&&this.validatePersistedProduct(version).audit.ok;
  }

  async run(projectId: string, key: ModuleKey, provider?: string, instructions?:string): Promise<ModuleResult> {
    const definition = getModule(key);
    if (!definition) throw new Error("Módulo desconocido.");
    const projectSettings = this.settings.get(projectId);
    const requestedProvider = provider ?? projectSettings?.preferredLlmProvider ?? "mock";
    if (requestedProvider !== "mock" && requestedProvider !== "openai"&&requestedProvider!=="gemini"&&requestedProvider!=="deepseek") {
      throw new Error(`Proveedor LLM no soportado: ${requestedProvider}.`);
    }
    const selectedProvider = key === "sources" ? "mock" : requestedProvider;
    if (selectedProvider === "openai" && !this.options.openAI.configured) {
      throw new Error("OpenAI no esta configurado. Define OPENAI_API_KEY o ejecuta con el proveedor Mock.");
    }
    if(selectedProvider==="gemini"&&!this.options.gemini.configured)throw new Error("Gemini no está configurado. Define GEMINI_API_KEY o ejecuta con Demo / Mock.");
    if(selectedProvider==="deepseek"&&!this.options.deepSeek?.configured)throw new Error("DeepSeek no está configurado. Define DEEPSEEK_API_KEY o ejecuta con el proveedor Mock.");
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
      if (parentKey === "sources" && parent?.freshness === "stale") {
        parent = await this.run(projectId, "sources", "mock");
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
      key === "problems"
        ? "SELECT e.id, e.quote_text AS quoteText FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id = ? AND s.include_in_analysis=1 AND c.analysis_eligible=1 ORDER BY c.quality_score DESC,c.likes DESC,e.created_at"
        : "SELECT e.id, e.quote_text AS quoteText FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id = ? AND s.include_in_analysis=1 AND c.analysis_eligible=1 ORDER BY c.quality_score DESC,c.likes DESC,e.created_at LIMIT 20",
    ).all(projectId) as unknown as Array<{ id: string; quoteText: string }>;
    const project = this.db.connection.prepare("SELECT name,niche FROM projects WHERE id = ?").get(projectId) as { name:string;niche: string };
    const productGroundingSnapshot = key === "product" ? buildProductGroundingSnapshot({
      evidence,
      opportunities: parentOutputs.opportunities,
      productConfiguration: { generalNotes: projectSettings?.generalNotes ?? null },
      explicitUserInput: instructions?.trim() || null,
    }) : undefined;
    const structuredOutputSchema = productGroundingSnapshot
      ? buildProductStructuredOutputSchema(productGroundingSnapshot)
      : MODULE_OUTPUT_SCHEMAS[key];
    const evidenceIds = productGroundingSnapshot
      ? productGroundingSnapshot.allowedEvidence.map((item) => item.id)
      : evidence.map((row) => row.id);
    const knowledgeQuery=[definition.label,project.niche,instructions?.trim()].filter(Boolean).join(" ");
    const knowledgePolicy=getAgentKnowledgePolicy(key);
    const knowledgeRows=projectSettings?.knowledgeEnabled===false?[]:retrieveKnowledge(this.knowledge,projectId,knowledgeQuery,knowledgePolicy);
    const knowledgeContext=buildKnowledgePromptContext(knowledgeRows,knowledgePolicy.maxContextTokens*4);
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
    let structuredOutputDiagnostics: LlmGenerateResult<Record<string, unknown>>["structuredOutputDiagnostics"];
    let providerInput: Record<string, unknown> | undefined;
    let problemMetrics: {commentsSelectedForSemanticAnalysis:number;batchesSentToProvider:number;batchesSentToGemini:number;semanticBatchProvider:string|null;commentsPerBatch:number;candidateInsights:number;candidateEvidenceLinks:number;clustersBeforeValidation:number}|undefined;
    const generationId = uuidv7();
    if ((selectedProvider === "openai"||selectedProvider==="gemini"||selectedProvider==="deepseek") && key !== "sources") {
      const prompt = getModulePrompt(key);
      if (!prompt) throw new Error(`No existe un prompt activo para el modulo ${key}.`);
      agentKey = prompt.agentKey;
      promptVersion = prompt.versionHash;
      promptHash = prompt.hash;
      promptPath = prompt.relativePath;
      model = selectedProvider==="gemini"?GEMINI_ANALYSIS_MODEL:selectedProvider==="deepseek"?this.options.deepSeek!.effectiveModel:resolveModel(prompt.modelTier, projectSettings, this.options);
      providerInput = productGroundingSnapshot ? {
        project: { name: project.name, niche: project.niche },
        moduleKey: key,
        productGrounding: productGroundingSnapshot,
        knowledge: {
          advisoryOnly: true,
          capabilityAuthorization: false,
          chunks: sanitizeProductKnowledge(knowledgeContext, new Set(evidenceIds)),
        },
      } : {
        project: { name: project.name, niche: project.niche }, settings: projectSettings,
        moduleKey: key, parentOutputs:providerParentOutputs(parentOutputs), evidence, knowledge: {advisoryOnly:knowledgePolicy.advisoryOnly,influence:knowledgePolicy.knowledgeInfluence,chunks:knowledgeContext},
        additionalInstructions: instructions?.trim() || null,
      };
      let generated!:LlmGenerateResult<Record<string,unknown>>;
      const providerClient:LlmProvider=selectedProvider==="gemini"?this.options.gemini:selectedProvider==="deepseek"?this.options.deepSeek!:this.options.openAI;
      try{
        const problemBatches=key==="problems"&&(selectedProvider==="gemini"||selectedProvider==="deepseek")?createProblemBatches(evidence):undefined;
        if(problemBatches){
          const mapped:Record<string,unknown>[]=[];let mapInputTokens=0,mapOutputTokens=0,mapCost=0;
          for(const [index,batch] of problemBatches.entries()){
            const mapInput={...providerInput,stage:"map",researchFocus:this.settings.researchFocus(projectId)?.value??project.niche,evidence:batch,batch:{index:index+1,total:problemBatches.length}};
            const mappedResult=await providerClient.generate<Record<string,unknown>>({provider:selectedProvider,model,systemInstructions:`${prompt.instructions}\n\nEtapa MAP: extrae candidatos normalizados, no problemas finales. Cada item debe incluir name, summary, category, evidenceIds, semanticSignature y researchRelevanceScore (0-100).`,input:JSON.stringify(mapInput),structuredOutput:{name:"problems_map_output",jsonSchema:MODULE_OUTPUT_SCHEMAS.problems},maxOutputTokens:8_000});
            if(!isCanonicalModuleOutput("problems",mappedResult.output))throw new Error(`${selectedProvider} devolvió un batch que no cumple el contrato de Problemas.`);
            const mappedItems=(mappedResult.output as {items:unknown[]}).items;
            mapped.push(...mappedItems.filter((value):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value)));
            mapInputTokens+=mappedResult.usage.inputTokens??0;mapOutputTokens+=mappedResult.usage.outputTokens??0;mapCost+=mappedResult.usage.estimatedCost??0;reportedModel=mappedResult.reportedModel;
          }
          problemMetrics={commentsSelectedForSemanticAnalysis:evidence.length,batchesSentToProvider:problemBatches.length,batchesSentToGemini:selectedProvider==="gemini"?problemBatches.length:0,semanticBatchProvider:selectedProvider,commentsPerBatch:60,candidateInsights:mapped.length,candidateEvidenceLinks:mapped.reduce((sum,item)=>sum+(Array.isArray(item.evidenceIds)?item.evidenceIds.length:0),0),clustersBeforeValidation:mapped.length};
          providerInput={...providerInput,stage:"global_reduce",researchFocus:this.settings.researchFocus(projectId)?.value??project.niche,evidence:undefined,candidates:mapped};
          usage={inputTokens:mapInputTokens,outputTokens:mapOutputTokens,estimatedCost:mapCost,currency:"USD",usageKind:"estimated"};
        }
        generated=await providerClient.generate<Record<string, unknown>>({provider:selectedProvider,model,systemInstructions:`${prompt.instructions}\n\nReglas de ejecución: usa únicamente evidenceIds incluidos en el contexto, distingue evidencia observada de inferencias y no inventes evidencia, cifras, testimonios, ventas ni credenciales. Agrupa patrones similares sin convertir toda opinión en dolor.`,input:JSON.stringify(providerInput),structuredOutput:{name:`${key}_output`,jsonSchema:structuredOutputSchema,...(key==="product"?{retryOnInvalidSchema:false}:{})},maxOutputTokens:8_000});
        if(key!=="product"&&!isCanonicalModuleOutput(key,generated.output))throw new Error(`${selectedProvider} devolvió una salida que no cumple el contrato de ${key}.`);
      }
      catch(error){const now=new Date().toISOString(),message=error instanceof Error?error.message:`La generación ${selectedProvider} falló.`,code=typeof error==="object"&&error!==null&&"code" in error&&typeof error.code==="string"?error.code:error instanceof Error?error.name:"generation_error";this.db.connection.prepare(`INSERT INTO generations(id,project_id,agent_key,provider,model,status,input_snapshot,output_data,prompt_version,input_tokens,output_tokens,estimated_cost,duration_ms,error_code,error_message,created_at,completed_at) VALUES(?,?,?,?,?,'FAILED',?,NULL,?,0,0,0,?,?,?,?,?)`).run(generationId,projectId,agentKey,selectedProvider,model,JSON.stringify({parentVersionIds:parentIds,evidenceIds,moduleKey:key,provider:selectedProvider,model,promptHash,promptPath,context:providerInput}),promptVersion,Date.now()-startedAt,code,message,now,now);throw error;}
      output = generated.output;
      usage = problemMetrics ? {inputTokens:(usage.inputTokens??0)+(generated.usage.inputTokens??0),outputTokens:(usage.outputTokens??0)+(generated.usage.outputTokens??0),estimatedCost:(usage.estimatedCost??0)+(generated.usage.estimatedCost??0),currency:"USD",usageKind:"estimated"} : generated.usage;
      reportedModel = generated.reportedModel;
      structuredOutputDiagnostics = generated.structuredOutputDiagnostics;
    } else if(instructions?.trim()) output.additionalInstructionsApplied=instructions.trim();
    // PHASE 3/4C — resolve the semantic vocabulary ONCE per run using the same
    // project + research focus + exact Analysis Set that the Problem Quality
    // Engine consumes below.
    //  - If an ACTIVE exact vocabulary exists, it is used with NO discovery.
    //  - Otherwise (PHASE 4C) a CANDIDATE is discovered from the structured
    //    pipeline output, dry-run deterministically, and activated only when the
    //    hard guardrails PASS. Discovery/validator/dry-run failures fall back to
    //    legacy exact behavior; activation failures are explicit, never silent.
    let vocabularySnapshot: SemanticVocabularySnapshot | null = null;
    let vocabularyVersionId: string | null = null;
    let vocabularyDryRun: DomainVocabularyDryRunResult | undefined;
    let discoveryAudit: Record<string, unknown> | undefined;
    if (key === "problems") {
      const researchFocusValue = this.settings.researchFocus(projectId)?.value ?? null;
      const effectiveFocus = deriveResearchFocus([], project.niche, researchFocusValue);
      const focusHash = researchFocusHash(effectiveFocus);
      const analysisSet = analysisSetSnapshot(this.db, projectId);
      const snapshotHash = analysisSnapshotHashFromRows(analysisSet.rows);
      const loaded = this.vocabulary.loadActiveVocabularySnapshot(projectId, focusHash, snapshotHash);
      vocabularySnapshot = loaded ?? null;
      vocabularyVersionId = vocabularySnapshot?.vocabularyVersionId ?? null;
      // Explicit corruption guard: an ACTIVE vocabulary must always carry content.
      if (vocabularySnapshot && vocabularySnapshot.concepts.length === 0) {
        throw new Error(
          `ACTIVE vocabulary corruption: loaded active vocabulary ${vocabularySnapshot.vocabularyVersionId} has zero concepts`,
        );
      }

      // PHASE 4C — only when there is no ACTIVE exact vocabulary do we discover.
      if (!vocabularySnapshot) {
        const discoveryProvider =
          this.options.discoveryProvider ??
          (selectedProvider === "gemini"
            ? this.options.gemini
            : selectedProvider === "deepseek"
              ? this.options.deepSeek
            : selectedProvider === "openai"
              ? this.options.openAI
              : undefined);
        const sourceItems = buildDiscoverySourceItems(output, analysisSet);
        let candidateSnapshot: SemanticVocabularySnapshot | null = null;
        if (discoveryProvider && sourceItems.length > 0) {
          try {
            const discovery = new DomainVocabularyDiscoveryService(
              discoveryProvider,
              this.vocabulary,
              this.db,
              { model, reuseExistingCandidate: true },
            );
            const discoveryResult = await discovery.discover({
              projectId,
              researchFocus: effectiveFocus,
              researchFocusHash: focusHash,
              analysisSnapshotHash: snapshotHash,
              analysisSetSnapshot: analysisSet,
              sourceItems,
            });
            // PHASE 4C observability — keep the discovery outcome for this exact run.
            discoveryAudit = toDiscoveryAudit(discoveryResult, sourceItems.length);
            const candidateId =
              discoveryResult.status === "CREATED_CANDIDATE" ||
              discoveryResult.status === "REUSED_CANDIDATE"
                ? discoveryResult.vocabularyVersionId
                : undefined;
            // Guardrail B — candidate must be fully loadable by its exact id.
            candidateSnapshot = candidateId
              ? this.vocabulary.loadVocabularySnapshot(candidateId)
              : null;
            if (candidateSnapshot) {
              vocabularyDryRun = runDomainVocabularyDryRun({
                database: this.db,
                projectId,
                analysisSetSnapshot: analysisSet,
                rawProblems: output,
                candidateSnapshot,
              });
              if (vocabularyDryRun.status !== "PASS") candidateSnapshot = null;
            }
          } catch (error) {
            // Discovery provider failure / unexpected discovery error => legacy CORE.
            discoveryAudit = {
              status: "PROVIDER_FAILED",
              sourceItemCount: sourceItems.length,
              issues: [{ code: "PROVIDER_ERROR", message: providerErrorDiagnostic(error) }],
              statistics: { totalConcepts: 0, validConcepts: 0, rejectedConcepts: 0 },
              provider: {
                provider: typeof discoveryProvider?.name === "string" ? discoveryProvider.name : null,
                model: model ?? null,
              },
            };
            candidateSnapshot = null;
          }
        }
        if (candidateSnapshot) {
          // Activation by the EXACT candidate id that passed the dry-run — never "latest".
          const activated = this.vocabulary.activateVocabularyVersion(
            candidateSnapshot.vocabularyVersionId,
          );
          if (!activated) {
            throw new Error(
              `domain vocabulary candidate activation failed for ${candidateSnapshot.vocabularyVersionId}`,
            );
          }
          vocabularySnapshot = candidateSnapshot;
          vocabularyVersionId = candidateSnapshot.vocabularyVersionId;
        }
      }

      const qualityOptions: {
        metrics?: Partial<ProblemPipelineMetrics>;
        vocabularySnapshot?: SemanticVocabularySnapshot | null;
        analysisSetSnapshot?: AnalysisSetSnapshot | null;
      } = { analysisSetSnapshot: analysisSet };
      if (problemMetrics) qualityOptions.metrics = problemMetrics;
      if (vocabularySnapshot) qualityOptions.vocabularySnapshot = vocabularySnapshot;
      output = qualityProblems(this.db, projectId, output, qualityOptions);
      if (vocabularyDryRun !== undefined) output.domainVocabularyDryRun = vocabularyDryRun;
      if (discoveryAudit !== undefined) output.domainVocabularyDiscovery = discoveryAudit;
    }
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
    // STRICT RESEARCH CONTRACT — a new Research generation is deterministically
    // validated against the complete module contract and grounded against the
    // EXACT source snapshot (evidenceIds) used for this run. Incomplete or
    // evidence-invalid output must never be APPROVED: it is persisted as a
    // DRAFT with a compact validation audit, never silently approved.
    let artifactStatus: "approved" | "draft" | undefined;
    if (key === "research") {
      const validation = validateResearchOutput(output, evidenceIds);
      output = validation.output;
      artifactStatus = validation.audit.ok ? "approved" : "draft";
    }
    if (key === "product") {
      const validation = validateProductOutput(output, {
        groundingSnapshot: productGroundingSnapshot!,
        problemEvidence: evidence,
      });
      output = validation.output;
      artifactStatus = validation.audit.ok ? "approved" : "draft";
    }
    const inputSnapshot = {
      generationId,parentVersionIds: parentIds, evidenceIds, moduleKey: key, provider: selectedProvider, model,
      ...(reportedModel ? { reportedModel } : {}), ...(promptHash ? { promptHash, promptPath } : {}),
      ...(structuredOutputDiagnostics ? { structuredOutputDiagnostics } : {}),
      ...(providerInput ? { context: providerInput } : {}),
      ...(instructions?.trim()?{instructions:instructions.trim()}: {}),
      ...(vocabularyVersionId ? { vocabularyVersionId, vocabularyContentHash: vocabularySnapshot?.contentHash ?? null } : { vocabularyVersionId: null }),
      knowledgeUsed: knowledgeContext,
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
       ...(artifactStatus ? { status: artifactStatus } : {}),
    });
    createdVersionId=version.id;

    this.db.connection.prepare(`
      INSERT INTO generations (
        id, project_id, agent_key, provider, model, status, vocabulary_version_id, input_snapshot,
        output_data, prompt_version, input_tokens, output_tokens,
        estimated_cost, duration_ms, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generationId, projectId, agentKey, selectedProvider, model, vocabularyVersionId, JSON.stringify(inputSnapshot), JSON.stringify(output),
      promptVersion, inputTokens, outputTokens, estimatedCost, Date.now() - startedAt, now, now,
    );
    this.db.connection.prepare(`
      INSERT INTO llm_usage (
        id, project_id, generation_id, provider, model, input_tokens,
        output_tokens, estimated_cost, currency, is_estimate, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)
    `).run(uuidv7(), projectId, generationId, selectedProvider, model, inputTokens, outputTokens, estimatedCost, usage.estimatedCost!==undefined&&usage.usageKind === "provider_reported" ? 0 : 1, now);

    if(knowledgeContext.length){
      const usedRows=knowledgeContext.map(context=>knowledgeRows.find(item=>context.chunkId===item.chunkId&&context.memoryId===item.memoryId)!).filter(Boolean);
      this.knowledge.createRetrievalLog({projectId,generationId,agentKey,query:knowledgeQuery,policy:{...knowledgePolicy,order:["project_evidence","project_knowledge","selected_global","approved_memory"],retrieval:"fts5_bm25"},selectedLibraryIds:[...new Set(usedRows.flatMap(item=>item.libraryId?[item.libraryId]:[]))],maxChunks:knowledgePolicy.maxChunks,maxContextTokens:knowledgePolicy.maxContextTokens,contextTokenEstimate:Math.ceil(JSON.stringify(knowledgeContext).length/4),items:knowledgeContext.map((context,index)=>{const item=usedRows[index]!;return item.chunkId?{kind:item.kind,chunkId:item.chunkId,rawScore:item.rawScore,tokenEstimate:Math.ceil(context.content.length/4),citation:{documentId:item.documentId,title:item.title,libraryId:item.libraryId,heading:item.heading,pageNumber:item.pageNumber,chunkIndex:item.chunkIndex,excerpt:context.content}}:{kind:item.kind,memoryId:item.memoryId!,rawScore:item.rawScore,tokenEstimate:Math.ceil(context.content.length/4),citation:{title:item.title,artifactVersionId:item.artifactVersionId,excerpt:context.content}};})});
    }

    for(const evidenceId of referencedEvidenceIds(output,evidenceIds)){
      this.db.connection.prepare(`INSERT OR IGNORE INTO evidence_links(id,project_id,target_type,target_id,source_type,source_id,relation,created_at) VALUES(?,?,'artifact_version',?,'evidence_snippet',?,'supports',?)`).run(uuidv7(),projectId,version.id,evidenceId,now);
    }

    this.workflow.update(projectId, key, artifactStatus === "draft" ? "IN_PROGRESS" : "COMPLETED");
    if (key === "landing") this.exporter.exportLanding(projectId, version.id, output);
    if (key === "final_product") this.exporter.exportFinalProduct(projectId, version.id, output);
    db.exec("COMMIT");
    return this.toResult(version);
    } catch(error){if(db.isTransaction)db.exec("ROLLBACK");if(createdVersionId)this.exporter.cleanupVersion(projectId,createdVersionId);throw error;}
  }

  private activeVersion(projectId:string,key:ModuleKey):ArtifactVersion|undefined {
    const row=this.db.connection.prepare(`SELECT active_version_id FROM artifacts
      WHERE project_id=? AND artifact_type=? ORDER BY created_at LIMIT 1`).get(projectId,key) as {active_version_id:string|null}|undefined;
    return row?.active_version_id?this.artifacts.getVersion(row.active_version_id):undefined;
  }

  private isInvalidApprovedProduct(version:ArtifactVersion):boolean {
    return version.artifactType==="product"&&version.status==="approved"&&!this.validatePersistedProduct(version).audit.ok;
  }

  private validatePersistedProduct(version:ArtifactVersion) {
    return validateProductOutput(version.outputData,this.persistedProductContext(version));
  }

  private persistedProductContext(version:ArtifactVersion):ProductValidationContext {
    const snapshot=asRecord(version.inputSnapshot),context=asRecord(snapshot.context),parentOutputs=asRecord(context.parentOutputs);
    const groundingSnapshot=productGroundingSnapshotFrom(context.productGrounding);
    if(groundingSnapshot)return {groundingSnapshot,userAuthored:snapshot.source==="user"};
    let selectedUpstream=parentOutputs.opportunities;
    if(selectedUpstream===undefined){
      const parent=this.db.connection.prepare(`SELECT parent.output_data FROM lineage_edges edge
        JOIN artifact_versions parent ON parent.id=edge.parent_version_id
        JOIN artifacts artifact ON artifact.id=parent.artifact_id
        WHERE edge.project_id=? AND edge.child_version_id=? AND artifact.artifact_type='opportunities'
        ORDER BY parent.created_at DESC LIMIT 1`).get(version.projectId,version.id) as {output_data:string}|undefined;
      if(parent)selectedUpstream=JSON.parse(parent.output_data) as unknown;
    }
    const settings=asRecord(context.settings);
    return {
      selectedUpstream,
      productConfiguration:{generalNotes:settings.generalNotes??this.settings.get(version.projectId)?.generalNotes??null},
      explicitUserInput:context.additionalInstructions??snapshot.instructions??null,
      problemEvidence:context.evidence,
      allowedEvidenceIds:Array.isArray(snapshot.evidenceIds)?snapshot.evidenceIds.filter((value):value is string=>typeof value==="string"):[],
      userAuthored:snapshot.source==="user",
    };
  }

  private toResult(version: NonNullable<ReturnType<ArtifactRepository["getVersion"]>>, invalidProduct=false): ModuleResult {
    return {
      moduleKey: version.artifactType as ModuleKey,
      artifactId: version.artifactId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      freshness: invalidProduct?"stale":version.freshness,
      status: invalidProduct?"draft":version.status,
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

interface ModuleKnowledgeItem {kind:"PROJECT_KNOWLEDGE"|"GLOBAL_KNOWLEDGE"|"APPROVED_MEMORY";content:string;title:string;rawScore:number;weightedScore:number;chunkId?:string;memoryId?:string;documentId?:string;libraryId?:string;heading?:string|null;pageNumber?:number|null;chunkIndex?:number;artifactVersionId?:string;}
interface ModuleKnowledgeContextItem {citationId:string;kind:ModuleKnowledgeItem["kind"];documentId:string|undefined;chunkId:string|undefined;memoryId:string|undefined;artifactVersionId:string|undefined;title:string;heading:string|null|undefined;pageNumber:number|null|undefined;content:string;rawScore:number;}
function retrieveKnowledge(repository:KnowledgeRepository,projectId:string,query:string,policy:ReturnType<typeof getAgentKnowledgePolicy>):ModuleKnowledgeItem[]{
  const terms=query.normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu)?.slice(0,24)??[];
  if(!terms.length)return[];
  const fts=terms.map(term=>`"${term.replaceAll('"','')}"`).join(" OR ");
  try{const allowed=new Set(policy.allowedKinds);const candidates:ModuleKnowledgeItem[]=[];if(allowed.has("project_knowledge")||allowed.has("global_knowledge")){for(const item of repository.search({projectId,query:fts,limit:Math.min(100,policy.maxChunks*4)})){const policyKind=item.kind==="PROJECT_KNOWLEDGE"?"project_knowledge":"global_knowledge";if(!allowed.has(policyKind))continue;candidates.push({kind:item.kind,content:item.content,title:item.title,rawScore:item.rawScore,weightedScore:(-item.rawScore)*policy.kindWeights[policyKind],chunkId:item.chunkId,documentId:item.documentId,libraryId:item.libraryId,heading:item.heading,pageNumber:item.pageNumber,chunkIndex:item.chunkIndex});}}if(allowed.has("approved_memory")){for(const item of repository.searchMemory(projectId,fts,policy.maxPerKind.approved_memory)){candidates.push({kind:"APPROVED_MEMORY",content:JSON.stringify(item.output),title:`Memoria aprobada · ${item.artifactType}`,rawScore:item.rawScore,weightedScore:(-item.rawScore)*policy.kindWeights.approved_memory,memoryId:item.memoryId,artifactVersionId:item.artifactVersionId});}}const counts=new Map<string,number>(),seen=new Set<string>();return candidates.sort((a,b)=>b.weightedScore-a.weightedScore||a.title.localeCompare(b.title)).filter(item=>{const fingerprint=item.content.replace(/\s+/g," ").trim().toLowerCase();if(seen.has(fingerprint))return false;const policyKind=item.kind==="PROJECT_KNOWLEDGE"?"project_knowledge":item.kind==="GLOBAL_KNOWLEDGE"?"global_knowledge":"approved_memory",count=counts.get(policyKind)??0;if(count>=policy.maxPerKind[policyKind])return false;seen.add(fingerprint);counts.set(policyKind,count+1);return true;}).slice(0,policy.maxChunks);}
  catch{return[];}
}

function buildKnowledgePromptContext(rows:ModuleKnowledgeItem[],maxCharacters:number):ModuleKnowledgeContextItem[]{
  const context:ModuleKnowledgeContextItem[]=[];
  for(const [index,row] of rows.entries()){
    const base={citationId:`K${index+1}`,kind:row.kind,documentId:row.documentId,chunkId:row.chunkId,memoryId:row.memoryId,artifactVersionId:row.artifactVersionId,title:row.title,heading:row.heading,pageNumber:row.pageNumber,rawScore:row.rawScore};
    const empty={...base,content:""};
    if(JSON.stringify([...context,empty]).length>maxCharacters)break;
    let low=0,high=row.content.length;
    while(low<high){const middle=Math.ceil((low+high)/2);if(JSON.stringify([...context,{...base,content:row.content.slice(0,middle)}]).length<=maxCharacters)low=middle;else high=middle-1;}
    context.push({...base,content:row.content.slice(0,low)});
  }
  return context;
}

/** Keep semantic parent data while excluding the large deterministic Problems audit. */
function providerParentOutputs(parents:Partial<Record<ModuleKey,unknown>>):Partial<Record<ModuleKey,unknown>>{
  return Object.fromEntries(Object.entries(parents).map(([key,value])=>{
    if(key!=="problems"||typeof value!=="object"||value===null||Array.isArray(value))return[key,value];
    const problems=value as Record<string,unknown>;
    return[key,{schemaVersion:problems.schemaVersion,researchFocus:problems.researchFocus,qualityAlgorithmVersion:problems.qualityAlgorithmVersion,items:problems.items}];
  })) as Partial<Record<ModuleKey,unknown>>;
}

function asRecord(value:unknown):Record<string,unknown>{
  return typeof value==="object"&&value!==null&&!Array.isArray(value)?value as Record<string,unknown>:{};
}

function productGroundingSnapshotFrom(value:unknown):ProductGroundingSnapshot|undefined{
  const snapshot=asRecord(value);
  if(!Array.isArray(snapshot.allowedEvidence)||!Array.isArray(snapshot.authorizedCapabilities))return undefined;
  return snapshot as unknown as ProductGroundingSnapshot;
}

function sanitizeProductKnowledge(
  context: readonly ModuleKnowledgeContextItem[],
  allowedEvidenceIds: ReadonlySet<string>,
): Array<Record<string,unknown>> {
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
  return context.map((item) => ({
    citationId:item.citationId,
    kind:item.kind,
    title:item.title,
    heading:item.heading,
    pageNumber:item.pageNumber,
    content: item.content.replace(uuid, (id) => allowedEvidenceIds.has(id) ? id : "[id omitted]"),
  }));
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
  product:{schemaVersion:1,proposals:[{id:"product-1",name:`Plan práctico: ${niche}`,concept:`Sistema guiado para ${opportunity?.name??niche}`,problem:opportunity?.rationale??problem?.summary??quote,outcome:"Un proceso claro y repetible",promise:"Avanza con una secuencia práctica y verificable",format:"Guía digital",deliverables:["Guía paso a paso"],modules:["Diagnóstico","Plan","Implementación","Revisión"],checklists:[],templates:[],resources:[],bonuses:[],evidenceIds:opportunity?.evidenceIds??ids}],selectedId:"product-1"},
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

/**
 * PHASE 4C — build a COMPACT discovery sourceItems from the structured Problems
 * output the pipeline already produced. Never resends the full corpus.
 *
 * For each candidate it includes the real evidence ids it references (that ARE
 * in the exact Analysis Set snapshot) plus a short server-side snippet for each.
 * This exposes resolvable evidence ids to the provider so it can propose
 * `evidenceIds` that the validator accepts, and grounded aliases. The enrichment
 * is generic (works for any niche) and bounded (max 5 evidence + short snippets
 * per candidate), keeping the payload compact.
 */
function buildDiscoverySourceItems(
  output: Record<string, unknown>,
  analysisSet: AnalysisSetSnapshot,
): DomainVocabularyDiscoverySourceItem[] {
  const rowsById = new Map(analysisSet.rows.map((row) => [row.id, row]));
  const items = Array.isArray(output.items) ? output.items : [];
  const sourceItems: DomainVocabularyDiscoverySourceItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const summary = typeof item.summary === "string" ? item.summary.trim() : "";
    const text = [name, summary].filter(Boolean).join(". ");
    if (!text) continue;
    const id =
      typeof item.id === "string" && item.id ? item.id : `candidate-${sourceItems.length + 1}`;
    const category =
      typeof item.category === "string" && item.category.trim() ? item.category.trim() : undefined;
    const evidenceIds = Array.isArray(item.evidenceIds)
      ? [...new Set(item.evidenceIds.filter((eid): eid is string => typeof eid === "string" && rowsById.has(eid)))].slice(0, 5)
      : [];
    const snippets = evidenceIds
      .map((eid) => rowsById.get(eid)!.quoteText.trim().slice(0, 120))
      .filter(Boolean);
    sourceItems.push({
      id,
      text,
      ...(category ? { context: category } : {}),
      ...(evidenceIds.length > 0 ? { evidenceIds, snippets } : {}),
    });
  }
  return sourceItems;
}

/**
 * PHASE 4C — build a safe, credential-free discovery audit for the current run
 * from a {@link DomainVocabularyDiscoveryResult}. Only fields that already exist
 * are included; never API keys, raw prompts or full corpus.
 */
function toDiscoveryAudit(
  result: DomainVocabularyDiscoveryResult,
  sourceItemCount: number,
): Record<string, unknown> {
  return {
    status: result.status,
    sourceItemCount,
    ...(result.vocabularyVersionId ? { vocabularyVersionId: result.vocabularyVersionId } : {}),
    ...(result.validationStatus ? { validationStatus: result.validationStatus } : {}),
    issues: result.issues,
    statistics: result.statistics,
    provider: {
      provider: result.providerMetadata?.provider ?? null,
      model: result.providerMetadata?.model ?? null,
    },
  };
}

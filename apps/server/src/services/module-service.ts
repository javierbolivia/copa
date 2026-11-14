import {validateFunnelOutput} from "./funnel-output-validator.js";
import {validateLandingOutput} from "./landing-output-validator.js";
import {validateOfferOutput} from "./offer-output-validator.js";
import {validateFinalProductOutput} from "./final-product-output-validator.js";
import {recordFinalProductReview, finalProductReviewStatus, type FinalProductReviewKind} from "./final-product-review.js";
import type {FinalProductReviewInput} from "@our-platform/shared";
import {validateBeliefsOutput} from "./beliefs-output-validator.js";
import {validateMechanismOutput} from "./mechanism-output-validator.js";
import {
  auditLandingQuality,
  AVATAR_FIELDS,
  LANDING_SECTION_LAYOUTS,
  LANDING_THEME_PRESETS,
  landingCheckoutUrl,
  landingImageUrl,
  landingStats,
  landingTextList,
  resolveLandingLayout,
  type LandingQualityReport,
} from "@our-platform/shared";
import { STUDIO_VISUAL_ASSETS, studioAssetUrl } from "./studio-visual-assets.js";
import {validateAvatarOutput} from "./avatar-output-validator.js";
import type { ArtifactVersion, LlmGenerateRequest, LlmGenerateResult, LlmPhysicalRequestUsage, LlmProvider, ModuleKey, ModuleResult, ProjectSettings } from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import { createDemoOutput } from "../domain/demo-outputs.js";
import { getModule } from "../domain/module-registry.js";
import type { ArtifactRepository } from "../repositories/artifact-repository.js";
import type { ProjectSettingsRepository } from "../repositories/project-settings-repository.js";
import type { WorkflowRepository } from "../repositories/workflow-repository.js";
import type { OpenAIProvider } from "../integrations/openai-provider.js";
import { GeminiResponseError, type GeminiProvider } from "../integrations/gemini-provider.js";
import { IntegrationError } from "../integrations/integration-error.js";
import { DEEPSEEK_DEFAULT_MODEL, type DeepSeekProvider } from "../integrations/deepseek-provider.js";
import { GROQ_DEFAULT_MODEL, type GroqProvider } from "../integrations/groq-provider.js";
import { OPENROUTER_DEFAULT_MODEL, type OpenRouterProvider } from "../integrations/openrouter-provider.js";
import {
  clusterEvidence,
  buildClusteredMapBatches,
  reconcileCandidatesWithClusters,
  type LocalClusteringResult,
} from "./local-evidence-preprocessor.js";
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
import { projectEvidenceForProvider, type ProviderEvidenceAudit } from "./provider-evidence-projection.js";
import { buildGeminiProjection, type GeminiPayloadProjectionAudit } from "./gemini-payload-projection.js";
import {
  buildProductGroundingSnapshot,
  buildProductStructuredOutputSchema,
  validateProductOutput,
  type ProductGroundingSnapshot,
  type ProductValidationContext,
} from "./product-output-validator.js";

import { GEMINI_ANALYSIS_MODEL } from "../integrations/gemini-provider.js";
import { estimateTokenCost, ratesForModel } from "./provider-pricing.js";
export { GEMINI_ANALYSIS_MODEL } from "../integrations/gemini-provider.js";
import { StageProviderRouter, type PipelineStage } from "./stage-provider-router.js";
import { prepareBoundedPlan, assertFrozenPlan, compactValidationPayload, validationProblemSchema, aliasMapEvidence, decodeMapEvidence, type BoundedPlan } from "./bounded-validation-plan.js";
import { ValidationSession } from "./validation-session.js";
const GEMINI_MAX_ATTEMPTS = 2;
const GEMINI_RETRY_DELAY_MS = 250;

type ProviderStage = "research/direct" | "problems/map" | "problems/global_reduce" | "vocabulary_discovery" | "direct";
interface ProviderAttemptAudit {
  readonly stage: ProviderStage;
  readonly batch?: { readonly index: number; readonly total: number };
  readonly attempt: number;
  readonly httpStatus?: number;
  readonly candidateCount?: number;
  readonly blockReason?: string;
  readonly finishReason?: string;
  readonly responseId?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly physicalRequests?: readonly LlmPhysicalRequestUsage[];
  readonly outcome: "usable" | "empty" | "error" | "budget_exceeded";
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly retryable?: boolean;
}

interface GeminiOperationTotals {
  readonly totalProviderRequests: number;
  readonly requestsByStage: Partial<Record<ProviderStage, number>>;
  readonly retries: number;
  readonly blockedRequests: number;
  readonly failedRequests: number;
}

export class GeminiOperationRequestBudget {
  private totalProviderRequests = 0;
  private readonly requestsByStage: Partial<Record<ProviderStage, number>> = {};
  private retries = 0;
  private blockedRequests = 0;
  private failedRequests = 0;

  constructor(private readonly limit: number) {}

  reserve(stage: ProviderStage, retry = false): void {
    if (this.totalProviderRequests >= this.limit) {
      this.blockedRequests += 1;
      throw new IntegrationError(
        "request_budget_exceeded",
        `REQUEST_BUDGET_EXCEEDED: Gemini request budget ${this.limit} reached (used ${this.totalProviderRequests}); blocked before outbound request at ${stage}.`,
      );
    }
    this.totalProviderRequests += 1;
    this.requestsByStage[stage] = (this.requestsByStage[stage] ?? 0) + 1;
    if (retry) this.retries += 1;
  }

  /**
   * Reject an operation whose deterministic request plan cannot fit in the
   * remaining operation budget. This prevents spending part of a plan that is
   * known in advance to be impossible to finish.
   */
  ensurePlannedCapacity(plannedRequests: number, stage: ProviderStage): void {
    const available = this.limit - this.totalProviderRequests;
    if (plannedRequests <= available) return;
    this.blockedRequests += 1;
    throw new IntegrationError(
      "request_budget_exceeded",
      `REQUEST_BUDGET_EXCEEDED: Gemini request plan requires ${plannedRequests} request(s) but budget ${this.limit} has ${available} remaining; blocked before outbound request at ${stage}.`,
    );
  }

  recordFailure(): void { this.failedRequests += 1; }

  snapshot(): GeminiOperationTotals {
    return {
      totalProviderRequests: this.totalProviderRequests,
      requestsByStage: { ...this.requestsByStage },
      retries: this.retries,
      blockedRequests: this.blockedRequests,
      failedRequests: this.failedRequests,
    };
  }
}

const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isRetryableGeminiFailure(error: unknown): error is IntegrationError {
  return error instanceof IntegrationError && error.retryable && (error.status === 429 || error.status === 503);
}

function providerAttemptFromError(stage: ProviderStage, attempt: number, error: unknown, batch?: { readonly index: number; readonly total: number }): ProviderAttemptAudit {
  const base = { stage, attempt, ...(batch ? { batch } : {}) };
  if (error instanceof IntegrationError && error.code === "request_budget_exceeded") return { ...base, outcome: "budget_exceeded", errorCode: error.code, errorMessage: error.message, retryable: false };
  if (error instanceof GeminiResponseError) return { ...base, ...error.diagnostics, outcome: "empty", errorCode: error.code, errorMessage: error.message, retryable: false };
  if (error instanceof IntegrationError) return { ...base, ...(error.status === undefined ? {} : { httpStatus: error.status }), ...(error.physicalRequests ? { physicalRequests: error.physicalRequests } : {}), outcome: "error", errorCode: error.code, errorMessage: error.message, retryable: error.retryable };
  return { ...base, outcome: "error", errorCode: "generation_error", errorMessage: error instanceof Error ? error.message : "La generación falló.", retryable: false };
}

export interface ModuleServiceOptions {
  readonly openAI: OpenAIProvider;
  readonly gemini: GeminiProvider;
  readonly deepSeek?: DeepSeekProvider;
  readonly groq?: GroqProvider;
  readonly openRouter?: OpenRouterProvider;
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

  providerStatus(projectId?: string): { generationBlock: {code:string;message:string}|null; openai: { configured: boolean; economyModel: string; powerfulModel: string }; gemini:{configured:boolean;economyModel:string;powerfulModel:string}; deepseek:{configured:boolean;model:string}; groq?: { configured: boolean; model: string }; openrouter?: { configured: boolean; model: string }; defaultProvider: "mock" | "openai" | "gemini" | "deepseek" | "groq" | "openrouter" } {
    const projectSettings = projectId ? this.settings.get(projectId) : undefined;
    return {
      generationBlock:projectId && this.db.connection.prepare("SELECT 1 FROM validation_sessions WHERE project_id=? AND state IN ('READY','RUNNING') LIMIT 1").get(projectId)
        ?{code:"VALIDATION_PROJECT_LOCKED_NEW_AUTHORIZATION_REQUIRED",message:"La generación de este proyecto está bloqueada tras una validación controlada. Puedes revisar los resultados guardados; para generar de nuevo se necesita una nueva autorización."}:null,
      openai: {
        configured: this.options.openAI.configured,
        economyModel: projectSettings?.economyModel?.trim() || this.options.economyModel || "gpt-5-mini",
        powerfulModel: projectSettings?.powerfulModel?.trim() || this.options.powerfulModel || "gpt-5",
      },
      gemini:{configured:this.options.gemini.configured,economyModel:GEMINI_ANALYSIS_MODEL,powerfulModel:GEMINI_ANALYSIS_MODEL},
      deepseek:{configured:this.options.deepSeek?.configured??false,model:this.options.deepSeek?.effectiveModel??DEEPSEEK_DEFAULT_MODEL},
      groq:{configured:this.options.groq?.configured??false,model:this.options.groq?.effectiveModel??GROQ_DEFAULT_MODEL},
      openrouter:{configured:this.options.openRouter?.configured??false,model:this.options.openRouter?.effectiveModel??OPENROUTER_DEFAULT_MODEL},
      defaultProvider:projectSettings?.preferredLlmProvider==="gemini"?"gemini":projectSettings?.preferredLlmProvider==="deepseek"?"deepseek":projectSettings?.preferredLlmProvider==="groq"?"groq":projectSettings?.preferredLlmProvider==="openrouter"?"openrouter":projectSettings?.preferredLlmProvider === "openai" ? "openai" : (this.options.deepSeek?.configured ? "deepseek" : this.options.gemini.configured ? "gemini" : "mock"),
    };
  }

  get(projectId: string, key: ModuleKey): ModuleResult | undefined {
    const version = this.activeVersion(projectId, key);
    if (!version || (key === "product" && !this.validatePersistedProduct(version).audit.ok) || (version&&key==="avatar"&&!this.validatePersistedAvatar(version).audit.ok)||(version&&key==="mechanism"&&!this.validatePersistedMechanism(version).audit.ok)||(version&&key==="beliefs"&&!this.validatePersistedBeliefs(version).audit.ok)||(version&&key==="offer"&&!this.validatePersistedOffer(version).audit.ok)||(version&&key==="landing"&&!this.validatePersistedLanding(version).audit.ok)||(version&&key==="funnel"&&!this.validatePersistedFunnel(version).audit.ok)) return undefined;
    return this.toResult(version);
  }

  history(projectId: string, key: ModuleKey): ModuleResult[] {
    return this.artifacts.list(projectId)
      .filter((version) => version.artifactType === key)
      .map((version) => this.toResult(version, this.isInvalidApprovedStrategyOutput(version)));
  }

  list(projectId: string): ModuleResult[] {
    return this.artifacts.list(projectId)
      .filter((version) => {
        const row = this.db.connection.prepare(
          "SELECT active_version_id FROM artifacts WHERE id = ? AND project_id = ?",
        ).get(version.artifactId, projectId) as { active_version_id: string | null } | undefined;
        return row?.active_version_id === version.id;
      })
      .map((version) => this.toResult(version, this.isInvalidApprovedStrategyOutput(version)));
  }

  artifactVersions(projectId:string):ArtifactVersion[] {
    return this.artifacts.list(projectId).map((version)=>this.isInvalidApprovedStrategyOutput(version)?{
      ...version,
      status:"draft",
      freshness:"stale",
      staleReason:"Documento incompleto o con afirmaciones sin respaldo válido; requiere revisión o regeneración.",
    }:version);
  }

  saveDraft(projectId:string,key:ModuleKey,outputData:unknown,expectedBaseVersionId?:string,sourceVersionId?:string, factualReview?:FinalProductReviewInput, factualReviewKind:FinalProductReviewKind="HUMAN_ATTESTATION"):ModuleResult {
    const definition=getModule(key);if(!definition)throw new Error("Módulo desconocido.");
    if(!isCanonicalModuleOutput(key,outputData)){
      if(key==="opportunities")throw new Error("Para editar Oportunidades se requieren los nueve scores válidos (0–100), selectedId y referencias estructuradas. Si esta versión histórica no tiene scores, regenera Oportunidades; el histórico se conserva sin cambios.");
      throw new Error("Los cambios no conservan el contrato estructurado del módulo.");
    }
    const activePointer=this.activeVersion(projectId,key);
    if(sourceVersionId&&key!=="product"&&key!=="avatar"&&key!=="mechanism"&&key!=="beliefs"&&key!=="offer"&&key!=="landing"&&key!=="funnel"&&key!=="content"&&key!=="final_product")throw new Error("La edición desde una versión concreta no está disponible para este módulo.");
    const active=sourceVersionId?this.artifacts.getVersion(sourceVersionId):activePointer;
    if(!active||active.projectId!==projectId||active.artifactType!==key)throw new Error("La versión de origen no existe en este módulo.");
    if(sourceVersionId){
      const snapshot=asRecord(active.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(active.status==="draft"){
        if(expected===undefined||(activePointer?.id??null)!==expected)throw new Error("El documento activo cambió o el borrador no conserva su versión de origen; regenera antes de editar.");
      }else if(active.status!=="approved"||active.id!==activePointer?.id)throw new Error("Solo puedes editar el documento activo o un borrador vigente.");
    }
    if(expectedBaseVersionId!==undefined&&activePointer?.id!==expectedBaseVersionId)throw new Error("La versión activa cambió mientras revisabas el documento. Recarga antes de guardar.");
    if(active.freshness!=="fresh")throw new Error("La versión activa está obsoleta; regenera el módulo antes de editarlo.");
    const current=this.toResult(active);
    const parentIds=this.db.connection.prepare("SELECT parent_version_id FROM lineage_edges WHERE project_id=? AND child_version_id=? ORDER BY created_at").all(projectId,current.versionId) as unknown as Array<{parent_version_id:string}>;
    let normalizedOutput=outputData;
    if(key==="research"){
      const validation=validateResearchOutput(outputData,this.researchSnapshotEvidence(active));
      if(!validation.audit.ok)throw new Error(`Investigación incompleta o sin evidencia válida: ${validation.audit.errors.join("; ")}`);
      normalizedOutput=validation.output;
    }
    if(key==="funnel"){const validation=validateFunnelOutput(outputData,this.avatarEvidence(active));if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));normalizedOutput=validation.output;}
    if(key==="landing"){const validation=validateLandingOutput(outputData,this.avatarEvidence(active));if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));normalizedOutput=validation.output;}
    if(key==="offer"){const validation=validateOfferOutput(outputData,this.avatarEvidence(active));if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));normalizedOutput=validation.output;}
    if(key==="beliefs"){const validation=validateBeliefsOutput(outputData,this.avatarEvidence(active));if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));normalizedOutput=validation.output;}
    if(key==="mechanism"){const validation=validateMechanismOutput(outputData,this.avatarEvidence(active));if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));normalizedOutput=validation.output;}
    if(key==="avatar"){const validation=validateAvatarOutput(outputData,this.avatarEvidence(active));if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));normalizedOutput=validation.output;}
    if(key==="final_product")normalizedOutput=validateFinalProductOutput(outputData).output;
    if(key==="problems")normalizedOutput=this.validateProblemDraft(active,outputData);
    if(key==="opportunities"){
      assertOpportunityReferences(outputData,this.parentOutput(projectId,current.versionId,"problems"));
      normalizedOutput=applyOpportunityScoring(asRecord(outputData));
    }
    const version=this.artifacts.createVersion({projectId,artifactType:key,name:definition.label,artifactId:current.artifactId,inputSnapshot:{...asRecord(active.inputSnapshot),editedFromVersionId:key==="product"||key==="avatar"||key==="mechanism"||key==="beliefs"||key==="offer"||key==="landing"||key==="funnel"||key==="content"||key==="final_product"?(activePointer?.id??null):current.versionId,...((key==="product"||key==="avatar"||key==="mechanism"||key==="beliefs"||key==="offer"||key==="landing"||key==="funnel"||key==="content"||key==="final_product")?{editingSourceVersionId:active.id}:{}),source:"user",...(key==="final_product"?{finalProductFactualReview:factualReview?recordFinalProductReview(normalizedOutput,factualReview,factualReviewKind):null}:{})},outputData:normalizedOutput,parentVersionIds:parentIds.map(item=>item.parent_version_id),status:"draft"});
    return this.toResult(version);
  }

  reviewFinalProduct(projectId:string,versionId:string,input:FinalProductReviewInput,kind:FinalProductReviewKind="HUMAN_ATTESTATION"):ModuleResult {
    const version=this.artifacts.getVersion(versionId);
    if(!version||version.projectId!==projectId||version.artifactType!=="final_product")throw new Error("El manuscrito no existe en este proyecto.");
    return this.saveDraft(projectId,"final_product",version.outputData,undefined,version.id,input,kind);
  }

  archiveDraft(projectId:string,key:ModuleKey,versionId:string):ModuleResult|undefined {
    const version=this.artifacts.getVersion(versionId);
    if(!version||version.projectId!==projectId||version.artifactType!==key)return undefined;
    const archived=this.artifacts.archiveDraft(projectId,versionId);
    return archived?this.toResult(archived):undefined;
  }

  approve(projectId:string,key:ModuleKey,versionId:string):ModuleResult|undefined {
    const version=this.artifacts.getVersion(versionId);if(!version||version.projectId!==projectId||version.artifactType!==key)return undefined;
    if(version.status==="draft"&&key==="opportunities"){
      if(!isCanonicalModuleOutput(key,version.outputData))throw new Error("El borrador no conserva el contrato estructurado de Oportunidades.");
      assertOpportunityReferences(version.outputData,this.parentOutput(projectId,version.id,"problems"));
      assertOpportunityScoring(version.outputData);
    }
    if(key==="product"){
      const validation=this.validatePersistedProduct(version);
      if(!validation.audit.ok)throw new Error(`Producto incompleto o sin grounding suficiente: ${validation.audit.errors.join("; ")}`);
    }
    const atomicExport = version.status === "draft" && (key === "landing" || key === "funnel" || key === "final_product");
    const db = this.db.connection;
    try {
    if (atomicExport) db.exec("BEGIN IMMEDIATE");
    const approved=this.artifacts.approveVersion(projectId,versionId,key==="research"?()=>{
      const validation=validateResearchOutput(version.outputData,this.researchSnapshotEvidence(version));
      if(!validation.audit.ok)throw new Error(`Investigación incompleta o sin evidencia válida: ${validation.audit.errors.join("; ")}`);
      const snapshot=asRecord(version.inputSnapshot),brief=asRecord(snapshot.researchBrief);
      const expected=typeof snapshot.editedFromVersionId==="string"?snapshot.editedFromVersionId:brief.activeVersionIdAtStart;
      if(expected!==undefined&&(this.activeVersion(projectId,key)?.id??null)!==expected)throw new Error("Hay una Investigación aprobada más reciente; revisa el nuevo brief antes de aprobar este borrador.");
      if(snapshot.researchBrief){
        const currentProject=this.db.connection.prepare("SELECT name,niche,description FROM projects WHERE id=?").get(projectId);
        if(JSON.stringify(currentProject)!==JSON.stringify(brief.project)||(this.settings.researchFocus(projectId)?.value??null)!==brief.researchFocus)throw new Error("El alcance de Investigación cambió; regenera el borrador antes de aprobarlo.");
      }
    }:key==="problems"&&version.status==="draft"?()=>{
      const expected=asRecord(version.inputSnapshot).editedFromVersionId;
      const active=this.activeVersion(projectId,key);
      if(typeof expected!=="string"||active?.id!==expected)throw new Error("Hay una versión de Problemas más reciente; revisa la interpretación activa antes de aprobar el borrador.");
      const normalized=this.validateProblemDraft(active,version.outputData);
      if(["items","analysisMetrics","analysisAudit"].some(field=>JSON.stringify(normalized[field])!==JSON.stringify(asRecord(version.outputData)[field])))throw new Error("El borrador de Problemas contiene soporte o métricas no verificadas; vuelve a guardar una revisión validada.");
    }:key==="opportunities"&&version.status==="draft"?()=>{
      const expected=asRecord(version.inputSnapshot).editedFromVersionId;
      if(typeof expected!=="string"||this.activeVersion(projectId,key)?.id!==expected)throw new Error("Hay una decisión de Oportunidades más reciente; revisa la selección activa antes de aprobar el borrador.");
      assertOpportunityReferences(version.outputData,this.parentOutput(projectId,version.id,"problems"));
      assertOpportunityScoring(version.outputData);
    }:key==="funnel"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay un Funnel más reciente; revisa la versión activa antes de aprobar.");
      const validation=this.validatePersistedFunnel(version);
      if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));
    }:key==="landing"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay una Landing más reciente; revisa la versión activa antes de aprobar.");
      const validation=this.validatePersistedLanding(version);
      if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));
    }:key==="offer"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay una Oferta más reciente; revisa la versión activa antes de aprobar.");
      const validation=this.validatePersistedOffer(version);
      if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));
    }:key==="beliefs"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay una interpretación de Creencias más reciente; revisa la versión activa antes de aprobar.");
      const validation=this.validatePersistedBeliefs(version);
      if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));
    }:key==="mechanism"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay un Mecanismo más reciente; revisa la interpretación activa antes de aprobar.");
      const validation=this.validatePersistedMechanism(version);
      if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));
    }:key==="avatar"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay un Avatar más reciente; revisa el perfil activo antes de aprobar.");
      const validation=this.validatePersistedAvatar(version);
      if(!validation.audit.ok)throw new Error(validation.audit.errors.join("; "));
    }:key==="content"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay un Contenido más reciente; revisa el borrador antes de aprobar.");
    }:key==="final_product"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      if(version.status==="draft"&&(expected===undefined||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay un Producto final más reciente; revisa el borrador antes de aprobarlo.");
      const validation=validateFinalProductOutput(version.outputData);
      if(!validation.audit.ok)throw new Error(`Producto final incompleto; no se puede aprobar ni exportar: ${validation.audit.errors.join("; ")}`);
      if(finalProductReviewStatus(version.outputData,version.inputSnapshot).status!=="RECORDED")throw new Error("Registra una revisión factual explícita de fuentes y afirmaciones para este manuscrito antes de aprobarlo o exportarlo.");
    }:key==="product"&&version.status==="draft"?()=>{
      const snapshot=asRecord(version.inputSnapshot);
      const expected=snapshot.editedFromVersionId;
      if(snapshot.source==="user"&&((expected!==null&&typeof expected!=="string")||(this.activeVersion(projectId,key)?.id??null)!==expected))throw new Error("Hay una versión de Producto más reciente; revisa el producto activo antes de aprobar este borrador.");
      const validation=this.validatePersistedProduct(version);
      if(!validation.audit.ok)throw new Error(`Producto incompleto o sin grounding suficiente: ${validation.audit.errors.join("; ")}`);
    }:undefined);if(!approved){if(atomicExport)db.exec("COMMIT");return undefined;}
    if(key==="landing")this.exporter.exportLanding(projectId,approved.id,approved.outputData);
    if(key==="funnel")this.exporter.exportFunnel(projectId,approved.id,approved.outputData);
    if(key==="final_product"){
      const review=finalProductReviewStatus(approved.outputData,approved.inputSnapshot);
      if(review.status!=="RECORDED")throw new Error("No se puede exportar un manuscrito sin revisión factual registrada.");
      this.exporter.exportFinalProduct(projectId,approved.id,approved.outputData,review.kind);
    }
    this.knowledge.saveMemoryDecision({originProjectId:projectId,artifactVersionId:approved.id,disposition:"APPROVED",visibility:"PROJECT",reusable:false,preferred:false});
    if (atomicExport) db.exec("COMMIT");
    return this.toResult(approved);
    } catch (error) {
      if (atomicExport && db.isTransaction) db.exec("ROLLBACK");
      if (atomicExport) this.exporter.cleanupVersion(projectId,versionId);
      throw error;
    }
  }

  canPromoteToMemory(projectId:string,versionId:string):boolean {
    const version=this.artifacts.getVersion(versionId);
    if(!version||version.projectId!==projectId)return false;
    if(version.artifactType==="funnel")return version.status==="approved"&&this.validatePersistedFunnel(version).audit.ok;
    if(version.artifactType==="landing")return version.status==="approved"&&this.validatePersistedLanding(version).audit.ok;
    if(version.artifactType==="offer")return version.status==="approved"&&this.validatePersistedOffer(version).audit.ok;
    if(version.artifactType==="beliefs")return version.status==="approved"&&this.validatePersistedBeliefs(version).audit.ok;
    if(version.artifactType==="mechanism")return version.status==="approved"&&this.validatePersistedMechanism(version).audit.ok;
    if(version.artifactType==="avatar")return version.status==="approved"&&this.validatePersistedAvatar(version).audit.ok;
    if(version.artifactType!=="product")return true;
    return version.status==="approved"&&this.validatePersistedProduct(version).audit.ok;
  }

  prepareValidation(projectId:string,expectedEvidence?:number):BoundedPlan {
    const router=new StageProviderRouter(this.options);
    for(const stage of ["problems/map","problems/global_reduce","opportunities/direct"] as const)router.resolveValidationStage(stage);
    return prepareBoundedPlan(this.db,projectId,expectedEvidence===undefined?{}:{expectedEvidence});
  }

  async executeValidation(sessionId:string,plan:BoundedPlan):Promise<{problems:ModuleResult;opportunities:ModuleResult}> {
    assertFrozenPlan(this.db,plan);
    const session=new ValidationSession(this.db.connection,sessionId);
    session.create(plan.projectId,plan.snapshotHash,{metrics:plan.metrics,maps:plan.maps,mapEvidenceAliases:plan.maps.map(map=>Object.fromEntries(aliasMapEvidence(map).aliases)),manifest:plan.clustering.clusters.map(c=>({clusterId:c.clusterId,evidenceIds:c.evidenceIds})),vocabulary:plan.vocabulary?.vocabularyVersionId??"LOCAL_CORE"});
    session.start();
    try {
      const problems=await this.run(plan.projectId,"problems","deepseek",undefined,{session,plan});
      if(problems.status!=="approved"||problems.freshness!=="fresh")throw new Error("PROBLEMS_NOT_APPROVED_FRESH");
      const opportunities=await this.run(plan.projectId,"opportunities","gemini",undefined,{session,plan});
      return {problems,opportunities};
    } catch(error){
      session.fail("VALIDATION_FAILED");
      const last=session.requests().at(-1);
      if(last && !this.db.connection.prepare("SELECT 1 FROM generations WHERE id=?").get(String(last.generation_id))){
        const now=new Date().toISOString();
        this.db.connection.prepare("INSERT INTO generations(id,project_id,agent_key,provider,model,status,input_snapshot,prompt_version,error_code,error_message,created_at,completed_at) VALUES(?,?,?,?,?,'FAILED',?,'bounded-validation-v1','VALIDATION_FAILED','Validation stopped; see physical request ledger.',?,?)")
          .run(String(last.generation_id),plan.projectId,String(last.module),String(last.provider),String(last.requested_model),JSON.stringify({validationSessionId:sessionId,physicalRequests:session.requests()}),now,now);
      }
      throw error;
    }
  }

  async run(projectId: string, key: ModuleKey, provider?: string, instructions?:string, validation?:{session:ValidationSession;plan:BoundedPlan}): Promise<ModuleResult> {
    if(validation){
      if(key!=="problems"&&key!=="opportunities")throw new Error("VALIDATION_MODULE_FORBIDDEN");
      assertFrozenPlan(this.db,validation.plan);
      validation.session.claimModule(key);
    }else if(this.db.connection.prepare("SELECT 1 FROM validation_sessions WHERE project_id=? AND state IN ('READY','RUNNING') LIMIT 1").get(projectId)){
      throw new Error("VALIDATION_PROJECT_LOCKED_NEW_AUTHORIZATION_REQUIRED");
    }
    const definition = getModule(key);
    if (!definition) throw new Error("Módulo desconocido.");
    const projectSettings = this.settings.get(projectId);
    const requestedProvider = provider ?? projectSettings?.preferredLlmProvider ?? "mock";
    if (requestedProvider !== "mock" && requestedProvider !== "openai" && requestedProvider !== "gemini" && requestedProvider !== "deepseek" && requestedProvider !== "groq" && requestedProvider !== "openrouter") {
      throw new Error(`Proveedor LLM no soportado: ${requestedProvider}.`);
    }
    const selectedProvider = key === "sources" ? "local" : requestedProvider;
    if (selectedProvider === "openai" && !this.options.openAI.configured) {
      throw new Error("OpenAI no esta configurado. Define OPENAI_API_KEY o ejecuta con el proveedor Mock.");
    }
    if(selectedProvider==="gemini"&&!this.options.gemini.configured)throw new Error("Gemini no está configurado. Define GEMINI_API_KEY o ejecuta con Demo / Mock.");
    if(selectedProvider==="deepseek"&&!this.options.deepSeek?.configured)throw new Error("DeepSeek no está configurado. Define DEEPSEEK_API_KEY o ejecuta con el proveedor Mock.");
    if(selectedProvider==="groq"&&!this.options.groq?.configured)throw new Error("Groq no está configurado. Define GROQ_API_KEY o ejecuta con el proveedor Mock.");
    if(selectedProvider==="openrouter"&&!this.options.openRouter?.configured)throw new Error("OpenRouter no está configurado. Define OPENROUTER_API_KEY o ejecuta con el proveedor Mock.");
    const startedAt = Date.now();
    const activeVersionIdAtStart=this.activeVersion(projectId,key)?.id??null;
    const researchFocusAtStart=key==="problems"||key==="research"?(this.settings.researchFocus(projectId)?.value??null):null;

    const parentIds: string[] = [];const parentOutputs:Partial<Record<ModuleKey,unknown>>={};
    const upstreamKeys=[...definition.parents,...(definition.optionalParents??[])];
    if(!validation&&upstreamKeys.includes("avatar")&&this.hasCurrentDraft(projectId,"avatar")){
      throw new Error("Avatar tiene un borrador vigente pendiente de aprobación; revisa el perfil y sus citas antes de generar etapas dependientes.");
    }
    if(!validation&&upstreamKeys.includes("beliefs")&&this.hasCurrentDraft(projectId,"beliefs")){
      throw new Error("Creencias tiene un borrador vigente pendiente de aprobación; revisa sus afirmaciones antes de generar etapas dependientes.");
    }
    if(!validation&&upstreamKeys.includes("mechanism")&&this.hasCurrentDraft(projectId,"mechanism")){
      throw new Error("Mecanismo tiene un borrador vigente pendiente de aprobación; revisa ese borrador antes de generar etapas dependientes.");
    }
    if(!validation&&upstreamKeys.includes("offer")&&this.hasCurrentDraft(projectId,"offer")){
      throw new Error("Oferta tiene un borrador vigente pendiente de aprobación; revisa esa propuesta antes de generar etapas dependientes.");
    }
    if(!validation&&upstreamKeys.includes("landing")&&this.hasCurrentDraft(projectId,"landing")){
      throw new Error("Landing tiene un borrador vigente pendiente de aprobación; revisa el contenido antes de generar etapas dependientes.");
    }
    if(!validation&&upstreamKeys.includes("funnel")&&this.hasCurrentDraft(projectId,"funnel")){
      throw new Error("Funnel tiene un borrador vigente pendiente de aprobación; revisa las integraciones antes de generar etapas dependientes.");
    }
    if(!validation&&upstreamKeys.includes("content")&&this.hasCurrentDraft(projectId,"content")){
      throw new Error("Contenido tiene un borrador vigente pendiente de aprobación; revísalo antes de generar el producto final.");
    }
    for (const parentKey of definition.parents) {
      let parent = this.get(projectId, parentKey);
      if (!validation && !parent && parentKey === "sources") {
        const sourceCount = (this.db.connection.prepare(
          "SELECT COUNT(*) AS total FROM sources WHERE project_id = ? AND status IN ('ready', 'completed')",
        ).get(projectId) as { total: number }).total;
        if (sourceCount > 0) parent = await this.run(projectId, "sources", "mock");
      }
      if (!validation && parentKey === "sources" && parent?.freshness === "stale") {
        parent = await this.run(projectId, "sources", "mock");
      }
      if (!parent) throw new Error(`Falta completar ${parentKey}.`);
      if (parent.freshness === "stale") throw new Error(`${parentKey} está obsoleto.`);
      parentIds.push(parent.versionId);
      parentOutputs[parentKey]=parent.outputData;
      if(validation && parentKey==="problems" && (parent.status!=="approved" || parent.versionId!==validation.session.row().problems_version_id))throw new Error("WRONG_VALIDATION_PROBLEMS_PARENT");
    }
    for (const optional of definition.optionalParents ?? []) {
      const parent = this.get(projectId, optional);
      if (parent && parent.freshness !== "stale") parentIds.push(parent.versionId);
      if(parent&&parent.freshness!=="stale")parentOutputs[optional]=parent.outputData;
    }

    const evidence = validation ? validation.plan.snapshot.rows : key==="research"?this.researchEvidence(projectId):this.db.connection.prepare(
      key === "problems"
        ? "SELECT e.id, e.comment_id AS commentId, e.quote_text AS quoteText, c.author, e.source_id AS sourceId, s.title AS sourceTitle, c.likes, c.is_reply AS isReply, c.thread_id AS threadId FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id = ? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') ORDER BY c.quality_score DESC,c.likes DESC,e.created_at"
        : "SELECT e.id, e.quote_text AS quoteText FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id = ? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') ORDER BY c.quality_score DESC,c.likes DESC,e.created_at LIMIT 20",
    ).all(projectId) as unknown as Array<{ id: string; quoteText: string }>;
    const project = this.db.connection.prepare("SELECT name,niche,description FROM projects WHERE id = ?").get(projectId) as { name:string;niche: string;description:string|null };
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
    let promptVersion = key === "sources" ? "local-sources-v1" : "demo-v1";
    let promptHash: string | undefined;
    let promptPath: string | undefined;
    let model = key === "sources" ? "local-sources-v1" : "demo-deterministic-v1";
    let usage: LlmGenerateResult<Record<string, unknown>>["usage"] = {
      inputTokens: 0, outputTokens: 0, estimatedCost: 0, currency: "USD", usageKind: "estimated",
    };
    let reportedModel: string | undefined;
    let structuredOutputDiagnostics: LlmGenerateResult<Record<string, unknown>>["structuredOutputDiagnostics"];
    let providerInput: Record<string, unknown> | undefined;
    let providerEvidenceAudit: ProviderEvidenceAudit | undefined;
    let opportunityEvidenceResolutionAudit: OpportunityEvidenceResolutionAudit | undefined;
    let geminiProjectionAudits: GeminiPayloadProjectionAudit[] = [];
    const providerAttempts: ProviderAttemptAudit[] = [];
    const geminiBudget = selectedProvider === "gemini" && (key === "research" || key === "problems")
      ? new GeminiOperationRequestBudget(key === "research" ? 2 : 6)
      : undefined;
    let lastProviderInput: Record<string, unknown> | undefined;
    let problemMetrics: {commentsSelectedForSemanticAnalysis:number;batchesSentToProvider:number;batchesSentToGemini:number;semanticBatchProvider:string|null;commentsPerBatch:number;candidateInsights:number;candidateEvidenceLinks:number;clustersBeforeValidation:number}|undefined;
    const generationId = uuidv7();
    let failurePersisted = false;
    const persistFailedGeneration = (error: unknown): void => {
      if (failurePersisted) return;
      const now = new Date().toISOString();
      const message = error instanceof Error ? error.message : `La generación ${selectedProvider} falló.`;
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : error instanceof Error ? error.name : "generation_error";
      const observedUsage = providerAttempts.reduce((total, attempt) => {
        const physicalRequests = attempt.physicalRequests;
        if (physicalRequests?.length) {
          for (const request of physicalRequests) {
            total.inputTokens += request.inputTokens ?? 0;
            total.outputTokens += request.outputTokens ?? 0;
          }
        } else {
          total.inputTokens += attempt.inputTokens ?? 0;
          total.outputTokens += attempt.outputTokens ?? 0;
        }
        return total;
      }, { inputTokens: 0, outputTokens: 0 });
      const { inputTokens, outputTokens } = observedUsage;
      const estimatedCost = inputTokens || outputTokens ? estimateCost(selectedProvider, model, modelTierFor(key), inputTokens, outputTokens, this.options) : 0;
      const db = this.db.connection;
      db.exec("SAVEPOINT failed_generation_usage");
      try {
        db.prepare(`INSERT INTO generations(id,project_id,agent_key,provider,model,status,input_snapshot,output_data,prompt_version,input_tokens,output_tokens,estimated_cost,duration_ms,error_code,error_message,created_at,completed_at) VALUES(?,?,?,?,?,'FAILED',?,NULL,?,?,?,?,?,?,?,?,?)`).run(
          generationId, projectId, agentKey, selectedProvider, model,
          JSON.stringify({ parentVersionIds: parentIds, evidenceIds, moduleKey: key, provider: selectedProvider, model, promptHash, promptPath, ...(providerEvidenceAudit ? { providerEvidenceProjection: providerEvidenceAudit } : {}), ...(geminiProjectionAudits.length ? { geminiPayloadProjection: geminiProjectionAudits } : {}), providerAttempts, ...(geminiBudget ? { geminiOperationTotals: geminiBudget.snapshot() } : {}), context: lastProviderInput ?? providerInput }),
          promptVersion, inputTokens, outputTokens, estimatedCost, Date.now() - startedAt, code, message, now, now,
        );
        if (inputTokens || outputTokens) {
          db.prepare(`INSERT INTO llm_usage(id,project_id,generation_id,provider,model,input_tokens,output_tokens,estimated_cost,currency,is_estimate,recorded_at) VALUES(?,?,?,?,?,?,?,?,'USD',1,?)`).run(
            uuidv7(), projectId, generationId, selectedProvider, model, inputTokens, outputTokens, estimatedCost, now,
          );
        }
        db.exec("RELEASE SAVEPOINT failed_generation_usage");
        failurePersisted = true;
      } catch (persistenceError) {
        db.exec("ROLLBACK TO SAVEPOINT failed_generation_usage");
        db.exec("RELEASE SAVEPOINT failed_generation_usage");
        throw persistenceError;
      }
    };
    if ((selectedProvider === "openai"||selectedProvider==="gemini"||selectedProvider==="deepseek"||selectedProvider==="groq"||selectedProvider==="openrouter") && key !== "sources") {
      const prompt = getModulePrompt(key);
      if (!prompt) throw new Error(`No existe un prompt activo para el modulo ${key}.`);
      agentKey = prompt.agentKey;
      promptVersion = prompt.versionHash;
      promptHash = prompt.hash;
      promptPath = prompt.relativePath;
      model = selectedProvider==="gemini"?GEMINI_ANALYSIS_MODEL:selectedProvider==="deepseek"?this.options.deepSeek!.effectiveModel:selectedProvider==="groq"?(this.options.groq?.effectiveModel||GROQ_DEFAULT_MODEL):selectedProvider==="openrouter"?(this.options.openRouter?.effectiveModel||OPENROUTER_DEFAULT_MODEL):resolveModel(prompt.modelTier, projectSettings, this.options);
      // Product uses its own allow-listed grounding snapshot. Other modules
      // receive a provider-only projection of the evidence below.
      const evidenceProjection = productGroundingSnapshot ? undefined : projectEvidenceForProvider(evidence);
      if (evidenceProjection && evidenceProjection.audit.transformedSnippetCount > 0) providerEvidenceAudit = evidenceProjection.audit;
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
        project: { name: project.name, niche: project.niche,...(key==="research"?{description:project.description}:{}) }, settings: projectSettings,
        ...(key==="research"?{researchFocus:researchFocusAtStart}:{}),
        moduleKey: key, parentOutputs:providerParentOutputs(parentOutputs), evidence: evidenceProjection!.evidence,
        ...(providerEvidenceAudit ? { providerEvidenceProjection: providerEvidenceAudit } : {}),
        knowledge: {advisoryOnly:knowledgePolicy.advisoryOnly,influence:knowledgePolicy.knowledgeInfluence,chunks:knowledgeContext},
        additionalInstructions: instructions?.trim() || null,
      };
      let generated!:LlmGenerateResult<Record<string,unknown>>;
      const providerClient:LlmProvider=selectedProvider==="gemini"?this.options.gemini:selectedProvider==="deepseek"?this.options.deepSeek!:selectedProvider==="groq"?this.options.groq!:selectedProvider==="openrouter"?this.options.openRouter!:this.options.openAI;
      const callProvider = async (
        stage: ProviderStage,
        input: Record<string, unknown>,
        systemInstructions: string,
        structuredOutput: NonNullable<LlmGenerateRequest["structuredOutput"]>,
        batch?: { readonly index: number; readonly total: number },
      ): Promise<LlmGenerateResult<Record<string, unknown>>> => {
        if(validation){
          const routedStage:PipelineStage=stage==="direct"?"opportunities/direct":stage;
          const router=new StageProviderRouter(this.options),route=router.resolveValidationStage(routedStage);
          const compact=compactValidationPayload(routedStage,input);
          const mapAliases=routedStage==="problems/map"?aliasMapEvidence(compact):undefined;
          const mapAllowedEvidenceIds=mapAliases?[...mapAliases.aliases.keys()]:[];
          const projected=route.provider.name==="gemini"?buildGeminiProjection(compact,systemInstructions):{payload:mapAliases?.payload??compact,systemInstructions};
          lastProviderInput=projected.payload;
          assertFrozenPlan(this.db,validation.plan);
          const mapEvidenceContract=mapAllowedEvidenceIds.length?`\nCONTRATO MAP ESTRICTO: evidenceIds debe contener exclusivamente copias literales de esta lista; no uses clusterId, sourceId ni IDs inferidos: ${JSON.stringify(mapAllowedEvidenceIds)}`:"";
          const result=await validation.session.invoke({provider:route.provider.name,model:route.model,stage:routedStage,batch:batch?.index??null,generationId},()=>router.generateWithRouting<Record<string,unknown>>(routedStage,{input:JSON.stringify(projected.payload),systemInstructions:projected.systemInstructions+"\nModo de validación única: responde en español. Sé conciso. Un patrón por candidato; no mezcles temas. No inventes soporte. Para Problems: name <=180 caracteres, summary <=480, 1–6 evidenceIds representativos por candidato; MAP máximo 24 candidatos, REDUCE máximo 15. Reutiliza exclusivamente las referencias entregadas."+mapEvidenceContract,structuredOutput:{...structuredOutput,...(key==="problems"?{jsonSchema:validationProblemSchema(routedStage)}:{}),retryOnInvalidSchema:false},maxOutputTokens:8000},{validationMode:true,autoFallback:false}));
          model=result.requestedModel;
          providerAttempts.push({...validation.session.requests().at(-1),stage,attempt:1,outcome:"usable"} as ProviderAttemptAudit);
          return mapAliases?{...result,output:decodeMapEvidence(result.output,mapAliases.aliases)}:result;
        }
        const projected = selectedProvider === "gemini"
          ? buildGeminiProjection(input, systemInstructions, { omitEvidenceQuoteText: key === "research" })
          : { payload: input, systemInstructions, audit: undefined };
        if (projected.audit) geminiProjectionAudits.push(projected.audit);
        lastProviderInput = projected.payload;
        const maxAttempts = selectedProvider === "gemini" && key !== "final_product" ? GEMINI_MAX_ATTEMPTS : 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            geminiBudget?.reserve(stage, attempt > 1);
            const defaultMaxTokens = (key === "opportunities" || selectedProvider === "deepseek") ? 16_000 : 8_000;
            const result = await providerClient.generate<Record<string, unknown>>({ provider:selectedProvider, model, systemInstructions:projected.systemInstructions, input:JSON.stringify(projected.payload), structuredOutput, maxOutputTokens:defaultMaxTokens });
            const diagnostics = result.providerDiagnostics ?? {};
            providerAttempts.push({ stage, attempt, ...(batch ? { batch } : {}), ...(typeof diagnostics.httpStatus === "number" ? { httpStatus: diagnostics.httpStatus } : {}), ...(typeof diagnostics.candidateCount === "number" ? { candidateCount: diagnostics.candidateCount } : {}), ...(typeof diagnostics.blockReason === "string" ? { blockReason: diagnostics.blockReason } : {}), ...(typeof diagnostics.finishReason === "string" ? { finishReason: diagnostics.finishReason } : {}), ...(typeof diagnostics.responseId === "string" ? { responseId: diagnostics.responseId } : {}), ...(result.usage.inputTokens === undefined ? {} : { inputTokens: result.usage.inputTokens }), ...(result.usage.outputTokens === undefined ? {} : { outputTokens: result.usage.outputTokens }), ...(result.structuredOutputDiagnostics?.physicalRequests ? { physicalRequests: result.structuredOutputDiagnostics.physicalRequests } : {}), outcome: "usable" });
            return result;
          } catch (error) {
            providerAttempts.push(providerAttemptFromError(stage, attempt, error, batch));
            if (selectedProvider === "gemini" && !(error instanceof IntegrationError && error.code === "request_budget_exceeded")) geminiBudget?.recordFailure();
            if (!isRetryableGeminiFailure(error) || attempt === maxAttempts) throw error;
            await sleep(GEMINI_RETRY_DELAY_MS * attempt);
          }
        }
        throw new Error("Gemini retry policy ended without a result.");
      };
      try{
        let clusteringResult: LocalClusteringResult | undefined;
        type ProblemBatchItem = { evidence: typeof evidence; clusters?: unknown[] };
        let problemBatches: ProblemBatchItem[] | undefined;

        if(validation && key==="problems"){
          clusteringResult=validation.plan.clustering;
          problemBatches=validation.plan.maps.map(m=>({evidence:[],clusters:m.clusters as unknown[]}));
        } else if (key === "problems" && (selectedProvider === "deepseek" || selectedProvider === "groq" || selectedProvider === "openrouter")) {
          clusteringResult = clusterEvidence(evidence as unknown as import("./local-evidence-preprocessor.js").EvidenceItem[]);
          const { batches } = buildClusteredMapBatches(clusteringResult);
          problemBatches = batches.map((b) => {
            const repIds = new Set(b.clusters.flatMap((c) => c.representativeEvidenceIds));
            const repEvidence = evidence.filter((e) => repIds.has(e.id));
            return {
              evidence: repEvidence,
              clusters: b.clusters,
            };
          });
        } else if (key === "problems" && selectedProvider === "gemini") {
          const rawBatches = createProblemBatches(evidence);
          problemBatches = rawBatches.map((b) => ({ evidence: b }));
        }
        let mappedCandidates: Record<string, unknown>[] | undefined;
        if(problemBatches){
          // A Problems run has one MAP request per deterministic batch and one
          // global reduce. If no exact ACTIVE vocabulary exists, discovery may
          // add one more request after the reduce. Check the full possible plan
          // before Gemini can receive a partial sequence of a doomed run.
          if (selectedProvider === "gemini") {
            const effectiveFocus = deriveResearchFocus([], project.niche, researchFocusAtStart);
            const hasExactVocabulary = !!this.vocabulary.loadActiveVocabularySnapshot(
              projectId,
              researchFocusHash(effectiveFocus),
              analysisSnapshotHashFromRows(analysisSetSnapshot(this.db, projectId).rows),
            );
            geminiBudget?.ensurePlannedCapacity(
              problemBatches.length + 1 + (hasExactVocabulary ? 0 : 1),
              "problems/map",
            );
          }
          const mapped:Record<string,unknown>[]=[];let mapInputTokens=0,mapOutputTokens=0,mapCost=0;
          for(const [index,batch] of problemBatches.entries()){
            const batchProjection=projectEvidenceForProvider(batch.evidence);
            const mapInput=validation?validation.plan.maps[index]!:{...providerInput,stage:"map",researchFocus:researchFocusAtStart??project.niche,evidence:batchProjection.evidence,...(batch.clusters?{clusters:batch.clusters}:{}),...(batchProjection.audit.transformedSnippetCount?{providerEvidenceProjection:batchProjection.audit}:{}),batch:{index:index+1,total:problemBatches.length}};
            const mappedResult=await callProvider("problems/map", mapInput, `${prompt.instructions}\n\nEtapa MAP: extrae candidatos normalizados, no problemas finales. Cada item debe incluir name, summary, category, evidenceIds, semanticSignature y researchRelevanceScore (0-100).`, {name:"problems_map_output",jsonSchema:MODULE_OUTPUT_SCHEMAS.problems}, {index:index+1,total:problemBatches.length});
            if(!isCanonicalModuleOutput("problems",mappedResult.output))throw new Error(`${selectedProvider} devolvió un batch que no cumple el contrato de Problemas.`);
            const mappedItems=(mappedResult.output as {items:unknown[]}).items;
            if(validation){
              const allowed=new Set((validation.plan.maps[index]!.clusters as Array<{representativeEvidenceIds:string[]}>).flatMap(c=>c.representativeEvidenceIds));
              for(const [ci,value] of mappedItems.entries()){
                const c=value as Record<string,unknown>;
                const returned=Array.isArray(c.evidenceIds)?c.evidenceIds.map(String):[];
                const invalid=returned.filter(id=>!allowed.has(id));
                const rejectionCode=!Array.isArray(c.evidenceIds)?"MAP_EVIDENCE_IDS_MISSING":!returned.length?"MAP_EVIDENCE_IDS_EMPTY":invalid.length?"MAP_EVIDENCE_OUTSIDE_FROZEN_BATCH":null;
                if(rejectionCode){
                  validation.session.recordRejectedMapOutput(index+1,mappedResult.output,returned,invalid,rejectionCode);
                  throw new Error(rejectionCode);
                }
                c.id=`map${index+1}-candidate${ci+1}`;
              }
              if(!mappedItems.length)throw new Error("EMPTY_MAP_OUTPUT");
            }
            mapped.push(...mappedItems.filter((value):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value)));
            const observedInputTokens=mappedResult.usage.inputTokens??0,observedOutputTokens=mappedResult.usage.outputTokens??0;
            mapInputTokens+=observedInputTokens;mapOutputTokens+=observedOutputTokens;
            mapCost+=mappedResult.usage.estimatedCost??estimateCost(selectedProvider,model,modelTierFor(key),observedInputTokens,observedOutputTokens,this.options);
            reportedModel=mappedResult.reportedModel;
          }
          mappedCandidates = mapped;
          problemMetrics={commentsSelectedForSemanticAnalysis:evidence.length,batchesSentToProvider:problemBatches.length,batchesSentToGemini:selectedProvider==="gemini"?problemBatches.length:0,semanticBatchProvider:selectedProvider,commentsPerBatch:evidence.length > 120 ? Math.ceil(evidence.length / problemBatches.length) : 60,candidateInsights:mapped.length,candidateEvidenceLinks:mapped.reduce((sum,item)=>sum+(Array.isArray(item.evidenceIds)?item.evidenceIds.length:0),0),clustersBeforeValidation:mapped.length};
          providerInput={...providerInput,stage:"global_reduce",researchFocus:researchFocusAtStart??project.niche,evidence:undefined,candidates:mapped};
          usage={inputTokens:mapInputTokens,outputTokens:mapOutputTokens,estimatedCost:mapCost,currency:"USD",usageKind:"estimated"};
        }
        const finalStage: ProviderStage = key === "research" ? "research/direct" : key === "problems" ? "problems/global_reduce" : "direct";
        const reduceInstruction = key === "problems" ? "\n\nEtapa REDUCE global: Consolida y sintetiza los candidatos en una lista de 8 a 15 problemas canónicos principales bien diferenciados, combinando candidatos redundantes o menores. Cada item debe ser conciso e incluir id, name, category, summary y sus evidenceIds representativos." : "";
        const opportunityInstruction = key === "opportunities" ? "\n\nInstrucción de concisión para Oportunidades:\n- Mantén rationale y cada justificación en scoreRationales concisas (1 o 2 oraciones breves y directas por criterio).\n- En evidenceIds de cada oportunidad, copia literalmente entre 2 y 5 identificadores de la lista evidenceIds del problema padre correspondiente. No inventes IDs ni uses IDs de otros problemas." : "";
        generated=await callProvider(finalStage, providerInput, `${prompt.instructions}${reduceInstruction}${opportunityInstruction}\n\nReglas de ejecución: usa únicamente evidenceIds incluidos en el contexto, distingue evidencia observada de inferencias y no inventes evidencia, cifras, testimonios, ventas ni credenciales. Si providerEvidenceProjection existe, sus quoteText son extractos redactados para compatibilidad: no los presentes como citas literales ni reconstruyas el texto omitido. ${selectedProvider === "gemini" && key === "research" ? "Los textos de evidence se conservan localmente y no se incluyen en esta solicitud; trátalos solo como IDs de trazabilidad. No generes EVIDENCE_BACKED ni asignes evidenceIds: usa AI_INFERENCE con evidenceIds vacíos." : ""} Agrupa patrones similares sin convertir toda opinión en dolor.`, {name:`${key}_output`,jsonSchema:structuredOutputSchema,...(key==="product"?{retryOnInvalidSchema:false}:{})});
        if(key!=="product"&&!isCanonicalModuleOutput(key,generated.output))throw new Error(`${selectedProvider} devolvió una salida que no cumple el contrato de ${key}.`);
        if(validation && key==="problems"){
          const allowed=new Set(mappedCandidates!.flatMap(c=>[String(c.id),...(c.evidenceIds as string[])]));
          const seen=new Set<string>();
          for(const c of (generated.output as {items:Record<string,unknown>[]}).items){
            if(seen.has(String(c.id)) || (c.evidenceIds as string[]).some(id=>!allowed.has(id)))throw new Error("REDUCE_INVALID_REFERENCES");
            seen.add(String(c.id));
          }
        }
        if (key === "problems" && clusteringResult && Array.isArray((generated.output as { items?: unknown }).items)) {
          const finalReconciled = reconcileCandidatesWithClusters((generated.output as { items: Record<string, unknown>[] }).items, clusteringResult, mappedCandidates, { filterSupported: true,...(validation?{strict:true,focus:validation.plan.focus,vocabulary:validation.plan.vocabulary}:{}) });
          (generated.output as { items: unknown[] }).items = finalReconciled;
        }
      }
      catch(error){
        persistFailedGeneration(error);
        throw error;
      }
      output = generated.output;
      // The provider is never the source of truth for `total`: recompute it
      // deterministically from the validated `scores` (isCanonicalModuleOutput
      // above already rejected missing/invalid scores). Any `total` the
      // provider sent is discarded here.
      if(key==="opportunities")output=applyOpportunityScoring(output);
      usage = problemMetrics ? {
        inputTokens:(usage.inputTokens??0)+(generated.usage.inputTokens??0),
        outputTokens:(usage.outputTokens??0)+(generated.usage.outputTokens??0),
        estimatedCost:(usage.estimatedCost??0)+(generated.usage.estimatedCost??estimateCost(selectedProvider,model,modelTierFor(key),generated.usage.inputTokens??0,generated.usage.outputTokens??0,this.options)),
        currency:"USD",usageKind:"estimated",
      } : generated.usage;
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
    let vocabularyCandidateToActivateId: string | null = null;
    let vocabularyDryRun: DomainVocabularyDryRunResult | undefined;
    let discoveryAudit: Record<string, unknown> | undefined;
    if (key === "problems") {
      const effectiveFocus = deriveResearchFocus([], project.niche, researchFocusAtStart);
      const focusHash = researchFocusHash(effectiveFocus);
      const analysisSet = validation?.plan.snapshot ?? analysisSetSnapshot(this.db, projectId);
      const snapshotHash = analysisSnapshotHashFromRows(analysisSet.rows);
      const loaded = validation ? validation.plan.vocabulary : this.vocabulary.loadActiveVocabularySnapshot(projectId, focusHash, snapshotHash);
      vocabularySnapshot = loaded ?? null;
      vocabularyVersionId = vocabularySnapshot?.vocabularyVersionId ?? null;
      // Explicit corruption guard: an ACTIVE vocabulary must always carry content.
      if (vocabularySnapshot && vocabularySnapshot.concepts.length === 0) {
        throw new Error(
          `ACTIVE vocabulary corruption: loaded active vocabulary ${vocabularySnapshot.vocabularyVersionId} has zero concepts`,
        );
      }

      // PHASE 4C — only when there is no ACTIVE exact vocabulary do we discover.
      if (!vocabularySnapshot && !validation) {
        const discoveryProvider =
          this.options.discoveryProvider ??
          (selectedProvider === "gemini"
            ? this.options.gemini
            : selectedProvider === "deepseek"
              ? this.options.deepSeek
            : selectedProvider === "groq"
              ? this.options.groq
            : selectedProvider === "openrouter"
              ? this.options.openRouter
            : selectedProvider === "openai"
              ? this.options.openAI
              : undefined);
        const sourceItems = buildDiscoverySourceItems(output, analysisSet);
        let candidateSnapshot: SemanticVocabularySnapshot | null = null;
        if (discoveryProvider && sourceItems.length > 0) {
          try {
            const instrumentedDiscoveryProvider: LlmProvider = selectedProvider === "gemini" && discoveryProvider.name === "gemini"
              ? {
                  name: discoveryProvider.name,
                  async generate<TOutput = string>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
                    const projected = buildGeminiProjection({ input: request.input }, request.systemInstructions);
                    geminiProjectionAudits.push(projected.audit);
                    for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
                      try {
                        geminiBudget?.reserve("vocabulary_discovery", attempt > 1);
                        const result = await discoveryProvider.generate<TOutput>({
                          ...request,
                          systemInstructions: projected.systemInstructions,
                          input: projected.payload.input,
                        });
                        const diagnostics = result.providerDiagnostics ?? {};
                        providerAttempts.push({ stage: "vocabulary_discovery", attempt, ...(typeof diagnostics.httpStatus === "number" ? { httpStatus: diagnostics.httpStatus } : {}), ...(typeof diagnostics.candidateCount === "number" ? { candidateCount: diagnostics.candidateCount } : {}), ...(typeof diagnostics.blockReason === "string" ? { blockReason: diagnostics.blockReason } : {}), ...(typeof diagnostics.finishReason === "string" ? { finishReason: diagnostics.finishReason } : {}), ...(typeof diagnostics.responseId === "string" ? { responseId: diagnostics.responseId } : {}), ...(result.usage.inputTokens === undefined ? {} : { inputTokens: result.usage.inputTokens }), ...(result.usage.outputTokens === undefined ? {} : { outputTokens: result.usage.outputTokens }), outcome: "usable" });
                        return result;
                      } catch (error) {
                        providerAttempts.push(providerAttemptFromError("vocabulary_discovery", attempt, error));
                        if (!(error instanceof IntegrationError && error.code === "request_budget_exceeded")) geminiBudget?.recordFailure();
                        if (!isRetryableGeminiFailure(error) || attempt === GEMINI_MAX_ATTEMPTS) throw error;
                        await sleep(GEMINI_RETRY_DELAY_MS * attempt);
                      }
                    }
                    throw new Error("Gemini retry policy ended without a result.");
                  },
                }
              : discoveryProvider;
            const discovery = new DomainVocabularyDiscoveryService(
              instrumentedDiscoveryProvider,
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
            if (error instanceof IntegrationError && error.code === "request_budget_exceeded") {
              persistFailedGeneration(error);
              throw error;
            }
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
          // Activation is deferred until the final CAS transaction so a rejected
          // generation cannot leave an ACTIVE vocabulary without an artifact.
          vocabularyCandidateToActivateId = candidateSnapshot.vocabularyVersionId;
          vocabularySnapshot = candidateSnapshot;
          vocabularyVersionId = candidateSnapshot.vocabularyVersionId;
        }
      }

      const qualityOptions: {
        researchFocus?: string | null;
        metrics?: Partial<ProblemPipelineMetrics>;
        vocabularySnapshot?: SemanticVocabularySnapshot | null;
        analysisSetSnapshot?: AnalysisSetSnapshot | null;
      } = { researchFocus: researchFocusAtStart, analysisSetSnapshot: analysisSet };
      if (problemMetrics) qualityOptions.metrics = problemMetrics;
      if (vocabularySnapshot) qualityOptions.vocabularySnapshot = vocabularySnapshot;
      output = qualityProblems(this.db, projectId, output, qualityOptions);
      if(validation){
        output.localPreprocessing=validation.plan.metrics;
        if(!Array.isArray(output.items)||output.items.length===0)throw new Error("NO_PROBLEMS_PASSED_QUALITY_GATES");
      }
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
    if(key==="opportunities"){
      if(parentOutputs.problems){
        const reconciliation=reconcileOpportunityEvidence(output,parentOutputs.problems,selectedProvider);
        output=reconciliation.output;
        opportunityEvidenceResolutionAudit=reconciliation.audit;
      }
      assertOpportunityReferences(output,parentOutputs.problems);
      output=applyOpportunityScoring(output);
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
    if(key==="funnel"){
      const validation=validateFunnelOutput(output,evidence);
      output=validation.output;
      // Structural checks do not authorize checkout, tracking or external integrations.
      artifactStatus="draft";
    }
    if(key==="landing"){
      const validation=validateLandingOutput(output,evidence);
      output=validation.output;
      // Structural/reference checks do not verify marketing claims or publishing authorization.
      artifactStatus="draft";
    }
    if(key==="offer"){
      const validation=validateOfferOutput(output,evidence);
      output=validation.output;
      // Structural validation cannot authorize pricing, guarantees, or commercial claims.
      artifactStatus="draft";
    }
    if(key==="beliefs"){
      const validation=validateBeliefsOutput(output,evidence);
      output=validation.output;
      // This audit is structural and cannot establish semantic grounding.
      artifactStatus="draft";
    }
    if(key==="mechanism"){
      const validation=validateMechanismOutput(output,evidence);
      output=validation.output;
      // The current mechanism audit checks structure and reference membership,
      // not semantic grounding or safety; generated interpretations need review.
      artifactStatus="draft";
    }
    if(key==="content"){
      // Distribution copy is public-facing and its schema cannot verify factual claims.
      artifactStatus="draft";
    }
    if(key==="final_product"){
      // Generated files remain unpublished until the proposed manuscript is reviewed.
      const validation=validateFinalProductOutput(output);
      output=validation.output;
      artifactStatus="draft";
    }
    if(key==="avatar"){
      const validation=validateAvatarOutput(output,evidence);
      output=validation.output;
      // This audit verifies structure and citation membership, not semantic
      // grounding of the profile; generated interpretations require review.
      artifactStatus="draft";
    }
    if (key === "product") {
      const validation = validateProductOutput(output, {
        groundingSnapshot: productGroundingSnapshot!,
        problemEvidence: evidence,
      });
      output = validation.output;
      artifactStatus = validation.audit.ok ? "approved" : "draft";
    }
    const persistedProvider=validation&&key==="problems"?"multi":selectedProvider;
    const inputSnapshot = {
      ...(validation?{validationSessionId:validation.session.id,frozenSnapshotHash:validation.plan.snapshotHash,physicalRequests:validation.session.requests(),localPreprocessing:validation.plan.metrics}:{}),
      generationId,parentVersionIds: parentIds, evidenceIds, moduleKey: key, provider: persistedProvider, model,
      ...((key==="product"||key==="avatar"||key==="mechanism"||key==="beliefs"||key==="offer"||key==="landing"||key==="funnel"||key==="content"||key==="final_product")?{activeVersionIdAtStart}:{}),
      ...(reportedModel ? { reportedModel } : {}), ...(promptHash ? { promptHash, promptPath } : {}),
      ...(structuredOutputDiagnostics ? { structuredOutputDiagnostics } : {}),
      ...(providerEvidenceAudit ? { providerEvidenceProjection: providerEvidenceAudit } : {}),
      ...(opportunityEvidenceResolutionAudit ? { opportunityEvidenceResolution: opportunityEvidenceResolutionAudit } : {}),
      ...(geminiProjectionAudits.length ? { geminiPayloadProjection: geminiProjectionAudits } : {}),
      ...(providerAttempts.length ? { providerAttempts } : {}),
      ...(geminiBudget ? { geminiOperationTotals: geminiBudget.snapshot() } : {}),
      ...(lastProviderInput ? { context: lastProviderInput } : providerInput ? { context: providerInput } : {}),
      ...(instructions?.trim()?{instructions:instructions.trim()}: {}),
      ...(key==="problems"?{researchFocus:deriveResearchFocus([],project.niche,researchFocusAtStart)}:{}),
      ...(key==="research"?{researchBrief:{project,researchFocus:researchFocusAtStart,evidenceLimit:20,activeVersionIdAtStart}}:{}),
      ...(vocabularyVersionId ? { vocabularyVersionId, vocabularyContentHash: vocabularySnapshot?.contentHash ?? null } : { vocabularyVersionId: null }),
      knowledgeUsed: knowledgeContext,
    };
    const inputTokens = key === "sources" ? 0 : usage.inputTokens || Math.max(20, Math.ceil(JSON.stringify(inputSnapshot).length / 4));
    const outputTokens = key === "sources" ? 0 : usage.outputTokens || Math.ceil(JSON.stringify(output).length / 4);
    const estimatedCost = key === "sources" ? 0 : usage.estimatedCost ?? estimateCost(persistedProvider, model, modelTierFor(key), inputTokens, outputTokens, this.options);
    const now = new Date().toISOString();

    const existing = this.db.connection.prepare(
      "SELECT id FROM artifacts WHERE project_id = ? AND artifact_type = ? ORDER BY created_at LIMIT 1",
    ).get(projectId, key) as { id: string } | undefined;
    const db=this.db.connection;
    db.exec("BEGIN IMMEDIATE");let createdVersionId:string|undefined;
    try {
    if(validation)assertFrozenPlan(this.db,validation.plan);
    this.assertActivationContext(projectId,key,parentIds,activeVersionIdAtStart,researchFocusAtStart);
    if(key==="research"){
      const currentProject=this.db.connection.prepare("SELECT name,niche,description FROM projects WHERE id=?").get(projectId);
      if(JSON.stringify(currentProject)!==JSON.stringify(project)||JSON.stringify(this.researchEvidence(projectId))!==JSON.stringify(evidence))throw new Error("El contexto o la evidencia de Investigación cambió durante la generación; vuelve a ejecutarla.");
    }
    if(vocabularyCandidateToActivateId){
      const activated=this.vocabulary.activateVocabularyVersion(vocabularyCandidateToActivateId);
      if(!activated)throw new Error(`domain vocabulary candidate activation failed for ${vocabularyCandidateToActivateId}`);
    }
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
    if(validation && (key==="problems"||key==="opportunities"))validation.session.published(key,version.id);

    this.db.connection.prepare(`
      INSERT INTO generations (
        id, project_id, agent_key, provider, model, status, vocabulary_version_id, input_snapshot,
        output_data, prompt_version, input_tokens, output_tokens,
        estimated_cost, duration_ms, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generationId, projectId, agentKey, persistedProvider, model, vocabularyVersionId, JSON.stringify(inputSnapshot), JSON.stringify(output),
      promptVersion, inputTokens, outputTokens, estimatedCost, Date.now() - startedAt, now, now,
    );
    if (key !== "sources") {
      this.db.connection.prepare(`
        INSERT INTO llm_usage (
          id, project_id, generation_id, provider, model, input_tokens,
          output_tokens, estimated_cost, currency, is_estimate, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?)
      `).run(uuidv7(), projectId, generationId, persistedProvider, model, inputTokens, outputTokens, estimatedCost, usage.estimatedCost!==undefined&&usage.usageKind === "provider_reported" ? 0 : 1, now);
    }

    if(knowledgeContext.length){
      const usedRows=knowledgeContext.map(context=>knowledgeRows.find(item=>context.chunkId===item.chunkId&&context.memoryId===item.memoryId)!).filter(Boolean);
      this.knowledge.createRetrievalLog({projectId,generationId,agentKey,query:knowledgeQuery,policy:{...knowledgePolicy,order:["project_evidence","project_knowledge","selected_global","approved_memory"],retrieval:"fts5_bm25"},selectedLibraryIds:[...new Set(usedRows.flatMap(item=>item.libraryId?[item.libraryId]:[]))],maxChunks:knowledgePolicy.maxChunks,maxContextTokens:knowledgePolicy.maxContextTokens,contextTokenEstimate:Math.ceil(JSON.stringify(knowledgeContext).length/4),items:knowledgeContext.map((context,index)=>{const item=usedRows[index]!;return item.chunkId?{kind:item.kind,chunkId:item.chunkId,rawScore:item.rawScore,tokenEstimate:Math.ceil(context.content.length/4),citation:{documentId:item.documentId,title:item.title,libraryId:item.libraryId,heading:item.heading,pageNumber:item.pageNumber,chunkIndex:item.chunkIndex,excerpt:context.content}}:{kind:item.kind,memoryId:item.memoryId!,rawScore:item.rawScore,tokenEstimate:Math.ceil(context.content.length/4),citation:{title:item.title,artifactVersionId:item.artifactVersionId,excerpt:context.content}};})});
    }

    for(const evidenceId of referencedEvidenceIds(output,evidenceIds)){
      this.db.connection.prepare(`INSERT OR IGNORE INTO evidence_links(id,project_id,target_type,target_id,source_type,source_id,relation,created_at) VALUES(?,?,'artifact_version',?,'evidence_snippet',?,'supports',?)`).run(uuidv7(),projectId,version.id,evidenceId,now);
    }

    this.workflow.update(projectId, key, artifactStatus === "draft" ? "IN_PROGRESS" : "COMPLETED");
    if (key === "landing" && version.status === "approved") this.exporter.exportLanding(projectId, version.id, output);
    if (key === "funnel" && version.status === "approved") this.exporter.exportFunnel(projectId, version.id, output);
    if (key === "final_product" && version.status === "approved") this.exporter.exportFinalProduct(projectId, version.id, output);
    db.exec("COMMIT");
    return this.toResult(version);
    } catch(error){if(db.isTransaction)db.exec("ROLLBACK");if(createdVersionId)this.exporter.cleanupVersion(projectId,createdVersionId);throw error;}
  }

  async generateLandingStudioAi(
    projectId: string,
    input: {
      provider?: string | undefined;
      mode?: "full_page" | "section" | "polish_copy" | undefined;
      prompt?: string | undefined;
      sectionIndex?: number | undefined;
      currentDraft?: unknown;
      sourceVersionId?: string | undefined;
    },
  ): Promise<{
    outputData: Record<string, unknown>;
    provider: string;
    model: string;
    audit: { ok: boolean; errors: string[] };
    quality: LandingQualityReport;
    passes: number;
  }> {
    if (this.db.connection.prepare("SELECT 1 FROM validation_sessions WHERE project_id=? AND state IN ('READY','RUNNING') LIMIT 1").get(projectId)) {
      throw new Error("VALIDATION_PROJECT_LOCKED_NEW_AUTHORIZATION_REQUIRED");
    }
    const project = this.db.connection.prepare("SELECT id,name,niche,description FROM projects WHERE id=?").get(projectId) as
      | { id: string; name: string; niche: string; description: string | null }
      | undefined;
    if (!project) throw new Error("El proyecto no existe.");

    const status = this.providerStatus(projectId);
    const requestedProvider = input.provider?.trim() || status.defaultProvider;
    if (
      requestedProvider !== "mock" &&
      requestedProvider !== "openai" &&
      requestedProvider !== "gemini" &&
      requestedProvider !== "deepseek" &&
      requestedProvider !== "groq" &&
      requestedProvider !== "openrouter"
    ) {
      throw new Error(`Proveedor LLM no soportado: ${requestedProvider}.`);
    }
    if (requestedProvider === "openai" && !this.options.openAI.configured) {
      throw new Error("OpenAI no está configurado. Define OPENAI_API_KEY o usa otro proveedor.");
    }
    if (requestedProvider === "gemini" && !this.options.gemini.configured) {
      throw new Error("Gemini no está configurado. Define GEMINI_API_KEY o usa otro proveedor.");
    }
    if (requestedProvider === "deepseek" && !this.options.deepSeek?.configured) {
      throw new Error("DeepSeek no está configurado. Define DEEPSEEK_API_KEY o usa otro proveedor.");
    }
    if (requestedProvider === "groq" && !this.options.groq?.configured) {
      throw new Error("Groq no está configurado. Define GROQ_API_KEY o usa otro proveedor.");
    }
    if (requestedProvider === "openrouter" && !this.options.openRouter?.configured) {
      throw new Error("OpenRouter no está configurado. Define OPENROUTER_API_KEY o usa otro proveedor.");
    }

    const mode = input.mode ?? "full_page";
    const userPrompt = input.prompt?.trim() ?? "";
    const sourceVersion =
      (input.sourceVersionId ? this.artifacts.getVersion(input.sourceVersionId) : undefined) ??
      this.activeVersion(projectId, "landing");
    const allowedEvidence =
      sourceVersion && sourceVersion.projectId === projectId && sourceVersion.artifactType === "landing"
        ? this.avatarEvidence(sourceVersion)
        : (this.db.connection
            .prepare(
              "SELECT e.id, e.quote_text AS quoteText FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed') ORDER BY c.quality_score DESC,c.likes DESC,e.created_at LIMIT 20",
            )
            .all(projectId) as unknown as Array<{ id: string; quoteText: string }>);

    const parentOutputs: Partial<Record<ModuleKey, unknown>> = {};
    const allVersions = this.artifacts.list(projectId);
    for (const key of ["problems", "opportunities", "product", "avatar", "mechanism", "beliefs", "offer"] as const) {
      const approved = this.get(projectId, key);
      if (approved) {
        parentOutputs[key] = approved.outputData;
      } else {
        const latest = allVersions
          .filter((v) => v.artifactType === key)
          .sort((a, b) => b.versionNumber - a.versionNumber)[0];
        if (latest) parentOutputs[key] = latest.outputData;
      }
    }

    const projectSettings = this.settings.get(projectId);
    const modeResolved = mode;
    const studioVisualAssetsPayload = STUDIO_VISUAL_ASSETS.map((a) => ({
      id: a.id,
      url: studioAssetUrl(a.filename),
      title: a.title,
      category: a.category,
    }));
    const sectionIndexResolved =
      typeof input.sectionIndex === "number" && Number.isInteger(input.sectionIndex) ? input.sectionIndex : 0;

    let model = "studio-contextual-v1";
    let rawOutput: Record<string, unknown>;
    let normalized: Record<string, unknown>;
    let quality: LandingQualityReport;
    let passes = 1;

    if (requestedProvider === "mock") {
      const base = createContextOutput("landing", project.niche, allowedEvidence, parentOutputs);
      rawOutput = contextualize(base, "landing", project.niche, allowedEvidence);
      rawOutput = applyMockPromptHints(rawOutput, userPrompt);
      normalized = sanitizeStudioLandingOutput({
        rawOutput,
        currentDraft: input.currentDraft,
        allowedEvidence,
        mode: modeResolved,
        sectionIndex: input.sectionIndex,
        fallbackTitle: `${project.name}`,
        parentOutputs,
      });
      quality = auditLandingQuality(normalized);
    } else {
      model =
        requestedProvider === "gemini"
          ? GEMINI_ANALYSIS_MODEL
          : requestedProvider === "deepseek"
            ? this.options.deepSeek!.effectiveModel
            : requestedProvider === "groq"
              ? this.options.groq?.effectiveModel || GROQ_DEFAULT_MODEL
              : requestedProvider === "openrouter"
                ? this.options.openRouter?.effectiveModel || OPENROUTER_DEFAULT_MODEL
                : resolveModel("powerful", projectSettings, this.options);

      const providerClient: LlmProvider =
        requestedProvider === "gemini"
          ? this.options.gemini
          : requestedProvider === "deepseek"
            ? this.options.deepSeek!
            : requestedProvider === "groq"
              ? this.options.groq!
              : requestedProvider === "openrouter"
                ? this.options.openRouter!
                : this.options.openAI;

      const basePrompt = getModulePrompt("landing");
      const evidenceProjection = projectEvidenceForProvider(allowedEvidence);
      const knowledgePolicy = getAgentKnowledgePolicy("landing");
      const knowledgeRows =
        projectSettings?.knowledgeEnabled === false
          ? []
          : retrieveKnowledge(this.knowledge, projectId, `${project.niche} landing ${userPrompt}`, knowledgePolicy);
      const knowledgeContext = buildKnowledgePromptContext(knowledgeRows, knowledgePolicy.maxContextTokens * 4);

      const compactDraft = sanitizeDraftForPrompt(input.currentDraft);
      const upstreamContext = providerParentOutputs(parentOutputs);
      const maxTokens = requestedProvider === "deepseek" ? 16_000 : 8_192;

      const rawPayload: Record<string, unknown> = {
        mode: modeResolved,
        project: { name: project.name, niche: project.niche, description: project.description },
        prompt: userPrompt || "Genera una landing profesional de alta conversión, rica visualmente y basada en toda la investigación del proyecto.",
        upstreamContext,
        evidence: evidenceProjection.evidence,
        studioVisualAssets: studioVisualAssetsPayload,
        knowledge: { advisoryOnly: true, chunks: knowledgeContext },
        ...(compactDraft ? { currentLanding: compactDraft } : {}),
        ...(modeResolved === "section" && compactDraft?.sections[sectionIndexResolved]
          ? { targetSectionIndex: sectionIndexResolved, targetSection: compactDraft.sections[sectionIndexResolved] }
          : {}),
      };

      const systemInstructions = buildStudioAiSystemInstructions(
        basePrompt?.instructions ?? "",
        modeResolved,
        userPrompt,
        sectionIndexResolved,
      );

      const projected =
        requestedProvider === "gemini"
          ? buildGeminiProjection(rawPayload, systemInstructions)
          : { payload: rawPayload, systemInstructions };

      const generated = await providerClient.generate<Record<string, unknown>>({
        provider: requestedProvider,
        model,
        systemInstructions: projected.systemInstructions,
        input: JSON.stringify(projected.payload),
        structuredOutput: {
          name: "landing_studio_pro_output",
          jsonSchema: MODULE_OUTPUT_SCHEMAS.landing,
        },
        maxOutputTokens: maxTokens,
      });

      rawOutput = generated.output;
      if (generated.reportedModel) model = generated.reportedModel;

      normalized = sanitizeStudioLandingOutput({
        rawOutput,
        currentDraft: input.currentDraft,
        allowedEvidence,
        mode: modeResolved,
        sectionIndex: input.sectionIndex,
        fallbackTitle: `${project.name}`,
        parentOutputs,
      });
      quality = auditLandingQuality(normalized);

      if (modeResolved === "full_page" && (quality.score < 82 || quality.issues.some((i) => i.severity === "high"))) {
        try {
          const repairPrompt = `REFINAMIENTO AUTOMÁTICO DE CALIDAD (Puntuación actual: ${quality.score}/100, Grado ${quality.grade}). Corrige TODOS los puntos señalados en qualityAuditIssuesToFix mejorando copy, estructuras, layouts variados (split, cards, comparison, steps, checklist, testimonials, accordion, pricing, badge), bullets, stats, precio e imageUrl reales de studioVisualAssets. Instrucción original del usuario: ${userPrompt || "Máxima conversión PRO"}.`;
          const repairPayload: Record<string, unknown> = {
            mode: "polish_copy",
            project: rawPayload.project,
            prompt: repairPrompt,
            upstreamContext,
            evidence: evidenceProjection.evidence,
            studioVisualAssets: studioVisualAssetsPayload,
            currentLanding: normalized,
            qualityAuditIssuesToFix: quality.issues.map((i) => i.message),
          };
          const repairInstructions = buildStudioAiSystemInstructions(
            basePrompt?.instructions ?? "",
            "polish_copy",
            repairPrompt,
            0,
          );
          const projectedRepair =
            requestedProvider === "gemini"
              ? buildGeminiProjection(repairPayload, repairInstructions)
              : { payload: repairPayload, systemInstructions: repairInstructions };

          const repairedGen = await providerClient.generate<Record<string, unknown>>({
            provider: requestedProvider,
            model,
            systemInstructions: projectedRepair.systemInstructions,
            input: JSON.stringify(projectedRepair.payload),
            structuredOutput: {
              name: "landing_studio_pro_output",
              jsonSchema: MODULE_OUTPUT_SCHEMAS.landing,
            },
            maxOutputTokens: maxTokens,
          });
          passes = 2;
          const repairedNormalized = sanitizeStudioLandingOutput({
            rawOutput: repairedGen.output,
            currentDraft: normalized,
            allowedEvidence,
            mode: "full_page",
            sectionIndex: undefined,
            fallbackTitle: `${project.name}`,
            parentOutputs,
          });
          const repairedQuality = auditLandingQuality(repairedNormalized);
          if (repairedQuality.score >= quality.score) {
            normalized = repairedNormalized;
            quality = repairedQuality;
          }
          if (repairedGen.reportedModel) model = repairedGen.reportedModel;
        } catch {
          // Keep pass-1 result cleanly if pass-2 hits rate limit or transient provider error
        }
      }
    }

    const validation = validateLandingOutput(normalized, allowedEvidence);
    return {
      outputData: validation.output,
      provider: requestedProvider,
      model,
      audit: validation.audit,
      quality,
      passes,
    };
  }

  private activeVersion(projectId:string,key:ModuleKey):ArtifactVersion|undefined {
    const row=this.db.connection.prepare(`SELECT active_version_id FROM artifacts
      WHERE project_id=? AND artifact_type=? ORDER BY created_at LIMIT 1`).get(projectId,key) as {active_version_id:string|null}|undefined;
    return row?.active_version_id?this.artifacts.getVersion(row.active_version_id):undefined;
  }

  private hasCurrentDraft(projectId:string,key:ModuleKey):boolean {
    const activeVersionId=this.activeVersion(projectId,key)?.id??null;
    const drafts=this.db.connection.prepare(`SELECT version.input_snapshot FROM artifact_versions version
      JOIN artifacts artifact ON artifact.id=version.artifact_id
      WHERE version.project_id=? AND artifact.artifact_type=? AND version.status='draft' AND version.freshness='fresh'`).all(projectId,key) as unknown as Array<{input_snapshot:string}>;
    return drafts.some(({input_snapshot})=>{
      const snapshot=asRecord(JSON.parse(input_snapshot));
      const expected=snapshot.source==="user"?snapshot.editedFromVersionId:snapshot.activeVersionIdAtStart;
      return expected===undefined||expected===activeVersionId;
    });
  }

  private validateProblemDraft(version:ArtifactVersion,outputData:unknown):Record<string,unknown>{
    if(!isCanonicalModuleOutput("problems",outputData))throw new Error("El borrador no conserva el contrato de Problemas.");
    const snapshot=asRecord(version.inputSnapshot),output=asRecord(outputData);
    const project=this.db.connection.prepare("SELECT niche FROM projects WHERE id=?").get(version.projectId) as {niche:string};
    const focus=deriveResearchFocus([],project.niche,this.settings.researchFocus(version.projectId)?.value??null);
    if(typeof snapshot.researchFocus!=="string"||snapshot.researchFocus!==focus)throw new Error("El foco de Problemas cambió; regenera la interpretación antes de editarla.");
    const allowed=new Set(Array.isArray(snapshot.evidenceIds)?snapshot.evidenceIds.filter((id):id is string=>typeof id==="string"):[]);
    const analysis=analysisSetSnapshot(this.db,version.projectId);
    const rows=analysis.rows.filter(row=>allowed.has(row.id)),available=new Set(rows.map(row=>row.id));
    const items=Array.isArray(output.items)?output.items.map(asRecord):[];
    const ids=items.map(item=>item.id);
    if(ids.some(id=>typeof id!=="string"||!id.trim())||new Set(ids).size!==ids.length)throw new Error("Cada problema necesita un identificador único.");
    for(const item of items){
      if(!Array.isArray(item.evidenceIds)||item.evidenceIds.length===0||item.evidenceIds.some(id=>typeof id!=="string"||!available.has(id)))throw new Error("El problema cita evidencia ajena, excluida o no disponible en su contexto original.");
    }
    const vocabularyId=snapshot.vocabularyVersionId;
    const vocabulary=typeof vocabularyId==="string"?this.vocabulary.loadVocabularySnapshot(vocabularyId):null;
    if(typeof vocabularyId==="string"&&(!vocabulary||vocabulary.contentHash!==snapshot.vocabularyContentHash))throw new Error("El vocabulario original de Problemas no está disponible; regenera la interpretación.");
    const normalized=qualityProblems(this.db,version.projectId,output,{researchFocus:focus,analysisSetSnapshot:{...analysis,rows},vocabularySnapshot:vocabulary,metrics:asRecord(asRecord(version.outputData).analysisMetrics) as Partial<ProblemPipelineMetrics>});
    const validated=Array.isArray(normalized.items)?normalized.items.map(asRecord):[];
    if(validated.length!==items.length||validated.some(item=>!ids.includes(item.id)))throw new Error("Uno o más problemas no pasan los controles de soporte, cohesión, precisión o foco. Revisa las afirmaciones y sus citas.");
    return normalized;
  }

  private researchEvidence(projectId:string):Array<{id:string;quoteText:string}>{
    return this.db.connection.prepare(`SELECT e.id,e.quote_text AS quoteText FROM evidence_snippets e
      JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id
      JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id
      WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')
      ORDER BY c.quality_score DESC,c.likes DESC,e.created_at,e.id LIMIT 20`).all(projectId) as Array<{id:string;quoteText:string}>;
  }

  private researchSnapshotEvidence(version:ArtifactVersion):string[]{
    const snapshot=asRecord(version.inputSnapshot);
    const ids=Array.isArray(snapshot.evidenceIds)?snapshot.evidenceIds.filter((id):id is string=>typeof id==="string"):[];
    // A draft may only cite its original evidence, still available and eligible.
    const eligible=this.db.connection.prepare(`SELECT e.id FROM evidence_snippets e
      JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id
      JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id
      WHERE e.project_id=? AND s.include_in_analysis=1 AND c.analysis_eligible=1 AND s.status IN ('ready','completed')`).all(version.projectId) as Array<{id:string}>;
    const current=new Set(eligible.map(row=>row.id));
    return ids.filter(id=>current.has(id));
  }

  private parentOutput(projectId:string,childVersionId:string,parentKey:ModuleKey):unknown {
    const row=this.db.connection.prepare(`SELECT parent.output_data FROM lineage_edges edge
      JOIN artifact_versions parent ON parent.id=edge.parent_version_id
      JOIN artifacts artifact ON artifact.id=parent.artifact_id
      WHERE edge.project_id=? AND edge.child_version_id=? AND artifact.artifact_type=?
      ORDER BY parent.created_at DESC LIMIT 1`).get(projectId,childVersionId,parentKey) as {output_data:string}|undefined;
    return row?JSON.parse(row.output_data) as unknown:undefined;
  }

  private assertActivationContext(projectId:string,key:ModuleKey,parentIds:readonly string[],expectedActiveVersionId:string|null,expectedResearchFocus:string|null):void {
    const current=this.db.connection.prepare("SELECT active_version_id FROM artifacts WHERE project_id=? AND artifact_type=? ORDER BY created_at LIMIT 1").get(projectId,key) as {active_version_id:string|null}|undefined;
    if((current?.active_version_id??null)!==expectedActiveVersionId)throw new Error("La versión activa cambió durante la generación; vuelve a ejecutar el módulo.");
    const definition=getModule(key);
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("avatar")&&this.hasCurrentDraft(projectId,"avatar")){
      throw new Error("Avatar tiene un borrador vigente pendiente de aprobación; revisa el perfil y sus citas antes de generar etapas dependientes.");
    }
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("beliefs")&&this.hasCurrentDraft(projectId,"beliefs")){
      throw new Error("Creencias tiene un borrador vigente pendiente de aprobación; revisa sus afirmaciones antes de generar etapas dependientes.");
    }
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("mechanism")&&this.hasCurrentDraft(projectId,"mechanism")){
      throw new Error("Mecanismo tiene un borrador vigente pendiente de aprobación; revisa ese borrador antes de generar etapas dependientes.");
    }
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("offer")&&this.hasCurrentDraft(projectId,"offer")){
      throw new Error("Oferta tiene un borrador vigente pendiente de aprobación; revisa esa propuesta antes de generar etapas dependientes.");
    }
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("landing")&&this.hasCurrentDraft(projectId,"landing")){
      throw new Error("Landing tiene un borrador vigente pendiente de aprobación; revisa el contenido antes de generar etapas dependientes.");
    }
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("funnel")&&this.hasCurrentDraft(projectId,"funnel")){
      throw new Error("Funnel tiene un borrador vigente pendiente de aprobación; revisa las integraciones antes de generar etapas dependientes.");
    }
    if(definition&&[...definition.parents,...(definition.optionalParents??[])].includes("content")&&this.hasCurrentDraft(projectId,"content")){
      throw new Error("Contenido tiene un borrador vigente pendiente de aprobación; revísalo antes de generar el producto final.");
    }
    if((key==="problems"||key==="research")&&(this.settings.researchFocus(projectId)?.value??null)!==expectedResearchFocus){
      throw new Error(`El Research Focus cambió durante la generación; vuelve a ejecutar ${key==="research"?"Investigación":"Problemas"}.`);
    }
    for(const parentId of parentIds){
      const parent=this.db.connection.prepare(`SELECT version.freshness,artifact.active_version_id activeVersionId
        FROM artifact_versions version JOIN artifacts artifact ON artifact.id=version.artifact_id
        WHERE version.id=? AND version.project_id=?`).get(parentId,projectId) as {freshness:string;activeVersionId:string|null}|undefined;
      if(!parent||parent.freshness!=="fresh"||parent.activeVersionId!==parentId)throw new Error("Una versión padre cambió o quedó obsoleta durante la generación; vuelve a ejecutar el módulo.");
    }
  }

  private isInvalidApprovedStrategyOutput(version:ArtifactVersion):boolean {
    return version.status==="approved"&&((version.artifactType==="product"&&!this.validatePersistedProduct(version).audit.ok)||(version.artifactType==="avatar"&&!this.validatePersistedAvatar(version).audit.ok)||(version.artifactType==="mechanism"&&!this.validatePersistedMechanism(version).audit.ok)||(version.artifactType==="beliefs"&&!this.validatePersistedBeliefs(version).audit.ok)||(version.artifactType==="offer"&&!this.validatePersistedOffer(version).audit.ok)||(version.artifactType==="landing"&&!this.validatePersistedLanding(version).audit.ok)||(version.artifactType==="funnel"&&!this.validatePersistedFunnel(version).audit.ok));
  }

  private avatarEvidence(version:ArtifactVersion):Array<{id:string;quoteText:string}>{
    const ids=asRecord(version.inputSnapshot).evidenceIds;
    const allowed=new Set(Array.isArray(ids)?ids.filter((id):id is string=>typeof id==="string"):[]);
    const rows=this.db.connection.prepare("SELECT e.id,e.quote_text AS quoteText FROM evidence_snippets e JOIN comments c ON c.id=e.comment_id AND c.project_id=e.project_id JOIN sources s ON s.id=e.source_id AND s.project_id=e.project_id WHERE e.project_id=? AND c.analysis_eligible=1 AND s.include_in_analysis=1 AND s.status IN ('ready','completed')").all(version.projectId) as unknown as Array<{id:string;quoteText:string}>;
    return rows.filter(item=>allowed.has(item.id));
  }

  private validatePersistedFunnel(version:ArtifactVersion){
    const validation=validateFunnelOutput(version.outputData,this.avatarEvidence(version));
    if(asRecord(version.inputSnapshot).source!=="user"&&asRecord(asRecord(version.outputData).funnelValidationAudit).ok===false)return {...validation,audit:{...validation.audit,ok:false,errors:[...validation.audit.errors,"La generación original requiere revisión explícita o regeneración."]}};
    return validation;
  }

  private validatePersistedLanding(version:ArtifactVersion){
    const validation=validateLandingOutput(version.outputData,this.avatarEvidence(version));
    if(asRecord(version.inputSnapshot).source!=="user"&&asRecord(asRecord(version.outputData).landingValidationAudit).ok===false)return {...validation,audit:{...validation.audit,ok:false,errors:[...validation.audit.errors,"La generación original requiere revisión explícita o regeneración."]}};
    return validation;
  }

  private validatePersistedOffer(version:ArtifactVersion){
    const validation=validateOfferOutput(version.outputData,this.avatarEvidence(version));
    if(asRecord(version.inputSnapshot).source!=="user"&&asRecord(asRecord(version.outputData).offerValidationAudit).ok===false)return {...validation,audit:{...validation.audit,ok:false,errors:[...validation.audit.errors,"La generación original requiere revisión explícita o regeneración."]}};
    return validation;
  }

  private validatePersistedBeliefs(version:ArtifactVersion){
    const validation=validateBeliefsOutput(version.outputData,this.avatarEvidence(version));
    if(asRecord(version.inputSnapshot).source!=="user"&&asRecord(asRecord(version.outputData).beliefsValidationAudit).ok===false)return {...validation,audit:{...validation.audit,ok:false,errors:[...validation.audit.errors,"La generación original requiere revisión explícita o regeneración."]}};
    return validation;
  }

  private validatePersistedMechanism(version:ArtifactVersion){
    const validation=validateMechanismOutput(version.outputData,this.avatarEvidence(version));
    if(asRecord(version.inputSnapshot).source!=="user"&&asRecord(asRecord(version.outputData).mechanismValidationAudit).ok===false)return {...validation,audit:{...validation.audit,ok:false,errors:[...validation.audit.errors,"La generación original requiere revisión explícita o regeneración."]}};
    return validation;
  }

  private validatePersistedAvatar(version:ArtifactVersion){
    const validation=validateAvatarOutput(version.outputData,this.avatarEvidence(version));
    if(asRecord(version.inputSnapshot).source!=="user"&&asRecord(asRecord(version.outputData).avatarValidationAudit).ok===false)return {...validation,audit:{...validation.audit,ok:false,errors:[...validation.audit.errors,"La generación original requiere una revisión explícita o regeneración."]}};
    return validation;
  }

  private validatePersistedProduct(version:ArtifactVersion) {
    const validation=validateProductOutput(version.outputData,this.persistedProductContext(version));
    const originalAudit=asRecord(asRecord(version.outputData).productValidationAudit);
    if(asRecord(version.inputSnapshot).source!=="user"&&originalAudit.ok===false){
      const errors=Array.isArray(originalAudit.errors)?originalAudit.errors.filter((value):value is string=>typeof value==="string"):[];
      return {...validation,audit:{...validation.audit,ok:false,grounded:validation.audit.grounded&&originalAudit.grounded!==false,complete:validation.audit.complete&&originalAudit.complete!==false,errors:[...new Set([...validation.audit.errors,...errors,"La generación original no pasó la validación; guarda una revisión explícita o regenera antes de aprobar."]) ]}};
    }
    return validation;
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
      outputData: version.artifactType==="final_product"?{...asRecord(version.outputData),finalProductFactualReview:finalProductReviewStatus(version.outputData,version.inputSnapshot)}:version.artifactType==="funnel"?{...asRecord(version.outputData),funnelValidationAudit:this.validatePersistedFunnel(version).audit}:version.artifactType==="landing"?{...asRecord(version.outputData),landingValidationAudit:this.validatePersistedLanding(version).audit}:version.artifactType==="offer"?{...asRecord(version.outputData),offerValidationAudit:this.validatePersistedOffer(version).audit}:version.artifactType==="beliefs"?{...asRecord(version.outputData),beliefsValidationAudit:this.validatePersistedBeliefs(version).audit}:version.artifactType==="mechanism"?{...asRecord(version.outputData),mechanismValidationAudit:this.validatePersistedMechanism(version).audit}:version.artifactType==="avatar"?{...asRecord(version.outputData),avatarValidationAudit:this.validatePersistedAvatar(version).audit}:version.artifactType==="product"&&(asRecord(version.inputSnapshot).source==="user"||!asRecord(version.outputData).productValidationAudit)?{...asRecord(version.outputData),productValidationAudit:this.validatePersistedProduct(version).audit}:version.outputData,
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

function estimateCost(provider: string, model: string, tier: ModelTier, inputTokens: number, outputTokens: number, options: ModuleServiceOptions): number {
  const inputRate = tier === "powerful"
    ? options.powerfulInputCostPerMillion ?? 1.25
    : options.economyInputCostPerMillion ?? 0.25;
  const outputRate = tier === "powerful"
    ? options.powerfulOutputCostPerMillion ?? 10
    : options.economyOutputCostPerMillion ?? 2;
  const rates = ratesForModel(provider,model,tier,{inputPerMillion:inputRate,outputPerMillion:outputRate});
  return estimateTokenCost(rates,inputTokens,outputTokens);
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

/** Keep semantic parent data while excluding the large deterministic Problems audit and bloated quote arrays. */
function providerParentOutputs(parents:Partial<Record<ModuleKey,unknown>>):Partial<Record<ModuleKey,unknown>>{
  return Object.fromEntries(Object.entries(parents).map(([key,value])=>{
    if(key!=="problems"||typeof value!=="object"||value===null||Array.isArray(value))return[key,value];
    const problems=value as Record<string,unknown>;
    const items = Array.isArray(problems.items)
      ? problems.items.map((item) => {
          const p = asRecord(item);
          return {
            id: p.id,
            name: p.name,
            category: p.category,
            summary: p.summary,
            evidenceIds: Array.isArray(p.evidenceIds) ? p.evidenceIds.slice(0, 10) : [],
            evidenceCount: p.evidenceCount,
            uniqueAuthors: p.uniqueAuthors,
            uniqueSources: p.uniqueSources,
            problemStrengthScore: p.problemStrengthScore,
            strengthLevel: p.strengthLevel,
          };
        })
      : [];
    return[key,{schemaVersion:problems.schemaVersion,researchFocus:problems.researchFocus,qualityAlgorithmVersion:problems.qualityAlgorithmVersion,items}];
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

/** Deterministic weighted formula for Opportunity `total` (opportunity-scorer.md).
 * Versioned as "1.0"; weights sum to 1.00. This is the ONLY place `total` is
 * computed: the provider's own `total` (if any) is always discarded, and this
 * function must be applied AFTER the final module output is assembled —
 * both for the mock/demo path (inside contextualize) and for the real
 * provider path (after `output = generated.output` in run()). */
const OPPORTUNITY_SCORE_WEIGHTS = {
  frequency:.15,urgency:.15,emotionalIntensity:.15,willingnessToPay:.10,
  solutionFeasibility:.15,competition:.05,differentiation:.10,commercialPotential:.10,
  evidenceConfidence:.05,
} as const;

function applyOpportunityScoring(output:Record<string,unknown>):Record<string,unknown>{
  if(!Array.isArray(output.items))return output;
  const items=output.items.map((raw)=>{
    if(typeof raw!=="object"||raw===null||Array.isArray(raw))return raw;
    const item=raw as Record<string,unknown>;
    const scores=item.scores as Record<string,number>|undefined;
    const total=Math.round(Object.entries(OPPORTUNITY_SCORE_WEIGHTS).reduce((sum,[name,weight])=>sum+(scores?.[name]??0)*weight,0));
    return {...item,total,scoreFormula:{version:"1.0",weights:OPPORTUNITY_SCORE_WEIGHTS},rationale:typeof item.rationale==="string"&&item.rationale.trim()?item.rationale:`Puntuación determinista ${total}/100 calculada con pesos versionados.`};
  });
  return {...output,items};
}

function assertOpportunityScoring(output:unknown):void{
  const original=asRecord(output),normalized=applyOpportunityScoring(original);
  const originalItems=Array.isArray(original.items)?original.items:[],normalizedItems=Array.isArray(normalized.items)?normalized.items:[];
  for(let index=0;index<originalItems.length;index+=1){
    const item=asRecord(originalItems[index]),expected=asRecord(normalizedItems[index]);
    if(item.total!==expected.total||JSON.stringify(item.scoreFormula)!==JSON.stringify(expected.scoreFormula)){
      throw new Error("El scoring del borrador no coincide con la fórmula autoritativa del backend.");
    }
  }
}

function assertOpportunityReferences(output:unknown,problemsOutput:unknown):void{
  const opportunities=asRecord(output),problems=asRecord(problemsOutput);
  const problemItems=Array.isArray(problems.items)?problems.items.map(asRecord):[];
  const problemById=new Map(problemItems.filter((item)=>typeof item.id==="string").map((item)=>[item.id as string,item]));
  const opportunityItems=Array.isArray(opportunities.items)?opportunities.items.map(asRecord):[];
  const opportunityIds=new Set<string>();
  for(const item of opportunityItems){
    const id=typeof item.id==="string"?item.id:"";
    if(!id||opportunityIds.has(id))throw new Error("Cada Oportunidad debe tener un id único.");
    opportunityIds.add(id);
    const problemId=typeof item.problemId==="string"?item.problemId:"";
    const problem=problemById.get(problemId);
    if(!problem)throw new Error(`La Oportunidad ${id} referencia un problemId que no existe en la versión padre de Problemas.`);
    const allowedEvidence=problemEvidenceIds(problem);
    const evidenceIds=Array.isArray(item.evidenceIds)?item.evidenceIds:[];
    if(evidenceIds.some((evidenceId)=>typeof evidenceId!=="string"||!allowedEvidence.has(evidenceId))){
      throw new Error(`La Oportunidad ${id} referencia evidencia que no pertenece al Problema padre.`);
    }
  }
  if(typeof opportunities.selectedId!=="string"||!opportunityIds.has(opportunities.selectedId)){
    throw new Error("selectedId debe identificar una Oportunidad existente.");
  }
}

function problemEvidenceIds(problem:Record<string,unknown>):Set<string>{
  const ids=new Set<string>();
  if(Array.isArray(problem.evidenceIds))for(const id of problem.evidenceIds)if(typeof id==="string")ids.add(id);
  if(Array.isArray(problem.evidence))for(const value of problem.evidence){const evidence=asRecord(value);if(typeof evidence.evidenceId==="string")ids.add(evidence.evidenceId);}
  return ids;
}

type OpportunityEvidenceResolutionAudit={
  version:1;
  generationProvider:string;
  items:Array<{
    opportunityId:string;
    problemId:string;
    providerEvidenceIds:string[];
    acceptedProviderEvidenceIds:string[];
    rejectedProviderEvidenceIds:string[];
    persistedEvidenceIds:string[];
    resolution:"provider_selected"|"backend_fallback_first_parent_ids"|"no_parent_evidence"|"problem_parent_missing";
  }>;
};

function reconcileOpportunityEvidence(output:Record<string,unknown>,problemsOutput:unknown,generationProvider:string):{output:Record<string,unknown>;audit:OpportunityEvidenceResolutionAudit}{
  const problems=asRecord(problemsOutput);
  const problemItems=Array.isArray(problems.items)?problems.items.map(asRecord):[];
  const problemById=new Map(problemItems.filter((item)=>typeof item.id==="string").map((item)=>[item.id as string,item]));
  const auditItems:OpportunityEvidenceResolutionAudit["items"]=[];
  if(!Array.isArray(output.items))return {output,audit:{version:1,generationProvider,items:auditItems}};
  const items=output.items.map((raw)=>{
    if(typeof raw!=="object"||raw===null||Array.isArray(raw))return raw;
    const item=raw as Record<string,unknown>;
    const problemId=typeof item.problemId==="string"?item.problemId:"";
    const providerEvidenceIds=Array.isArray(item.evidenceIds)?item.evidenceIds.filter((id):id is string=>typeof id==="string"):[];
    const problem=problemById.get(problemId);
    if(!problem){
      auditItems.push({opportunityId:String(item.id??""),problemId,providerEvidenceIds,acceptedProviderEvidenceIds:[],rejectedProviderEvidenceIds:providerEvidenceIds,persistedEvidenceIds:providerEvidenceIds,resolution:"problem_parent_missing"});
      return item;
    }
    const allowedEvidence=problemEvidenceIds(problem);
    const acceptedProviderEvidenceIds=providerEvidenceIds.filter((id)=>allowedEvidence.has(id));
    const rejectedProviderEvidenceIds=providerEvidenceIds.filter((id)=>!allowedEvidence.has(id));
    const usedFallback=acceptedProviderEvidenceIds.length===0;
    const persistedEvidenceIds=usedFallback?[...allowedEvidence].slice(0,Math.min(5,allowedEvidence.size)):acceptedProviderEvidenceIds;
    const resolution:OpportunityEvidenceResolutionAudit["items"][number]["resolution"]=usedFallback?(allowedEvidence.size>0?"backend_fallback_first_parent_ids":"no_parent_evidence"):"provider_selected";
    auditItems.push({opportunityId:String(item.id??""),problemId,providerEvidenceIds,acceptedProviderEvidenceIds,rejectedProviderEvidenceIds,persistedEvidenceIds,resolution});
    const evidenceIds=persistedEvidenceIds;
    return {...item,evidenceIds};
  });
  return {output:{...output,items},audit:{version:1,generationProvider,items:auditItems}};
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
    contextual.items=evidence.slice(0,Math.min(5,evidence.length)).map((item,index)=>({id:`problem-${index+1}`,name:`${niche}: patrón observado ${index+1}`,category:"pain",summary:item.quoteText,frequency:Math.round(100/(index+1)),confidence:Math.min(95,55+evidence.length*4),evidenceIds:[item.id],quotes:[item.quoteText]}));
  }
  if(key==="beliefs"){
    for(const field of ["currentBeliefs","limitingBeliefs","requiredBeliefs","objections","arguments"]){
      contextual[field]=(Array.isArray(contextual[field])?contextual[field]:[]).map(item=>typeof item==="string"?item:asRecord(item).text).filter(item=>typeof item==="string"&&item.trim());
    }
  }
  if(key==="mechanism"||key==="offer"||key==="landing"){
    const allowed=new Set(evidence.map(item=>item.id));
    contextual.evidenceIds=Array.isArray(contextual.evidenceIds)?contextual.evidenceIds.filter(id=>typeof id==="string"&&allowed.has(id)):[];
  }
  if(key==="avatar"){
    const allowed=new Set(evidence.map(item=>item.id));
    for(const [field] of AVATAR_FIELDS){
      contextual[field]=(Array.isArray(contextual[field])?contextual[field]:[]).map((raw:unknown)=>{
        const item=typeof raw==="string"?{text:raw,provenance:"AI_INFERENCE",evidenceIds:[]}:asRecord(raw);
        const ids=Array.isArray(item.evidenceIds)?item.evidenceIds.filter(id=>typeof id==="string"&&allowed.has(id)):[];
        return {...item,provenance:ids.length?item.provenance:"AI_INFERENCE",evidenceIds:ids};
      });
    }
    contextual.language=evidence.slice(0,3).map(item=>({text:item.quoteText,provenance:"EVIDENCE_BACKED",evidenceIds:[item.id]}));
  }
  if(key==="opportunities"){
    contextual=applyOpportunityScoring(contextual);
  }
  return contextual;
}

function createContextOutput(key:ModuleKey,niche:string,evidence:Array<{id:string;quoteText:string}>,parents:Partial<Record<ModuleKey,unknown>>):Record<string,unknown>{
 const ids=evidence.slice(0,5).map(item=>item.id),quote=evidence[0]?.quoteText??`Todavía no existe evidencia para ${niche}.`;
 const parent=(key:ModuleKey)=>parents[key] as Record<string,any>|undefined;
 const selectedProduct=parent("product")?.proposals?.find((item:any)=>item.id===parent("product")?.selectedId)??parent("product")?.proposals?.[0];
 const opportunity=parent("opportunities")?.items?.find((item:any)=>item.id===parent("opportunities")?.selectedId)??parent("opportunities")?.items?.[0];
  const problem=parent("problems")?.items?.[0],avatar=parent("avatar"),mechanism=parent("mechanism"),beliefs=parent("beliefs"),landing=parent("landing"),offer=parent("offer");
  const painBody=(typeof avatar?.pains?.[0]==="string"?avatar.pains[0]:(typeof avatar?.pains?.[0]?.text==="string"?avatar.pains[0].text:undefined))??`Intentar resolver ${niche} sin una secuencia probada genera frustración, pérdidas de tiempo y resultados inconsistentes.`;
  const outputs:Partial<Record<ModuleKey,Record<string,unknown>>>={
  research:{schemaVersion:1,summary:`Mapa inicial para ${niche}`,subniches:[`Usuarios de ${niche}`],hypotheses:[{text:`Existe una necesidad resoluble en ${niche}.`,provenance:"AI_INFERENCE",evidenceIds:[]}],questions:["¿Qué resultado buscan y qué les impide lograrlo?"],searchSuggestions:[`${niche} problemas`,`${niche} soluciones`],insights:[]},
  sources:{schemaVersion:1,summary:`Corpus local para ${niche}`,sourceCount:0,commentCount:0,isDemo:false},
  problems:{schemaVersion:1,items:[]},
  opportunities:{schemaVersion:1,items:[{id:"opportunity-1",name:`Solución práctica para ${niche}`,problemId:problem?.id??"",scores:{frequency:60,urgency:55,emotionalIntensity:50,willingnessToPay:40,solutionFeasibility:70,competition:50,differentiation:55,commercialPotential:55,evidenceConfidence:Array.isArray(problem?.evidenceIds)&&problem.evidenceIds.length?65:20},evidenceIds:Array.isArray(problem?.evidenceIds)?problem.evidenceIds:[]}],selectedId:"opportunity-1"},
  product:{schemaVersion:1,proposals:[{id:"product-1",name:`Ebook práctico: ${niche}`,concept:`Ebook estructurado para ${opportunity?.name??niche}`,problem:opportunity?.rationale??problem?.summary??quote,outcome:"Un proceso claro y repetible",promise:"Avanza con una secuencia práctica y verificable",format:"Ebook digital",deliverables:["Ebook digital completo (PDF/EPUB)","Workbook de ejercicios prácticos","Checklist de implementación"],modules:["Capítulo 1: Diagnóstico","Capítulo 2: Plan","Capítulo 3: Implementación","Capítulo 4: Casos Prácticos"],checklists:[],templates:[],resources:[],bonuses:[],evidenceIds:opportunity?.evidenceIds??ids}],selectedId:"product-1"},
  avatar:{schemaVersion:1,name:`Usuario objetivo de ${selectedProduct?.name??niche}`,productContext:selectedProduct?.concept,currentSituation:[{text:problem?.summary??quote,provenance:evidence.length?"EVIDENCE_BACKED":"AI_INFERENCE",evidenceIds:problem?.evidenceIds??(evidence[0]?[evidence[0].id]:[])}],desiredOutcome:[{text:selectedProduct?.outcome??`Lograr un resultado claro en ${niche}`,provenance:"AI_INFERENCE",evidenceIds:[]}],pains:problem?[problem.summary]:[],frustrations:[],desires:[],objections:["Necesita validar que el proceso sea realizable"],motivations:[selectedProduct?.promise].filter(Boolean),language:evidence.slice(0,3).map(item=>({text:item.quoteText,provenance:"EVIDENCE_BACKED",evidenceIds:[item.id]})),purchaseConcerns:[]},
  mechanism:{schemaVersion:1,perceivedProblem:problem?.summary??quote,apparentCause:"Falta de un proceso claro",rootCauseHypothesis:"Las decisiones no están organizadas en una secuencia repetible",mechanism:"Método de diagnóstico, plan, acción y revisión",solutionMechanism:selectedProduct?.concept??"Pasos pequeños con criterios verificables",differentiation:"Trazabilidad entre evidencia y decisión",simpleExplanation:"Convertir un problema amplio en pasos comprobables",detailedExplanation:`El método ordena el trabajo de ${niche} y conserva el origen de cada decisión.`,provenance:"AI_INFERENCE",evidenceIds:problem?.evidenceIds??ids},
  beliefs:{schemaVersion:1,product:selectedProduct?.name,avatar:avatar?.name,mechanism:mechanism?.mechanism,currentBeliefs:(avatar?.currentSituation??[]).map((item:any)=>item.text??item),limitingBeliefs:avatar?.objections??[],requiredBeliefs:[`El mecanismo ${mechanism?.mechanism??"propuesto"} puede aplicarse paso a paso`],objections:avatar?.purchaseConcerns??avatar?.objections??[],arguments:[mechanism?.simpleExplanation??"El sistema empieza con una acción acotada"],centralThesis:`${selectedProduct?.promise??`Un proceso claro mejora ${niche}`} mediante ${mechanism?.solutionMechanism??"pasos verificables"}.`},
  offer:{schemaVersion:1,name:selectedProduct?.name??`Ebook: ${niche}`,audience:avatar?.name,mechanism:mechanism?.mechanism,centralThesis:beliefs?.centralThesis,promise:selectedProduct?.promise??`El libro definitivo para ${niche}`,benefits:[mechanism?.simpleExplanation??"Claridad","Secuencia accionable","Revisión verificable"],deliverables:selectedProduct?.deliverables??["Ebook digital","Workbook de ejercicios","Checklist"],bonuses:selectedProduct?.bonuses??[],guaranteeSuggestion:"Garantía de satisfacción de 14 días",pricingSuggestion:{amount:27,currency:"USD",rationale:"Precio sugerido para libro digital con materiales complementarios"},orderBump:"Workbook de ejercicios",upsell:"Guía avanzada de implementación rápida",downsell:"Checklist esencial",cta:"Comprar el Ebook ahora",provenance:"AI_INFERENCE",disclaimer:"Sin testimonios, ventas, estadísticas ni garantías inventadas",evidenceIds:selectedProduct?.evidenceIds??ids},
   landing:{
     schemaVersion:1,
     title:offer?.name??selectedProduct?.name??`Ebook: ${niche}`,
     designTokens:{accent:"#2563eb",background:"#f8fafc",text:"#0f172a",font:"sans",width:"compact",spacing:"relaxed",theme:"modern"},
     sections:[
       {id:"hero-1",type:"hero",enabled:true,variant:"centered",eyebrow:offer?.audience??"PROPUESTA EXCLUSIVA",headline:offer?.promise??`Una ruta clara para ${niche}`,subheadline:beliefs?.centralThesis??"Del problema actual a un plan accionable y verificable.",cta:offer?.cta??"Comprar el Ebook ahora",evidenceIds:offer?.evidenceIds??ids},
       {id:"problem-1",type:"problem",enabled:true,variant:"editorial",eyebrow:"EL PROBLEMA REAL",headline:problem?.name??"La dificultad principal que frena tus resultados",body:problem?.summary??quote,evidenceIds:problem?.evidenceIds??ids},
       {id:"agitation-1",type:"agitation",enabled:true,variant:"editorial",eyebrow:"EL COSTO DE LA INACCIÓN",headline:"¿Por qué postergar la solución empeora la situación?",body:painBody,items:(avatar?.frustrations?.length?avatar.frustrations.slice(0,3):["Esfuerzo disperso sin saber qué palanca mover.","Incertidumbre constante sobre el siguiente paso.","Desgaste de tiempo y recursos sin avance medible."]).map((f:any)=>typeof f==="string"?f:(f?.text??String(f)))},
       {id:"mechanism-1",type:"mechanism",enabled:true,variant:"editorial",eyebrow:"EL MECANISMO ÚNICO",headline:mechanism?.mechanism??"Un proceso verificable paso a paso",subheadline:mechanism?.simpleExplanation??"Convierte un problema complejo en pasos concretos y comprobables.",body:mechanism?.detailedExplanation??mechanism?.solutionMechanism??"Diagnóstico preciso, plan de acción, implementación guiada y revisión continua.",items:[{name:"Paso 1: Diagnóstico",description:"Identificación precisa de la situación actual y puntos de fuga."},{name:"Paso 2: Plan de acción",description:"Secuencia priorizada de pasos concretos sin sobrecarga."},{name:"Paso 3: Implementación",description:"Ejecución guiada con plantillas y recursos prácticos."},{name:"Paso 4: Verificación",description:"Medición objetiva y ajustes continuos para sostener resultados."}],evidenceIds:mechanism?.evidenceIds??ids},
       {id:"benefits-1",type:"benefits",enabled:true,variant:"editorial",eyebrow:"TRANSFORMACIÓN Y BENEFICIOS",headline:"Lo que conseguirás al aplicar este libro",items:(offer?.benefits?.length?offer.benefits:["Claridad total sobre qué hacer cada día.","Secuencia estructurada sin saltarse pasos.","Resultados medibles y repetibles en el tiempo."]).map((b:any)=>typeof b==="string"?{name:b,description:"Beneficio directo y observable en tu rutina diaria."}:b)},
       {id:"product-1",type:"product",enabled:true,variant:"editorial",eyebrow:"PRESENTACIÓN",headline:selectedProduct?.name??offer?.name??`Ebook: ${niche}`,subheadline:selectedProduct?.concept??selectedProduct?.outcome??"Un libro estructurado para avanzar con seguridad.",body:selectedProduct?.promise??`Diseñado específicamente para ${avatar?.name??"lectores que buscan dominar "+niche}.`,items:(selectedProduct?.modules?.length?selectedProduct.modules:["Capítulo 1: Fundamentos y Diagnóstico","Capítulo 2: Ejecución Paso a Paso","Capítulo 3: Casos y Resultados"]).map((m:any)=>typeof m==="string"?{name:m,description:"Capítulo del libro con ejercicios guiados y plantillas."}:m)},
       {id:"deliverables-1",type:"deliverables",enabled:true,variant:"editorial",eyebrow:"QUÉ RECIBES",headline:"Todo lo que incluye el Ebook y sus complementos",items:(selectedProduct?.deliverables??offer?.deliverables??["Ebook digital completo (PDF/EPUB)","Hojas de trabajo prácticas (Workbooks)","Checklists de verificación y control"]).map((d:any)=>typeof d==="string"?{name:d,description:"Acceso y descarga inmediata tras la compra."}:d)},
       {id:"bonuses-1",type:"bonuses",enabled:true,variant:"editorial",eyebrow:"BONOS EXCLUSIVOS",headline:"Recursos complementarios para acelerar tus avances",items:(selectedProduct?.bonuses?.length?selectedProduct.bonuses:[{name:"Plantilla rápida de implementación",description:"Comienza en menos de 15 minutos sin fricción."},{name:"Guía de resolución de dudas frecuentes",description:"Soluciones a los obstáculos más habituales."}]).map((b:any)=>typeof b==="string"?{name:b,description:"Bono incluido para optimizar tu tiempo."}:b)},
       {id:"proof-1",type:"proof",enabled:true,variant:"editorial",eyebrow:"RESPALDO Y FUNDAMENTOS",headline:"Basado en evidencia observada y validación real",body:mechanism?.differentiation??"Cada decisión, capítulo y entregable proviene directamente del análisis de problemas comprobados en el mercado.",items:(avatar?.language?.slice(0,3)??[]).map((l:any)=>({name:"Observación de campo",description:`"${l.text??l}"`})),evidenceIds:ids},
       {id:"objections-1",type:"objections",enabled:true,variant:"editorial",eyebrow:"DUDAS COMUNES",headline:"Respuestas a las dudas más frecuentes antes de adquirir el libro",items:(beliefs?.objections?.length?beliefs.objections.slice(0,3):["¿Funcionará en mi situación particular?","¿Cuánto tiempo requiere aplicar las pautas del libro?"]).map((obj:any,i:number)=>({q:typeof obj==="string"?obj:(obj?.text??String(obj)),a:typeof beliefs?.arguments?.[i]==="string"?beliefs.arguments[i]:(beliefs?.arguments?.[i]?.text??"El libro se adapta a diferentes niveles partiendo de una acción mínima viable.")}))},
       {id:"faq-1",type:"faq",enabled:true,variant:"editorial",eyebrow:"PREGUNTAS FRECUENTES",headline:"Todo lo que necesitas saber antes de comprar",items:[{q:"¿Cómo accedo al libro?",a:"Recibirás enlace de descarga inmediata en PDF y EPUB tras completar tu compra."},{q:"¿Qué formato tienen los materiales?",a:"Ebook digital navegable, plantillas de trabajo y listas de verificación imprimibles."},{q:"¿Requiere conocimientos previos?",a:"No, el libro comienza desde los fundamentos y avanza progresivamente."}]},
       {id:"offer-1",type:"offer",enabled:true,variant:"centered",eyebrow:"OFERTA",headline:offer?.name??"Acceso completo al Ebook",subheadline:offer?.promise??"Adquiere el libro completo con todos los entregables y bonos digitales.",body:offer?.pricingSuggestion?.amount?`Inversión propuesta: ${offer.pricingSuggestion.amount} ${offer.pricingSuggestion.currency??"USD"}.`:"Acceso con condiciones especiales por lanzamiento.",cta:offer?.cta??"Comprar ahora"},
       {id:"guarantee-1",type:"guarantee",enabled:true,variant:"centered",eyebrow:"TRANQUILIDAD TOTAL",headline:"Garantía de satisfacción",body:offer?.guaranteeSuggestion??"Si tras revisar los primeros capítulos consideras que el libro no es para ti, dispones de una garantía de satisfacción total según las condiciones indicadas."},
       {id:"cta-1",type:"cta",enabled:true,variant:"centered",eyebrow:"DA EL SIGUIENTE PASO",headline:"Comienza hoy mismo con una lectura clara y aplicable",subheadline:"No dejes que la falta de claridad te siga costando tiempo y oportunidades.",cta:offer?.cta??"Quiero el Ebook completo"},
       {id:"footer-1",type:"footer",enabled:true,variant:"centered",body:`© ${new Date().getFullYear()} ${niche}. Todos los derechos reservados. Este sitio no forma parte de ninguna plataforma publicitaria externa.`}
     ],
     evidenceIds:offer?.evidenceIds??ids
   },
  funnel:{schemaVersion:1,landingVersion:landing?.title??"Landing principal",offerName:offer?.name??"Oferta principal",
     tracking:{events:[]},
     externalCheckout:{platform:"none"},
     nodes:[
     {id:"landing",type:"landing",label:landing?.title??"Landing principal",description:"Página propuesta; revisar antes de publicar.",active:true,linkedArtifact:"landing"},
     {id:"checkout",type:"checkout_placeholder",label:"Checkout pendiente de configurar",description:"Placeholder inactivo. Plataforma, URL y precio requieren una decisión explícita.",active:false,linkedArtifact:"offer",price:null,externalPlatform:"none"},
     {id:"bump",type:"order_bump",label:"Order bump no configurado",description:"Etapa opcional inactiva; requiere una oferta aprobada.",active:false,linkedArtifact:"offer",externalPlatform:"none"},
     {id:"upsell",type:"upsell",label:"Upsell no configurado",description:"Etapa opcional inactiva; requiere una oferta aprobada.",active:false,linkedArtifact:"offer",externalPlatform:"none"},
     {id:"downsell",type:"downsell",label:"Downsell no configurado",description:"Etapa opcional inactiva; requiere una oferta aprobada.",active:false,linkedArtifact:"offer",externalPlatform:"none"},
     {id:"thanks",type:"thank_you",label:"Confirmación pendiente de configurar",description:"Etapa inactiva hasta definir y validar el proceso de entrega.",active:false}
   ],edges:[
     {from:"landing",to:"checkout",event:"continue",label:"Continuar solo si se aprueba la oferta y se configura un checkout"},
     {from:"checkout",to:"bump",event:"continue",label:"Evaluar un complemento solo si se aprueba"},
     {from:"bump",to:"upsell",event:"accept",label:"Evaluar una oferta adicional, si existe y se aprueba"},
     {from:"upsell",to:"thanks",event:"accept",label:"Definir entrega antes de activar esta etapa"},
     {from:"upsell",to:"downsell",event:"decline",label:"Alternativa opcional, pendiente de decisión"},
     {from:"downsell",to:"thanks",event:"complete",label:"Finalizar solo tras definir el proceso de entrega"}
   ],paymentsEnabled:false,evidenceIds:offer?.evidenceIds??ids},
  content:{schemaVersion:1,offerName:offer?.name,audience:avatar?.name,mechanism:mechanism?.mechanism,centralThesis:beliefs?.centralThesis,calendar:[{day:1,type:"educational",channel:"Facebook",hook:`El primer paso para ${offer?.promise??niche}`,body:mechanism?.simpleExplanation??"Empieza por definir un resultado observable.",cta:`Descubre ${offer?.name??"el Ebook"}`},{day:3,type:"objection",channel:"Facebook",hook:(beliefs?.objections??[])[0]??"No necesitas resolver todo hoy",body:(beliefs?.arguments??[])[0]??"Elige una acción acotada y revísala.",cta:`Conoce el enfoque de ${offer?.name??"el Ebook"}`}],hooks:[beliefs?.centralThesis??`Una forma más clara de abordar ${niche}`],channels:["Facebook"],evidenceIds:offer?.evidenceIds??ids},
  final_product:{schemaVersion:1,files:[],guide:{title:selectedProduct?.name??offer?.name??`Ebook: ${niche}`,introduction:"MUESTRA SINTÉTICA DE DEMOSTRACIÓN. No es contenido editorial listo para publicar.",chapters:(selectedProduct?.modules??["Diagnóstico","Plan","Implementación","Casos prácticos"]).map((title:string)=>({title,content:"MUESTRA SINTÉTICA DE DEMOSTRACIÓN. Este espacio ilustra la estructura y debe sustituirse por contenido desarrollado antes de aprobar o exportar.",evidenceIds:[]})),conclusion:"MUESTRA SINTÉTICA DE DEMOSTRACIÓN. No es contenido editorial listo para publicar."},checklist:["Definir resultado","Revisar evidencia","Elegir acción","Registrar avance"],workbook:["Situación actual","Objetivo","Plan de acción del libro"],miniTool:{title:`Planificador del Ebook: ${niche}`,fields:["Objetivo","Próxima acción","Fecha de revisión"]},evidenceIds:selectedProduct?.evidenceIds??offer?.evidenceIds??ids},
 };
 return outputs[key] ?? {};
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

function buildStudioAiSystemInstructions(
  basePrompt: string,
  mode: "full_page" | "section" | "polish_copy",
  userPrompt: string,
  sectionIndex: number,
): string {
  const layoutMatrix = Object.entries(LANDING_SECTION_LAYOUTS)
    .map(([type, layouts]) => `  - ${type}: ${layouts.join(" | ")}`)
    .join("\n");

  const modeGuidance =
    mode === "full_page"
      ? `MODO FULL_PAGE PRO (NIVEL AGENCIA / FRAMER ELITE):
- Actúa como director de arte + copywriter senior de respuesta directa. Genera una landing COMPLETA (entre 11 y 15 bloques canónicos: hero, problem, agitation, mechanism, benefits, product, deliverables, bonuses, proof, objections, faq, offer, guarantee, cta, footer).
- Incluye designTokens completos coherentes con la instrucción del usuario (theme: "modern"|"warm"|"dark"|"editorial"|"minimal", accent, background, text en hex #RRGGBB, font: "sans"|"serif", width: "compact"|"wide", spacing: "compact"|"relaxed").
- VARÍA el diseño de cada bloque eligiendo explícitamente el campo "layout" adecuado (NO repitas el mismo layout en toda la página):
${layoutMatrix}
- Campos obligatorios de alto impacto por bloque:
  * hero: layout "split" (o "stats"), badge corto (ej. "GUÍA DIGITAL · LECTURA INMEDIATA"), eyebrow, headline potente de 6-14 palabras con promesa clara, subheadline concreto, 3-4 bullets cortos (viñetas), 3 stats reales ({ "value": "...", "label": "..." }), cta accionable e imageUrl elegido de studioVisualAssets.
  * problem / agitation: al menos 3-4 escenas reales del avatar (items con { "icon", "name", "description" } o layout "comparison" con beforeLabel, afterLabel e items { "name", "before", "after" }).
  * mechanism: layout "steps", con 3-5 pasos claros basados en upstreamContext.mechanism.
  * benefits: layout "checklist", 4-6 transformaciones medibles.
  * product / deliverables / bonuses: layouts "split" / "cards" / "checklist", entregables y bonos fieles a upstreamContext.offer y upstreamContext.product, con imageUrl de studioVisualAssets.
  * proof: layout "testimonials" o "stats", con cifras verificables o casos honestos basados en evidence (sin inventar testimonios ficticios con cifras médicas falsas).
  * objections & faq: layout "accordion", mínimo 4 preguntas reales ({ "q", "a" }).
  * offer: layout "pricing", badge destacado, price (toma el monto y moneda reales de upstreamContext.offer.pricingSuggestion), priceNote (condiciones/acceso), oldPrice opcional si hay anclaje en offer, bullets de confianza, items con lo que incluye, cta directo al checkout e imageUrl ("/api/studio-assets/bundle.jpg").
  * guarantee: layout "badge", badge corto (ej. "GARANTÍA TRANSPARENTE"), condiciones honestas en body.
  * cta: layout "centered" o "split", cierre convincente con cta.`
      : mode === "section"
        ? `MODO REESCRITURA DE SECCIÓN (targetSectionIndex=${sectionIndex}):
- Mantén intactas las demás secciones de currentLanding y reescribe profundamente la sección en el índice ${sectionIndex} eligiendo el layout óptimo (${layoutMatrix.replace(/\n/g, "; ")}) y usando todos los datos de upstreamContext, evidence y studioVisualAssets.`
        : `MODO PULIDO GLOBAL (polish_copy):
- Conserva el propósito de las secciones de currentLanding (o completa las secciones faltantes si hay qualityAuditIssuesToFix), mejora layouts variados, titulares de alto impacto (6-14 palabras en hero), bullets, stats, precio en offer, garantía, acordeón FAQ y asigna imageUrl reales de studioVisualAssets donde falten fotos.`;

  return `${basePrompt}

${modeGuidance}

ESTRUCTURA DE ITEMS Y ELEMENTOS PRO:
- Para bloques problem, agitation, mechanism, benefits, product, deliverables, bonuses y proof: usa objetos { "icon": "✓", "name": "Título conciso", "description": "Explicación concreta respaldada por el proyecto" } (y opcionalmente "before", "after", "role", "rating" 1-5 según el layout).
- Para bloques faq y objections: usa SIEMPRE objetos { "q": "¿Pregunta clara?", "a": "Respuesta directa y honesta" }.

REGLAS ESTRICTAS:
- Devuelve EXCLUSIVAMENTE un objeto JSON válido que cumpla el schema de Landing.
- USA ÚNICAMENTE URLs presentes en studioVisualAssets (formato "/api/studio-assets/archivo.jpg") para imageUrl (al menos en 4 a 6 bloques clave: hero, problem, mechanism, product, proof, offer) acompañadas de imageAlt descriptivo en español. NO inventes URLs externas.
- CERO texto genérico de relleno ("lorem ipsum", "bloque de contenido", "sin completar").
- Usa SOLO evidenceIds reales presentes en el arreglo evidence entregado.
- Instrucción prioritaria del usuario: ${userPrompt || "Máxima calidad editorial, jerarquía visual variada y copy de alta conversión fiel a la investigación."}`;
}

function sanitizeDraftForPrompt(raw: unknown): { title?: string; sections: Record<string, unknown>[] } | undefined {
  const rec = asRecord(raw);
  if (!Array.isArray(rec.sections)) return undefined;
  return {
    ...(typeof rec.title === "string" ? { title: rec.title } : {}),
    sections: rec.sections
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
      .slice(0, 20)
      .map((sec) => ({
        id: sec.id,
        type: sec.type,
        enabled: sec.enabled,
        variant: sec.variant,
        layout: sec.layout,
        badge: sec.badge,
        eyebrow: sec.eyebrow,
        headline: sec.headline,
        subheadline: sec.subheadline,
        body: sec.body,
        cta: sec.cta,
        price: sec.price,
        oldPrice: sec.oldPrice,
        priceNote: sec.priceNote,
        beforeLabel: sec.beforeLabel,
        afterLabel: sec.afterLabel,
        bullets: sec.bullets,
        stats: sec.stats,
        imageUrl: sec.imageUrl,
        imageAlt: sec.imageAlt,
        items: Array.isArray(sec.items) ? sec.items.slice(0, 12) : undefined,
        evidenceIds: sec.evidenceIds,
      })),
  };
}

function applyMockPromptHints(doc: Record<string, unknown>, prompt: string): Record<string, unknown> {
  const lower = prompt.toLowerCase();
  let nextTokens = asRecord(doc.designTokens);
  if (/oscuro|dark|framer|cyber|neon/i.test(lower)) nextTokens = { ...nextTokens, ...LANDING_THEME_PRESETS.dark };
  else if (/editorial|revista|serif|elegante/i.test(lower)) nextTokens = { ...nextTokens, ...LANDING_THEME_PRESETS.editorial };
  else if (/calid|warm|amber/i.test(lower)) nextTokens = { ...nextTokens, ...LANDING_THEME_PRESETS.warm };
  else if (/minimal|limpio|clean/i.test(lower)) nextTokens = { ...nextTokens, ...LANDING_THEME_PRESETS.minimal };
  return { ...doc, designTokens: nextTokens };
}

function sanitizeStudioSectionItems(type: string, items: unknown): unknown[] | undefined {
  if (!Array.isArray(items)) return undefined;
  const isQa = type === "faq" || type === "objections";
  const cleaned: unknown[] = [];
  for (const raw of items.slice(0, 60)) {
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) continue;
      if (isQa) cleaned.push({ q: text.endsWith("?") ? text : `¿${text}?`, a: "Consulta el detalle dentro del programa." });
      else cleaned.push(text);
      continue;
    }
    const obj = asRecord(raw);
    if (isQa || typeof obj.q === "string") {
      const q = (typeof obj.q === "string" ? obj.q : typeof obj.name === "string" ? obj.name : typeof obj.title === "string" ? obj.title : "").trim();
      const a = (typeof obj.a === "string" ? obj.a : typeof obj.description === "string" ? obj.description : typeof obj.text === "string" ? obj.text : "").trim();
      if (q && a) cleaned.push({ q, a });
      else if (q) cleaned.push({ q: q.endsWith("?") ? q : `¿${q}?`, a: "Respuesta basada en el alcance del producto." });
      continue;
    }
    const name = (typeof obj.name === "string" ? obj.name : typeof obj.title === "string" ? obj.title : typeof obj.headline === "string" ? obj.headline : "").trim();
    const before = typeof obj.before === "string" ? obj.before.trim().slice(0, 500) : "";
    const after = typeof obj.after === "string" ? obj.after.trim().slice(0, 500) : "";
    const description = (typeof obj.description === "string" ? obj.description : typeof obj.text === "string" ? obj.text : typeof obj.body === "string" ? obj.body : after || before).trim();
    const icon = typeof obj.icon === "string" ? obj.icon.trim().slice(0, 8) : "";
    const role = typeof obj.role === "string" ? obj.role.trim().slice(0, 120) : "";
    const rating = typeof obj.rating === "number" && Number.isFinite(obj.rating) ? Math.max(1, Math.min(5, Math.round(obj.rating))) : undefined;
    if (name || description || before || after) {
      cleaned.push({
        ...(icon ? { icon } : {}),
        name: name || description.slice(0, 60),
        description: description || after || before || name,
        ...(before ? { before } : {}),
        ...(after ? { after } : {}),
        ...(role ? { role } : {}),
        ...(rating !== undefined ? { rating } : {}),
      });
    }
  }
  return cleaned;
}

const STUDIO_ASSET_ROLE_PRIORITY: Record<string, string[]> = {
  hero: ["hero", "bundle", "guide"],
  problem: ["problem", "foto_perro_tension_urbana"],
  agitation: ["foto_estallido_reactivo", "foto_perro_tension_urbana"],
  mechanism: ["foto_master_01_paseo_nocturno", "foto_olfateo_calma", "illustration_signals"],
  product: ["guide", "bundle", "foto_cuaderno_escritorio"],
  deliverables: ["foto_mockup_tarjetas_sos", "foto_cuaderno_escritorio"],
  bonuses: ["foto_masticacion_descompresion", "foto_descompresion_sniffari"],
  benefits: ["foto_perro_paseo_calmado", "foto_banco_parque_atardecer"],
  proof: ["testimonial", "foto_perro_grande_pastor", "expert"],
  offer: ["bundle", "foto_mockup_tarjetas_sos"],
  guarantee: ["expert", "foto_master_02_consulta_etologia"],
  cta: ["foto_paseo_nocturno_calmado", "hero"],
};

function resolveCandidateStudioAsset(rawValue: unknown): { url: string; alt: string } | null {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const validDirect = landingImageUrl(trimmed);
  if (validDirect) {
    if (validDirect.startsWith("/api/studio-assets/")) {
      const slug = decodeURIComponent(validDirect.slice("/api/studio-assets/".length));
      const matched = STUDIO_VISUAL_ASSETS.find((a) => a.filename.toLowerCase() === slug.toLowerCase() || a.id.toLowerCase() === slug.toLowerCase());
      return matched ? { url: studioAssetUrl(matched.filename), alt: matched.title } : null;
    }
    return { url: validDirect, alt: "" };
  }
  const byName = STUDIO_VISUAL_ASSETS.find(
    (a) => a.filename.toLowerCase() === trimmed.toLowerCase() || a.id.toLowerCase() === trimmed.toLowerCase(),
  );
  return byName ? { url: studioAssetUrl(byName.filename), alt: byName.title } : null;
}

function defaultAssetForSectionType(type: string): { url: string; alt: string } | null {
  const candidates = STUDIO_ASSET_ROLE_PRIORITY[type];
  if (!candidates) return null;
  for (const id of candidates) {
    const asset = STUDIO_VISUAL_ASSETS.find((item) => item.id === id);
    if (asset) return { url: studioAssetUrl(asset.filename), alt: asset.title };
  }
  return null;
}

function sanitizeStudioLandingOutput({
  rawOutput,
  currentDraft,
  allowedEvidence,
  mode,
  sectionIndex,
  fallbackTitle,
  parentOutputs,
}: {
  rawOutput: Record<string, unknown>;
  currentDraft: unknown;
  allowedEvidence: ReadonlyArray<{ id: string }>;
  mode: "full_page" | "section" | "polish_copy";
  sectionIndex: number | undefined;
  fallbackTitle: string;
  parentOutputs?: Partial<Record<ModuleKey, unknown>> | undefined;
}): Record<string, unknown> {
  const allowedIds = new Set(allowedEvidence.map((item) => item.id));
  const draftRecord = asRecord(currentDraft);
  const offerRecord = asRecord(parentOutputs?.offer);
  const pricingRecord = asRecord(offerRecord.pricingSuggestion);
  const derivedOfferPrice =
    pricingRecord.amount !== undefined && pricingRecord.amount !== null && String(pricingRecord.amount).trim()
      ? (String(pricingRecord.currency ?? "").trim().toUpperCase() === "USD"
          ? `$${String(pricingRecord.amount).trim()} USD`
          : `${String(pricingRecord.amount).trim()} ${String(pricingRecord.currency ?? "").trim()}`.trim())
      : "";
  const existingSections = Array.isArray(draftRecord.sections)
    ? draftRecord.sections.filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object" && !Array.isArray(s)))
    : [];

  const filterIds = (ids: unknown): string[] =>
    Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === "string" && allowedIds.has(id)))].slice(0, 40) : [];

  const existingById = new Map(existingSections.filter((s) => typeof s.id === "string" && s.id).map((s) => [String(s.id), s]));
  const existingByType = new Map(existingSections.filter((s) => typeof s.type === "string" && s.type).map((s) => [String(s.type), s]));

  const strField = (primary: unknown, fallback: unknown, maxLen = 12000) => {
    const first = typeof primary === "string" ? primary.trim().slice(0, maxLen) : "";
    if (first) return first;
    return typeof fallback === "string" ? fallback.trim().slice(0, maxLen) : "";
  };

  const normalizeOneSection = (
    sec: Record<string, unknown>,
    idx: number,
    prevMatch?: Record<string, unknown>,
    allowAutoAsset = false,
  ): Record<string, unknown> => {
    const type = typeof sec.type === "string" && sec.type.trim() ? sec.type.trim() : typeof prevMatch?.type === "string" ? prevMatch.type : "benefits";
    const id = typeof sec.id === "string" && sec.id.trim() ? sec.id.trim() : typeof prevMatch?.id === "string" && prevMatch.id ? prevMatch.id : `studio-${idx + 1}-${type}`;
    const resolvedSecImg = resolveCandidateStudioAsset(sec.imageUrl);
    const resolvedPrevImg = resolveCandidateStudioAsset(prevMatch?.imageUrl);
    const autoImg = !resolvedSecImg && !resolvedPrevImg && allowAutoAsset ? defaultAssetForSectionType(type) : null;
    const candidateImg = resolvedSecImg?.url ?? resolvedPrevImg?.url ?? autoImg?.url ?? "";
    const candidateAlt = candidateImg
      ? (typeof sec.imageAlt === "string" && sec.imageAlt.trim()
          ? sec.imageAlt.trim().slice(0, 250)
          : typeof prevMatch?.imageAlt === "string" && prevMatch.imageAlt.trim()
            ? prevMatch.imageAlt.trim().slice(0, 250)
            : resolvedSecImg?.alt || resolvedPrevImg?.alt || autoImg?.alt || (typeof sec.headline === "string" && sec.headline.trim() ? sec.headline.trim() : "Imagen de sección").slice(0, 250))
      : "";

    const items = sanitizeStudioSectionItems(type, sec.items ?? prevMatch?.items);
    const headline = typeof sec.headline === "string" ? sec.headline.trim().slice(0, 12000) : "";
    const subheadline = typeof sec.subheadline === "string" ? sec.subheadline.trim().slice(0, 12000) : "";
    const body = typeof sec.body === "string" ? sec.body.trim().slice(0, 12000) : "";
    const eyebrow = typeof sec.eyebrow === "string" ? sec.eyebrow.trim().slice(0, 12000) : "";
    const cta = typeof sec.cta === "string" ? sec.cta.trim().slice(0, 12000) : "";
    const badge = strField(sec.badge, prevMatch?.badge, 120) || (type === "guarantee" ? "GARANTÍA TRANSPARENTE" : "");
    const price = strField(sec.price, prevMatch?.price, 120) || (type === "offer" ? derivedOfferPrice : "");
    const oldPrice = strField(sec.oldPrice, prevMatch?.oldPrice, 120);
    const priceNote = strField(sec.priceNote, prevMatch?.priceNote, 240);
    const beforeLabel = strField(sec.beforeLabel, prevMatch?.beforeLabel, 120);
    const afterLabel = strField(sec.afterLabel, prevMatch?.afterLabel, 120);
    const bullets = landingTextList(sec.bullets !== undefined ? sec.bullets : prevMatch?.bullets, 10);
    const stats = landingStats(sec.stats !== undefined ? sec.stats : prevMatch?.stats);
    const layout = resolveLandingLayout({
      type,
      layout: typeof sec.layout === "string" && sec.layout.trim() ? sec.layout : prevMatch?.layout,
      imageUrl: candidateImg,
    });
    const hasContent = Boolean(headline || subheadline || body || cta || (items && items.length) || stats.length || bullets.length);

    return {
      id,
      type,
      enabled: typeof sec.enabled === "boolean" ? sec.enabled : typeof prevMatch?.enabled === "boolean" ? prevMatch.enabled : true,
      variant: sec.variant === "centered" ? "centered" : sec.variant === "editorial" ? "editorial" : prevMatch?.variant === "centered" ? "centered" : "editorial",
      layout,
      ...(badge ? { badge } : {}),
      ...(eyebrow ? { eyebrow } : {}),
      headline: headline || (hasContent ? headline : "Propuesta principal"),
      ...(subheadline ? { subheadline } : {}),
      body: body || (!hasContent ? "Consulta el contenido completo de esta sección dentro de la guía." : body),
      ...(cta ? { cta } : {}),
      ...(price ? { price } : {}),
      ...(oldPrice ? { oldPrice } : {}),
      ...(priceNote ? { priceNote } : {}),
      ...(beforeLabel ? { beforeLabel } : {}),
      ...(afterLabel ? { afterLabel } : {}),
      ...(bullets.length ? { bullets } : {}),
      ...(stats.length ? { stats } : {}),
      ...(candidateImg ? { imageUrl: candidateImg, imageAlt: candidateAlt } : {}),
      ...(items !== undefined ? { items } : {}),
      evidenceIds: filterIds(sec.evidenceIds ?? prevMatch?.evidenceIds),
    };
  };

  let generatedSections = Array.isArray(rawOutput.sections)
    ? rawOutput.sections.filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object" && !Array.isArray(s)))
    : [];

  if (mode === "section" && existingSections.length > 0 && typeof sectionIndex === "number" && existingSections[sectionIndex]) {
    const targetPrev = existingSections[sectionIndex]!;
    const replacement =
      generatedSections[sectionIndex] ??
      generatedSections.find((s) => s.id === targetPrev.id) ??
      generatedSections.find((s) => s.type === targetPrev.type) ??
      generatedSections[0];
    generatedSections = existingSections.map((prev, idx) =>
      idx === sectionIndex && replacement ? normalizeOneSection(replacement, idx, prev, false) : normalizeOneSection(prev, idx, prev, false),
    );
  } else if (generatedSections.length > 0) {
    const existingImages = generatedSections.filter((sec) => Boolean(resolveCandidateStudioAsset(sec.imageUrl))).length;
    const allowAuto = mode === "full_page" && existingImages < 4;
    generatedSections = generatedSections.slice(0, 40).map((sec, idx) => {
      const prevMatch =
        (typeof sec.id === "string" ? existingById.get(sec.id) : undefined) ??
        (typeof sec.type === "string" ? existingByType.get(sec.type) : undefined);
      return normalizeOneSection(sec, idx, prevMatch, allowAuto);
    });
  } else if (existingSections.length > 0) {
    generatedSections = existingSections.map((prev, idx) => normalizeOneSection(prev, idx, prev, mode === "full_page"));
  }

  if (generatedSections.length > 0 && !generatedSections.some((s) => s.enabled !== false)) {
    generatedSections[0] = { ...generatedSections[0]!, enabled: true };
  }

  const rawTokens = asRecord(rawOutput.designTokens);
  const draftTokens = asRecord(draftRecord.designTokens);
  const theme = typeof rawTokens.theme === "string" && rawTokens.theme in LANDING_THEME_PRESETS
    ? rawTokens.theme as keyof typeof LANDING_THEME_PRESETS
    : typeof draftTokens.theme === "string" && draftTokens.theme in LANDING_THEME_PRESETS
      ? draftTokens.theme as keyof typeof LANDING_THEME_PRESETS
      : "modern";
  const preset = LANDING_THEME_PRESETS[theme] ?? {
    theme: "modern",
    accent: "#2563eb",
    background: "#f8fafc",
    text: "#0f172a",
    font: "sans" as const,
    width: "compact" as const,
    spacing: "relaxed" as const,
  };
  const hex = (val: unknown, alt: unknown, fallback: string) =>
    typeof val === "string" && /^#[0-9a-f]{6}$/i.test(val.trim())
      ? val.trim()
      : typeof alt === "string" && /^#[0-9a-f]{6}$/i.test(alt.trim())
        ? alt.trim()
        : fallback;

  const designTokens = {
    theme,
    accent: hex(rawTokens.accent, draftTokens.accent, preset.accent),
    background: hex(rawTokens.background, draftTokens.background, preset.background),
    text: hex(rawTokens.text, draftTokens.text, preset.text),
    font: rawTokens.font === "serif" || rawTokens.font === "sans" ? rawTokens.font : draftTokens.font === "serif" ? "serif" : preset.font,
    width: rawTokens.width === "wide" || rawTokens.width === "compact" ? rawTokens.width : draftTokens.width === "wide" ? "wide" : preset.width,
    spacing: rawTokens.spacing === "compact" || rawTokens.spacing === "relaxed" ? rawTokens.spacing : draftTokens.spacing === "compact" ? "compact" : preset.spacing,
  };

  const title =
    (typeof rawOutput.title === "string" && rawOutput.title.trim()) ||
    (typeof draftRecord.title === "string" && draftRecord.title.trim()) ||
    fallbackTitle ||
    "Landing del proyecto";

  const footerNote =
    (typeof rawOutput.footerNote === "string" && rawOutput.footerNote) ||
    (typeof draftRecord.footerNote === "string" && draftRecord.footerNote) ||
    "";

  const checkout = asRecord(draftRecord.externalCheckout);
  const hasValidCheckout =
    ["none", "hotmart", "skool", "custom"].includes(String(checkout.platform)) &&
    (checkout.platform === "none" || landingCheckoutUrl(checkout.checkoutUrl));

  return {
    schemaVersion: 1,
    title: title.slice(0, 12000),
    footerNote: footerNote.slice(0, 12000),
    designTokens,
    sections: generatedSections,
    ...(hasValidCheckout ? { externalCheckout: checkout } : {}),
    evidenceIds: filterIds(rawOutput.evidenceIds ?? draftRecord.evidenceIds),
  };
}

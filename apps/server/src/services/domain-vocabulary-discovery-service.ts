import type { LlmProvider, LlmGenerateResult } from "@our-platform/shared";
import { v7 as uuidv7 } from "uuid";

import type { AppDatabase } from "../database/database.js";
import { getPrompt } from "../services/prompt-registry.js";
import type {
  DomainVocabularyDiscoveryInput,
  DomainVocabularyDiscoveryProviderMetadata,
  DomainVocabularyDiscoveryResult,
  DomainVocabularyDiscoveryResultStatus,
  DomainVocabularyProposal,
  DomainVocabularyDiscoverySourceItem,
  NormalizedConcept,
  VocabularyValidationResult,
  VocabularyValidationStatus,
} from "../services/domain-vocabulary-discovery.js";
import type { AnalysisSetSnapshot } from "../services/problem-quality-engine.js";
import {
  validateDomainVocabularyProposal,
} from "../services/domain-vocabulary-discovery.js";
import { SemanticVocabularyRepository } from "../repositories/semantic-vocabulary-repository.js";
import { canonicalContentHash } from "../services/semantic-vocabulary.js";

const DISCOVERY_PROMPT_RELATIVE_PATH = "prompts/domain-vocabulary-discovery.md";
const MAX_OUTPUT_TOKENS = 8_000;

/* ------------------------------------------------------------------ */
/*  Safe diagnostic helpers (PHASE 4C observability)                   */
/* ------------------------------------------------------------------ */

const SECRET_PATTERNS = [
  /AIza[\w-]{20,}/gu,
  /sk-[A-Za-z0-9]{16,}/gu,
  /Bearer\s+[\w-]{8,}/giu,
  /x-goog-api-key[^\n]*/giu,
  /\?key=[^&\s]+/giu,
  /key=[^&\s]{12,}/giu,
];

function sanitizeDiagnostic(value: string): string {
  let safe = value;
  for (const pattern of SECRET_PATTERNS) safe = safe.replace(pattern, "[redacted]");
  return safe.replace(/\s+/gu, " ").trim().slice(0, 300);
}

/**
 * Safe, credential-free diagnostic string for a provider/validation error.
 * Only the error category, an optional HTTP status and a sanitized message are
 * kept. Never exposes API keys, headers, prompts or raw secrets.
 */
export function providerErrorDiagnostic(error: unknown): string {
  if (error instanceof Error) {
    const rec = error as Error & { code?: unknown; status?: unknown };
    const code = typeof rec.code === "string" ? rec.code : rec.name;
    const status = typeof rec.status === "number" ? ` http=${rec.status}` : "";
    return sanitizeDiagnostic(`${code}${status}: ${rec.message}`);
  }
  return sanitizeDiagnostic(String(error));
}

function buildSourceMaterial(input: DomainVocabularyDiscoveryInput): string {
  const lines: string[] = [];
  lines.push(`researchFocus: ${input.researchFocus ?? "(sin foco explícito)"}`);
  lines.push("");
  lines.push(`sourceItems:`);
  for (const item of input.sourceItems) {
    lines.push(`- id: ${item.id}`);
    if (item.context) lines.push(`  context: ${item.context}`);
    lines.push(`  text: "${item.text.replace(/"/g, '\\"')}"`);
    if (item.evidenceIds && item.evidenceIds.length > 0) {
      lines.push(`  evidenceIds: [${item.evidenceIds.join(", ")}]`);
    }
    if (item.snippets && item.snippets.length > 0) {
      lines.push(`  snippets:`);
      for (const snippet of item.snippets) {
        lines.push(`    - "${snippet.replace(/"/g, '\\"')}"`);
      }
    }
  }
  return lines.join("\n");
}

function buildStructuredOutputSchema(): { name: string; jsonSchema: Record<string, unknown> } {
  return {
    name: "domain_vocabulary_discovery_output",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        concepts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              proposedKey: { type: "string" },
              label: { type: "string" },
              definition: { type: "string" },
              aliases: {
                type: "array",
                items: { type: "string" },
              },
              exclusions: {
                type: "array",
                items: { type: "string" },
              },
              evidenceIds: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["label", "aliases", "evidenceIds"],
          },
        },
      },
      required: ["concepts"],
    },
  };
}

function toProviderMetadata(result: LlmGenerateResult<unknown>): DomainVocabularyDiscoveryProviderMetadata {
  return {
    provider: result.provider,
    model: result.reportedModel ?? result.requestedModel,
    promptVersion: "",
    usage: result.usage,
  };
}

function buildNormalizedConceptsForPersistence(
  validation: VocabularyValidationResult,
): { concepts: import("../services/semantic-vocabulary.js").ConceptInput[]; contentHash: string } {
  const concepts = validation.normalizedConcepts.map((concept) => ({
    conceptKey: concept.conceptKey,
    label: concept.label,
    definition: concept.definition,
    cohesionWeight: concept.cohesionWeight,
    aliases: [
      ...concept.aliases.map((alias) => ({ alias, isExclusion: false as const })),
      ...concept.exclusions.map((exclusion) => ({ alias: exclusion, isExclusion: true as const })),
    ],
  }));
  const contentHash = canonicalContentHash(concepts);
  return { concepts, contentHash };
}

export class DomainVocabularyDiscoveryService {
  constructor(
    private readonly provider: LlmProvider,
    private readonly vocabulary: SemanticVocabularyRepository,
    private readonly database: AppDatabase,
    private readonly options: {
      readonly model?: string;
      readonly maxOutputTokens?: number;
      readonly reuseExistingCandidate?: boolean;
    } = {},
  ) {}

  async discover(
    input: DomainVocabularyDiscoveryInput,
  ): Promise<DomainVocabularyDiscoveryResult> {
    const reuseExistingCandidate = input.sourceItems.length > 0
      ? (this.options.reuseExistingCandidate ?? true)
      : false;

    if (reuseExistingCandidate) {
      const existing = this.vocabulary.getLatestCandidateForTuple(
        input.projectId,
        input.researchFocusHash,
        input.analysisSnapshotHash,
      );
      if (existing) {
        return {
          status: "REUSED_CANDIDATE",
          vocabularyVersionId: existing.id,
          validationStatus: "VALID",
          issues: [],
          statistics: {
            totalConcepts: 0,
            validConcepts: 0,
            rejectedConcepts: 0,
          },
        };
      }
    }

    const prompt = getPrompt(DISCOVERY_PROMPT_RELATIVE_PATH);
    const systemInstructions = prompt.instructions;
    const promptVersion = prompt.versionHash;
    const model = this.options.model?.trim() || "gpt-4o-mini";
    const sourceMaterial = buildSourceMaterial(input);

    let providerResult: LlmGenerateResult<DomainVocabularyProposal> | undefined;
    try {
      providerResult = await this.provider.generate<DomainVocabularyProposal>({
        provider: this.provider.name,
        model,
        systemInstructions,
        input: sourceMaterial,
        structuredOutput: buildStructuredOutputSchema(),
        maxOutputTokens: this.options.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      });
    } catch (error) {
      return {
        status: "PROVIDER_FAILED",
        issues: [{ code: "PROVIDER_ERROR", message: providerErrorDiagnostic(error) }],
        statistics: {
          totalConcepts: 0,
          validConcepts: 0,
          rejectedConcepts: 0,
        },
        providerMetadata: {
          provider: this.provider.name,
          model,
          promptVersion,
          usage: {
            usageKind: "unknown",
          },
        },
      };
    }

    const proposal = providerResult.output;
    const validation = validateDomainVocabularyProposal(
      proposal,
      input.analysisSetSnapshot,
      input.researchFocus,
    );

    if (validation.status === "REJECTED") {
      return {
        status: "REJECTED",
        validationStatus: validation.status,
        issues: validation.issues,
        statistics: {
          totalConcepts: validation.statistics.totalConcepts,
          validConcepts: validation.statistics.validConcepts,
          rejectedConcepts: validation.statistics.rejectedConcepts,
        },
        providerMetadata: {
          ...toProviderMetadata(providerResult),
          promptVersion,
        },
      };
    }

    const validConcepts = validation.normalizedConcepts.filter(
      (concept) =>
        concept.aliases.length > 0 &&
        concept.evidenceIds.length >= 2 &&
        !concept.issues.some((issue) =>
          [
            "label is a generic/over-broad term",
            "label contains injection-like content",
            "definition contains injection-like content",
            "no grounded aliases remain after validation",
            "insufficient grounded evidence",
          ].some((blocker) => issue.toLowerCase().includes(blocker.toLowerCase())),
        ),
    );

    if (validConcepts.length === 0) {
      return {
        status: "REJECTED",
        validationStatus: validation.status,
        issues: validation.issues,
        statistics: {
          totalConcepts: validation.statistics.totalConcepts,
          validConcepts: 0,
          rejectedConcepts: validation.statistics.rejectedConcepts,
        },
        providerMetadata: {
          ...toProviderMetadata(providerResult),
          promptVersion,
        },
      };
    }

    const { concepts, contentHash } = buildNormalizedConceptsForPersistence({
      ...validation,
      normalizedConcepts: validConcepts,
    });

    const generationId = uuidv7();
    let versionId: string | undefined;
    try {
      const version = this.vocabulary.createVocabularyVersion({
        projectId: input.projectId,
        researchFocus: input.researchFocus,
        researchFocusHash: input.researchFocusHash,
        analysisSnapshotHash: input.analysisSnapshotHash,
        contentHash,
        status: "candidate",
        provider: providerResult.provider,
        model: providerResult.reportedModel ?? providerResult.requestedModel,
        promptVersion,
        concepts,
      });
      versionId = version.id;
    } catch (error) {
      return {
        status: "PROVIDER_FAILED",
        issues: [
          ...validation.issues,
          {
            code: "PERSISTENCE_FAILED",
            message: error instanceof Error ? error.message : "Error persistiendo vocabulary candidate.",
          },
        ],
        statistics: {
          totalConcepts: validation.statistics.totalConcepts,
          validConcepts: validConcepts.length,
          rejectedConcepts: validation.statistics.rejectedConcepts,
        },
        providerMetadata: {
          ...toProviderMetadata(providerResult),
          promptVersion,
        },
      };
    }

    return {
      status: "CREATED_CANDIDATE",
      vocabularyVersionId: versionId,
      validationStatus: validation.status,
      issues: validation.issues,
      statistics: {
        totalConcepts: validation.statistics.totalConcepts,
        validConcepts: validConcepts.length,
        rejectedConcepts: validation.statistics.rejectedConcepts,
      },
      providerMetadata: {
        ...toProviderMetadata(providerResult),
        promptVersion,
      },
    };
  }
}

export type {
  DomainVocabularyDiscoveryInput,
  DomainVocabularyDiscoveryProviderMetadata,
  DomainVocabularyDiscoveryResult,
  DomainVocabularyDiscoveryResultStatus,
  DomainVocabularyDiscoverySourceItem,
} from "../services/domain-vocabulary-discovery.js";

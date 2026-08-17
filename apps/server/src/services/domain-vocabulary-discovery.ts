import type { AnalysisSetSnapshot } from "../services/problem-quality-engine.js";
import { sha256, normalizeForHash } from "../services/semantic-vocabulary.js";
import { sequenceMatch, tokenizeForMatch } from "../services/semantic-vocabulary-matcher.js";

/* ------------------------------------------------------------------ */
/*  Provider-agnostic proposal contract                                */
/* ------------------------------------------------------------------ */

export interface DomainConceptProposal {
  proposedKey?: string;
  label: string;
  definition?: string;
  aliases: string[];
  exclusions?: string[];
  evidenceIds: string[];
}

export interface DomainVocabularyProposal {
  concepts: DomainConceptProposal[];
}

/* ------------------------------------------------------------------ */
/*  Validated / normalized concept                                    */
/* ------------------------------------------------------------------ */

export interface NormalizedConcept {
  conceptKey: string;
  label: string;
  definition: string | null;
  aliases: string[];
  exclusions: string[];
  evidenceIds: string[];
  cohesionWeight: number;
  /** Aliases that were present in the proposal but removed because they were not grounded. */
  removedAliases: string[];
  /** Evidence IDs proposed but not found in the snapshot. */
  unresolvedEvidenceIds: string[];
  matchedEvidenceCount: number;
  matchedCommentCount: number;
  corpusMatchRatio: number;
  issues: string[];
}

/* ------------------------------------------------------------------ */
/*  Validation result                                                  */
/* ------------------------------------------------------------------ */

export interface VocabularyValidationIssue {
  code: string;
  message: string;
  conceptIndex?: number;
  evidenceIds?: string[];
}

export type VocabularyValidationStatus = "VALID" | "NEEDS_REPAIR" | "REJECTED";

export interface VocabularyValidationResult {
  status: VocabularyValidationStatus;
  normalizedConcepts: NormalizedConcept[];
  issues: VocabularyValidationIssue[];
  statistics: {
    totalConcepts: number;
    validConcepts: number;
    rejectedConcepts: number;
    totalAliases: number;
    groundedAliases: number;
    removedAliases: number;
    totalEvidenceIds: number;
    resolvedEvidenceIds: number;
    unresolvedEvidenceIds: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Discovery input contract (provider-agnostic)                       */
/* ------------------------------------------------------------------ */

export interface DomainVocabularyDiscoverySourceItem {
  /** Stable evidence/source identifier. */
  id: string;
  /** Compact text representation. */
  text: string;
  /** Optional candidate/problem context to guide discovery without resending full corpus. */
  context?: string;
  /**
   * Real evidence ids this candidate references that ARE present in the
   * Analysis Set snapshot. Exposing them lets a provider propose resolvable
   * `evidenceIds` instead of inventing ids that the validator rejects.
   */
  evidenceIds?: string[];
  /** Short server-side snippets for those evidence ids to guide alias grounding. */
  snippets?: string[];
}

export interface DomainVocabularyDiscoveryInput {
  projectId: string;
  researchFocus: string | null;
  researchFocusHash: string;
  analysisSnapshotHash: string;
  analysisSetSnapshot: AnalysisSetSnapshot;
  sourceItems: readonly DomainVocabularyDiscoverySourceItem[];
}

/* ------------------------------------------------------------------ */
/*  Discovery result                                                   */
/* ------------------------------------------------------------------ */

export type DomainVocabularyDiscoveryResultStatus =
  | "REUSED_CANDIDATE"
  | "CREATED_CANDIDATE"
  | "REJECTED"
  | "PROVIDER_FAILED";

export interface DomainVocabularyDiscoveryProviderMetadata {
  provider: string;
  model?: string;
  promptVersion: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
    currency?: string;
    usageKind?: "provider_reported" | "estimated" | "unknown";
  };
}

export interface DomainVocabularyDiscoveryResult {
  status: DomainVocabularyDiscoveryResultStatus;
  vocabularyVersionId?: string;
  validationStatus?: VocabularyValidationStatus;
  issues: VocabularyValidationIssue[];
  statistics: {
    totalConcepts: number;
    validConcepts: number;
    rejectedConcepts: number;
  };
  providerMetadata?: DomainVocabularyDiscoveryProviderMetadata;
}

/* ------------------------------------------------------------------ */
/*  V1 limits (deterministic, server-side)                             */
/* ------------------------------------------------------------------ */

const MAX_CONCEPTS = 12;
const MIN_CONCEPTS = 1;
const MAX_ALIASES = 8;
const MAX_EXCLUSIONS = 6;
const MAX_ALIAS_LENGTH = 80;
const MIN_ALIAS_LENGTH = 3;
const MAX_DEFINITION_LENGTH = 300;
const MAX_LABEL_LENGTH = 80;
const MIN_EVIDENCE_IDS = 2;
const MAX_EVIDENCE_IDS = 20;

const GENERIC_LABELS = new Set([
  "problema",
  "problemas",
  "ayuda",
  "duda",
  "dudas",
  "pregunta",
  "preguntas",
  "usuario",
  "usuarios",
  "user",
  "comentario",
  "comentarios",
  "video",
  "tutorial",
  "varios",
  "varias",
  "otros",
  "otras",
  "misc",
  "miscellaneous",
]);

const GENERIC_STOPWORDS = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "y",
  "o",
  "en",
  "para",
  "por",
  "con",
  "un",
  "una",
  "que",
  "como",
  "sobre",
  "sus",
  "se",
  "al",
  "a",
  "es",
  "son",
  "no",
  "mi",
  "tu",
  "su",
  "this",
  "that",
  "from",
  "into",
  "foto",
  "fotos",
  "fotografia",
  "fotografias",
  "tutorial",
  "video",
  "problema",
  "usuarios",
  "user",
]);

const INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /system\s+prompt/i,
  /ADMIN_OVERRIDE/i,
  /sudo/i,
  /\/\/\s*system/i,
  /\{\{?\s*system/i,
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProposalAlias(alias: string): string {
  return normalizeForHash(alias);
}

function buildCanonicalConceptKey(label: string, aliases: string[]): string {
  const normalizedLabel = normalizeForHash(label);
  const normalizedAliases = aliases
    .map((alias) => normalizeForHash(alias))
    .filter((alias) => alias.length > 0)
    .sort();
  const input = `${normalizedLabel}|${normalizedAliases.join(",")}`;
  return `dom_${sha256(input).slice(0, 12)}`;
}

function tokenizeAlias(alias: string): string[] {
  return tokenizeForMatch(alias);
}

function aliasAppearsInEvidence(alias: string, evidenceQuotes: string[]): boolean {
  const aliasTokens = tokenizeAlias(alias);
  if (aliasTokens.length === 0) return false;

  for (const quote of evidenceQuotes) {
    const quoteTokens = tokenizeForMatch(quote);
    if (aliasTokens.length === 1) {
      if (quoteTokens.includes(aliasTokens[0]!)) return true;
    } else if (sequenceMatch(quoteTokens, aliasTokens)) {
      return true;
    }
  }
  return false;
}

function hasInjectionContent(value: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(value));
}

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function isStopwordOnlyAlias(alias: string): boolean {
  const tokens = tokenizeAlias(alias);
  if (tokens.length === 0) return true;
  return tokens.every((token) => GENERIC_STOPWORDS.has(token));
}

function shouldMergeConcepts(a: NormalizedConcept, b: NormalizedConcept): boolean {
  // A) shared normalized alias
  const aliasSetA = new Set(a.aliases.map((alias) => normalizeForHash(alias)));
  const aliasSetB = new Set(b.aliases.map((alias) => normalizeForHash(alias)));
  const sharedAliases = [...aliasSetA].filter((alias) => aliasSetB.has(alias));
  if (sharedAliases.length > 0) return true;

  // B) evidence overlap / union >= 0.60
  const setA = new Set(a.evidenceIds);
  const setB = new Set(b.evidenceIds);
  const intersection = [...setA].filter((id) => setB.has(id)).length;
  const union = new Set([...setA, ...setB]).size;
  if (union > 0 && intersection / union >= 0.6) return true;

  return false;
}

function mergeConcepts(a: NormalizedConcept, b: NormalizedConcept): NormalizedConcept {
  const aliases = [...new Set([...a.aliases, ...b.aliases])];
  const exclusions = [...new Set([...a.exclusions, ...b.exclusions])];
  const evidenceIds = [...new Set([...a.evidenceIds, ...b.evidenceIds])];

  // deterministic label choice: alphabetically first normalized label
  const labelA = normalizeForHash(a.label);
  const labelB = normalizeForHash(b.label);
  const label = labelA <= labelB ? a.label : b.label;

  const conceptKey = buildCanonicalConceptKey(label, aliases);

  return {
    conceptKey,
    label,
    definition: a.definition ?? b.definition ?? null,
    aliases,
    exclusions,
    evidenceIds,
    cohesionWeight: 1,
    removedAliases: [...a.removedAliases, ...b.removedAliases],
    unresolvedEvidenceIds: [...a.unresolvedEvidenceIds, ...b.unresolvedEvidenceIds],
    matchedEvidenceCount: a.matchedEvidenceCount + b.matchedEvidenceCount,
    matchedCommentCount: new Set([...a.aliases, ...b.aliases]).size,
    corpusMatchRatio: 0,
    issues: [...a.issues, ...b.issues],
  };
}

function calculatePrevalence(
  concept: NormalizedConcept,
  snapshot: AnalysisSetSnapshot,
): { matchedEvidenceCount: number; matchedCommentCount: number; corpusMatchRatio: number } {
  const rows = snapshot.rows;
  if (rows.length === 0) {
    return { matchedEvidenceCount: 0, matchedCommentCount: 0, corpusMatchRatio: 0 };
  }

  let matchedEvidence = 0;
  const matchedComments = new Set<string>();

  for (const row of rows) {
    const rowTokens = tokenizeForMatch(row.quoteText);
    const rowTokenSet = new Set(rowTokens);

    for (const alias of concept.aliases) {
      const aliasTokens = tokenizeAlias(alias);
      if (aliasTokens.length === 0) continue;

      let matched = false;
      if (aliasTokens.length === 1) {
        matched = rowTokenSet.has(aliasTokens[0]!);
      } else {
        matched = sequenceMatch(rowTokens, aliasTokens);
      }

      if (matched) {
        matchedEvidence++;
        matchedComments.add(row.commentId);
        break;
      }
    }
  }

  return {
    matchedEvidenceCount: matchedEvidence,
    matchedCommentCount: matchedComments.size,
    corpusMatchRatio: matchedEvidence / rows.length,
  };
}

/* ------------------------------------------------------------------ */
/*  Public validator                                                   */
/* ------------------------------------------------------------------ */

export function validateDomainVocabularyProposal(
  proposal: DomainVocabularyProposal,
  analysisSetSnapshot: AnalysisSetSnapshot,
  researchFocus?: string | null,
): VocabularyValidationResult {
  const issues: VocabularyValidationIssue[] = [];
  const rowsById = new Map(analysisSetSnapshot.rows.map((row) => [row.id, row]));
  const allQuotes = analysisSetSnapshot.rows.map((row) => row.quoteText);

  // ------------------------------------------------------------------
  // 1. Top-level schema validation
  // ------------------------------------------------------------------
  if (!Array.isArray(proposal.concepts)) {
    return {
      status: "REJECTED",
      normalizedConcepts: [],
      issues: [{ code: "SCHEMA_INVALID", message: "proposal.concepts must be an array" }],
      statistics: {
        totalConcepts: 0,
        validConcepts: 0,
        rejectedConcepts: 0,
        totalAliases: 0,
        groundedAliases: 0,
        removedAliases: 0,
        totalEvidenceIds: 0,
        resolvedEvidenceIds: 0,
        unresolvedEvidenceIds: 0,
      },
    };
  }

  if (proposal.concepts.length < MIN_CONCEPTS || proposal.concepts.length > MAX_CONCEPTS) {
    issues.push({
      code: "CONCEPT_COUNT_OUT_OF_RANGE",
      message: `concept count must be between ${MIN_CONCEPTS} and ${MAX_CONCEPTS}`,
    });
  }

  // ------------------------------------------------------------------
  // 2. Per-concept normalization + evidence resolution
  // ------------------------------------------------------------------
  const normalized: NormalizedConcept[] = [];
  let repaired = false;

  for (let conceptIndex = 0; conceptIndex < proposal.concepts.length; conceptIndex++) {
    const raw = proposal.concepts[conceptIndex]!;
    const conceptIssues: string[] = [];

    // --- label ---
    const label = typeof raw.label === "string" ? normalizeForHash(raw.label.trim()) : "";
    if (label.length < 3 || label.length > MAX_LABEL_LENGTH) {
      conceptIssues.push(`label length must be 3..${MAX_LABEL_LENGTH}`);
    }
    if (hasControlCharacters(raw.label)) {
      conceptIssues.push("label contains control characters");
    }
    if (hasInjectionContent(raw.label)) {
      conceptIssues.push("label contains injection-like content");
    }
    if (GENERIC_LABELS.has(label)) {
      conceptIssues.push("label is a generic/over-broad term");
    }

    // --- definition ---
    const rawDefinition = typeof raw.definition === "string" ? raw.definition : "";
    const definition = rawDefinition.trim().length > 0 ? normalizeForHash(rawDefinition.trim().slice(0, MAX_DEFINITION_LENGTH)) : null;
    if (rawDefinition.length > MAX_DEFINITION_LENGTH) {
      conceptIssues.push(`definition truncated to ${MAX_DEFINITION_LENGTH} chars`);
    }
    if (rawDefinition && hasInjectionContent(rawDefinition)) {
      conceptIssues.push("definition contains injection-like content");
    }

    // --- aliases ---
    const rawAliases = Array.isArray(raw.aliases) ? raw.aliases : [];
    let aliases: string[] = [];
    let removedAliases: string[] = [];

    for (const alias of rawAliases) {
      const trimmed = typeof alias === "string" ? alias.trim() : "";
      if (trimmed.length < MIN_ALIAS_LENGTH || trimmed.length > MAX_ALIAS_LENGTH) {
        removedAliases.push(alias);
        continue;
      }
      if (hasControlCharacters(trimmed)) {
        removedAliases.push(alias);
        continue;
      }
      if (hasInjectionContent(trimmed)) {
        removedAliases.push(alias);
        conceptIssues.push("alias contains injection-like content");
        continue;
      }
      const normalizedAlias = normalizeProposalAlias(trimmed);
      if (normalizedAlias.length === 0) {
        removedAliases.push(alias);
        continue;
      }
      if (isStopwordOnlyAlias(normalizedAlias)) {
        removedAliases.push(alias);
        continue;
      }
      if (aliases.includes(normalizedAlias)) {
        removedAliases.push(alias);
        continue;
      }
      aliases.push(normalizedAlias);
    }

    // --- exclusions ---
    const rawExclusions = Array.isArray(raw.exclusions) ? raw.exclusions : [];
    let exclusions: string[] = [];
    for (const exclusion of rawExclusions) {
      const trimmed = typeof exclusion === "string" ? exclusion.trim() : "";
      if (trimmed.length < MIN_ALIAS_LENGTH || trimmed.length > MAX_ALIAS_LENGTH) continue;
      if (hasControlCharacters(trimmed)) continue;
      if (hasInjectionContent(trimmed)) continue;
      const normalizedExclusion = normalizeProposalAlias(trimmed);
      if (normalizedExclusion.length === 0) continue;
      if (exclusions.includes(normalizedExclusion)) continue;
      exclusions.push(normalizedExclusion);
    }

    // Remove aliases that are identical to exclusions
    const beforeAliasCount = aliases.length;
    aliases = aliases.filter((alias) => !exclusions.includes(alias));
    if (aliases.length < beforeAliasCount) {
      repaired = true;
    }

    // --- evidenceIds ---
    const rawEvidenceIds = Array.isArray(raw.evidenceIds)
      ? raw.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];
    const uniqueEvidenceIds = [...new Set(rawEvidenceIds)].slice(0, MAX_EVIDENCE_IDS);
    const unresolvedEvidenceIds = uniqueEvidenceIds.filter((id) => !rowsById.has(id));
    const resolvedEvidenceIds = uniqueEvidenceIds.filter((id) => rowsById.has(id));

    if (resolvedEvidenceIds.length < MIN_EVIDENCE_IDS) {
      conceptIssues.push(`insufficient grounded evidence: ${resolvedEvidenceIds.length} valid, minimum ${MIN_EVIDENCE_IDS}`);
    }

    if (unresolvedEvidenceIds.length > 0) {
      issues.push({
        code: "EVIDENCE_NOT_IN_SNAPSHOT",
        message: `concept references evidenceIds not present in the analysis snapshot`,
        conceptIndex,
        evidenceIds: unresolvedEvidenceIds,
      });
    }

    // --- alias grounding ---
    const conceptQuotes = resolvedEvidenceIds.map((id) => rowsById.get(id)!.quoteText);
    const groundedAliases: string[] = [];
    const removedUngrounded: string[] = [];

    for (const alias of aliases) {
      if (aliasAppearsInEvidence(alias, conceptQuotes)) {
        groundedAliases.push(alias);
      } else {
        removedUngrounded.push(alias);
      }
    }

    if (removedUngrounded.length > 0) {
      repaired = true;
    }

    // Exclusions: keep all normalized exclusions (unused exclusions do not invalidate)
    const groundedExclusions = exclusions;

    // After grounding, if no aliases remain => concept is dead
    if (groundedAliases.length === 0 && resolvedEvidenceIds.length < MIN_EVIDENCE_IDS) {
      normalized.push({
        conceptKey: buildCanonicalConceptKey(label || "unknown", []),
        label: label || "unknown",
        definition,
        aliases: groundedAliases,
        exclusions: groundedExclusions,
        evidenceIds: resolvedEvidenceIds,
        cohesionWeight: 1,
        removedAliases: [...removedAliases, ...removedUngrounded],
        unresolvedEvidenceIds,
        matchedEvidenceCount: 0,
        matchedCommentCount: 0,
        corpusMatchRatio: 0,
        issues: [...conceptIssues, "no grounded aliases remain after validation"],
      });
      continue;
    }

    const conceptKey = buildCanonicalConceptKey(label, groundedAliases);

    // Prevalence metrics (measured, not blocking in Phase 4A)
    const prevalence = calculatePrevalence(
      {
        conceptKey,
        label,
        definition,
        aliases: groundedAliases,
        exclusions: groundedExclusions,
        evidenceIds: resolvedEvidenceIds,
        cohesionWeight: 1,
        removedAliases: [...removedAliases, ...removedUngrounded],
        unresolvedEvidenceIds,
        matchedEvidenceCount: 0,
        matchedCommentCount: 0,
        corpusMatchRatio: 0,
        issues: conceptIssues,
      },
      analysisSetSnapshot,
    );

    if (prevalence.corpusMatchRatio > 0.5) {
      conceptIssues.push(`prevalence warning: concept matches ${Math.round(prevalence.corpusMatchRatio * 100)}% of corpus`);
    }

    normalized.push({
      conceptKey,
      label,
      definition,
      aliases: groundedAliases,
      exclusions: groundedExclusions,
      evidenceIds: resolvedEvidenceIds,
      cohesionWeight: 1,
      removedAliases: [...removedAliases, ...removedUngrounded],
      unresolvedEvidenceIds,
      matchedEvidenceCount: prevalence.matchedEvidenceCount,
      matchedCommentCount: prevalence.matchedCommentCount,
      corpusMatchRatio: prevalence.corpusMatchRatio,
      issues: conceptIssues,
    });
  }

  // ------------------------------------------------------------------
  // 3. Deterministic deduplication
  // ------------------------------------------------------------------
  const deduped: NormalizedConcept[] = [];
  for (const concept of normalized) {
    const existing = deduped.find((other) => shouldMergeConcepts(concept, other));
    if (existing) {
      repaired = true;
      const merged = mergeConcepts(existing, concept);
      merged.issues = [...new Set([...existing.issues, ...concept.issues])];
      // Recalculate prevalence after merge
      const prevalence = calculatePrevalence(merged, analysisSetSnapshot);
      merged.matchedEvidenceCount = prevalence.matchedEvidenceCount;
      merged.matchedCommentCount = prevalence.matchedCommentCount;
      merged.corpusMatchRatio = prevalence.corpusMatchRatio;
      if (prevalence.corpusMatchRatio > 0.5) {
        merged.issues.push(`prevalence warning: merged concept matches ${Math.round(prevalence.corpusMatchRatio * 100)}% of corpus`);
      }
      // Replace in place
      const idx = deduped.indexOf(existing);
      deduped[idx] = merged;
    } else {
      deduped.push(concept);
    }
  }

  // ------------------------------------------------------------------
  // 4. Determine per-concept status and overall status
  // ------------------------------------------------------------------
  const validConcepts: NormalizedConcept[] = [];
  const rejectedConcepts: NormalizedConcept[] = [];

  for (const concept of deduped) {
    const hasCriticalIssue = concept.issues.some((issue) =>
      [
        "label is a generic/over-broad term",
        "label contains injection-like content",
        "definition contains injection-like content",
        "no grounded aliases remain after validation",
        "insufficient grounded evidence",
      ].some((blocker) => issue.toLowerCase().includes(blocker.toLowerCase())),
    );

    const isRejected =
      concept.evidenceIds.length < MIN_EVIDENCE_IDS ||
      concept.aliases.length === 0 ||
      hasCriticalIssue;

    if (isRejected) {
      rejectedConcepts.push(concept);
      // Push concept-level issues to top-level with codes
      for (const issue of concept.issues) {
        const lower = issue.toLowerCase();
        let code = "CONCEPT_INVALID";
        if (lower.includes("generic")) code = "GENERIC_CONCEPT";
        else if (lower.includes("injection")) code = "INJECTION_DETECTED";
        else if (lower.includes("insufficient")) code = "INSUFFICIENT_EVIDENCE";
        else if (lower.includes("no grounded aliases")) code = "NO_GROUNDED_ALIASES";
        issues.push({ code, message: issue, conceptIndex: deduped.indexOf(concept) });
      }
    } else {
      validConcepts.push(concept);
    }
  }

  let overallStatus: VocabularyValidationStatus;
  if (validConcepts.length > 0 && rejectedConcepts.length === 0) {
    overallStatus = "VALID";
  } else if (validConcepts.length > 0 && rejectedConcepts.length > 0) {
    overallStatus = "NEEDS_REPAIR";
  } else {
    overallStatus = "REJECTED";
  }

  // If the top-level schema was fundamentally broken, override to REJECTED
  if (proposal.concepts.length < MIN_CONCEPTS && validConcepts.length === 0) {
    overallStatus = "REJECTED";
  }

  // ------------------------------------------------------------------
  // 5. Statistics
  // ------------------------------------------------------------------
  const totalAliases = normalized.reduce((sum, c) => sum + c.aliases.length + c.removedAliases.length, 0);
  const groundedAliases = normalized.reduce((sum, c) => sum + c.aliases.length, 0);
  const removedAliases = normalized.reduce((sum, c) => sum + c.removedAliases.length, 0);
  const totalEvidenceIds = normalized.reduce((sum, c) => sum + c.evidenceIds.length + c.unresolvedEvidenceIds.length, 0);
  const resolvedEvidenceIds = normalized.reduce((sum, c) => sum + c.evidenceIds.length, 0);
  const unresolvedEvidenceIds = normalized.reduce((sum, c) => sum + c.unresolvedEvidenceIds.length, 0);

  return {
    status: overallStatus,
    normalizedConcepts: deduped,
    issues,
    statistics: {
      totalConcepts: proposal.concepts.length,
      validConcepts: validConcepts.length,
      rejectedConcepts: rejectedConcepts.length,
      totalAliases,
      groundedAliases,
      removedAliases,
      totalEvidenceIds,
      resolvedEvidenceIds,
      unresolvedEvidenceIds,
    },
  };
}

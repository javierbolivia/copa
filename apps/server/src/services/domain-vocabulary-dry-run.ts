import type { AppDatabase } from "../database/database.js";
import type {
  AnalysisSetSnapshot,
  ProblemPipelineMetrics,
} from "./problem-quality-engine.js";
import { qualityProblems } from "./problem-quality-engine.js";
import type { SemanticVocabularySnapshot } from "./semantic-vocabulary.js";
import { sequenceMatch, tokenizeForMatch } from "./semantic-vocabulary-matcher.js";

/**
 * PHASE 4C — deterministic dry-run gate for a domain vocabulary CANDIDATE.
 *
 * This layer is deliberately provider-free: it never calls an LLM, never
 * re-runs the Problems MAP/REDUCE and never mutates the database. It measures
 * the REAL, generative-free effect of a candidate vocabulary by running the
 * Problem Quality Engine over the EXACT same materialized Analysis Set and the
 * EXACT same Problems output, once without dynamic vocabulary (baseline) and
 * once with the candidate (candidate). The comparison is fully deterministic.
 *
 * It enforces the PHASE 4C hard guardrails V1:
 *   A/B  tuple ownership + loadability are enforced by the caller (module-service)
 *   C    dynamicMatchCount === 0                   -> BLOCK
 *   D    a concept with no real match in the set   -> BLOCK
 *   E    a concept matching >= 50% of the corpus   -> BLOCK
 *   F    an individual alias matching >= 40%       -> BLOCK
 *   G    invariant / corruption (empty concepts)   -> BLOCK
 *   H    candidate qualityProblems run throws      -> BLOCK
 *   I    REJECTED_NO_SUPPORT -> VALIDATED          -> BLOCK
 *
 * Decision flips are MEASURED and AUDITED but are NOT a hard-block by arbitrary
 * percentage. The specific no-support promotion is blocked because vocabulary
 * aliases must never manufacture evidence support.
 */

export type DomainVocabularyDryRunStatus = "PASS" | "BLOCK";

export interface DomainConceptDryRunMetrics {
  conceptKey: string;
  label: string;
  matchedRowCount: number;
  corpusMatchRatio: number;
  dominanceBlocked: boolean;
  noMatchBlocked: boolean;
  matchedAliases: string[];
}

export interface DomainAliasDryRunMetrics {
  alias: string;
  matchedRowCount: number;
  corpusMatchRatio: number;
  dominanceBlocked: boolean;
}

export interface DomainVocabularyDecisionChange {
  clusterId: string;
  baselineDecision: string;
  candidateDecision: string;
  decision: string;
}

export interface DomainVocabularyClusterAggregates {
  clusterCount: number;
  validated: number;
  rejected: number;
  directEvidence: number;
  inferredEvidence: number;
  cohesionSum: number;
  precisionSum: number;
}

export interface DomainVocabularyDryRunInput {
  database: AppDatabase;
  projectId: string;
  analysisSetSnapshot: AnalysisSetSnapshot;
  rawProblems: unknown;
  candidateSnapshot: SemanticVocabularySnapshot;
}

export interface DomainVocabularyDryRunResult {
  status: DomainVocabularyDryRunStatus;
  candidateVocabularyVersionId: string;
  dynamicMatchCount: number;
  conceptMetrics: DomainConceptDryRunMetrics[];
  aliasMetrics: DomainAliasDryRunMetrics[];
  baselineMetrics: ProblemPipelineMetrics;
  candidateMetrics: ProblemPipelineMetrics;
  baseline: DomainVocabularyClusterAggregates;
  candidate: DomainVocabularyClusterAggregates;
  decisionChanges: DomainVocabularyDecisionChange[];
  issues: string[];
}

/* ------------------------------------------------------------------ */
/*  Deterministic matching primitives (same tokenizer/sequence rules   */
/*  as the engine, so dry-run dominance numbers are comparable).       */
/* ------------------------------------------------------------------ */

interface RowTokens {
  id: string;
  tokens: string[];
  set: Set<string>;
}

function tokenizeRow(quoteText: string, id: string): RowTokens {
  const tokens = tokenizeForMatch(quoteText);
  return { id, tokens, set: new Set(tokens) };
}

function aliasMatchesRow(alias: string, row: RowTokens): boolean {
  const aliasTokens = tokenizeForMatch(alias);
  if (aliasTokens.length === 0) return false;
  if (aliasTokens.length === 1) return row.set.has(aliasTokens[0]!);
  return sequenceMatch(row.tokens, aliasTokens);
}

function conceptBlockedOnRow(concept: { exclusions: readonly string[] }, row: RowTokens): boolean {
  return concept.exclusions.some((exclusion) => aliasMatchesRow(exclusion, row));
}

/* ------------------------------------------------------------------ */
/*  Audit helpers                                                      */
/* ------------------------------------------------------------------ */

interface AuditCluster {
  clusterId: string;
  finalDecision: string;
  directEvidenceCount: number;
  inferredEvidenceCount: number;
  cohesionScore: number | null;
  evidencePrecisionScore: number | null;
}

function clustersOf(output: Record<string, unknown>): AuditCluster[] {
  const audit = (output.analysisAudit ?? {}) as {
    postMergeClusters?: unknown;
  };
  const list = Array.isArray(audit.postMergeClusters) ? audit.postMergeClusters : [];
  return list.flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const row = raw as Record<string, unknown>;
    const clusterId = typeof row.clusterId === "string" ? row.clusterId : "";
    return [
      {
        clusterId,
        finalDecision: typeof row.finalDecision === "string" ? row.finalDecision : "",
        directEvidenceCount: typeof row.directEvidenceCount === "number" ? row.directEvidenceCount : 0,
        inferredEvidenceCount: typeof row.inferredEvidenceCount === "number" ? row.inferredEvidenceCount : 0,
        cohesionScore: typeof row.cohesionScore === "number" ? row.cohesionScore : null,
        evidencePrecisionScore: typeof row.evidencePrecisionScore === "number" ? row.evidencePrecisionScore : null,
      },
    ];
  });
}

function aggregatesOf(output: Record<string, unknown>): DomainVocabularyClusterAggregates {
  const metrics = (output.analysisMetrics ?? {}) as Partial<ProblemPipelineMetrics>;
  const clusters = clustersOf(output);
  return {
    clusterCount: clusters.length,
    validated: metrics.validatedProblems ?? clusters.filter((c) => c.finalDecision === "VALIDATED").length,
    rejected: clusters.filter((c) => c.finalDecision !== "VALIDATED").length,
    directEvidence: clusters.reduce((sum, c) => sum + c.directEvidenceCount, 0),
    inferredEvidence: clusters.reduce((sum, c) => sum + c.inferredEvidenceCount, 0),
    cohesionSum: clusters.reduce((sum, c) => sum + (c.cohesionScore ?? 0), 0),
    precisionSum: clusters.reduce((sum, c) => sum + (c.evidencePrecisionScore ?? 0), 0),
  };
}

function clusterIdentityIssues(clusters:readonly AuditCluster[],label:"baseline"|"candidate"):string[]{
  const issues:string[]=[],seen=new Set<string>();
  for(const cluster of clusters){
    if(!cluster.clusterId){issues.push(`corruption: ${label} cluster id is empty`);continue;}
    if(seen.has(cluster.clusterId))issues.push(`corruption: ${label} cluster id is duplicated: ${cluster.clusterId}`);
    seen.add(cluster.clusterId);
  }
  return issues;
}

function decisionsOf(clusters: readonly AuditCluster[]): Map<string, string> {
  return new Map(clusters.map((c) => [c.clusterId, c.finalDecision]));
}

function decisionChangesOf(
  baseline: readonly AuditCluster[],
  candidate: readonly AuditCluster[],
): DomainVocabularyDecisionChange[] {
  const baselineDecisions = decisionsOf(baseline);
  const candidateDecisions = decisionsOf(candidate);
  const changes: DomainVocabularyDecisionChange[] = [];
  for (const [clusterId, baselineDecision] of baselineDecisions) {
    const candidateDecision = candidateDecisions.get(clusterId);
    if (candidateDecision === undefined) continue;
    if (candidateDecision !== baselineDecision) {
      changes.push({
        clusterId,
        baselineDecision,
        candidateDecision,
        decision: `${baselineDecision} -> ${candidateDecision}`,
      });
    }
  }
  return changes;
}

/* ------------------------------------------------------------------ */
/*  Dry-run entry point                                                */
/* ------------------------------------------------------------------ */

export function runDomainVocabularyDryRun(
  input: DomainVocabularyDryRunInput,
): DomainVocabularyDryRunResult {
  const { database, projectId, analysisSetSnapshot, rawProblems, candidateSnapshot } = input;
  const corpus = analysisSetSnapshot.rows;
  const corpusSize = corpus.length;
  const rows = corpus.map((row) => tokenizeRow(row.quoteText, row.id));
  const issues: string[] = [];

  // Guardrail G — invariant / corruption.
  if (candidateSnapshot.concepts.length === 0) {
    issues.push("corruption: candidate vocabulary has zero concepts");
  }
  for (const concept of candidateSnapshot.concepts) {
    if (concept.aliases.length === 0) {
      issues.push(`corruption: concept ${concept.conceptKey} has zero aliases`);
    }
  }
  if (corpusSize === 0) {
    issues.push("invariant: materialized analysis set is empty");
  }

  // Per-concept matching (non-blocked, active matches only).
  const conceptMetrics: DomainConceptDryRunMetrics[] = candidateSnapshot.concepts.map((concept) => {
    const matchedRowIds = new Set<string>();
    const matchedAliases: string[] = [];
    for (const row of rows) {
      if (conceptBlockedOnRow(concept, row)) continue;
      const matchedAlias = concept.aliases.find((alias) => aliasMatchesRow(alias, row));
      if (matchedAlias) {
        matchedRowIds.add(row.id);
        if (!matchedAliases.includes(matchedAlias)) matchedAliases.push(matchedAlias);
      }
    }
    const matchedRowCount = matchedRowIds.size;
    const corpusMatchRatio = corpusSize ? matchedRowCount / corpusSize : 0;
    return {
      conceptKey: concept.conceptKey,
      label: concept.label,
      matchedRowCount,
      corpusMatchRatio,
      dominanceBlocked: corpusMatchRatio >= 0.5,
      noMatchBlocked: matchedRowCount === 0,
      matchedAliases,
    };
  });

  // Per-alias matching (active, non-blocked).
  const aliasRows = new Map<string, Set<string>>();
  for (const concept of candidateSnapshot.concepts) {
    for (const alias of concept.aliases) {
      const ids = new Set<string>();
      for (const row of rows) {
        if (conceptBlockedOnRow(concept, row)) continue;
        if (aliasMatchesRow(alias, row)) ids.add(row.id);
      }
      aliasRows.set(alias, ids);
    }
  }
  const aliasMetrics: DomainAliasDryRunMetrics[] = [...aliasRows.entries()].map(([alias, ids]) => {
    const matchedRowCount = ids.size;
    const corpusMatchRatio = corpusSize ? matchedRowCount / corpusSize : 0;
    return {
      alias,
      matchedRowCount,
      corpusMatchRatio,
      dominanceBlocked: corpusMatchRatio >= 0.4,
    };
  });

  // Dynamic match count = distinct rows matched by at least one active concept.
  const dynamicRows = new Set<string>();
  for (const row of rows) {
    for (const concept of candidateSnapshot.concepts) {
      if (conceptBlockedOnRow(concept, row)) continue;
      if (concept.aliases.some((alias) => aliasMatchesRow(alias, row))) {
        dynamicRows.add(row.id);
        break;
      }
    }
  }
  const dynamicMatchCount = dynamicRows.size;

  // Guardrail C.
  if (dynamicMatchCount === 0) {
    issues.push("block: dynamicMatchCount is 0");
  }
  // Guardrail D.
  for (const cm of conceptMetrics) {
    if (cm.noMatchBlocked) {
      issues.push(`block: concept ${cm.conceptKey} has no match in the analysis set`);
    }
  }
  // Guardrail E.
  for (const cm of conceptMetrics) {
    if (cm.dominanceBlocked) {
      issues.push(`block: concept ${cm.conceptKey} matches ${Math.round(cm.corpusMatchRatio * 100)}% of corpus (>=50%)`);
    }
  }
  // Guardrail F.
  for (const am of aliasMetrics) {
    if (am.dominanceBlocked) {
      issues.push(`block: alias "${am.alias}" matches ${Math.round(am.corpusMatchRatio * 100)}% of corpus (>=40%)`);
    }
  }

  // Baseline vs candidate runs over the EXACT same materialized snapshot and
  // the EXACT same Problems output. No MAP/REDUCE, no LLM, no DB writes.
  const baseline = qualityProblems(database, projectId, rawProblems, {
    analysisSetSnapshot: analysisSetSnapshot,
  }) as Record<string, unknown>;

  let candidate: Record<string, unknown> | undefined;
  let candidateError: Error | undefined;
  try {
    candidate = qualityProblems(database, projectId, rawProblems, {
      analysisSetSnapshot: analysisSetSnapshot,
      vocabularySnapshot: candidateSnapshot,
    }) as Record<string, unknown>;
  } catch (error) {
    candidateError = error instanceof Error ? error : new Error(String(error));
    // Guardrail H.
    issues.push(`block: candidate qualityProblems run threw: ${candidateError.message}`);
  }

  const baselineClusters = clustersOf(baseline);
  const candidateClusters = candidate ? clustersOf(candidate) : [];
  issues.push(...clusterIdentityIssues(baselineClusters,"baseline"));
  if(candidate)issues.push(...clusterIdentityIssues(candidateClusters,"candidate"));

  const decisionChanges = candidate
    ? decisionChangesOf(baselineClusters, candidateClusters)
    : [];
  for(const change of decisionChanges){
    if(change.baselineDecision==="REJECTED_NO_SUPPORT"&&change.candidateDecision==="VALIDATED"){
      issues.push(`block: vocabulary must not manufacture support for cluster ${change.clusterId}`);
    }
  }

  const baselineMetrics = baseline.analysisMetrics as ProblemPipelineMetrics;
  const candidateMetrics = (candidate?.analysisMetrics ?? {}) as ProblemPipelineMetrics;

  const hasHardBlock = issues.some(
    (issue) =>
      issue.startsWith("block:") || issue.startsWith("corruption:") || issue.startsWith("invariant:"),
  );
  const status: DomainVocabularyDryRunStatus =
    candidateError || hasHardBlock ? "BLOCK" : "PASS";

  return {
    status,
    candidateVocabularyVersionId: candidateSnapshot.vocabularyVersionId,
    dynamicMatchCount,
    conceptMetrics,
    aliasMetrics,
    baselineMetrics,
    candidateMetrics,
    baseline: aggregatesOf(baseline),
    candidate: candidate ? aggregatesOf(candidate) : aggregatesOf(baseline),
    decisionChanges,
    issues,
  };
}

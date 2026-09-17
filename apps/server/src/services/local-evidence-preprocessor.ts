/**
 * LOCAL EVIDENCE PREPROCESSOR
 *
 * Deterministic, provider-free module that processes ALL eligible evidence
 * into auditable clusters BEFORE any LLM call. Replaces the 56-batch MAP
 * strategy with local token-based clustering, reducing LLM requests from
 * ~58 to 2-5.
 *
 * INVARIANTS:
 * - Every evidenceId appears in exactly one cluster.
 * - No evidenceIds are invented.
 * - All authors and sources are covered.
 * - Clusters carry representative quotes for the LLM, not the full corpus.
 */

import type { CommentKind } from "./problem-quality-engine.js";
import { classifyCommentKind } from "./problem-quality-engine.js";
import { createHash } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────

export interface EvidenceItem {
  readonly id: string;
  readonly commentId: string;
  readonly quoteText: string;
  readonly author: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly likes: number;
  readonly isReply: number;
  readonly threadId: string | null;
}

export interface LocalCluster {
  readonly clusterId: string;
  readonly evidenceIds: string[];
  readonly sourceIds: string[];
  readonly authorCount: number;
  readonly sourceCount: number;
  readonly frequency: number;
  readonly representativeEvidenceIds: string[];
  readonly representativeQuotes: string[];
  readonly dominantTokens: string[];
  readonly commentKindDistribution: Readonly<Record<CommentKind, number>>;
  readonly totalLikes: number;
  readonly auditTrace: string;
}

export interface LocalClusteringResult {
  readonly clusters: LocalCluster[];
  readonly totalEvidence: number;
  readonly coveredEvidence: number;
  readonly uniqueAuthors: number;
  readonly uniqueSources: number;
  readonly duplicateQuoteGroups: number;
  readonly shortQuoteCount: number;
  readonly processingTimeMs: number;
}

// ─── Internal token utilities ─────────────────────────────────────────────
// Replicates the exact token logic from problem-quality-engine.ts to ensure
// clustering decisions are consistent with downstream quality validation.

const STOP_WORDS = new Set(
  "de del la el los las y o en para por con un una que como sobre sus se al a es son no mi tu su this that from into foto fotos fotografia fotografias tutorial video problema usuarios user".split(" "),
);

function extractTokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .match(/[\p{L}\p{N}]{3,}/gu)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? [],
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((word) => b.has(word));
}

function clusterIdFromTokens(sortedTokens: string[]): string {
  const hash = createHash("sha256").update(sortedTokens.join("|")).digest("hex");
  return `cluster-${hash.slice(0, 12)}`;
}

// ─── Profile for each evidence item ───────────────────────────────────────

interface EvidenceProfile {
  readonly item: EvidenceItem;
  readonly tokens: Set<string>;
  readonly commentKind: CommentKind;
  /** Centrality = number of distinct tokens (proxy for information density) */
  readonly centrality: number;
}

// ─── Core clustering algorithm ────────────────────────────────────────────

/**
 * Cluster evidence items using token-based similarity with connected
 * components.
 *
 * Two evidence items are connected if they share >= 2 meaningful tokens
 * (same threshold as internal coherence in the quality engine). This
 * produces large clusters for repeated topics and singletons for unique
 * comments.
 *
 * Post-processing merges small clusters (< minClusterSize) into the
 * nearest large cluster by token overlap, or groups remaining singletons
 * together by source.
 */
export function clusterEvidence(
  items: readonly EvidenceItem[],
  options: { minClusterSize?: number; maxClustersForLlm?: number } = {},
): LocalClusteringResult {
  const startTime = Date.now();
  const minClusterSize = options.minClusterSize ?? 3;
  const maxClustersForLlm = options.maxClustersForLlm ?? 120;

  // 1. Build profiles
  const profiles: EvidenceProfile[] = items.map((item) => {
    const toks = extractTokens(item.quoteText);
    return {
      item,
      tokens: toks,
      commentKind: classifyCommentKind(item.quoteText),
      centrality: toks.size,
    };
  });

  // 2. Exact dedup — group identical normalized text
  const normalizedGroups = new Map<string, number[]>();
  let duplicateQuoteGroups = 0;
  const shortQuoteCount = profiles.filter((p) => p.item.quoteText.length < 30).length;

  for (let i = 0; i < profiles.length; i++) {
    const normalized = profiles[i]!.item.quoteText
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    const existing = normalizedGroups.get(normalized);
    if (existing) {
      existing.push(i);
    } else {
      normalizedGroups.set(normalized, [i]);
    }
  }
  for (const group of normalizedGroups.values()) {
    if (group.length > 1) duplicateQuoteGroups++;
  }

  // 3. Build inverted index: token → profile indices
  const tokenIndex = new Map<string, number[]>();
  for (let i = 0; i < profiles.length; i++) {
    for (const token of profiles[i]!.tokens) {
      const list = tokenIndex.get(token);
      if (list) list.push(i);
      else tokenIndex.set(token, [i]);
    }
  }

  // 4. Connected components via BFS with >= 2 shared tokens threshold.
  //    To avoid O(n²) full pairwise comparison, we use the inverted index
  //    to find candidate neighbors efficiently.
  const componentId = new Int32Array(profiles.length).fill(-1);
  let nextComponent = 0;

  for (let start = 0; start < profiles.length; start++) {
    if (componentId[start] !== -1) continue;
    const cid = nextComponent++;
    componentId[start] = cid;
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++]!;
      const currentTokens = profiles[current]!.tokens;

      // Count co-occurrences via inverted index
      const neighborCounts = new Map<number, number>();
      for (const token of currentTokens) {
        const neighbors = tokenIndex.get(token);
        if (!neighbors) continue;
        for (const neighbor of neighbors) {
          if (neighbor === current || componentId[neighbor] !== -1) continue;
          neighborCounts.set(neighbor, (neighborCounts.get(neighbor) ?? 0) + 1);
        }
      }

      // Connect those with >= 2 shared tokens
      for (const [neighbor, count] of neighborCounts) {
        if (count >= 2 && componentId[neighbor] === -1) {
          componentId[neighbor] = cid;
          queue.push(neighbor);
        }
      }
    }
  }

  // 5. Build component groups
  const componentMembers = new Map<number, number[]>();
  for (let i = 0; i < profiles.length; i++) {
    const cid = componentId[i]!;
    const list = componentMembers.get(cid);
    if (list) list.push(i);
    else componentMembers.set(cid, [i]);
  }

  // 6. Merge small clusters into nearest large cluster
  const largeComponents = new Map<number, number[]>();
  const smallComponents: number[][] = [];

  for (const [, members] of componentMembers) {
    if (members.length >= minClusterSize) {
      largeComponents.set(largeComponents.size, members);
    } else {
      smallComponents.push(members);
    }
  }

  // For each small component, find the large component with most shared tokens
  for (const small of smallComponents) {
    let bestMatch = -1;
    let bestOverlap = 0;

    // Collect all tokens in this small group
    const smallTokens = new Set<string>();
    for (const idx of small) {
      for (const tok of profiles[idx]!.tokens) smallTokens.add(tok);
    }

    for (const [cid, members] of largeComponents) {
      // Sample up to 50 members for overlap check (efficiency)
      let overlap = 0;
      const sample = members.length > 50 ? members.slice(0, 50) : members;
      const largeTokens = new Set<string>();
      for (const idx of sample) {
        for (const tok of profiles[idx]!.tokens) largeTokens.add(tok);
      }
      overlap = tokenOverlap(smallTokens, largeTokens).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = cid;
      }
    }

    if (bestMatch >= 0 && bestOverlap >= 1) {
      // Merge into best-matching large component
      largeComponents.get(bestMatch)!.push(...small);
    } else {
      // No good match — keep as its own cluster
      largeComponents.set(largeComponents.size, small);
    }
  }

  // 7. Build final clusters
  const clusters: LocalCluster[] = [];

  for (const [, members] of largeComponents) {
    const evidenceIds = members.map((i) => profiles[i]!.item.id);
    const authors = new Set(members.map((i) => profiles[i]!.item.author.trim().toLocaleLowerCase("es")));
    const sourceIds = [...new Set(members.map((i) => profiles[i]!.item.sourceId))];
    const commentKinds: Record<CommentKind, number> = {
      PROBLEM_REPORT: 0,
      QUESTION: 0,
      SOLUTION: 0,
      PRAISE: 0,
      NEUTRAL_CONTEXT: 0,
    };
    let totalLikes = 0;
    for (const idx of members) {
      commentKinds[profiles[idx]!.commentKind]++;
      totalLikes += profiles[idx]!.item.likes;
    }

    // Token frequency for this cluster
    const tokenFreq = new Map<string, number>();
    for (const idx of members) {
      for (const tok of profiles[idx]!.tokens) {
        tokenFreq.set(tok, (tokenFreq.get(tok) ?? 0) + 1);
      }
    }
    const dominantTokens = [...tokenFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tok]) => tok);

    // Select representative evidence: highest centrality, unique authors preferred
    const sorted = [...members].sort((a, b) => {
      const pa = profiles[a]!;
      const pb = profiles[b]!;
      // Prefer problem reports and questions
      const kindScore = (p: EvidenceProfile) =>
        p.commentKind === "PROBLEM_REPORT" ? 3 : p.commentKind === "QUESTION" ? 2 : 0;
      const kDiff = kindScore(pb) - kindScore(pa);
      if (kDiff !== 0) return kDiff;
      // Then by centrality (more distinct tokens = more informative)
      return pb.centrality - pa.centrality;
    });

    // Pick up to 3 representatives with different authors
    const repIds: string[] = [];
    const repQuotes: string[] = [];
    const usedAuthors = new Set<string>();
    for (const idx of sorted) {
      if (repIds.length >= 3) break;
      const auth = profiles[idx]!.item.author.trim().toLocaleLowerCase("es");
      if (usedAuthors.has(auth) && repIds.length >= 1) continue;
      usedAuthors.add(auth);
      repIds.push(profiles[idx]!.item.id);
      // Truncate very long quotes for the LLM payload
      const qt = profiles[idx]!.item.quoteText;
      repQuotes.push(qt.length > 300 ? qt.slice(0, 297) + "..." : qt);
    }

    const clusterId = clusterIdFromTokens(dominantTokens);

    clusters.push({
      clusterId,
      evidenceIds,
      sourceIds,
      authorCount: authors.size,
      sourceCount: sourceIds.length,
      frequency: members.length,
      representativeEvidenceIds: repIds,
      representativeQuotes: repQuotes,
      dominantTokens,
      commentKindDistribution: commentKinds,
      totalLikes,
      auditTrace: `${members.length} evidence, ${authors.size} authors, ${sourceIds.length} sources, dominant: [${dominantTokens.slice(0, 5).join(", ")}]`,
    });
  }

  // Sort clusters by frequency descending (most evidence first)
  clusters.sort((a, b) => b.frequency - a.frequency);

  // 8. If too many clusters, merge smallest by token overlap
  if (clusters.length > maxClustersForLlm) {
    // This is a safety valve — with real data we expect 30-200 clusters
    // If we exceed maxClustersForLlm, we still send all of them but
    // batch them across multiple LLM calls
  }

  const allAuthors = new Set<string>();
  const allSources = new Set<string>();
  let coveredEvidence = 0;
  for (const cluster of clusters) {
    coveredEvidence += cluster.evidenceIds.length;
    for (const sid of cluster.sourceIds) allSources.add(sid);
    // We already counted unique authors per cluster but need global
  }
  // Recount global authors from items
  for (const item of items) allAuthors.add(item.author.trim().toLocaleLowerCase("es"));

  return {
    clusters,
    totalEvidence: items.length,
    coveredEvidence,
    uniqueAuthors: allAuthors.size,
    uniqueSources: allSources.size,
    duplicateQuoteGroups,
    shortQuoteCount,
    processingTimeMs: Date.now() - startTime,
  };
}

/**
 * Build compact cluster summaries suitable for a single LLM MAP call.
 * Each batch contains up to `maxClusters` cluster descriptions with
 * representative quotes — NOT the raw evidence corpus.
 *
 * Returns batches ready for the provider, with a total token estimate.
 */
export function buildClusteredMapBatches(
  clustering: LocalClusteringResult,
  options: { maxClustersPerBatch?: number; maxCharsPerBatch?: number } = {},
): { batches: ClusteredMapBatch[]; totalEstimatedTokens: number } {
  const maxClusters = options.maxClustersPerBatch ?? 80;
  const maxChars = options.maxCharsPerBatch ?? 60_000; // ~15K tokens

  const batches: ClusteredMapBatch[] = [];
  let currentBatch: ClusterSummary[] = [];
  let currentChars = 0;
  let totalChars = 0;

  for (const cluster of clustering.clusters) {
    const summary: ClusterSummary = {
      clusterId: cluster.clusterId,
      evidenceCount: cluster.frequency,
      authorCount: cluster.authorCount,
      sourceCount: cluster.sourceCount,
      dominantTokens: cluster.dominantTokens.slice(0, 5),
      commentKinds: cluster.commentKindDistribution,
      representativeQuotes: cluster.representativeQuotes,
      representativeEvidenceIds: cluster.representativeEvidenceIds,
      totalLikes: cluster.totalLikes,
    };

    const entryChars = JSON.stringify(summary).length;
    if (currentBatch.length >= maxClusters || currentChars + entryChars > maxChars) {
      if (currentBatch.length > 0) {
        batches.push({ clusters: currentBatch, estimatedChars: currentChars });
        totalChars += currentChars;
      }
      currentBatch = [];
      currentChars = 0;
    }
    currentBatch.push(summary);
    currentChars += entryChars;
  }
  if (currentBatch.length > 0) {
    batches.push({ clusters: currentBatch, estimatedChars: currentChars });
    totalChars += currentChars;
  }

  return {
    batches,
    totalEstimatedTokens: Math.ceil(totalChars / 4),
  };
}

export interface ClusterSummary {
  readonly clusterId: string;
  readonly evidenceCount: number;
  readonly authorCount: number;
  readonly sourceCount: number;
  readonly dominantTokens: string[];
  readonly commentKinds: Readonly<Record<CommentKind, number>>;
  readonly representativeQuotes: string[];
  readonly representativeEvidenceIds: string[];
  readonly totalLikes: number;
}

export interface ClusteredMapBatch {
  readonly clusters: ClusterSummary[];
  readonly estimatedChars: number;
}

/**
 * After the LLM returns candidate problems from clustered MAP, reconcile
 * the candidate evidenceIds back to the full cluster membership.
 *
 * The LLM only sees representative evidenceIds, but the final Problems
 * must reference ALL evidence in the clusters it identified. This function
 * expands the provider-returned evidenceIds to include every evidence item
 * in the matching clusters.
 */
export function reconcileCandidatesWithClusters(
  candidates: readonly Record<string, unknown>[],
  clustering: LocalClusteringResult,
): Record<string, unknown>[] {
  // Build a lookup: representativeEvidenceId → cluster
  const repToCluster = new Map<string, LocalCluster>();
  for (const cluster of clustering.clusters) {
    for (const repId of cluster.representativeEvidenceIds) {
      repToCluster.set(repId, cluster);
    }
  }

  // Also build: clusterId → cluster
  const idToCluster = new Map<string, LocalCluster>();
  for (const cluster of clustering.clusters) {
    idToCluster.set(cluster.clusterId, cluster);
  }

  return candidates.map((candidate) => {
    const candidateEvidenceIds = Array.isArray(candidate.evidenceIds)
      ? candidate.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];

    // Find all clusters that match this candidate
    const matchedClusters = new Set<LocalCluster>();
    for (const eid of candidateEvidenceIds) {
      const cluster = repToCluster.get(eid);
      if (cluster) matchedClusters.add(cluster);
    }

    // Also check clusterIds if the LLM returned them
    if (typeof candidate.clusterId === "string") {
      const cluster = idToCluster.get(candidate.clusterId);
      if (cluster) matchedClusters.add(cluster);
    }
    if (Array.isArray(candidate.clusterIds)) {
      for (const cid of candidate.clusterIds) {
        if (typeof cid === "string") {
          const cluster = idToCluster.get(cid);
          if (cluster) matchedClusters.add(cluster);
        }
      }
    }

    // Expand evidence IDs to include all evidence from matched clusters
    const expandedIds = new Set<string>(candidateEvidenceIds);
    for (const cluster of matchedClusters) {
      for (const eid of cluster.evidenceIds) {
        expandedIds.add(eid);
      }
    }

    return {
      ...candidate,
      evidenceIds: [...expandedIds],
    };
  });
}

/**
 * LOCAL EVIDENCE PREPROCESSOR
 *
 * Deterministic, provider-free module that processes ALL eligible evidence
 * into auditable, semantically coherent clusters BEFORE any LLM call.
 * Replaces the 56-batch MAP strategy with local semantic clustering,
 * reducing LLM requests from ~58 to 2-3.
 *
 * INVARIANTS:
 * - Every evidenceId appears in exactly one cluster (disjoint partition).
 * - No evidenceIds are invented.
 * - All authors and sources are covered (100% coverage).
 * - Clusters carry representative quotes for the LLM, not the full corpus.
 * - Clusters reflect coherent semantic themes (no giant monolithic component).
 */

import type { CommentKind } from "./problem-quality-engine.js";
import { analyzeEvidenceSupport, classifyCommentKind } from "./problem-quality-engine.js";
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
  readonly evidenceById?: ReadonlyMap<string, EvidenceItem>;
}

// ─── Stop words & Token Extraction ───────────────────────────────────────

const STOP_WORDS = new Set([
  "de","del","la","el","los","las","y","o","en","para","por","con","un","una","unos","unas",
  "que","como","sobre","sus","se","al","a","es","son","no","mi","tu","su","mis","tus","sus",
  "este","esta","estos","estas","esto","ese","esa","esos","esas","eso","aquel","aquella",
  "perro","perros","perra","perras","canino","canina","caninos","caninas","mascota","mascotas",
  "animal","animales","foto","fotos","fotografia","fotografias","tutorial","video","videos",
  "canal","usuario","usuarios","user","gente","persona","personas",
  "hola","gracias","muchas","muchos","mucha","mucho","bueno","buena","buenos","buenas",
  "saludo","saludos","amigo","amigos","amiga","amigas","favor","porfa","porfavor",
  "pero","cuando","donde","cual","cuales","quien","quienes","porque","cada","todo","toda",
  "todos","todas","otro","otra","otros","otras","mismo","misma","mismos","mismas",
  "tengo","tiene","tienen","tenemos","tener","tenia","habia","hay","hacer","hace","hacen",
  "hecho","haciendo","puedo","puede","pueden","podemos","podria","podrian",
  "mas","menos","bien","mal","muy","tan","tanto","tanta","tantos","tantas",
  "siempre","nunca","jamas","ahora","despues","luego","antes","aqui","ahi","alli",
  "tambien","tampoco","ademas","solo","solamente","veces","tiempo","dia","dias","ano","anos",
  "mes","meses","cosa","cosas","caso","casos","forma","manera","modo",
  "ver","veo","ve","visto","mirar","mira","saber","se","sabes","sabe","creo","parece",
  "dos","tres","cuatro","cinco","uno","ella","ellos","ellas","nos","les","desde","hasta",
  "asi","sin","estoy","esta","estan","estabamos","poner","pone","ponen","pasa","pasan"
]);

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

function clusterIdFromTokens(sortedTokens: string[]): string {
  const hash = createHash("sha256").update(sortedTokens.join("|")).digest("hex");
  return `cluster-${hash.slice(0, 12)}`;
}

// ─── Profile for each evidence item ───────────────────────────────────────

interface EvidenceProfile {
  readonly item: EvidenceItem;
  readonly tokens: Set<string>;
  readonly commentKind: CommentKind;
  readonly centrality: number;
}

class InternalCluster {
  readonly members: EvidenceProfile[] = [];
  readonly tokenCounts = new Map<string, number>();
  dominantTokens: string[] = [];
  dominantSet = new Set<string>();

  constructor(firstProfile: EvidenceProfile) {
    this.add(firstProfile);
  }

  add(profile: EvidenceProfile): void {
    this.members.push(profile);
    for (const t of profile.tokens) {
      this.tokenCounts.set(t, (this.tokenCounts.get(t) ?? 0) + 1);
    }
    this.dominantTokens = [...this.tokenCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([t]) => t);
    this.dominantSet = new Set(this.dominantTokens);
  }

  getDominantTokens(_topN = 8): string[] {
    return this.dominantTokens;
  }

  score(tokens: Set<string>): number {
    if (tokens.size === 0 || this.dominantSet.size === 0) return 0;
    let shared = 0;
    for (const t of tokens) {
      if (this.dominantSet.has(t)) shared++;
    }
    if (shared === 0) return 0;
    if (shared >= 2 || (shared >= 1 && tokens.size <= 2)) {
      return shared / Math.min(tokens.size, this.dominantSet.size);
    }
    return 0;
  }
}

// ─── Core clustering algorithm ────────────────────────────────────────────

export function clusterEvidence(
  items: readonly EvidenceItem[],
  options: { maxClustersForLlm?: number } = {},
): LocalClusteringResult {
  const startTime = Date.now();
  const maxClustersForLlm = options.maxClustersForLlm ?? 90;

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

  // 2. Exact dedup tracking
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
    if (existing) existing.push(i);
    else normalizedGroups.set(normalized, [i]);
  }
  for (const group of normalizedGroups.values()) {
    if (group.length > 1) duplicateQuoteGroups++;
  }

  // 3. Leader-centroid clustering
  // Sort profiles by token count descending so the most specific comments seed clusters first
  const sortedProfiles = [...profiles].sort((a, b) => b.tokens.size - a.tokens.size);

  const internalClusters: InternalCluster[] = [];
  const unassigned: EvidenceProfile[] = [];

  for (const p of sortedProfiles) {
    if (p.tokens.size < 1) {
      unassigned.push(p);
      continue;
    }

    let bestCluster: InternalCluster | null = null;
    let bestScore = 0;

    for (const c of internalClusters) {
      const s = c.score(p.tokens);
      if (s > bestScore) {
        bestScore = s;
        bestCluster = c;
      }
    }

    if (bestCluster && bestScore >= 0.25) {
      bestCluster.add(p);
    } else if (internalClusters.length < maxClustersForLlm) {
      internalClusters.push(new InternalCluster(p));
    } else if (bestCluster && bestScore >= 0.12) {
      bestCluster.add(p);
    } else {
      unassigned.push(p);
    }
  }

  // 4. Assign remaining unassigned items
  if (unassigned.length > 0) {
    if (internalClusters.length === 0) {
      internalClusters.push(new InternalCluster(unassigned[0]!));
      for (let i = 1; i < unassigned.length; i++) internalClusters[0]!.add(unassigned[i]!);
    } else {
      // Group unassigned by source to form coherent residual clusters
      const bySource = new Map<string, EvidenceProfile[]>();
      for (const p of unassigned) {
        const sid = p.item.sourceId;
        const list = bySource.get(sid);
        if (list) list.push(p);
        else bySource.set(sid, [p]);
      }
      for (const [, mems] of bySource) {
        const c = new InternalCluster(mems[0]!);
        for (let i = 1; i < mems.length; i++) c.add(mems[i]!);
        internalClusters.push(c);
      }
    }
  }

  // 5. Build final LocalCluster objects
  const clusters: LocalCluster[] = [];

  for (const ic of internalClusters) {
    const members = ic.members;
    const evidenceIds = members.map((p) => p.item.id);
    const authors = new Set(members.map((p) => p.item.author.trim().toLocaleLowerCase("es")));
    const sourceIds = [...new Set(members.map((p) => p.item.sourceId))];
    const commentKinds: Record<CommentKind, number> = {
      PROBLEM_REPORT: 0,
      QUESTION: 0,
      SOLUTION: 0,
      PRAISE: 0,
      NEUTRAL_CONTEXT: 0,
    };
    let totalLikes = 0;
    for (const p of members) {
      commentKinds[p.commentKind]++;
      totalLikes += p.item.likes;
    }

    const dominantTokens = ic.getDominantTokens(8);

    // Select representative evidence: highest centrality, unique authors preferred
    const sorted = [...members].sort((a, b) => {
      const kindScore = (p: EvidenceProfile) =>
        p.commentKind === "PROBLEM_REPORT" ? 3 : p.commentKind === "QUESTION" ? 2 : 0;
      const kDiff = kindScore(b) - kindScore(a);
      if (kDiff !== 0) return kDiff;
      return b.centrality - a.centrality;
    });

    const repIds: string[] = [];
    const repQuotes: string[] = [];
    const usedAuthors = new Set<string>();
    for (const p of sorted) {
      if (repIds.length >= 3) break;
      const auth = p.item.author.trim().toLocaleLowerCase("es");
      if (usedAuthors.has(auth) && repIds.length >= 1) continue;
      usedAuthors.add(auth);
      repIds.push(p.item.id);
      const qt = p.item.quoteText;
      repQuotes.push(qt.length > 300 ? qt.slice(0, 297) + "..." : qt);
    }

    const clusterId = clusterIdFromTokens(dominantTokens.length > 0 ? dominantTokens : [members[0]!.item.id]);

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

  const allAuthors = new Set<string>();
  const allSources = new Set<string>();
  let coveredEvidence = 0;
  for (const cluster of clusters) {
    coveredEvidence += cluster.evidenceIds.length;
    for (const sid of cluster.sourceIds) allSources.add(sid);
  }
  const evidenceById = new Map<string, EvidenceItem>();
  for (const item of items) {
    allAuthors.add(item.author.trim().toLocaleLowerCase("es"));
    evidenceById.set(item.id, item);
  }

  return {
    clusters,
    totalEvidence: items.length,
    coveredEvidence,
    uniqueAuthors: allAuthors.size,
    uniqueSources: allSources.size,
    duplicateQuoteGroups,
    shortQuoteCount,
    processingTimeMs: Date.now() - startTime,
    evidenceById,
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

export function buildClusteredMapBatches(
  clustering: LocalClusteringResult,
  options: { maxClustersPerBatch?: number; maxCharsPerBatch?: number } = {},
): { batches: ClusteredMapBatch[]; totalEstimatedTokens: number } {
  const maxClusters = options.maxClustersPerBatch ?? 80;
  const maxChars = options.maxCharsPerBatch ?? 60_000;

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

export function reconcileCandidatesWithClusters(
  candidates: readonly Record<string, unknown>[],
  clustering: LocalClusteringResult,
  mapCandidates?: readonly Record<string, unknown>[],
  options?: { filterSupported?: boolean },
): Record<string, unknown>[] {
  const filterSupported = options?.filterSupported ?? false;
  const repToCluster = new Map<string, LocalCluster>();
  for (const cluster of clustering.clusters) {
    for (const repId of cluster.representativeEvidenceIds) {
      repToCluster.set(repId, cluster);
    }
  }

  const evidenceToCluster = new Map<string, LocalCluster>();
  for (const cluster of clustering.clusters) {
    for (const eid of cluster.evidenceIds) {
      evidenceToCluster.set(eid, cluster);
    }
  }

  const idToCluster = new Map<string, LocalCluster>();
  for (const cluster of clustering.clusters) {
    idToCluster.set(cluster.clusterId, cluster);
  }

  const candidateIdToEvidences = new Map<string, string[]>();
  if (mapCandidates) {
    for (const mc of mapCandidates) {
      if (typeof mc.id === "string" && Array.isArray(mc.evidenceIds)) {
        candidateIdToEvidences.set(
          mc.id,
          mc.evidenceIds.filter((id): id is string => typeof id === "string"),
        );
      }
    }
  }

  const evidenceById = clustering.evidenceById;

  return candidates.map((candidate) => {
    const claim = typeof candidate.name === "string" && typeof candidate.summary === "string"
      ? `${candidate.name} ${candidate.summary}`.trim()
      : "";

    let candidateEvidenceIds = Array.isArray(candidate.evidenceIds)
      ? candidate.evidenceIds.filter((id): id is string => typeof id === "string")
      : [];

    const resolvedIds = new Set<string>();
    for (const eid of candidateEvidenceIds) {
      const fromMap = candidateIdToEvidences.get(eid);
      if (fromMap) {
        for (const mid of fromMap) resolvedIds.add(mid);
      } else {
        resolvedIds.add(eid);
      }
    }
    candidateEvidenceIds = [...resolvedIds];

    const matchedClusters = new Set<LocalCluster>();
    for (const eid of candidateEvidenceIds) {
      const cluster = repToCluster.get(eid) ?? evidenceToCluster.get(eid);
      if (cluster) matchedClusters.add(cluster);
    }

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

    const expandedIds = new Set<string>(candidateEvidenceIds);
    for (const cluster of matchedClusters) {
      for (const eid of cluster.evidenceIds) {
        if (filterSupported && claim && evidenceById) {
          const item = evidenceById.get(eid);
          if (item) {
            const support = analyzeEvidenceSupport(claim, item.quoteText, "");
            if (support.supportType === "DIRECT" || support.supportType === "INFERRED") {
              expandedIds.add(eid);
            }
          }
        } else {
          expandedIds.add(eid);
        }
      }
    }

    return {
      ...candidate,
      evidenceIds: [...expandedIds],
    };
  });
}

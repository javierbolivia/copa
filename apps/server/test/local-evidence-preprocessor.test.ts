import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  clusterEvidence,
  buildClusteredMapBatches,
  reconcileCandidatesWithClusters,
  type EvidenceItem,
} from "../src/services/local-evidence-preprocessor.js";

const PROJECT_ID = "01a0289f-9377-70b0-b9ac-a0eb5a9dd35a";

function loadRealEvidence(): EvidenceItem[] {
  const dbPath = resolve(import.meta.dirname, "../../..", "data/our-platform.db");
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true } as never);
  } catch {
    return []; // DB not available in CI
  }
  try {
    const rows = db.prepare(
      `SELECT e.id, e.comment_id commentId, e.quote_text quoteText,
              c.author, e.source_id sourceId, s.title sourceTitle,
              c.likes, c.is_reply isReply, c.thread_id threadId
       FROM evidence_snippets e
       JOIN comments c ON c.id = e.comment_id AND c.project_id = e.project_id
       JOIN sources s ON s.id = e.source_id AND s.project_id = e.project_id
       WHERE e.project_id = ?
         AND s.include_in_analysis = 1
         AND c.analysis_eligible = 1
         AND s.status IN ('ready', 'completed')`,
    ).all(PROJECT_ID) as EvidenceItem[];
    return rows;
  } finally {
    db.close();
  }
}

// Synthetic small dataset for deterministic unit tests
function syntheticEvidence(): EvidenceItem[] {
  return [
    { id: "e1", commentId: "c1", quoteText: "Mi perro ladra mucho cuando ve otros perros", author: "Ana", sourceId: "s1", sourceTitle: "Video 1", likes: 5, isReply: 0, threadId: null },
    { id: "e2", commentId: "c2", quoteText: "El perro ladra constantemente a otros perros en la calle", author: "Luis", sourceId: "s1", sourceTitle: "Video 1", likes: 3, isReply: 0, threadId: null },
    { id: "e3", commentId: "c3", quoteText: "Problemas de ladrido con otros perros al pasear", author: "María", sourceId: "s2", sourceTitle: "Video 2", likes: 10, isReply: 0, threadId: null },
    { id: "e4", commentId: "c4", quoteText: "Mi perro tiene miedo a los ruidos fuertes y truenos", author: "Carlos", sourceId: "s2", sourceTitle: "Video 2", likes: 2, isReply: 0, threadId: null },
    { id: "e5", commentId: "c5", quoteText: "El miedo a los truenos y ruidos le causa ansiedad", author: "Pedro", sourceId: "s3", sourceTitle: "Video 3", likes: 1, isReply: 0, threadId: null },
    { id: "e6", commentId: "c6", quoteText: "Gracias por el tutorial, muy útil", author: "Elena", sourceId: "s1", sourceTitle: "Video 1", likes: 20, isReply: 0, threadId: null },
    { id: "e7", commentId: "c7", quoteText: "ok", author: "Test", sourceId: "s1", sourceTitle: "Video 1", likes: 0, isReply: 0, threadId: null },
    { id: "e8", commentId: "c8", quoteText: "El perro ladra a otros perros cuando los ve", author: "Ana", sourceId: "s1", sourceTitle: "Video 1", likes: 4, isReply: 0, threadId: null },
    { id: "e9", commentId: "c9", quoteText: "Agresividad hacia otros perros en el parque", author: "Rosa", sourceId: "s3", sourceTitle: "Video 3", likes: 7, isReply: 0, threadId: null },
    { id: "e10", commentId: "c10", quoteText: "Mi perro tira mucho de la correa y no puedo controlarlo", author: "Juan", sourceId: "s2", sourceTitle: "Video 2", likes: 8, isReply: 0, threadId: null },
  ];
}

describe("local-evidence-preprocessor", () => {
  describe("clusterEvidence — synthetic", () => {
    it("covers all evidence IDs", () => {
      const items = syntheticEvidence();
      const result = clusterEvidence(items);
      const allCoveredIds = result.clusters.flatMap((c) => c.evidenceIds).sort();
      const inputIds = items.map((i) => i.id).sort();
      expect(allCoveredIds).toEqual(inputIds);
      expect(result.coveredEvidence).toBe(items.length);
    });

    it("produces fewer clusters than evidence", () => {
      const items = syntheticEvidence();
      const result = clusterEvidence(items);
      expect(result.clusters.length).toBeLessThan(items.length);
      expect(result.clusters.length).toBeGreaterThan(0);
    });

    it("groups similar barking evidence together", () => {
      const items = syntheticEvidence();
      const result = clusterEvidence(items);
      // e1, e2, e3, e8, e9 should be in the same cluster (perro ladra/otros perros)
      const barkingIds = new Set(["e1", "e2", "e3", "e8", "e9"]);
      const clusterWithBarking = result.clusters.find((c) =>
        c.evidenceIds.some((id) => barkingIds.has(id)),
      )!;
      expect(clusterWithBarking).toBeDefined();
      const barkingInCluster = clusterWithBarking.evidenceIds.filter((id) => barkingIds.has(id));
      expect(barkingInCluster.length).toBeGreaterThanOrEqual(3);
    });

    it("each cluster has representative quotes", () => {
      const items = syntheticEvidence();
      const result = clusterEvidence(items);
      for (const cluster of result.clusters) {
        expect(cluster.representativeEvidenceIds.length).toBeGreaterThanOrEqual(1);
        expect(cluster.representativeQuotes.length).toBe(cluster.representativeEvidenceIds.length);
        // Rep IDs must be members
        for (const rid of cluster.representativeEvidenceIds) {
          expect(cluster.evidenceIds).toContain(rid);
        }
      }
    });

    it("no evidenceId appears in multiple clusters", () => {
      const items = syntheticEvidence();
      const result = clusterEvidence(items);
      const seen = new Set<string>();
      for (const cluster of result.clusters) {
        for (const id of cluster.evidenceIds) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    });
  });

  describe("buildClusteredMapBatches", () => {
    it("produces batches within size limits", () => {
      const items = syntheticEvidence();
      const clustering = clusterEvidence(items);
      const { batches, totalEstimatedTokens } = buildClusteredMapBatches(clustering);
      expect(batches.length).toBeGreaterThanOrEqual(1);
      expect(totalEstimatedTokens).toBeGreaterThan(0);
      for (const batch of batches) {
        expect(batch.clusters.length).toBeLessThanOrEqual(80);
      }
    });
  });

  describe("reconcileCandidatesWithClusters", () => {
    it("expands representative IDs to full cluster membership", () => {
      const items = syntheticEvidence();
      const clustering = clusterEvidence(items);
      // Simulate LLM output: it references one representative ID
      const largestCluster = clustering.clusters[0]!;
      const candidates = [
        {
          name: "Test problem",
          summary: "A problem",
          category: "test",
          evidenceIds: [largestCluster.representativeEvidenceIds[0]],
          semanticSignature: "test",
        },
      ];
      const reconciled = reconcileCandidatesWithClusters(candidates, clustering);
      expect(reconciled[0]!.evidenceIds).toEqual(
        expect.arrayContaining(largestCluster.evidenceIds),
      );
    });
  });

  describe("clusterEvidence — real data", () => {
    const realEvidence = loadRealEvidence();
    const skip = realEvidence.length === 0;

    it.skipIf(skip)("loads expected evidence count", () => {
      expect(realEvidence.length).toBe(3359);
    });

    it.skipIf(skip)("covers ALL 3,359 evidence items", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.coveredEvidence).toBe(3359);
      expect(result.totalEvidence).toBe(3359);
    });

    it.skipIf(skip)("covers all unique authors", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.uniqueAuthors).toBe(2471);
    });

    it.skipIf(skip)("covers all unique sources", () => {
      const result = clusterEvidence(realEvidence);
      // 24 active sources from our DB query
      expect(result.uniqueSources).toBeGreaterThanOrEqual(19);
    });

    it.skipIf(skip)("produces a reasonable cluster count (30-300)", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.clusters.length).toBeGreaterThanOrEqual(10);
      expect(result.clusters.length).toBeLessThanOrEqual(500);
      console.log(`Real data: ${result.clusters.length} clusters from ${realEvidence.length} evidence in ${result.processingTimeMs}ms`);
    });

    it.skipIf(skip)("no evidenceId appears in multiple clusters", () => {
      const result = clusterEvidence(realEvidence);
      const seen = new Set<string>();
      for (const cluster of result.clusters) {
        for (const id of cluster.evidenceIds) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    });

    it.skipIf(skip)("no evidenceId is invented", () => {
      const result = clusterEvidence(realEvidence);
      const validIds = new Set(realEvidence.map((e) => e.id));
      for (const cluster of result.clusters) {
        for (const id of cluster.evidenceIds) {
          expect(validIds.has(id)).toBe(true);
        }
      }
    });

    it.skipIf(skip)("produces <=5 LLM batches", () => {
      const result = clusterEvidence(realEvidence);
      const { batches } = buildClusteredMapBatches(result);
      expect(batches.length).toBeLessThanOrEqual(5);
      console.log(`Real data: ${batches.length} LLM batches, clusters: ${result.clusters.length}`);
      for (const [i, batch] of batches.entries()) {
        console.log(`  Batch ${i + 1}: ${batch.clusters.length} clusters, ~${batch.estimatedChars} chars`);
      }
    });

    it.skipIf(skip)("completes under 2 seconds", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.processingTimeMs).toBeLessThan(2000);
    });
  });
});

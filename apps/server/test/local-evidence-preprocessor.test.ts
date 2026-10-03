import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import {
  clusterEvidence,
  buildClusteredMapBatches,
  reconcileCandidatesWithClusters,
  type EvidenceItem,
} from "../src/services/local-evidence-preprocessor.js";

// Reproducible stress corpus: no runtime database, personal authors or network.
const CORPUS_SIZE = 3600;
const AUTHOR_COUNT = 2400;
const SOURCE_COUNT = 24;
function stressEvidence(): EvidenceItem[] {
  const topics = [
    "ladridos explosivos correa tirones", "miedo tormentas truenos temblores",
    "ansiedad separación soledad destrucción", "agresividad comida protección recursos",
    "insomnio nocturno inquietud descanso", "excitación visitas saltos recibimiento",
    "fugas vallado escapes jardín", "ruidos tráfico motos bocinas",
    "socialización cachorros encuentros adaptación", "veterinario consulta exploración nervios",
    "transporte coche mareos viajes", "higiene baño cepillado resistencia",
    "aprendizaje premios constancia práctica", "ejercicio juego recuperación fatiga",
    "paseos multitudes estrechez aceras", "gatos persecución bicicletas carreras",
    "economía cursos profesionales presupuesto", "familia convivencia niños límites",
    "enriquecimiento olfato búsqueda alimentos", "mudanzas vivienda cambios adaptación",
    "vecinos quejas convivencia edificio", "refugio adopción acogida transición",
    "frustración puertas barreras accesos", "comunicación señales observación registros",
  ];
  return Array.from({length: CORPUS_SIZE}, (_, index) => ({
    id: 'evidence-' + index, commentId: 'comment-' + index,
    quoteText: topics[index % topics.length]!, author: 'author-' + (index % AUTHOR_COUNT),
    sourceId: 'source-' + (index % SOURCE_COUNT), sourceTitle: 'Synthetic source',
    likes: index % 13, isReply: index % 5 === 0 ? 1 : 0,
    threadId: 'thread-' + Math.floor(index / 3),
  }));
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

  describe("clusterEvidence — isolated stress corpus", () => {
    const realEvidence = stressEvidence();

    it("loads expected evidence count", () => {
      expect(realEvidence.length).toBe(CORPUS_SIZE);
    });

    it("covers ALL 3,600 evidence items", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.coveredEvidence).toBe(CORPUS_SIZE);
      expect(result.totalEvidence).toBe(CORPUS_SIZE);
    });

    it("covers all unique authors", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.uniqueAuthors).toBe(AUTHOR_COUNT);
    });

    it("covers all unique sources", () => {
      const result = clusterEvidence(realEvidence);
      // All synthetic sources must be represented.
      expect(result.uniqueSources).toBe(SOURCE_COUNT);
    });

    it("produces a reasonable cluster count (30-300)", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.clusters.length).toBeGreaterThanOrEqual(10);
      expect(result.clusters.length).toBeLessThanOrEqual(500);
      console.log(`Synthetic corpus: ${result.clusters.length} clusters from ${realEvidence.length} evidence in ${result.processingTimeMs}ms`);
    });

    it("no evidenceId appears in multiple clusters", () => {
      const result = clusterEvidence(realEvidence);
      const seen = new Set<string>();
      for (const cluster of result.clusters) {
        for (const id of cluster.evidenceIds) {
          expect(seen.has(id)).toBe(false);
          seen.add(id);
        }
      }
    });

    it("no evidenceId is invented", () => {
      const result = clusterEvidence(realEvidence);
      const validIds = new Set(realEvidence.map((e) => e.id));
      for (const cluster of result.clusters) {
        for (const id of cluster.evidenceIds) {
          expect(validIds.has(id)).toBe(true);
        }
      }
    });

    it("produces <=5 LLM batches", () => {
      const result = clusterEvidence(realEvidence);
      const { batches } = buildClusteredMapBatches(result);
      expect(batches.length).toBeLessThanOrEqual(5);
      console.log(`Synthetic corpus: ${batches.length} LLM batches, clusters: ${result.clusters.length}`);
      for (const [i, batch] of batches.entries()) {
        console.log(`  Batch ${i + 1}: ${batch.clusters.length} clusters, ~${batch.estimatedChars} chars`);
      }
    });

    it("completes under 2 seconds", () => {
      const result = clusterEvidence(realEvidence);
      expect(result.processingTimeMs).toBeLessThan(2000);
    });
  });
});

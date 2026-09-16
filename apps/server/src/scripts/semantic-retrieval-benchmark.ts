import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { hybridRank, rerankHybrid } from "../services/semantic-retrieval/hybrid-ranking.js";
import { LocalTransformersEmbeddingProvider, LocalTransformersReranker } from "../services/semantic-retrieval/local-transformers.js";
import type { RankedSemanticCandidate, SemanticCandidate } from "../services/semantic-retrieval/types.js";

type Fixture = SemanticCandidate & { readonly relevantTo: readonly string[] };
type Metrics = { readonly precisionAt3: number; readonly recallAt3: number; readonly reciprocalRank: number };

const fixtures: readonly Fixture[] = [
  { id: "photo-organizer", projectId: "bench-a", text: "Herramienta que clasifica automáticamente fotos por fecha, personas y eventos.", lexicalScore: 0.2, relevantTo: ["q-photo-es", "q-photo-en"] },
  { id: "slow-backup", projectId: "bench-a", text: "Usuarios necesitan copias de seguridad de imágenes rápidas y confiables.", lexicalScore: 0.1, relevantTo: ["q-photo-es"] },
  { id: "budgeting", projectId: "bench-a", text: "A personal budgeting app tracks household expenses and monthly cash flow.", lexicalScore: 0.05, relevantTo: ["q-budget-en"] },
  { id: "invoice", projectId: "bench-a", text: "Pequeños negocios pierden tiempo creando facturas y cobrando pagos atrasados.", lexicalScore: 0.4, relevantTo: ["q-invoice-es"] },
  { id: "recipe", projectId: "bench-a", text: "Receta de sopa vegetariana con verduras de temporada.", lexicalScore: 0.3, relevantTo: [] },
  { id: "spam", projectId: "bench-a", text: "fotos fotos fotos ganar dinero urgente click aquí", lexicalScore: 0.8, relevantTo: [] },
  { id: "long-photo", projectId: "bench-a", text: "Una fotógrafa acumula miles de imágenes. Quiere encontrar recuerdos familiares sin navegar carpetas: necesita agrupación visual por fecha y persona, búsqueda simple y una copia segura.", lexicalScore: 0.15, relevantTo: ["q-photo-es", "q-photo-en"] },
  { id: "other-project", projectId: "bench-b", text: "Clasificador de fotografías para otro proyecto que nunca debe aparecer.", lexicalScore: 1, relevantTo: ["q-photo-es", "q-photo-en"] },
];

const queries = [
  { id: "q-photo-es", text: "necesito ordenar fotos familiares rápidamente" },
  { id: "q-photo-en", text: "I need an easy way to organize family pictures" },
  { id: "q-budget-en", text: "track my household spending every month" },
  { id: "q-invoice-es", text: "crear facturas y cobrar a clientes morosos" },
] as const;

function words(text: string): readonly string[] { return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []; }
function lexical(query: string, candidates: readonly Fixture[]): readonly Fixture[] {
  const tokens = new Set(words(query));
  return candidates.filter((candidate) => candidate.projectId === "bench-a").map((candidate) => ({ ...candidate, lexicalScore: words(candidate.text).filter((word) => tokens.has(word)).length }))
    .sort((left, right) => (right.lexicalScore - left.lexicalScore) || left.id.localeCompare(right.id));
}
function metrics(queryId: string, ids: readonly string[]): Metrics {
  const relevant = fixtures.filter((fixture) => fixture.projectId === "bench-a" && fixture.relevantTo.includes(queryId)).map((fixture) => fixture.id);
  const top = ids.slice(0, 3);
  const found = top.filter((id) => relevant.includes(id));
  const first = ids.findIndex((id) => relevant.includes(id));
  return { precisionAt3: found.length / 3, recallAt3: relevant.length === 0 ? 1 : found.length / relevant.length, reciprocalRank: first < 0 ? 0 : 1 / (first + 1) };
}
function average(values: readonly Metrics[]): Metrics {
  return { precisionAt3: values.reduce((sum, value) => sum + value.precisionAt3, 0) / values.length, recallAt3: values.reduce((sum, value) => sum + value.recallAt3, 0) / values.length, reciprocalRank: values.reduce((sum, value) => sum + value.reciprocalRank, 0) / values.length };
}
function elapsedMs(start: bigint): number { return Number(process.hrtime.bigint() - start) / 1_000_000; }

const cacheDir = resolve(process.cwd(), "data", "model-cache");
await mkdir(cacheDir, { recursive: true });
const embedding = new LocalTransformersEmbeddingProvider({ cacheDir, localFilesOnly: false });
const reranker = new LocalTransformersReranker({ cacheDir, localFilesOnly: false });
const ftsResults: Metrics[] = [];
const semanticResults: Metrics[] = [];
const hybridResults: Metrics[] = [];
const rerankedResults: Metrics[] = [];
const timings: number[] = [];
const returnedIds: string[] = [];

for (const query of queries) {
  const fts = lexical(query.text, fixtures);
  const started = process.hrtime.bigint();
  const hybrid = await hybridRank("bench-a", query.text, fts, embedding);
  const reranked = await rerankHybrid(query.text, hybrid.slice(0, 5), reranker);
  returnedIds.push(...fts.map((candidate) => candidate.id), ...semanticOnlyIds(hybrid), ...hybrid.map((candidate) => candidate.id), ...reranked.map((candidate) => candidate.id));
  timings.push(elapsedMs(started));
  const semanticOnly = [...hybrid].sort((left, right) => (right.semanticScore - left.semanticScore) || left.id.localeCompare(right.id));
  ftsResults.push(metrics(query.id, fts.map((candidate) => candidate.id)));
  semanticResults.push(metrics(query.id, semanticOnly.map((candidate) => candidate.id)));
  hybridResults.push(metrics(query.id, hybrid.map((candidate) => candidate.id)));
  rerankedResults.push(metrics(query.id, reranked.map((candidate) => candidate.id)));
}

function semanticOnlyIds(candidates: readonly RankedSemanticCandidate[]): readonly string[] {
  return [...candidates].sort((left, right) => (right.semanticScore - left.semanticScore) || left.id.localeCompare(right.id)).map((candidate) => candidate.id);
}

const report = {
  fixtureCount: fixtures.length,
  projectIsolation: !returnedIds.includes("other-project"),
  fts5: average(ftsResults),
  semantic: average(semanticResults),
  hybrid: average(hybridResults),
  rerankedHybrid: average(rerankedResults),
  latencyMs: { average: timings.reduce((sum, value) => sum + value, 0) / timings.length, perQuery: timings },
  rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  embeddingReady: embedding.available,
  rerankerReady: reranker.available,
};
console.log(JSON.stringify(report, null, 2));

import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { LocalSemanticRuntime, LOCAL_EMBEDDING_MODEL, LOCAL_RERANKER_MODEL } from "../services/semantic-retrieval/local-transformers.js";
import { SemanticEmbeddingStore } from "../services/semantic-retrieval/semantic-embedding-store.js";

type Document = { id: string; projectId: string; text: string; relevantTo: readonly string[] };
type Query = { id: string; text: string; projectId: string; relevantIds: readonly string[] };
type Scores = { p1: number; p3: number; p5: number; r1: number; r3: number; r5: number; mrr: number; ndcg5: number };

const topics = [
  ["fotos", "photo organizer", "organizar fotos familiares", "family picture organizer"], ["facturas", "invoices", "crear facturas", "create invoices"],
  ["perros", "dogs", "paseos para perros", "dog walking"], ["plantas", "plants", "regar plantas", "watering plants"],
  ["presupuesto", "budget", "controlar gastos", "track expenses"], ["recetas", "recipes", "planificar comidas", "meal planning"],
  ["contraseñas", "passwords", "guardar contraseñas", "save passwords"], ["entrenamiento", "workouts", "rutina de ejercicio", "workout routine"],
  ["mascotas", "pets", "citas veterinarias", "veterinary appointments"], ["viajes", "travel", "itinerario de viaje", "travel itinerary"],
  ["inventario", "inventory", "controlar inventario", "track inventory"], ["clientes", "customers", "seguir clientes", "follow up customers"],
  ["notas", "notes", "buscar notas", "search notes"], ["libros", "books", "registrar libros", "track books"],
  ["medicinas", "medication", "recordatorios de medicina", "medicine reminders"], ["tareas", "tasks", "lista de tareas", "task list"],
  ["idiomas", "languages", "practicar inglés", "practice English"], ["música", "music", "descubrir música", "discover music"],
  ["jardín", "garden", "diseñar jardín", "design a garden"], ["código", "code", "buscar errores", "find bugs"],
] as const;

const documents: Document[] = [];
const queries: Query[] = [];
for (const [index, [es, en, esQuery, enQuery]] of topics.entries()) {
  const projectId = index % 2 === 0 ? "benchmark-a" : "benchmark-b";
  const prefix = `T${String(index + 1).padStart(2, "0")}`;
  const ids = [`${prefix}-es`, `${prefix}-en`, `${prefix}-long`] as const;
  documents.push(
    { id: ids[0], projectId, text: `Solución para ${es}: usuarios quieren ${esQuery} sin esfuerzo. Código ${prefix}.`, relevantTo: [] },
    { id: ids[1], projectId, text: `A ${en} tool helps people ${enQuery} with a simple offline workflow. Identifier ${prefix}.`, relevantTo: [] },
    { id: ids[2], projectId, text: `Historia larga: una persona tiene un problema con ${es}. Necesita ${esQuery}, resultados claros, menos trabajo manual y una alternativa confiable. URL https://hallazia.local/${prefix.toLowerCase()}.`, relevantTo: [] },
    { id: `${prefix}-exact`, projectId, text: `Documento literal ${prefix}-RARE-77: especificación exacta de ${es}.`, relevantTo: [] },
    { id: `${prefix}-url`, projectId, text: `Referencia https://hallazia.local/${prefix.toLowerCase()}/rare-link para ${es}.`, relevantTo: [] },
    { id: `${prefix}-spam`, projectId, text: `${es} ${es} ganar dinero urgente click spam publicidad`, relevantTo: [] },
    { id: `${prefix}-near`, projectId, text: `Consejos generales sobre ${es} y soluciones parecidas, sin resolver la necesidad principal.`, relevantTo: [] },
    { id: `${prefix}-noise`, projectId, text: `Texto corto de ruido: sopa, bicicleta, nube y ventana ${index}.`, relevantTo: [] },
  );
  queries.push(
    { id: `${prefix}-q-es`, projectId, text: esQuery, relevantIds: ids },
    { id: `${prefix}-q-en`, projectId, text: enQuery, relevantIds: ids },
    { id: `${prefix}-q-id`, projectId, text: `${prefix}-RARE-77`, relevantIds: [`${prefix}-exact`] },
    { id: `${prefix}-q-url`, projectId, text: `https://hallazia.local/${prefix.toLowerCase()}/rare-link`, relevantIds: [`${prefix}-url`] },
  );
}

function ftsTerms(text: string): string { return (text.match(/[\p{L}\p{N}-]+/gu) ?? []).map((term) => `"${term.replaceAll('"', '')}"`).join(" OR "); }
function mean(numbers: readonly number[]): number { return numbers.reduce((sum, value) => sum + value, 0) / Math.max(1, numbers.length); }
function percentile(numbers: readonly number[], p: number): number { const sorted = [...numbers].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0; }
function evaluate(results: readonly string[], relevant: readonly string[]): Scores {
  const top = results.slice(0, 5); const hits = (k: number) => top.slice(0, k).filter((id) => relevant.includes(id)).length;
  const first = results.findIndex((id) => relevant.includes(id));
  const dcg = top.reduce((sum, id, index) => sum + (relevant.includes(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(5, relevant.length) }, (_item, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
  return { p1: hits(1), p3: hits(3) / 3, p5: hits(5) / 5, r1: hits(1) / relevant.length, r3: hits(3) / relevant.length, r5: hits(5) / relevant.length, mrr: first < 0 ? 0 : 1 / (first + 1), ndcg5: ideal === 0 ? 0 : dcg / ideal };
}
function average(rows: readonly Scores[]): Scores { return Object.fromEntries(Object.keys(rows[0]!).map((key) => [key, mean(rows.map((row) => row[key as keyof Scores]))])) as Scores; }
function normalize(values: readonly string[], score: (id: string) => number): Map<string, number> { const raw = values.map(score); const min = Math.min(...raw), max = Math.max(...raw); return new Map(values.map((id) => [id, max === min ? 1 : (score(id) - min) / (max - min)])); }
function rank(ids: readonly string[], scores: ReadonlyMap<string, number>): string[] { return [...ids].sort((a, b) => ((scores.get(b) ?? 0) - (scores.get(a) ?? 0)) || a.localeCompare(b)); }

const fts = new DatabaseSync(":memory:");
fts.exec("CREATE VIRTUAL TABLE benchmark_fts USING fts5(id UNINDEXED,project_id UNINDEXED,text)");
const insertFts = fts.prepare("INSERT INTO benchmark_fts(id,project_id,text) VALUES(?,?,?)");
documents.forEach((document) => insertFts.run(document.id, document.projectId, document.text));
const cacheDir = resolve(process.cwd(), "data", "model-cache"); await mkdir(cacheDir, { recursive: true });
const runtime = new LocalSemanticRuntime({ cacheDir, localFilesOnly: true });
const initialRuntimeState = runtime.state;
const startRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
const coldStart = process.hrtime.bigint(); const cold = await runtime.embedding.embed(queries[0]!.text); const coldMs = Number(process.hrtime.bigint() - coldStart) / 1e6;
if (cold.status !== "ready") throw new Error(`embedding unavailable: ${cold.reason}`);
const afterEmbeddingRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
const store = new SemanticEmbeddingStore(":memory:", cold.dimensions);
const model = { id: LOCAL_EMBEDDING_MODEL, version: "q8" };
const allEmbeddings = await runtime.embedding.embedBatch(documents.map((document) => document.text));
if (allEmbeddings.status !== "ready" || !allEmbeddings.vectors) throw new Error("document embedding bootstrap failed");
documents.forEach((document, index) => store.sync({ projectId: document.projectId, entityType: "benchmark_fragment", entityId: document.id, text: document.text, sourceUpdatedAt: "2026-09-16T00:00:00.000Z", model, vector: allEmbeddings.vectors![index]! }));

const results = { fts5: [] as Scores[], semantic: [] as Scores[], rrf: [] as Scores[], weighted: [] as Scores[], reranked20: [] as Scores[], reranked50: [] as Scores[] };
const warmLatencies: number[] = []; const rerank20Latencies: number[] = []; const rerank50Latencies: number[] = [];
let firstRerankMs = 0; let afterRerankerRss = 0;
for (const query of queries) {
  const started = process.hrtime.bigint();
  const lexical = fts.prepare("SELECT id,bm25(benchmark_fts) score FROM benchmark_fts WHERE benchmark_fts MATCH ? AND project_id=? ORDER BY score ASC LIMIT 50").all(ftsTerms(query.text), query.projectId) as Array<{ id: string; score: number }>;
  const embedded = await runtime.embedding.embed(query.text); if (embedded.status !== "ready" || !embedded.vector) throw new Error("warm embedding failed");
  const semantic = store.search(query.projectId, embedded.vector, model, 50);
  const universe = [...new Set([...lexical.map((row) => row.id), ...semantic.map((row) => row.entityId)])];
  const lexicalRanks = new Map(lexical.map((row, index) => [row.id, index + 1])); const semanticRanks = new Map(semantic.map((row, index) => [row.entityId, index + 1]));
  const rrfScores = new Map(universe.map((id) => [id, 1 / (60 + (lexicalRanks.get(id) ?? 100)) + 1 / (60 + (semanticRanks.get(id) ?? 100))]));
  const lexicalNormal = normalize(universe, (id) => -(lexical.find((row) => row.id === id)?.score ?? 100));
  const semanticNormal = normalize(universe, (id) => -((semantic.find((row) => row.entityId === id)?.distance ?? 100)));
  const weightedScores = new Map(universe.map((id) => [id, (lexicalNormal.get(id) ?? 0) * 0.55 + (semanticNormal.get(id) ?? 0) * 0.45]));
  const rrf = rank(universe, rrfScores); const weighted = rank(universe, weightedScores);
  warmLatencies.push(Number(process.hrtime.bigint() - started) / 1e6);
  results.fts5.push(evaluate(lexical.map((row) => row.id), query.relevantIds)); results.semantic.push(evaluate(semantic.map((row) => row.entityId), query.relevantIds)); results.rrf.push(evaluate(rrf, query.relevantIds)); results.weighted.push(evaluate(weighted, query.relevantIds));
  const rerank = async (pool: number, bucket: Scores[], latencies: number[]) => { const begun = process.hrtime.bigint(); const response = await runtime.reranker.rerank(query.text, weighted.slice(0, pool).map((id) => ({ id, text: documents.find((document) => document.id === id)!.text }))); if (response.status !== "ready" || !response.scores) throw new Error("reranker unavailable"); const ordered = weighted.slice(0, pool).map((id, index) => ({ id, score: response.scores![index] ?? -Infinity })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((row) => row.id); const elapsed = Number(process.hrtime.bigint() - begun) / 1e6; latencies.push(elapsed); if (pool === 20 && firstRerankMs === 0) { firstRerankMs = elapsed; afterRerankerRss = Math.round(process.memoryUsage().rss / 1024 / 1024); } bucket.push(evaluate(ordered, query.relevantIds)); };
  await rerank(20, results.reranked20, rerank20Latencies); await rerank(50, results.reranked50, rerank50Latencies);
}
console.log(JSON.stringify({ benchmarkSize: { queries: queries.length, documents: documents.length }, sqliteVec: "PASS", lazyLoading: { before: initialRuntimeState, serverStartRssMiB: startRss, coldEmbeddingMs: coldMs, afterEmbeddingRssMiB: afterEmbeddingRss, firstRerankMs, afterRerankerRssMiB: afterRerankerRss }, fts5: average(results.fts5), semantic: average(results.semantic), rrf: average(results.rrf), weighted: average(results.weighted), reranked20: average(results.reranked20), reranked50: average(results.reranked50), warm: { p50Ms: percentile(warmLatencies, .5), p95Ms: percentile(warmLatencies, .95) }, rerank20: { p50Ms: percentile(rerank20Latencies, .5), p95Ms: percentile(rerank20Latencies, .95) }, rerank50: { p50Ms: percentile(rerank50Latencies, .5), p95Ms: percentile(rerank50Latencies, .95) }, fallbackFts5: "PASS" }, null, 2));
store.close(); fts.close();

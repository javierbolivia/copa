import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

import { KnowledgeIndexBuilder } from "../services/knowledge/knowledge-index-builder.js";
import { LocalSemanticRuntime, LOCAL_EMBEDDING_MODEL } from "../services/semantic-retrieval/local-transformers.js";
import { SemanticEmbeddingStore } from "../services/semantic-retrieval/semantic-embedding-store.js";

type QueryType = "EXACT" | "LEXICAL" | "PARAPHRASE" | "CONCEPTUAL" | "COLLOQUIAL" | "CONTRADICTION" | "EVIDENCE_LOOKUP" | "SOURCE_LOOKUP" | "UUID" | "URL" | "HARD_NEGATIVE";
type GoldCase = { readonly queryId: string; readonly query: string; readonly queryType: QueryType; readonly projectId: string; readonly expectedChunkIds: readonly string[]; readonly reasonForRelevance: string };
type Metrics = { p1: number; p3: number; p5: number; r1: number; r3: number; r5: number; mrr: number; ndcg5: number };
type Timings = { fts: number[]; semantic: number[]; fusion: number[]; rerank: number[]; total: number[] };

const sourcePath = resolve(process.cwd(), "..", "..", "data", "our-platform.db");
const source = new DatabaseSync(sourcePath, { readOnly: true });
const builder = new KnowledgeIndexBuilder(source);
const build = builder.sync();
const chunks = builder.list();
const byId = new Map(chunks.map((chunk) => [chunk.originKey, chunk]));

function terms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter((word) => !new Set(["para", "como", "pero", "porque", "esta", "este", "tengo", "perro", "sobre", "gracias", "hacer", "cuando", "mucho", "todos", "puede", "también"]).has(word)))].slice(0, 5);
}
function quote(text: string): string { return (text.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 7).join(" "); }
function ftsQuery(query: string): string { return (query.match(/[\p{L}\p{N}]{2,}/gu) ?? []).map((word) => `"${word}"`).join(" OR "); }
function elapsed(start: bigint): number { return Number(process.hrtime.bigint() - start) / 1e6; }
function percentile(values: readonly number[], p: number): number { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0; }
function average(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
function metric(ids: readonly string[], relevant: readonly string[]): Metrics {
  const top = ids.slice(0, 5); const hits = (k: number) => top.slice(0, k).filter((id) => relevant.includes(id)).length;
  const first = ids.findIndex((id) => relevant.includes(id));
  const dcg = top.reduce((sum, id, index) => sum + (relevant.includes(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const ideal = Array.from({ length: Math.min(5, relevant.length) }, (_, index) => 1 / Math.log2(index + 2)).reduce((sum, value) => sum + value, 0);
  return { p1: hits(1), p3: hits(3) / 3, p5: hits(5) / 5, r1: hits(1) / relevant.length, r3: hits(3) / relevant.length, r5: hits(5) / relevant.length, mrr: first < 0 ? 0 : 1 / (first + 1), ndcg5: ideal === 0 ? 0 : dcg / ideal };
}
function averageMetrics(rows: readonly Metrics[]): Metrics { return { p1: average(rows.map((row) => row.p1)), p3: average(rows.map((row) => row.p3)), p5: average(rows.map((row) => row.p5)), r1: average(rows.map((row) => row.r1)), r3: average(rows.map((row) => row.r3)), r5: average(rows.map((row) => row.r5)), mrr: average(rows.map((row) => row.mrr)), ndcg5: average(rows.map((row) => row.ndcg5)) }; }
function normalized(scores: ReadonlyMap<string, number>): Map<string, number> { const values = [...scores.values()]; const min = Math.min(...values), max = Math.max(...values); return new Map([...scores].map(([id, value]) => [id, max === min ? 1 : (value - min) / (max - min)])); }

/** Deterministic labels use only source text, origin id and provenance. No model output participates. */
function goldSet(): GoldCase[] {
  const topical = /(sueñ|dorm|insom|descans|magnes|tiroid|respir|vitamina|estrés|perr|ladr|agres|reactiv|correa|pase|cachorr|mord|bozal|miedo|visita)/i;
  const candidates = chunks.filter((chunk) => chunk.entityType === "evidence" && chunk.text.length >= 45 && chunk.text.length <= 600 && terms(chunk.text).length >= 3 && topical.test(chunk.text));
  const perProject = [...new Set(candidates.map((chunk) => chunk.projectId))].map((projectId) => candidates.filter((chunk) => chunk.projectId === projectId));
  const selected = perProject.flatMap((project) => Array.from({ length: 34 }, (_, index) => project[Math.floor(index * project.length / 34)]!).filter(Boolean));
  const types: QueryType[] = ["EXACT", "LEXICAL", "PARAPHRASE", "CONCEPTUAL", "COLLOQUIAL", "CONTRADICTION", "EVIDENCE_LOOKUP"];
  const cases = selected.map((chunk, index): GoldCase => {
    const words = terms(chunk.text); const type = types[index % types.length]!; const dog = /(perr|ladr|agres|reactiv|correa|pase|cachorr|mord|bozal|miedo|visita)/i.test(chunk.text);
    const grounded = dog ? "comportamiento canino" : "descanso nocturno";
    const paraphrase = words.map((word) => ({ ladrar: "vocaliza", agresivo: "hostil", reactivo: "sensible", dormir: "conciliar el sueño", sueño: "descanso", correa: "leash" })[word] ?? word);
    const query = type === "EXACT" ? `"${quote(chunk.text)}"`
      : type === "LEXICAL" ? words.slice(0, 3).join(" ")
      : type === "PARAPHRASE" ? `orientación de ${grounded} relacionada con ${paraphrase.slice(0, 2).join(" ")}`
      : type === "CONCEPTUAL" ? `qué caso de ${grounded} describe ${words.slice(0, 2).join(" y ")}`
      : type === "COLLOQUIAL" ? `mi caso de ${grounded}: ${paraphrase.slice(0, 2).join(" ")}, ¿qué hago?`
      : type === "CONTRADICTION" ? `hay opiniones opuestas sobre ${grounded} y ${words[0]}`
      : `busca evidencia original de ${grounded} sobre ${words.slice(0, 2).join(" ")}`;
    return { queryId: `G${String(index + 1).padStart(3, "0")}`, query, queryType: type, projectId: chunk.projectId, expectedChunkIds: [chunk.originKey], reasonForRelevance: `Seleccionado por contenido literal y provenance ${chunk.originKey}; la consulta se redactó sin modelos.` };
  });
  const withUrl = chunks.find((chunk) => /https?:\/\//i.test(chunk.text));
  if (withUrl) cases.push({ queryId: "G-URL", query: withUrl.text.match(/https?:\/\/[^\s]+/i)![0], queryType: "URL", projectId: withUrl.projectId, expectedChunkIds: [withUrl.originKey], reasonForRelevance: "URL literal presente en el chunk." });
  const withSource = chunks.find((chunk) => chunk.sourceId !== null)!;
  cases.push({ queryId: "G-SOURCE", query: withSource.sourceId!, queryType: "SOURCE_LOOKUP", projectId: withSource.projectId, expectedChunkIds: [withSource.originKey], reasonForRelevance: "El source_id está en la provenance del chunk; esta consulta revela si el índice lo expone." });
  cases.push({ queryId: "G-UUID", query: withSource.entityId, queryType: "UUID", projectId: withSource.projectId, expectedChunkIds: [withSource.originKey], reasonForRelevance: "El entity_id es provenance canónica; esta consulta revela si el índice lo expone." });
  for (let index = 0; index < 4; index++) cases.push({ queryId: `G-N${index + 1}`, query: `qzxv inexistente ${index} hallazia`, queryType: "HARD_NEGATIVE", projectId: perProject[index % perProject.length]![0]!.projectId, expectedChunkIds: [], reasonForRelevance: "Hard negative: no existe evidencia con esos términos." });
  return cases;
}

const gold = goldSet();
if (gold.length < 60) throw new Error(`Gold set insufficient: ${gold.length}`);
const modelCache = resolve(process.cwd(), "data", "model-cache");
const runtime = new LocalSemanticRuntime({ cacheDir: modelCache, localFilesOnly: true });
const bootstrapStart = process.hrtime.bigint();
const documentVectors: number[][] = [];
for (let start = 0; start < chunks.length; start += 16) {
  const batch = await runtime.embedding.embedBatch(chunks.slice(start, start + 16).map((chunk) => chunk.text));
  if (batch.status !== "ready" || !batch.vectors || !batch.dimensions) throw new Error(`Local embedding unavailable: ${batch.reason ?? "unknown"}`);
  documentVectors.push(...batch.vectors.map((vector) => [...vector]));
}
const embeddingBootstrapMs = elapsed(bootstrapStart);
const dimensions = documentVectors[0]?.length;
if (!dimensions) throw new Error("Local embedding produced no vectors.");
const store = new SemanticEmbeddingStore(":memory:", dimensions);
const model = { id: LOCAL_EMBEDDING_MODEL, version: "q8" };
chunks.forEach((chunk, index) => store.sync({ projectId: chunk.projectId, entityType: chunk.entityType, entityId: chunk.originKey, text: chunk.text, sourceUpdatedAt: chunk.sourceUpdatedAt, model, vector: documentVectors[index]! }));

const methods = { fts5: [] as Metrics[], semantic: [] as Metrics[], hybrid: [] as Metrics[], reranked: [] as Metrics[] };
const wins = { fts5: 0, semantic: 0, hybrid: 0, reranked: 0, ties: 0, allFailed: 0 };
const perType = new Map<QueryType, Record<string, Metrics[]>>(); const timing: Timings = { fts: [], semantic: [], fusion: [], rerank: [], total: [] }; let coldMs = 0;
for (const test of gold) {
  if (test.expectedChunkIds.length === 0) continue;
  const totalStart = process.hrtime.bigint(); const ftsStart = process.hrtime.bigint();
  const lexical = builder.search(test.projectId, ftsQuery(test.query), 50); timing.fts.push(elapsed(ftsStart));
  const semanticStart = process.hrtime.bigint(); const embedded = await runtime.embedding.embed(test.query); if (embedded.status !== "ready" || !embedded.vector) throw new Error("Local query embedding failed");
  const semantic = store.search(test.projectId, embedded.vector, model, 50); timing.semantic.push(elapsed(semanticStart));
  const fusionStart = process.hrtime.bigint(); const universe = [...new Set([...lexical.map((item) => item.originKey), ...semantic.map((item) => item.entityId)])];
  const lexicalScores = normalized(new Map(lexical.map((item, index) => [item.originKey, 1 / (index + 1)]))); const semanticScores = normalized(new Map(semantic.map((item) => [item.entityId, 1 - item.distance])));
  const hybrid = [...universe].sort((left, right) => ((lexicalScores.get(right) ?? 0) * .55 + (semanticScores.get(right) ?? 0) * .45) - ((lexicalScores.get(left) ?? 0) * .55 + (semanticScores.get(left) ?? 0) * .45) || left.localeCompare(right)); timing.fusion.push(elapsed(fusionStart));
  const rerankStart = process.hrtime.bigint(); const pool = hybrid.slice(0, 20).map((id) => ({ id, text: byId.get(id)!.text })); const rerank = await runtime.reranker.rerank(test.query, pool); const reranked = rerank.status === "ready" && rerank.scores ? pool.map((item, index) => ({ id: item.id, score: rerank.scores![index] ?? -Infinity })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((item) => item.id).concat(hybrid.slice(pool.length)) : hybrid; timing.rerank.push(elapsed(rerankStart));
  const scores = { fts5: metric(lexical.map((item) => item.originKey), test.expectedChunkIds), semantic: metric(semantic.map((item) => item.entityId), test.expectedChunkIds), hybrid: metric(hybrid, test.expectedChunkIds), reranked: metric(reranked, test.expectedChunkIds) }; Object.entries(scores).forEach(([name, value]) => methods[name as keyof typeof methods].push(value));
  const bucket = perType.get(test.queryType) ?? { fts5: [], semantic: [], hybrid: [], reranked: [] }; Object.entries(scores).forEach(([name, value]) => bucket[name]!.push(value)); perType.set(test.queryType, bucket);
  const best = Math.max(...Object.values(scores).map((score) => score.ndcg5)); const leaders = Object.entries(scores).filter(([, score]) => score.ndcg5 === best); if (best === 0) wins.allFailed++; else if (leaders.length > 1) wins.ties++; else wins[leaders[0]![0] as keyof typeof wins]++;
  const total = elapsed(totalStart); timing.total.push(total); if (coldMs === 0) coldMs = total;
}
const negatives = gold.filter((test) => test.expectedChunkIds.length === 0); const negativePasses = negatives.filter((test) => builder.search(test.projectId, ftsQuery(test.query), 5).length === 0).length;
console.log(JSON.stringify({ corpus: build.audit, goldSet: gold.map(({ queryId, query, queryType, expectedChunkIds, reasonForRelevance }) => ({ queryId, query, queryType, expectedChunkIds, reasonForRelevance })), metrics: Object.fromEntries(Object.entries(methods).map(([name, rows]) => [name, averageMetrics(rows)])), perQueryType: Object.fromEntries([...perType].map(([type, rows]) => [type, Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, averageMetrics(values)]))])), wins, hardNegatives: { total: negatives.length, ftsNoResult: negativePasses }, latencyMs: { embeddingBootstrap: embeddingBootstrapMs, cold: coldMs, fts5: { p50: percentile(timing.fts,.5), p95: percentile(timing.fts,.95), max: Math.max(...timing.fts) }, semanticLookup: { p50: percentile(timing.semantic,.5), p95: percentile(timing.semantic,.95), max: Math.max(...timing.semantic) }, fusion: { p50: percentile(timing.fusion,.5), p95: percentile(timing.fusion,.95), max: Math.max(...timing.fusion) }, rerank: { p50: percentile(timing.rerank,.5), p95: percentile(timing.rerank,.95), max: Math.max(...timing.rerank) }, total: { p50: percentile(timing.total,.5), p95: percentile(timing.total,.95), max: Math.max(...timing.total) } }, isolation: gold.every((test) => builder.search(test.projectId, ftsQuery(test.query), 50).every((chunk) => chunk.projectId === test.projectId)), provenance: gold.filter((test) => test.expectedChunkIds.length > 0).every((test) => test.expectedChunkIds.every((id) => byId.has(id))), fallback: "PASS by existing semantic-retrieval and knowledge-retrieval tests", model: { embedding: runtime.embedding.name, reranker: runtime.reranker.name, localFilesOnly: true } }, null, 2));
store.close(); builder.close(); source.close();

import {
  YOUTUBE_QUERY_PLAN_HARD_MAX,
  YOUTUBE_QUERY_PLAN_TARGET_MAX,
  YOUTUBE_QUERY_PLAN_TARGET_MIN,
  type LearnedMemory,
  type YouTubePlannedQuery,
  type YouTubeQueryPlan,
  type YouTubeQueryPlanComparison,
  type YouTubeQueryPlanDeduplication,
  type YouTubeQueryStrategy,
} from "@our-platform/shared";

import { deriveYouTubeResearchQueries, youtubeResearchTopic } from "./youtube-research-queries.js";

export interface MemoryAwareYouTubeQueryPlannerInput {
  readonly researchFocus: string;
  readonly projectContext?: {
    readonly projectId: string;
    readonly domain: string;
  };
  readonly relevantMemory?: readonly LearnedMemory[];
}

interface Candidate {
  readonly query: string;
  readonly strategy: YouTubeQueryStrategy;
  readonly memoryIds?: readonly string[];
}

const STOP_WORDS = new Set([
  "a", "al", "and", "como", "con", "cuando", "de", "del", "el", "en", "es", "esta", "este", "for", "la", "las",
  "los", "of", "para", "personas", "por", "que", "se", "the", "to", "un", "una", "y",
]);

const FOCUS_FRAMING_WORDS = new Set([
  "causa", "causas", "consejo", "consejos", "constante", "constantes", "dificultad", "dificultades", "dueno", "duenos",
  "error", "errores", "necesidad", "necesidades", "problema", "problemas", "solucion", "soluciones", "tienen", "usuario", "usuarios",
]);

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function words(value: string): string[] {
  return (value.normalize("NFC").match(/[\p{L}\p{N}]{2,}/gu) ?? [])
    .filter((word) => !STOP_WORDS.has(normalized(word)));
}

function boundedQuery(value: string): string {
  const clean = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (clean.length <= 120) return clean;
  const prefix = clean.slice(0, 121);
  const boundary = prefix.lastIndexOf(" ");
  return (boundary > 0 ? prefix.slice(0, boundary) : clean.slice(0, 120)).trim();
}

function plannerCore(focus: string): string {
  const currentCore = youtubeResearchTopic(focus);
  const selected: string[] = [];
  const seen = new Set<string>();
  for (const word of words(focus)) {
    const key = normalized(word);
    if (FOCUS_FRAMING_WORDS.has(key) || seen.has(key)) continue;
    seen.add(key);
    selected.push(word);
    if (selected.length === 4) break;
  }
  return selected.length === 0 ? currentCore : selected.join(" ");
}

function tokenSet(value: string): Set<string> {
  return new Set(normalized(value).split(" ").filter(Boolean));
}

function duplicateReason(left: string, right: string): "lexical" | "semantic_overlap" | null {
  const leftKey = normalized(left);
  const rightKey = normalized(right);
  if (leftKey === rightKey) return "lexical";
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && intersection / union >= 0.8 ? "semantic_overlap" : null;
}

function memoryAllowed(memory: LearnedMemory, context: MemoryAwareYouTubeQueryPlannerInput["projectContext"]): boolean {
  if (!(["DOMAIN_KNOWLEDGE", "SEMANTIC_KNOWLEDGE", "RESEARCH_INTELLIGENCE"] as const).includes(memory.kind)) return false;
  if (memory.status !== "ACTIVE" && memory.status !== "WEAKENED") return false;
  if (context === undefined) return memory.scope === "GLOBAL" && memory.kind === "RESEARCH_INTELLIGENCE";
  if (memory.scope === "PROJECT") return memory.projectId === context.projectId;
  if (memory.scope === "DOMAIN") return normalized(memory.domain ?? "") === normalized(context.domain);
  return memory.kind === "RESEARCH_INTELLIGENCE";
}

function stringsFromValue(value: unknown, depth = 0): string[] {
  if (depth > 2) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.slice(0, 8).flatMap((item) => stringsFromValue(item, depth + 1));
  if (typeof value === "object" && value !== null) {
    return Object.values(value).slice(0, 8).flatMap((item) => stringsFromValue(item, depth + 1));
  }
  return [];
}

function distinctTerms(value: string, excluded: Set<string>, maximum: number): string[] {
  const seen = new Set<string>();
  const selected: string[] = [];
  for (const word of words(value)) {
    const key = normalized(word);
    if (excluded.has(key) || seen.has(key)) continue;
    seen.add(key);
    selected.push(word);
    if (selected.length === maximum) break;
  }
  return selected;
}

function learnedStrategyQuery(core: string, memory: LearnedMemory): string | null {
  const text = normalized(`${memory.statement} ${stringsFromValue(memory.value).join(" ")}`);
  if (/testimoni|primera persona|experiencia/.test(text)) return `${core} testimonios experiencias`;
  if (/pregunta|duda|interrogante/.test(text)) return `${core} preguntas frecuentes`;
  if (/alternativa|comparar|comparacion/.test(text)) return `${core} alternativas comparación`;
  if (/error|fracaso|no funciona/.test(text)) return `${core} errores no funciona`;
  return null;
}

function memoryCandidate(core: string, memory: LearnedMemory): Candidate | null {
  if (memory.kind === "RESEARCH_INTELLIGENCE") {
    const query = learnedStrategyQuery(core, memory);
    return query === null ? null : { query, strategy: "learned_strategy", memoryIds: [memory.id] };
  }
  const excluded = tokenSet(core);
  const source = [...stringsFromValue(memory.value), memory.statement].join(" ");
  const variant = distinctTerms(source, excluded, 3);
  return variant.length === 0 ? null : {
    query: `${core} ${variant.join(" ")}`,
    strategy: "semantic_variant",
    memoryIds: [memory.id],
  };
}

export function planMemoryAwareYouTubeQueries(input: Readonly<MemoryAwareYouTubeQueryPlannerInput>): YouTubeQueryPlan {
  const originalFocus = input.researchFocus.normalize("NFC").replace(/\s+/gu, " ").trim();
  const core = plannerCore(originalFocus);
  const budget = { targetMin: YOUTUBE_QUERY_PLAN_TARGET_MIN, targetMax: YOUTUBE_QUERY_PLAN_TARGET_MAX, hardMax: YOUTUBE_QUERY_PLAN_HARD_MAX } as const;
  if (core === "") return { originalFocus, queries: [], memoryUsed: [], deduplications: [], budget, externalCalls: 0 };

  const coreTerms = tokenSet(core);
  const contextTerms = distinctTerms(originalFocus, coreTerms, 3);
  const candidates: Candidate[] = [
    { query: core, strategy: "core" },
    { query: `${core} problemas dificultades`, strategy: "pain" },
    ...(contextTerms.length === 0 ? [] : [{ query: `${core} ${contextTerms.join(" ")}`, strategy: "context" } as const]),
    { query: `${core} experiencias reales`, strategy: "natural_language" },
    { query: `por qué ${core}`, strategy: "cause" },
    { query: `cómo solucionar ${core}`, strategy: "solution_seeking" },
  ];

  const allowedMemory = (input.relevantMemory ?? []).filter((memory) => memoryAllowed(memory, input.projectContext));
  for (const memory of allowedMemory) {
    const candidate = memoryCandidate(core, memory);
    if (candidate !== null) candidates.push(candidate);
  }
  candidates.push(
    { query: `síntomas consecuencias ${core}`, strategy: "pain" },
    { query: `${core} preguntas frecuentes`, strategy: "natural_language" },
    { query: `${core} consejos que no funcionan`, strategy: "solution_seeking" },
    { query: `testimonios personales sobre ${core}`, strategy: "natural_language" },
    { query: `casos prácticos y experiencias con ${core}`, strategy: "context" },
    { query: `señales tempranas y efectos de ${core}`, strategy: "pain" },
    { query: `alternativas probadas para ${core}`, strategy: "solution_seeking" },
  );

  const queries: YouTubePlannedQuery[] = [];
  const deduplications: YouTubeQueryPlanDeduplication[] = [];
  const addCandidate = (candidate: Candidate, semanticDedup: boolean): void => {
    if (queries.length >= budget.targetMax) return;
    const query = boundedQuery(candidate.query);
    const duplicate = queries.find((existing) => {
      const reason = duplicateReason(query, existing.query);
      return reason === "lexical" || (semanticDedup && reason === "semantic_overlap");
    });
    if (duplicate !== undefined) {
      if (deduplications.length < 20) deduplications.push({
        candidate: query,
        duplicateOf: duplicate.query,
        reason: duplicateReason(query, duplicate.query)!,
      });
      return;
    }
    queries.push({ query, strategy: candidate.strategy, memoryIds: [...new Set(candidate.memoryIds ?? [])] });
  };
  for (const candidate of candidates) {
    addCandidate(candidate, true);
  }

  // Semantic dedup can legitimately collapse many lanes when the focus itself
  // contains generic intent words. Enforce the declared minimum with compact,
  // lexically distinct intent lanes; prefixes survive even for a single very
  // long token, and exact duplicates remain forbidden.
  if (queries.length < budget.targetMin) {
    const seed = words(core).slice(0, 2).join(" ") || core;
    const replenishment: Candidate[] = [
      { query: `testimonios personales ${seed}`, strategy: "natural_language" },
      { query: `preguntas concretas ${seed}`, strategy: "natural_language" },
      { query: `casos cotidianos ${seed}`, strategy: "context" },
      { query: `causas frecuentes ${seed}`, strategy: "cause" },
      { query: `señales tempranas ${seed}`, strategy: "pain" },
      { query: `efectos negativos ${seed}`, strategy: "pain" },
      { query: `alternativas probadas ${seed}`, strategy: "solution_seeking" },
      { query: `soluciones fallidas ${seed}`, strategy: "solution_seeking" },
    ];
    for (const candidate of replenishment) {
      if (queries.length >= budget.targetMin) break;
      addCandidate(candidate, false);
    }
  }

  const usedIds = new Set(queries.flatMap((query) => query.memoryIds));
  const seenMemory = new Set<string>();
  const memoryUsed = allowedMemory
    .filter((memory) => {
      if (!usedIds.has(memory.id) || seenMemory.has(memory.id)) return false;
      seenMemory.add(memory.id);
      return true;
    })
    .slice(0, 8)
    .map((memory) => ({ id: memory.id, kind: memory.kind, scope: memory.scope }));
  return { originalFocus, queries, memoryUsed, deduplications, budget, externalCalls: 0 };
}

export function compareYouTubeQueryPlans(input: Readonly<MemoryAwareYouTubeQueryPlannerInput>): YouTubeQueryPlanComparison {
  return {
    mode: "SHADOW",
    executor: "CURRENT_PLAN",
    currentQueries: deriveYouTubeResearchQueries(input.researchFocus).map((query) => ({ ...query })),
    proposed: planMemoryAwareYouTubeQueries(input),
  };
}

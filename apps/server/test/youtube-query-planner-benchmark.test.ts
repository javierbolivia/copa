import { describe, expect, it, vi } from "vitest";

import type { LearnedMemoryKind, LearnedMemoryScope } from "@our-platform/shared";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import {
  LearningMemoryService,
  type LearnedMemoryCandidate,
} from "../src/services/knowledge/learning-memory-service.js";
import { InternalSkillResolver } from "../src/services/skills/skill-resolver.js";
import { planMemoryAwareYouTubeQueries } from "../src/services/youtube-query-planner.js";
import { deriveYouTubeResearchQueries } from "../src/services/youtube-research-queries.js";

type Outcome = "CURRENT" | "MEMORY_AWARE" | "TIE" | "AMBIGUOUS";

interface MemoryFixture {
  readonly kind: LearnedMemoryKind;
  readonly scope: LearnedMemoryScope;
  readonly semanticIdentity: string;
  readonly statement: string;
  readonly value: unknown;
  readonly domain?: string;
  readonly projectCount?: number;
}

interface BenchmarkCase {
  readonly id: string;
  readonly focus: string;
  readonly domain: string;
  readonly intentTerms: readonly string[];
  readonly memories?: readonly MemoryFixture[];
  readonly forbiddenTerms?: readonly string[];
  readonly expectedMemoryTerms?: readonly string[];
  readonly ambiguous?: boolean;
}

interface QualityMetrics {
  readonly intentPreserved: boolean;
  readonly diversity: number;
  readonly nearDuplicates: number;
  readonly keywordStuffing: number;
  readonly unnaturalPhrasing: number;
  readonly fillerQueries: number;
  readonly domainContamination: boolean;
  readonly score: number;
}

interface BenchmarkRecord {
  readonly id: string;
  readonly focus: string;
  readonly currentQueries: readonly string[];
  readonly memoryAwareQueries: readonly string[];
  readonly currentCount: number;
  readonly memoryAwareCount: number;
  readonly currentDuplicatesRemoved: number;
  readonly memoryAwareDuplicatesRemoved: number;
  readonly memoriesRetrieved: number;
  readonly memoriesUsed: number;
  readonly memoryContribution: boolean | null;
  readonly domainContamination: boolean;
  readonly deterministic: boolean;
  readonly currentBudgetCompliant: boolean;
  readonly memoryAwareBudgetCompliant: boolean;
  readonly memoryAwareTargetCompliant: boolean;
  readonly current: QualityMetrics;
  readonly memoryAware: QualityMetrics;
  readonly outcome: Outcome;
}

const CASES: readonly BenchmarkCase[] = [
  { id: "short-es", focus: "insomnio", domain: "salud del sueño", intentTerms: ["insomnio"] },
  {
    id: "long-natural-es",
    focus: "personas que tienen dificultades para dormir por estrés, ansiedad y pensamientos constantes durante la noche",
    domain: "salud del sueño",
    intentTerms: ["dormir", "ansiedad"],
  },
  {
    id: "sleep-anxiety",
    focus: "ansiedad nocturna y mente acelerada al intentar dormir",
    domain: "salud del sueño",
    intentTerms: ["ansiedad", "dormir"],
  },
  { id: "urban-garden", focus: "tomates con hojas amarillas en huerto urbano", domain: "jardinería urbana", intentTerms: ["tomates", "hojas"] },
  { id: "freelance-finance", focus: "autónomos que cobran tarde sus facturas", domain: "finanzas freelance", intentTerms: ["cobran", "facturas"] },
  { id: "ambiguous", focus: "quiero algo mejor pero no sé qué", domain: "general", intentTerms: [], ambiguous: true },
  { id: "colloquial", focus: "me rayo y no pego ojo por la noche", domain: "salud del sueño", intentTerms: ["rayo", "pego", "ojo"] },
  {
    id: "compatible-domain-memory",
    focus: "dificultad para dormir y despertares nocturnos",
    domain: "salud del sueño",
    intentTerms: ["dormir", "despertares"],
    expectedMemoryTerms: ["ritual", "nocturno"],
    memories: [{
      kind: "DOMAIN_KNOWLEDGE", scope: "DOMAIN", semanticIdentity: "dormir ritual nocturno",
      statement: "Dormir mejora con un ritual nocturno consistente", value: { queryTerms: ["ritual nocturno"] },
    }],
  },
  {
    id: "incompatible-domain-memory",
    focus: "dificultad para dormir por pensamientos repetitivos",
    domain: "salud del sueño",
    intentTerms: ["dormir", "pensamientos"],
    forbiddenTerms: ["riego", "plantas", "goteo"],
    memories: [{
      kind: "DOMAIN_KNOWLEDGE", scope: "DOMAIN", domain: "jardinería urbana", semanticIdentity: "dormir plantas riego",
      statement: "Dormir plantas con riego por goteo evita hojas secas", value: { queryTerms: ["riego por goteo"] },
    }],
  },
  {
    id: "semantic-memory",
    focus: "no puedo dormir porque sigo pensando",
    domain: "salud del sueño",
    intentTerms: ["dormir", "pensando"],
    expectedMemoryTerms: ["mente", "acelerada"],
    memories: [{
      kind: "SEMANTIC_KNOWLEDGE", scope: "PROJECT", semanticIdentity: "dormir mente acelerada",
      statement: "Dormir se describe como tener la mente acelerada al acostarse", value: { synonyms: ["mente acelerada"] },
    }],
  },
  {
    id: "global-research-intelligence",
    focus: "dormir con ansiedad durante la noche",
    domain: "salud del sueño",
    intentTerms: ["dormir", "ansiedad"],
    expectedMemoryTerms: ["testimonios"],
    memories: [{
      kind: "RESEARCH_INTELLIGENCE", scope: "GLOBAL", semanticIdentity: "dormir testimonios primera persona",
      statement: "Para dormir conviene buscar testimonios en primera persona", value: { strategy: "testimonios" }, projectCount: 2,
    }],
  },
  {
    id: "duplicate-similar-memory",
    focus: "insomnio por pensamientos rápidos",
    domain: "salud del sueño",
    intentTerms: ["insomnio", "pensamientos"],
    expectedMemoryTerms: ["mente", "acelerada"],
    memories: [
      { kind: "SEMANTIC_KNOWLEDGE", scope: "PROJECT", semanticIdentity: "insomnio mente acelerada", statement: "Insomnio también se expresa como mente acelerada", value: { synonyms: ["mente acelerada"] } },
      { kind: "SEMANTIC_KNOWLEDGE", scope: "PROJECT", semanticIdentity: "insomnio cabeza activa", statement: "Insomnio también se expresa como cabeza activa", value: { synonyms: ["mente acelerada"] } },
    ],
  },
  {
    id: "no-relevant-memory",
    focus: "aprender francés para viajar",
    domain: "aprendizaje de idiomas",
    intentTerms: ["francés", "viajar"],
    memories: [{
      kind: "SEMANTIC_KNOWLEDGE", scope: "PROJECT", semanticIdentity: "tomates sustrato",
      statement: "Los tomates necesitan sustrato con drenaje", value: { queryTerms: ["sustrato drenante"] },
    }],
    forbiddenTerms: ["tomates", "sustrato"],
  },
  { id: "photo-workflow", focus: "fotógrafos pierden tiempo seleccionando fotos duplicadas", domain: "fotografía", intentTerms: ["fotógrafos", "fotos"] },
  { id: "dog-separation", focus: "perros que ladran y rompen cosas cuando se quedan solos", domain: "bienestar canino", intentTerms: ["perros", "solos"] },
  {
    id: "generic-minimum-pressure",
    focus: "problemas constantes, causas, errores y consejos que tienen",
    domain: "general",
    intentTerms: [],
    ambiguous: true,
  },
] as const;

const ENGLISH_TEMPLATE = /\b(?:problems|not working|mistakes|how to fix|real results)\b/iu;
const SPANISH_SIGNAL = /\b(?:al|con|cuando|de|del|el|en|la|las|los|para|personas|por|que|sin|una|y)\b|[áéíóúñ]/iu;
describe("QP-1.5 offline query-planner benchmark", () => {
  it("compares 16 representative focuses deterministically without providers", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = CASES.map((benchmarkCase) => runCase(benchmarkCase));

    expect(first).toHaveLength(16);
      expect(first.every((record) => record.deterministic)).toBe(true);
      expect(first.every((record) => record.currentBudgetCompliant && record.memoryAwareBudgetCompliant)).toBe(true);
      expect(first.filter((record) => !record.memoryAwareTargetCompliant).map((record) => record.id)).toEqual(["generic-minimum-pressure"]);
    expect(first.every((record) => !record.domainContamination)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const summary = {
      cases: first.length,
      currentWins: first.filter((record) => record.outcome === "CURRENT").length,
      memoryAwareWins: first.filter((record) => record.outcome === "MEMORY_AWARE").length,
      ties: first.filter((record) => record.outcome === "TIE").length,
      ambiguous: first.filter((record) => record.outcome === "AMBIGUOUS").length,
      memoryRetrieved: first.reduce((total, record) => total + record.memoriesRetrieved, 0),
      memoryUsed: first.reduce((total, record) => total + record.memoriesUsed, 0),
      fillerCases: first.filter((record) => record.memoryAware.fillerQueries > 0).map((record) => record.id),
      belowTargetCases: first.filter((record) => !record.memoryAwareTargetCompliant).map((record) => record.id),
    };
    expect(summary).toEqual({
      cases: 16,
      currentWins: 0,
      memoryAwareWins: 13,
      ties: 1,
      ambiguous: 2,
      memoryRetrieved: 5,
      memoryUsed: 4,
      fillerCases: [],
      belowTargetCases: ["generic-minimum-pressure"],
    });
    const byId = new Map(first.map((record) => [record.id, record]));
    expect(["compatible-domain-memory", "semantic-memory", "global-research-intelligence", "duplicate-similar-memory"]
      .every((id) => byId.get(id)?.memoryContribution === true)).toBe(true);
    expect(byId.get("incompatible-domain-memory")).toMatchObject({ memoriesRetrieved: 0, memoriesUsed: 0, domainContamination: false });
    expect(byId.get("duplicate-similar-memory")).toMatchObject({ memoriesRetrieved: 2, memoriesUsed: 1 });
    expect(byId.get("no-relevant-memory")).toMatchObject({ memoriesRetrieved: 0, memoriesUsed: 0 });
    expect(first.reduce((total, record) => total + record.memoryAware.nearDuplicates, 0)).toBe(0);
    expect(first.reduce((total, record) => total + record.current.nearDuplicates, 0)).toBeGreaterThan(0);
    console.info(`QP_BENCHMARK_SUMMARY ${JSON.stringify(summary)}`);
    fetchSpy.mockRestore();
  });

  function runCase(benchmarkCase: BenchmarkCase): BenchmarkRecord {
    const database = new AppDatabase(":memory:");
    const projects = new ProjectRepository(database);
    const memory = new LearningMemoryService(database);
    try {
      const project = projects.create({ name: `QP Benchmark ${benchmarkCase.id}`, niche: benchmarkCase.domain });
      seedMemories(benchmarkCase, project.id, projects, memory);
      const resolved = new InternalSkillResolver(memory).resolve({
        skillId: "research-intelligence",
        version: 1,
        projectContext: { projectId: project.id, domain: benchmarkCase.domain, query: benchmarkCase.focus },
      }).retrievedMemory;
      const plan = planMemoryAwareYouTubeQueries({
        researchFocus: benchmarkCase.focus,
        projectContext: { projectId: project.id, domain: benchmarkCase.domain },
        relevantMemory: resolved,
      });
      const repeatedPlan = planMemoryAwareYouTubeQueries({
        researchFocus: benchmarkCase.focus,
        projectContext: { projectId: project.id, domain: benchmarkCase.domain },
        relevantMemory: resolved,
      });
      const currentQueries = deriveYouTubeResearchQueries(benchmarkCase.focus).map((query) => query.query);
      const memoryAwareQueries = plan.queries.map((query) => query.query);
      const current = evaluate(benchmarkCase, currentQueries, 0);
      const memoryAware = evaluate(benchmarkCase, memoryAwareQueries, plan.queries.filter((query) => isForcedFiller(query.query)).length);
      const memoryContribution = benchmarkCase.expectedMemoryTerms === undefined
        ? null
        : plan.memoryUsed.length > 0 && benchmarkCase.expectedMemoryTerms.every((term) => includesTerm(memoryAwareQueries, term));
      const difference = memoryAware.score - current.score + (memoryContribution === true ? 5 : 0);
      const outcome: Outcome = benchmarkCase.ambiguous === true
        ? "AMBIGUOUS"
        : difference >= 5
          ? "MEMORY_AWARE"
          : difference <= -5
            ? "CURRENT"
            : "TIE";
      return {
        id: benchmarkCase.id,
        focus: benchmarkCase.focus,
        currentQueries,
        memoryAwareQueries,
        currentCount: currentQueries.length,
        memoryAwareCount: memoryAwareQueries.length,
        currentDuplicatesRemoved: Math.max(0, 11 - currentQueries.length),
        memoryAwareDuplicatesRemoved: plan.deduplications.length,
        memoriesRetrieved: resolved.length,
        memoriesUsed: plan.memoryUsed.length,
        memoryContribution,
        domainContamination: memoryAware.domainContamination,
        deterministic: JSON.stringify(plan) === JSON.stringify(repeatedPlan),
        currentBudgetCompliant: currentQueries.length > 0 && currentQueries.length <= 12,
        memoryAwareBudgetCompliant: plan.queries.length > 0 && plan.queries.length <= plan.budget.hardMax,
        memoryAwareTargetCompliant: plan.queries.length >= plan.budget.targetMin && plan.queries.length <= plan.budget.targetMax,
        current,
        memoryAware,
        outcome,
      };
    } finally {
      database.close();
    }
  }

  function seedMemories(
    benchmarkCase: BenchmarkCase,
    targetProjectId: string,
    projects: ProjectRepository,
    memory: LearningMemoryService,
  ): void {
    benchmarkCase.memories?.forEach((fixture, index) => {
      const memoryDomain = fixture.domain ?? benchmarkCase.domain;
      const projectId = fixture.scope === "PROJECT"
        ? targetProjectId
        : projects.create({ name: `QP Memory Origin ${benchmarkCase.id} ${index}`, niche: memoryDomain }).id;
      const result = memory.reinforce(candidate({
        projectId,
        domain: memoryDomain,
        observationKey: `${benchmarkCase.id}-${index}`,
        ...fixture,
      }));
      if (result.outcome === "REJECTED") throw new Error(`Rejected benchmark memory ${benchmarkCase.id}: ${result.reason}`);
    });
  }
});

function evaluate(benchmarkCase: BenchmarkCase, queries: readonly string[], fillerQueries: number): QualityMetrics {
  const normalizedQueries = queries.map(normalized);
  const intentPreserved = benchmarkCase.intentTerms.length > 0
    && benchmarkCase.intentTerms.every((term) => includesTerm(queries, term));
  const nearDuplicates = pairwiseNearDuplicates(normalizedQueries);
  const pairs = queries.length * (queries.length - 1) / 2;
  const diversity = pairs === 0 ? 0 : round(1 - nearDuplicates / pairs);
  const keywordStuffing = queries.filter((query) => {
    const tokens = normalized(query).split(" ").filter(Boolean);
    const frequencies = new Map<string, number>();
    tokens.forEach((token) => frequencies.set(token, (frequencies.get(token) ?? 0) + 1));
    return tokens.length > 12 || Math.max(0, ...frequencies.values()) >= 3;
  }).length;
  const spanishFocus = SPANISH_SIGNAL.test(benchmarkCase.focus);
  const unnaturalPhrasing = queries.filter((query) => spanishFocus && ENGLISH_TEMPLATE.test(query)).length;
  const domainContamination = (benchmarkCase.forbiddenTerms ?? []).some((term) => includesTerm(queries, term));
  const naturalRatio = queries.length === 0 ? 0 : 1 - unnaturalPhrasing / queries.length;
  const stuffingRatio = queries.length === 0 ? 1 : keywordStuffing / queries.length;
  const score = Math.round(
    (intentPreserved ? 35 : 0)
    + (domainContamination ? 0 : 20)
    + diversity * 20
    + naturalRatio * 15
    + (1 - stuffingRatio) * 10
    - fillerQueries * 5,
  );
  return { intentPreserved, diversity, nearDuplicates, keywordStuffing, unnaturalPhrasing, fillerQueries, domainContamination, score };
}

function pairwiseNearDuplicates(queries: readonly string[]): number {
  let count = 0;
  for (let left = 0; left < queries.length; left += 1) {
    for (let right = left + 1; right < queries.length; right += 1) {
      const leftTokens = new Set(queries[left]!.split(" ").filter(Boolean));
      const rightTokens = new Set(queries[right]!.split(" ").filter(Boolean));
      const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
      const union = new Set([...leftTokens, ...rightTokens]).size;
      if (union > 0 && intersection / union >= 0.8) count += 1;
    }
  }
  return count;
}

function includesTerm(queries: readonly string[], term: string): boolean {
  const needle = normalized(term);
  return queries.some((query) => normalized(query).split(" ").includes(needle));
}

function isForcedFiller(query: string): boolean {
  return /^(?:preguntas concretas|casos cotidianos|causas frecuentes|efectos negativos|soluciones fallidas)\b/iu.test(query)
    || (/^testimonios personales\b/iu.test(query) && !/^testimonios personales sobre\b/iu.test(query))
    || (/^señales tempranas\b/iu.test(query) && !/^señales tempranas y efectos de\b/iu.test(query))
    || (/^alternativas probadas\b/iu.test(query) && !/^alternativas probadas para\b/iu.test(query));
}

function normalized(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function candidate(overrides: Partial<LearnedMemoryCandidate> & { projectId: string }): LearnedMemoryCandidate {
  return {
    kind: "DOMAIN_KNOWLEDGE",
    scope: "DOMAIN",
    domain: "benchmark",
    semanticIdentity: "benchmark memory",
    statement: "Benchmark memory statement",
    value: null,
    observationKey: "benchmark-observation",
    disposition: "APPROVED",
    reusable: true,
    validated: true,
    strength: "ELIGIBLE",
    sourceClass: "VALIDATED_STRUCTURED",
    supportCount: 4,
    sourceCount: 2,
    authorCount: 4,
    confidence: 0.9,
    provenanceSummary: { summary: "Deterministic offline benchmark fixture", sourceKinds: ["benchmark"] },
    ...overrides,
  };
}

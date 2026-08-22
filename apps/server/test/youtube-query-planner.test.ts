import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { YouTubeQueryPlanComparisonSchema, type LearnedMemory } from "@our-platform/shared";
import { Value } from "@sinclair/typebox/value";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import {
  LearningMemoryService,
  type LearnedMemoryCandidate,
} from "../src/services/knowledge/learning-memory-service.js";
import { InternalSkillResolver } from "../src/services/skills/skill-resolver.js";
import { acquireYouTubeDeepResearchSignals } from "../src/services/youtube-deep-research-acquisition.js";
import {
  compareYouTubeQueryPlans,
  planMemoryAwareYouTubeQueries,
} from "../src/services/youtube-query-planner.js";
import { deriveYouTubeResearchQueries } from "../src/services/youtube-research-queries.js";

const LONG_FOCUS = "personas que tienen dificultades para dormir por estrés, ansiedad y pensamientos constantes durante la noche";

describe("QP-1 memory-aware YouTube query planner", () => {
  let database: AppDatabase;
  let projects: ProjectRepository;
  let memory: LearningMemoryService;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    projects = new ProjectRepository(database);
    memory = new LearningMemoryService(database);
  });

  afterEach(() => database.close());

  it("plans a short focus inside the normal 6-8 query budget", () => {
    const plan = planMemoryAwareYouTubeQueries({ researchFocus: "insomnio" });

    expect(plan.originalFocus).toBe("insomnio");
    expect(plan.queries.length).toBeGreaterThanOrEqual(6);
    expect(plan.queries.length).toBeLessThanOrEqual(8);
    expect(plan.budget).toEqual({ targetMin: 6, targetMax: 8, hardMax: 10 });
  });

  it("compacts a long Spanish focus into complementary intents", () => {
    const plan = planMemoryAwareYouTubeQueries({ researchFocus: LONG_FOCUS });

    expect(plan.originalFocus).toBe(LONG_FOCUS);
    expect(plan.queries).toEqual(expect.arrayContaining([
      expect.objectContaining({ strategy: "core" }),
      expect.objectContaining({ strategy: "context" }),
      expect.objectContaining({ strategy: "cause" }),
    ]));
    expect(plan.queries.some((query) => query.query === LONG_FOCUS)).toBe(false);
    expect(plan.queries[0]?.query).toContain("dormir");
    expect(plan.queries[0]?.query).not.toContain("tienen");
    expect(new Set(plan.queries.map((query) => query.query)).size).toBe(plan.queries.length);
  });

  it("uses compatible DOMAIN memory through the existing bounded resolver", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    const result = memory.reinforce(candidate({ projectId: project.id }));
    expect(result.outcome).toBe("CREATED");

    const relevantMemory = resolve(project.id, project.niche, LONG_FOCUS);
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: LONG_FOCUS,
      projectContext: { projectId: project.id, domain: project.niche },
      relevantMemory,
    });
    expect(plan.memoryUsed).toEqual([
      expect.objectContaining({ kind: "DOMAIN_KNOWLEDGE", scope: "DOMAIN" }),
    ]);
    expect(plan.queries.some((query) => query.query.includes("ritual nocturno"))).toBe(true);
  });

  it("does not allow incompatible DOMAIN memory to contaminate the plan", () => {
    const sleep = projects.create({ name: "Sueño", niche: "salud del sueño" });
    const garden = projects.create({ name: "Jardín", niche: "jardinería urbana" });
    memory.reinforce(candidate({
      projectId: garden.id,
      domain: garden.niche,
      semanticIdentity: "dormir plantas riego",
      statement: "Dormir plantas con riego por goteo evita hojas secas",
      value: { queryTerms: ["riego por goteo"] },
    }));

    const relevantMemory = resolve(sleep.id, sleep.niche, LONG_FOCUS);
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: LONG_FOCUS,
      projectContext: { projectId: sleep.id, domain: sleep.niche },
      relevantMemory,
    });
    expect(plan.memoryUsed).toEqual([]);
    expect(plan.queries.every((query) => !query.query.includes("riego"))).toBe(true);
  });

  it("adds a useful SEMANTIC_KNOWLEDGE variant", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    memory.reinforce(candidate({
      projectId: project.id,
      kind: "SEMANTIC_KNOWLEDGE",
      scope: "PROJECT",
      semanticIdentity: "dormir mente acelerada",
      statement: "Dormir se describe también como mente acelerada al acostarse",
      value: { synonyms: ["mente acelerada"] },
    }));
    const relevantMemory = resolve(project.id, project.niche, LONG_FOCUS);
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: LONG_FOCUS,
      projectContext: { projectId: project.id, domain: project.niche },
      relevantMemory,
    });

    expect(plan.memoryUsed).toEqual([expect.objectContaining({ kind: "SEMANTIC_KNOWLEDGE" })]);
    expect(plan.queries.some((query) => /mente acelerada/u.test(query.query))).toBe(true);
  });

  it("reuses eligible GLOBAL RESEARCH_INTELLIGENCE as a search strategy", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    memory.reinforce(candidate({
      projectId: project.id,
      kind: "RESEARCH_INTELLIGENCE",
      scope: "GLOBAL",
      semanticIdentity: "dormir testimonios primera persona",
      statement: "Para dormir, buscar testimonios en primera persona descubre lenguaje natural",
      value: { strategy: "testimonios en primera persona" },
      projectCount: 2,
    }));
    const relevantMemory = resolve(project.id, project.niche, LONG_FOCUS);
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: LONG_FOCUS,
      projectContext: { projectId: project.id, domain: project.niche },
      relevantMemory,
    });

    expect(plan.memoryUsed).toEqual([expect.objectContaining({ kind: "RESEARCH_INTELLIGENCE", scope: "GLOBAL" })]);
    expect(plan.queries.some((query) => query.strategy === "learned_strategy" && query.query.includes("testimonios"))).toBe(true);
  });

  it("records lexical deduplication and never exceeds ten queries", () => {
    const duplicateMemory = learnedMemory({
      kind: "SEMANTIC_KNOWLEDGE",
      scope: "PROJECT",
      projectId: "00000000-0000-4000-8000-000000000001",
      statement: "Insomnio problemas dificultades",
      value: { terms: ["problemas dificultades"] },
    });
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: "insomnio",
      projectContext: { projectId: duplicateMemory.projectId!, domain: "salud del sueño" },
      relevantMemory: Array.from({ length: 20 }, () => duplicateMemory),
    });

    expect(plan.deduplications.length).toBeGreaterThan(0);
    expect(plan.queries.length).toBeLessThanOrEqual(10);
  });

  it.each([
    "dificultades reales: causas, síntomas y consejos",
    "problemas dificultades reales por qué cómo síntomas consejos",
  ])("replenishes after dedup to preserve the six-query minimum: %s", (researchFocus) => {
    const plan = planMemoryAwareYouTubeQueries({ researchFocus });
    expect(plan.queries.length).toBeGreaterThanOrEqual(6);
    expect(plan.queries.length).toBeLessThanOrEqual(8);
  });

  it("does not force filler queries when a focus has no specific subject", () => {
    const plan = planMemoryAwareYouTubeQueries({
      researchFocus: "problemas constantes, causas, errores y consejos que tienen",
    });
    expect(plan.queries).toEqual([
      expect.objectContaining({ strategy: "core", query: "problemas constantes, causas, errores y consejos que tienen" }),
    ]);
  });

  it("does not let a possessive displace the focus subject", () => {
    const plan = planMemoryAwareYouTubeQueries({ researchFocus: "autónomos que cobran tarde sus facturas" });
    expect(plan.queries[0]?.query).toBe("autónomos cobran tarde facturas");
  });

  it("is deterministic for the same focus and memory", () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    const input = {
      researchFocus: LONG_FOCUS,
      projectContext: { projectId, domain: "salud del sueño" },
      relevantMemory: [learnedMemory({ scope: "PROJECT", projectId })],
    };
    const first = compareYouTubeQueryPlans(input);
    expect(first.proposed.memoryUsed).toHaveLength(1);
    expect(first).toEqual(compareYouTubeQueryPlans(input));
  });

  it("keeps shadow telemetry valid for the current executor's longest focus", () => {
    const comparison = compareYouTubeQueryPlans({ researchFocus: "x".repeat(240) });
    expect(Math.max(...comparison.currentQueries.map((query) => query.query.length))).toBeGreaterThan(120);
    expect(Value.Check(YouTubeQueryPlanComparisonSchema, comparison)).toBe(true);
  });

  it("keeps the current executor queries unchanged in shadow mode", async () => {
    const searchVideos = vi.fn(async (_query: string, _pageToken?: string, _maxResults?: number) => ({ items: [] }));
    const client = {
      searchVideos,
      getVideo: vi.fn(),
      listCommentThreads: vi.fn(),
    };
    const shadow = planMemoryAwareYouTubeQueries({ researchFocus: LONG_FOCUS });

    const acquisition = await acquireYouTubeDeepResearchSignals(client, {
      topic: LONG_FOCUS,
      shadowQueryPlan: shadow,
    });
    const executed = searchVideos.mock.calls.map((call) => call[0]);
    const current = deriveYouTubeResearchQueries(LONG_FOCUS).map((query) => query.query);
    expect(executed).toEqual(current);
    expect(executed).not.toEqual(shadow.queries.map((query) => query.query));
    expect(acquisition.metrics.queryPlanComparison).toMatchObject({
      mode: "SHADOW",
      executor: "CURRENT_PLAN",
      proposed: shadow,
    });
  });

  it("performs zero external calls and does not mutate the Dormir Mejor project", () => {
    const project = projects.create({ name: "Dormir Mejor", niche: "salud del sueño" });
    memory.reinforce(candidate({ projectId: project.id }));
    const before = projects.get(project.id);
    const changesBefore = database.connection.prepare("SELECT total_changes() changes").get() as { changes: number };
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const relevantMemory = resolve(project.id, project.niche, LONG_FOCUS);
    planMemoryAwareYouTubeQueries({
      researchFocus: LONG_FOCUS,
      projectContext: { projectId: project.id, domain: project.niche },
      relevantMemory,
    });

    const changesAfter = database.connection.prepare("SELECT total_changes() changes").get() as { changes: number };
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(projects.get(project.id)).toEqual(before);
    expect(changesAfter.changes).toBe(changesBefore.changes);
    fetchSpy.mockRestore();
  });

  function resolve(projectId: string, domain: string, query: string): readonly LearnedMemory[] {
    return new InternalSkillResolver(memory).resolve({
      skillId: "research-intelligence",
      version: 1,
      projectContext: { projectId, domain, query },
    }).retrievedMemory;
  }
});

function candidate(overrides: Partial<LearnedMemoryCandidate> & { projectId: string }): LearnedMemoryCandidate {
  return {
    kind: "DOMAIN_KNOWLEDGE",
    scope: "DOMAIN",
    domain: "salud del sueño",
    semanticIdentity: "dormir ritual nocturno",
    statement: "Dormir mejora cuando existe un ritual nocturno consistente",
    value: { queryTerms: ["ritual nocturno"] },
    observationKey: "query-planner-fixture",
    disposition: "APPROVED",
    reusable: true,
    validated: true,
    strength: "ELIGIBLE",
    sourceClass: "VALIDATED_STRUCTURED",
    supportCount: 4,
    sourceCount: 2,
    authorCount: 4,
    confidence: 0.9,
    provenanceSummary: { summary: "Validated test fixture", sourceKinds: ["finding"] },
    ...overrides,
  };
}

function learnedMemory(overrides: Partial<LearnedMemory> = {}): LearnedMemory {
  return {
    id: "a".repeat(64),
    kind: "SEMANTIC_KNOWLEDGE",
    scope: "GLOBAL",
    projectId: null,
    domain: null,
    canonicalKey: "semantic:query-planner",
    statement: "Dormir con mente acelerada expresa insomnio nocturno",
    value: { synonyms: ["mente acelerada"] },
    status: "ACTIVE",
    supportCount: 4,
    sourceCount: 2,
    authorCount: 4,
    projectCount: 2,
    confidence: 0.9,
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastReinforcedAt: "2026-01-01T00:00:00.000Z",
    reinforcementCount: 1,
    contradictionCount: 0,
    provenanceSummary: { summary: "Validated fixture", sourceKinds: ["finding"] },
    ...overrides,
  };
}

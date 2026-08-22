import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LearnedMemoryKind, LearnedMemoryScope } from "@our-platform/shared";

import { AppDatabase } from "../src/database/database.js";
import { ProjectRepository } from "../src/repositories/project-repository.js";
import {
  LearningMemoryService,
  type LearnedMemoryCandidate,
  type LearnedMemorySourceClass,
} from "../src/services/knowledge/learning-memory-service.js";
import { getInternalSkill } from "../src/services/skills/skill-registry.js";
import { InternalSkillResolver } from "../src/services/skills/skill-resolver.js";

describe("Hallazia internal Skills + persistent learned memory", () => {
  let database: AppDatabase;
  let projects: ProjectRepository;
  let memory: LearningMemoryService;

  beforeEach(() => {
    database = new AppDatabase(":memory:");
    projects = new ProjectRepository(database);
    memory = new LearningMemoryService(database);
  });

  afterEach(() => database.close());

  it("loads research-intelligence by stable id/version and resolves bounded local context", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    for (let index = 0; index < 10; index += 1) {
      expect(memory.reinforce(candidate({
        projectId: project.id,
        kind: "RESEARCH_INTELLIGENCE",
        scope: "GLOBAL",
        semanticIdentity: `triangulacion ${index}`,
        statement: `Triangular evidencia de fuentes diversas ${index}`,
        observationKey: `global-${index}`,
        projectCount: 2,
      })).outcome).toBe("CREATED");
    }
    const definition = getInternalSkill("research-intelligence", 1);
    expect(definition).toMatchObject({ id: "research-intelligence", version: 1, status: "ACTIVE" });
    expect(getInternalSkill("research-intelligence", 2)).toBeUndefined();

    const evidence = Array.from({ length: 70 }, (_, index) => ({
      id: `e-${index}`,
      sourceType: "fixture",
      summary: `Evidence ${index}`,
    }));
    const resolved = new InternalSkillResolver(memory).resolve({
      skillId: "research-intelligence",
      version: 1,
      projectContext: { projectId: project.id, domain: "salud del sueño", query: "evidencia fuentes" },
      evidenceContext: evidence,
    });
    expect(resolved.retrievedMemory).toHaveLength(8);
    expect(resolved.evidenceContext).toHaveLength(60);
    expect(resolved.budget.externalCalls).toBe(0);
    expect(resolved.missingRequiredMemoryKinds).toEqual([]);
  });

  it("persists, reinforces and deduplicates by canonical identity plus observation", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    const first = candidate({ projectId: project.id, observationKey: "run-1" });
    expect(memory.reinforce(first).outcome).toBe("CREATED");
    expect(memory.reinforce({ ...first, observationKey: "run-2", supportCount: 5 }).outcome).toBe("REINFORCED");
    expect(memory.reinforce({ ...first, observationKey: "run-2", supportCount: 99 }).outcome).toBe("UNCHANGED");

    const rows = memory.list({ domain: "salud del sueño" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reinforcementCount: 2, supportCount: 5, status: "ACTIVE" });
    expect(database.connection.prepare("SELECT count(*) count FROM learned_memory_observations").get())
      .toMatchObject({ count: 2 });
  });

  it("does not promote rejected, demo, raw or weak candidates", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    const cases: Array<Partial<LearnedMemoryCandidate>> = [
      { disposition: "REJECTED" },
      { sourceClass: "DEMO" },
      { sourceClass: "RAW_COMMENT" },
      { strength: "WEAK" },
      { reusable: false },
      { validated: false },
    ];
    cases.forEach((overrides, index) => {
      const result = memory.reinforce(candidate({
        projectId: project.id,
        semanticIdentity: `blocked ${index}`,
        observationKey: `blocked-${index}`,
        ...overrides,
      }));
      expect(result.outcome).toBe("REJECTED");
    });
    expect(memory.list()).toEqual([]);
  });

  it("keeps domain memory isolated while global Research Intelligence crosses domains", () => {
    const sleep = projects.create({ name: "Sueño", niche: "salud del sueño" });
    const garden = projects.create({ name: "Jardín", niche: "jardinería urbana" });
    memory.reinforce(candidate({ projectId: sleep.id, observationKey: "sleep-domain" }));
    memory.reinforce(candidate({
      projectId: sleep.id,
      kind: "RESEARCH_INTELLIGENCE",
      scope: "GLOBAL",
      semanticIdentity: "triangular fuentes",
      statement: "Triangular fuentes independientes mejora la auditabilidad de la investigación",
      observationKey: "global-method",
      projectCount: 2,
    }));

    expect(memory.getRelevantKnowledge({
      context: { projectId: garden.id, domain: "jardinería urbana", query: "rutina consistente" },
      kinds: ["DOMAIN_KNOWLEDGE"],
      scope: "PROJECT_AND_DOMAIN",
      limit: 10,
    })).toEqual([]);
    const crossDomain = memory.getRelevantKnowledge({
      context: { projectId: garden.id, domain: "jardinería urbana", query: "triangular fuentes auditabilidad" },
      kinds: ["RESEARCH_INTELLIGENCE"],
      scope: "PROJECT_DOMAIN_GLOBAL",
      limit: 10,
    });
    expect(crossDomain).toHaveLength(1);
    expect(crossDomain[0]).toMatchObject({ scope: "GLOBAL", kind: "RESEARCH_INTELLIGENCE" });
  });

  it("marks supported contradictions without silently overwriting the accepted statement", () => {
    const project = projects.create({ name: "Sueño", niche: "salud del sueño" });
    const first = candidate({ projectId: project.id, observationKey: "run-1" });
    memory.reinforce(first);
    const contradiction = memory.reinforce({
      ...first,
      observationKey: "run-2",
      statement: "Una rutina nocturna consistente no cambia la fricción al dormir",
    });
    expect(contradiction.outcome).toBe("CONTRADICTED");
    if (contradiction.outcome === "CONTRADICTED") {
      expect(contradiction.memory).toMatchObject({
        statement: first.statement,
        status: "CONTRADICTED",
        contradictionCount: 1,
      });
      expect(memory.inspect(contradiction.memory.id)?.observations).toEqual([
        expect.objectContaining({ observationKey: "run-1", contradiction: false }),
        expect.objectContaining({ observationKey: "run-2", contradiction: true }),
      ]);
    }
    expect(memory.getRelevantKnowledge({
      context: { projectId: project.id, domain: "salud del sueño", query: "rutina nocturna" },
      kinds: ["DOMAIN_KNOWLEDGE"],
      scope: "PROJECT_AND_DOMAIN",
      limit: 10,
    })).toEqual([]);
  });

  it("deletes project-owned data while eligible distilled reusable memory survives", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const project = projects.create({ name: "TEMP Memory Delete", niche: "salud del sueño" });
    memory.reinforce(candidate({
      projectId: project.id,
      kind: "SEMANTIC_KNOWLEDGE",
      scope: "PROJECT",
      semanticIdentity: "desvelado insomnio",
      statement: "Desvelado puede expresar dificultad para conciliar el sueño",
      observationKey: "project-memory",
    }));
    memory.reinforce(candidate({ projectId: project.id, observationKey: "domain-memory" }));
    memory.reinforce(candidate({
      projectId: project.id,
      kind: "RESEARCH_INTELLIGENCE",
      scope: "GLOBAL",
      semanticIdentity: "triangulacion recurrente",
      statement: "Triangular hallazgos recurrentes entre proyectos antes de reutilizarlos",
      observationKey: "global-memory",
      projectCount: 2,
    }));
    expect(memory.list()).toHaveLength(3);

    expect(projects.archive(project.id)?.status).toBe("archived");
    expect(projects.deletePermanently(project.id)).toBe(true);

    const survivors = memory.list();
    expect(survivors.map((item) => item.scope).sort()).toEqual(["DOMAIN", "GLOBAL"]);
    expect(database.connection.prepare("SELECT count(*) count FROM learned_memory_observations").get())
      .toMatchObject({ count: 0 });
    expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(database.connection.prepare("PRAGMA integrity_check").get()).toMatchObject({ integrity_check: "ok" });
    memory.checkFtsIntegrity();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

function candidate(overrides: Partial<LearnedMemoryCandidate> & { projectId: string }): LearnedMemoryCandidate {
  return {
    kind: "DOMAIN_KNOWLEDGE" as LearnedMemoryKind,
    scope: "DOMAIN" as LearnedMemoryScope,
    domain: "salud del sueño",
    semanticIdentity: "rutina nocturna consistente",
    statement: "Una rutina nocturna consistente reduce la fricción al dormir",
    value: { strategy: "rutina consistente" },
    observationKey: "fixture-observation",
    disposition: "APPROVED",
    reusable: true,
    validated: true,
    strength: "ELIGIBLE",
    sourceClass: "VALIDATED_STRUCTURED" as LearnedMemorySourceClass,
    supportCount: 3,
    sourceCount: 2,
    authorCount: 3,
    projectCount: 1,
    confidence: 0.8,
    provenanceSummary: { summary: "Fixture local validado", sourceKinds: ["structured_fixture"] },
    ...overrides,
  };
}

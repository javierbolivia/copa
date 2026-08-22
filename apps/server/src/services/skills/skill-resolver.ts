import type { InternalSkillDefinition, LearnedMemory, LearnedMemoryKind } from "@our-platform/shared";

import type { LearningMemoryService } from "../knowledge/learning-memory-service.js";

import { getInternalSkill } from "./skill-registry.js";

export interface SkillProjectContext {
  readonly projectId: string;
  readonly domain: string;
  readonly query: string;
}

export interface SkillEvidenceContext {
  readonly id: string;
  readonly sourceType: string;
  readonly summary: string;
}

export interface ResolvedInternalSkillContext {
  readonly skill: InternalSkillDefinition;
  readonly projectContext: SkillProjectContext;
  readonly retrievedMemory: readonly LearnedMemory[];
  readonly missingRequiredMemoryKinds: readonly LearnedMemoryKind[];
  readonly evidenceContext: readonly SkillEvidenceContext[];
  readonly budget: InternalSkillDefinition["budgetPolicy"];
}

export class InternalSkillResolver {
  constructor(private readonly memory: LearningMemoryService) {}

  resolve(input: {
    readonly skillId: string;
    readonly version?: number;
    readonly projectContext: SkillProjectContext;
    readonly evidenceContext?: readonly SkillEvidenceContext[];
  }): ResolvedInternalSkillContext {
    const skill = getInternalSkill(input.skillId, input.version);
    if (skill === undefined || skill.status !== "ACTIVE") {
      throw new Error(`Internal Skill not found or inactive: ${input.skillId}${input.version === undefined ? "" : `@${input.version}`}`);
    }
    validateContext(skill, input.projectContext);
    const kinds = [...new Set([
      ...skill.memoryPolicy.requiredKinds,
      ...skill.memoryPolicy.optionalKinds,
    ])];
    const limit = Math.min(skill.memoryPolicy.retrievalLimit, skill.budgetPolicy.maxMemoryItems);
    const retrievedMemory = this.memory.getRelevantKnowledge({
      context: input.projectContext,
      kinds,
      scope: skill.memoryPolicy.scopePolicy,
      limit,
    });
    const presentKinds = new Set(retrievedMemory.map((item) => item.kind));
    const missingRequiredMemoryKinds = skill.memoryPolicy.requiredKinds.filter(
      (kind) => !presentKinds.has(kind),
    );
    return {
      skill,
      projectContext: input.projectContext,
      retrievedMemory,
      missingRequiredMemoryKinds,
      evidenceContext: (input.evidenceContext ?? []).slice(0, skill.budgetPolicy.maxEvidenceItems),
      budget: skill.budgetPolicy,
    };
  }
}

function validateContext(skill: InternalSkillDefinition, context: SkillProjectContext): void {
  for (const key of skill.inputContract.requiredContext) {
    if (context[key].trim() === "") throw new Error(`Skill context requires ${key}.`);
  }
}

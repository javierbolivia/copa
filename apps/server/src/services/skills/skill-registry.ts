import { InternalSkillDefinitionSchema, type InternalSkillDefinition } from "@our-platform/shared";
import { Value } from "@sinclair/typebox/value";

import { RESEARCH_INTELLIGENCE_SKILL } from "./research-intelligence.js";

const DEFINITIONS = [RESEARCH_INTELLIGENCE_SKILL] as const;

for (const definition of DEFINITIONS) {
  if (!Value.Check(InternalSkillDefinitionSchema, definition)) {
    throw new Error("Invalid internal Skill definition.");
  }
}

export function getInternalSkill(id: string, version?: number): InternalSkillDefinition | undefined {
  const matches = DEFINITIONS.filter((definition) =>
    definition.id === id && (version === undefined || definition.version === version),
  );
  return matches.sort((a, b) => b.version - a.version)[0];
}

export function listInternalSkills(): readonly InternalSkillDefinition[] {
  return DEFINITIONS;
}

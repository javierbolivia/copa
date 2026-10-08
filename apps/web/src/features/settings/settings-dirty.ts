import type { ProjectSettings } from "@our-platform/shared";

const editableFields = [
  "language",
  "targetMarket",
  "currency",
  "generalNotes",
  "preferredLlmProvider",
  "economyModel",
  "powerfulModel",
  "maxBudget",
  "contentLanguage",
  "knowledgeEnabled",
] as const satisfies readonly (keyof ProjectSettings)[];

export function hasUnsavedProjectSettings(
  current: ProjectSettings | null,
  saved: ProjectSettings | null,
): boolean {
  if (!current || !saved || current.projectId !== saved.projectId) return false;
  return editableFields.some((field) => current[field] !== saved[field]);
}

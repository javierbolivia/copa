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

// These controls render null as an empty string and clear back to null.
// Historical snapshots may store either representation; do not rewrite them.
const nullableTextFields = new Set<keyof ProjectSettings>([
  "targetMarket", "generalNotes", "economyModel", "powerfulModel",
]);

export function hasUnsavedProjectSettings(
  current: ProjectSettings | null,
  saved: ProjectSettings | null,
): boolean {
  if (!current || !saved || current.projectId !== saved.projectId) return false;
  return editableFields.some((field) => nullableTextFields.has(field)
    ? (current[field] ?? "") !== (saved[field] ?? "")
    : current[field] !== saved[field]);
}

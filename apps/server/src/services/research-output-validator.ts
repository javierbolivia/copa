/**
 * STRICT RESEARCH OUTPUT CONTRACT + EVIDENCE GROUNDING.
 *
 * Research is validated deterministically BEFORE a new artifact version may be
 * APPROVED. This validator:
 *   - enforces the complete module contract (summary + subniches + hypotheses +
 *     questions + searchSuggestions + insights, all non-empty and meaningful);
 *   - grounds EVERY evidence reference (hypotheses[] and insights[]) against the
 *     exact Analysis Set / source snapshot used for that generation;
 *   - drops malformed/nonexistent IDs deterministically (no fuzzy UUID repair,
 *     no prefix similarity, no guessing), dedupes, and preserves stable order;
 *   - enforces the provenance invariant: an EVIDENCE_BACKED item must retain at
 *     least one valid evidence ID, otherwise the output is not APPROVAL-eligible;
 *   - AI_INFERENCE items keep their current intended behavior (no fabricated
 *     evidence);
 *   - records a compact validation audit.
 *
 * The validator never rewrites historical artifacts; it only governs NEW
 * generations. New valid output is stamped schemaVersion 2 (strict contract),
 * while historical schemaVersion 1 artifacts remain untouched in the DB.
 */

export const RESEARCH_SCHEMA_VERSION = 2;

export interface ResearchValidationAudit {
  schemaVersion: number;
  totalEvidenceRefs: number;
  resolvedEvidenceRefs: number;
  unresolvedEvidenceRefs: number;
  unresolvedEvidenceIds: string[];
  duplicateEvidenceRefsRemoved: number;
  missingSections: string[];
  emptySections: string[];
  ungroundedEvidenceBackedItems: number;
  ok: boolean;
  errors: string[];
}

export interface ResearchValidationResult {
  output: Record<string, unknown>;
  audit: ResearchValidationAudit;
}

interface SectionSpec { key: string; kind: "strings" | "items" }
const SECTIONS: ReadonlyArray<SectionSpec> = [
  { key: "subniches", kind: "strings" },
  { key: "hypotheses", kind: "items" },
  { key: "questions", kind: "strings" },
  { key: "searchSuggestions", kind: "strings" },
  { key: "insights", kind: "items" },
];
const EVIDENCE_BACKED = "EVIDENCE_BACKED";

interface Resolution {
  cleaned: string[];
  total: number;
  resolved: number;
  unresolved: string[];
  duplicates: number;
}

function resolveEvidenceIds(value: unknown, allowed: ReadonlySet<string>): Resolution {
  const raw = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  const unresolved = new Set<string>();
  let total = 0;
  let resolved = 0;
  let duplicates = 0;
  for (const id of raw) {
    total += 1;
    if (allowed.has(id)) {
      resolved += 1;
      if (seen.has(id)) duplicates += 1;
      else { seen.add(id); cleaned.push(id); }
    } else {
      unresolved.add(id);
    }
  }
  return { cleaned, total, resolved, unresolved: [...unresolved], duplicates };
}

function normalizeItems(raw: unknown, allowed: ReadonlySet<string>, key: string, errors: string[], audit: ResearchValidationAudit): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: Record<string, unknown>[] = [];
  for (const rawItem of raw) {
    if (typeof rawItem !== "object" || rawItem === null || Array.isArray(rawItem)) {
      errors.push(`${key} contains an invalid item`);
      continue;
    }
    const item = rawItem as Record<string, unknown>;
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) errors.push(`${key} contains an item with empty text`);
    const provenance = typeof item.provenance === "string" && item.provenance.trim() ? item.provenance : "AI_INFERENCE";
    const resolution = resolveEvidenceIds(item.evidenceIds, allowed);
    audit.totalEvidenceRefs += resolution.total;
    audit.resolvedEvidenceRefs += resolution.resolved;
    audit.unresolvedEvidenceRefs += resolution.unresolved.length;
    audit.unresolvedEvidenceIds.push(...resolution.unresolved);
    audit.duplicateEvidenceRefsRemoved += resolution.duplicates;
    if (provenance.toUpperCase() === EVIDENCE_BACKED && resolution.cleaned.length === 0) {
      audit.ungroundedEvidenceBackedItems += 1;
      errors.push(`${key} has an EVIDENCE_BACKED item without any valid evidence`);
    }
    cleaned.push({ text, provenance, evidenceIds: resolution.cleaned });
  }
  return cleaned;
}

export function validateResearchOutput(input: unknown, allowedEvidenceIds: string[]): ResearchValidationResult {
  const allowed = new Set(allowedEvidenceIds);
  const errors: string[] = [];
  const missing: string[] = [];
  const empty: string[] = [];
  const audit: ResearchValidationAudit = {
    schemaVersion: RESEARCH_SCHEMA_VERSION,
    totalEvidenceRefs: 0,
    resolvedEvidenceRefs: 0,
    unresolvedEvidenceRefs: 0,
    unresolvedEvidenceIds: [],
    duplicateEvidenceRefsRemoved: 0,
    missingSections: missing,
    emptySections: empty,
    ungroundedEvidenceBackedItems: 0,
    ok: false,
    errors,
  };
  const src = (typeof input === "object" && input !== null && !Array.isArray(input)) ? (input as Record<string, unknown>) : {};
  const out: Record<string, unknown> = { schemaVersion: RESEARCH_SCHEMA_VERSION };
  if (typeof src.additionalInstructionsApplied === "string") out.additionalInstructionsApplied = src.additionalInstructionsApplied;

  if (typeof src.summary === "string" && src.summary.trim()) out.summary = src.summary.trim();
  else { missing.push("summary"); errors.push("summary is missing or empty"); }

  for (const spec of SECTIONS) {
    const raw = src[spec.key];
    if (!Array.isArray(raw)) { missing.push(spec.key); errors.push(`${spec.key} is missing`); continue; }
    if (spec.kind === "strings") {
      const cleaned = raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
      if (cleaned.length === 0) { empty.push(spec.key); errors.push(`${spec.key} has no meaningful strings`); }
      out[spec.key] = cleaned;
    } else {
      const cleaned = normalizeItems(raw, allowed, spec.key, errors, audit);
      if (cleaned.length === 0) { empty.push(spec.key); errors.push(`${spec.key} has no valid items`); }
      out[spec.key] = cleaned;
    }
  }

  audit.unresolvedEvidenceIds = [...new Set(audit.unresolvedEvidenceIds)];
  audit.ok = errors.length === 0;
  out.validationAudit = audit;
  return { output: out, audit };
}

import { describe, expect, it } from "vitest";
import { validateResearchOutput } from "../src/services/research-output-validator.js";

/**
 * STRICT RESEARCH CONTRACT + EVIDENCE GROUNDING — unit tests.
 *
 * The validator is generic: production code contains no niche terms. Fixtures
 * below may use photography/dogs/sales wording only as test data.
 */

const VALID = "e-valid";
const OTHER = "e-other";
const ALLOWED = [VALID];

function complete(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    summary: "Resumen de investigación",
    subniches: ["Un subnicho"],
    hypotheses: [{ text: "Una hipótesis", provenance: "AI_INFERENCE", evidenceIds: [] }],
    questions: ["Una pregunta"],
    searchSuggestions: ["Una búsqueda"],
    insights: [{ text: "Un hallazgo", provenance: "EVIDENCE_BACKED", evidenceIds: [VALID] }],
  };
}

describe("Research output validator", () => {
  it("TEST 1/complete — valid complete output with valid evidence is APPROVAL-eligible", () => {
    const r = validateResearchOutput(complete(), ALLOWED);
    expect(r.audit.ok).toBe(true);
    expect(r.audit.totalEvidenceRefs).toBe(1);
    expect(r.audit.resolvedEvidenceRefs).toBe(1);
    expect(r.audit.unresolvedEvidenceRefs).toBe(0);
    expect(r.output.schemaVersion).toBe(2);
    expect(r.output.summary).toBe("Resumen de investigación");
    expect(r.output.subniches).toEqual(["Un subnicho"]);
    expect(r.output.hypotheses).toHaveLength(1);
    expect(r.output.questions).toEqual(["Una pregunta"]);
    expect(r.output.searchSuggestions).toEqual(["Una búsqueda"]);
    expect(r.output.insights).toEqual([{ text: "Un hallazgo", provenance: "EVIDENCE_BACKED", evidenceIds: [VALID] }]);
  });

  it("TEST 2 — malformed evidence ID (duplicated UUID fragment) is never treated as valid or fuzzy repaired", () => {
    const input = complete();
    input.insights = [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: ["01a010d9-cdb7-76ce-01a010d9-cdb7-76ce-b2d6-0866d0a093df"] }];
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.unresolvedEvidenceRefs).toBe(1);
    expect(r.audit.unresolvedEvidenceIds).toEqual(["01a010d9-cdb7-76ce-01a010d9-cdb7-76ce-b2d6-0866d0a093df"]);
    expect(r.audit.ungroundedEvidenceBackedItems).toBe(1);
    expect(r.audit.ok).toBe(false);
    expect((r.output.insights as Array<{ evidenceIds: string[] }>)[0]!.evidenceIds).toEqual([]);
  });

  it("TEST 3 — syntactically valid UUID not in the exact Analysis Set is unresolved", () => {
    const input = complete();
    input.insights = [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: ["01a010d9-a5ec-71d9-9e61-12dc7d3bfb01"] }];
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.unresolvedEvidenceRefs).toBe(1);
    expect(r.audit.unresolvedEvidenceIds).toEqual(["01a010d9-a5ec-71d9-9e61-12dc7d3bfb01"]);
    expect(r.audit.ok).toBe(false);
  });

  it("TEST 4 — mixed valid + invalid keeps valid, drops invalid, records rejected id, remains eligible", () => {
    const input = complete();
    input.insights = [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: [VALID, "bad-id"] }];
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.resolvedEvidenceRefs).toBe(1);
    expect(r.audit.unresolvedEvidenceRefs).toBe(1);
    expect(r.audit.unresolvedEvidenceIds).toEqual(["bad-id"]);
    expect((r.output.insights as Array<{ evidenceIds: string[] }>)[0]!.evidenceIds).toEqual([VALID]);
    // Evidence-backed item retains valid grounding and output is complete => eligible.
    expect(r.audit.ungroundedEvidenceBackedItems).toBe(0);
    expect(r.audit.ok).toBe(true);
  });

  it("TEST 5 — EVIDENCE_BACKED item with only invalid IDs is NOT approved", () => {
    const input = complete();
    input.insights = [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: ["bad-1", "bad-2"] }];
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.ungroundedEvidenceBackedItems).toBe(1);
    expect(r.audit.ok).toBe(false);
  });

  it("TEST 6 — duplicate IDs are normalized and counted", () => {
    const input = complete();
    input.insights = [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: [VALID, VALID, OTHER] }];
    // OTHER is not allowed => unresolved; VALID duplicated once.
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.duplicateEvidenceRefsRemoved).toBe(1);
    expect((r.output.insights as Array<{ evidenceIds: string[] }>)[0]!.evidenceIds).toEqual([VALID]);
    expect(r.audit.ok).toBe(true);
  });

  it.each(["subniches", "hypotheses", "questions", "searchSuggestions"])(
    "TEST 7-10 — provider omits %s => NOT approved",
    (key) => {
      const input = complete();
      delete (input as Record<string, unknown>)[key];
      const r = validateResearchOutput(input, ALLOWED);
      expect(r.audit.missingSections).toContain(key);
      expect(r.audit.ok).toBe(false);
    },
  );

  it.each(["subniches", "hypotheses", "questions", "searchSuggestions", "insights"])(
    "TEST 11-12 — empty required %s => NOT approved",
    (key) => {
      const input = complete();
      (input as Record<string, unknown>)[key] = [];
      const r = validateResearchOutput(input, ALLOWED);
      expect(r.audit.emptySections).toContain(key);
      expect(r.audit.ok).toBe(false);
    },
  );

  it("TEST 13 — AI_INFERENCE without evidence is preserved and eligible", () => {
    const input = complete();
    input.hypotheses = [{ text: "Hipótesis sin evidencia", provenance: "AI_INFERENCE", evidenceIds: [] }];
    input.insights = [{ text: "Inferencia", provenance: "AI_INFERENCE", evidenceIds: [] }];
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.ungroundedEvidenceBackedItems).toBe(0);
    expect(r.audit.ok).toBe(true);
    expect(r.output.hypotheses).toEqual([{ text: "Hipótesis sin evidencia", provenance: "AI_INFERENCE", evidenceIds: [] }]);
  });

  it("TEST 14 — ID valid elsewhere in DB but NOT in the exact Analysis Set is unresolved", () => {
    const input = complete();
    // OTHER exists in the project DB but is not in the allowed set for this generation.
    input.insights = [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: [OTHER, VALID] }];
    const r = validateResearchOutput(input, ALLOWED);
    expect(r.audit.unresolvedEvidenceRefs).toBe(1);
    expect(r.audit.unresolvedEvidenceIds).toEqual([OTHER]);
    expect((r.output.insights as Array<{ evidenceIds: string[] }>)[0]!.evidenceIds).toEqual([VALID]);
    expect(r.audit.ok).toBe(true);
  });

  it("TEST 16 — multi-niche generic behavior (photography / dogs / sales)", () => {
    const niches = [
      { niche: "fotografía", allowed: ["f-1"], valid: "f-1", invalid: "f-999" },
      { niche: "perros", allowed: ["d-1"], valid: "d-1", invalid: "d-999" },
      { niche: "ventas", allowed: ["s-1"], valid: "s-1", invalid: "s-999" },
    ];
    for (const c of niches) {
      const base = {
        schemaVersion: 1,
        summary: `Resumen ${c.niche}`,
        subniches: [`Subnicho ${c.niche}`],
        hypotheses: [{ text: `Hipótesis ${c.niche}`, provenance: "AI_INFERENCE", evidenceIds: [] }],
        questions: [`Pregunta ${c.niche}`],
        searchSuggestions: [`Búsqueda ${c.niche}`],
        insights: [{ text: `Hallazgo ${c.niche}`, provenance: "EVIDENCE_BACKED", evidenceIds: [c.valid] }],
      };
      const okRun = validateResearchOutput(base, c.allowed);
      expect(okRun.audit.ok).toBe(true);

      const bad = { ...base, insights: [{ text: "x", provenance: "EVIDENCE_BACKED", evidenceIds: [c.invalid] }] };
      const badRun = validateResearchOutput(bad, c.allowed);
      expect(badRun.audit.unresolvedEvidenceIds).toEqual([c.invalid]);
      expect(badRun.audit.ok).toBe(false);
    }
  });
});

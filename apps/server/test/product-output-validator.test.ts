import { describe, expect, it } from "vitest";

import { MODULE_OUTPUT_SCHEMAS } from "../src/services/module-output-schema.js";
import { validateProductOutput } from "../src/services/product-output-validator.js";

function complete(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    proposals: [{
      id: "product-1",
      name: "Guía práctica",
      concept: "Guía estructurada para resolver el problema seleccionado",
      problem: "La tarea resulta difícil de gestionar",
      outcome: "Comprender y manejar mejor la tarea",
      promise: "Una guía estructurada para comprender y manejar mejor la tarea",
      format: "Guía digital con workbook",
      deliverables: ["Guía", "Workbook"],
      modules: ["Diagnóstico", "Plan"],
      checklists: ["Checklist de avance"],
      templates: ["Plantilla de plan"],
      resources: [],
      bonuses: [],
      evidenceIds: [],
      ...overrides,
    }],
    selectedId: "product-1",
  };
}

describe("Product completeness and grounding validator", () => {
  it("rejects missing, blank and placeholder formats", () => {
    const missing = complete();
    delete (missing.proposals as Array<Record<string, unknown>>)[0]!.format;
    expect(validateProductOutput(missing).audit).toMatchObject({ ok: false, missingFields: ["proposals[0].format"] });
    expect(validateProductOutput(complete({ format: "   " })).audit).toMatchObject({ ok: false, emptyFields: ["proposals[0].format"] });
    expect(validateProductOutput(complete({ format: "Sin completar" })).audit).toMatchObject({ ok: false, placeholderFields: ["proposals[0].format"] });
  });

  it("accepts a complete conservative Product and stamps the strict schema version", () => {
    const result = validateProductOutput(complete());
    expect(result.audit).toMatchObject({ ok: true, complete: true, grounded: true, unsupportedClaims: [] });
    expect(result.output.schemaVersion).toBe(2);
  });

  it("requires every DeepSeek/provider Product field in the shared output contract", () => {
    const schema = MODULE_OUTPUT_SCHEMAS.product as { properties: { proposals: { items: { required: string[] } } } };
    expect(schema.properties.proposals.items.required).toEqual(expect.arrayContaining([
      "id", "name", "concept", "problem", "outcome", "promise", "format",
      "deliverables", "modules", "checklists", "templates", "resources", "bonuses", "evidenceIds",
    ]));
  });

  it("rejects unsupported time, efficacy and personalized-service claims", () => {
    const result = validateProductOutput(complete({
      promise: "Transforma el resultado en 30 días con un método probado, basado en la evidencia y apoyo personalizado",
    }));
    expect(result.audit.ok).toBe(false);
    expect(result.audit.unsupportedClaims.map((item) => item.category)).toEqual(expect.arrayContaining([
      "TIME_BOUND_RESULT", "EFFICACY_OR_PROOF", "PERSONALIZED_SERVICE",
    ]));
  });

  it("handles written time commitments and generic operational-feature claims", () => {
    expect(validateProductOutput(complete({ promise: "Resultados en una semana" })).audit.unsupportedClaims)
      .toEqual(expect.arrayContaining([expect.objectContaining({ category: "TIME_BOUND_RESULT" })]));
    expect(validateProductOutput(complete({ promise: "Incluye seguimiento semanal" })).audit.unsupportedClaims)
      .toEqual(expect.arrayContaining([expect.objectContaining({ category: "OPERATIONAL_FEATURE" })]));
  });

  it("does not treat evidence of the problem as support for solution efficacy", () => {
    const result = validateProductOutput(complete({ promise: "Un método probado y basado en la evidencia" }), {
      problemEvidence: [{ quoteText: "Llevo 30 días con este problema y necesito apoyo personalizado" }],
    });
    expect(result.audit.problemEvidenceAuthorizesCommercialClaims).toBe(false);
    expect(result.audit.unsupportedClaims.map((item) => item.category)).toContain("EFFICACY_OR_PROOF");
    expect(result.audit.ok).toBe(false);
  });

  it("allows a restricted attribute only when selected upstream or explicit input authorizes it", () => {
    const promise = "Incluye apoyo personalizado";
    expect(validateProductOutput(complete({ promise }), {
      selectedUpstream: { name: "Programa con apoyo personalizado" },
    }).audit.ok).toBe(true);
    expect(validateProductOutput(complete({ promise }), {
      explicitUserInput: "El producto debe incluir apoyo personalizado",
    }).audit.ok).toBe(true);
  });

  it("does not mistake a negative instruction for authorization", () => {
    const result = validateProductOutput(complete({ promise: "Incluye apoyo personalizado" }), {
      explicitUserInput: "No incluir apoyo personalizado ni coaching",
    });
    expect(result.audit.ok).toBe(false);
    expect(result.audit.unsupportedClaims.map((item) => item.category)).toContain("PERSONALIZED_SERVICE");
  });

  it("rejects invalid selection and unresolved evidence lineage", () => {
    const result = validateProductOutput({ ...complete({ evidenceIds: ["outside"] }), selectedId: "missing" }, {
      allowedEvidenceIds: ["allowed"],
    });
    expect(result.audit).toMatchObject({ ok: false, invalidSelection: true, unresolvedEvidenceIds: ["outside"] });
  });

  it("treats a complete user-authored draft as explicit product input while preserving completeness", () => {
    expect(validateProductOutput(complete({ promise: "Programa garantizado en 4 semanas con coaching" }), {
      userAuthored: true,
    }).audit.ok).toBe(true);
    expect(validateProductOutput(complete({ format: "" }), { userAuthored: true }).audit.ok).toBe(false);
  });
});

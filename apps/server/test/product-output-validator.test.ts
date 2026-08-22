import { describe, expect, it } from "vitest";

import { validateJsonSchema } from "../src/integrations/structured-output.js";
import { MODULE_OUTPUT_SCHEMAS } from "../src/services/module-output-schema.js";
import {
  buildProductGroundingSnapshot,
  buildProductStructuredOutputSchema,
  validateProductOutput,
} from "../src/services/product-output-validator.js";

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
      format: "Guía digital",
      deliverables: ["Guía"],
      modules: ["Diagnóstico", "Plan"],
      checklists: [],
      templates: [],
      resources: [],
      bonuses: [],
      evidenceIds: [],
      ...overrides,
    }],
    selectedId: "product-1",
  };
}

describe("Product completeness and grounding validator", () => {
  it("builds one bounded snapshot from the selected Opportunity and removes lateral evidence IDs", () => {
    const snapshot = buildProductGroundingSnapshot({
      evidence: [{ id: "allowed", quoteText: "Evidencia permitida" }],
      opportunities: {
        selectedId: "selected",
        items: [
          { id: "selected", name: "Guía práctica", evidenceIds: ["allowed", "outside"] },
          { id: "unselected", name: "Comunidad privada", evidenceIds: ["outside"] },
        ],
      },
    });

    expect(snapshot.allowedEvidence).toEqual([{ id: "allowed", quote: "Evidencia permitida" }]);
    expect(snapshot.selectedOpportunity).toMatchObject({ id: "selected", evidenceIds: ["allowed"] });
    expect(JSON.stringify(snapshot.selectedOpportunity)).not.toContain("unselected");
    expect(JSON.stringify(snapshot)).not.toContain("outside");
    expect(snapshot.authorizedCapabilities).not.toContain("COMMUNITY_ACCESS");
  });

  it("uses the snapshot allowlist for both valid and fabricated/cross-snapshot evidence", () => {
    const snapshot = buildProductGroundingSnapshot({
      evidence: [{ id: "allowed", quoteText: "Evidencia permitida" }],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
    });
    expect(validateProductOutput(complete({ evidenceIds: ["allowed"] }), { groundingSnapshot: snapshot }).audit.ok).toBe(true);

    const invalid = validateProductOutput(complete({ evidenceIds: ["fabricated", "stale", "other-project"] }), { groundingSnapshot: snapshot });
    expect(invalid.audit.ok).toBe(false);
    expect(invalid.audit.unresolvedEvidenceIds).toEqual(["fabricated", "other-project", "stale"]);
    expect(invalid.audit.issues.filter((issue) => issue.code === "EVIDENCE_OUTSIDE_SNAPSHOT")).toHaveLength(3);
  });

  it("treats authorizedCapabilities as an allowlist and never promotes market-need evidence", () => {
    const neutral = buildProductGroundingSnapshot({
      evidence: [{ id: "market", quoteText: "Necesito una comunidad y apoyo de otras personas" }],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
    });
    const unauthorized = validateProductOutput(complete({ concept: "Comunidad privada para participantes" }), {
      groundingSnapshot: neutral,
      problemEvidence: [{ quoteText: "Necesito una comunidad" }],
    });
    expect(neutral.authorizedCapabilities).not.toContain("COMMUNITY_ACCESS");
    expect(unauthorized.audit.issues).toContainEqual({
      code: "UNAUTHORIZED_CAPABILITY",
      path: "$.proposals[0].concept",
      category: "COMMUNITY_ACCESS",
    });

    const authorized = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Comunidad privada para participantes" }] },
    });
    expect(authorized.authorizedCapabilities).toContain("COMMUNITY_ACCESS");
    expect(validateProductOutput(complete({ concept: "Comunidad privada para participantes" }), { groundingSnapshot: authorized }).audit.ok).toBe(true);
  });

  it("accepts explicit Product configuration/input authorization and supports zero optional capabilities", () => {
    const noCapabilities = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
    });
    expect(noCapabilities.authorizedCapabilities).toEqual([]);
    expect(validateProductOutput(complete(), { groundingSnapshot: noCapabilities }).audit.ok).toBe(true);
    expect(validateProductOutput(complete({ templates: ["Plantilla de seguimiento"] }), { groundingSnapshot: noCapabilities }).audit.ok).toBe(false);

    for (const input of [
      { productConfiguration: { generalNotes: "El producto incluye comunidad privada" } },
      { explicitUserInput: "El producto debe incluir comunidad privada" },
    ]) {
      const snapshot = buildProductGroundingSnapshot({
        evidence: [],
        opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
        ...input,
      });
      expect(snapshot.authorizedCapabilities).toContain("COMMUNITY_ACCESS");
      expect(validateProductOutput(complete({ concept: "Comunidad privada para participantes" }), { groundingSnapshot: snapshot }).audit.ok).toBe(true);
    }
  });

  it("derives a zero-capability provider contract that keeps base Product structure usable", () => {
    const snapshot = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Curso práctico" }] },
    });
    const schema = buildProductStructuredOutputSchema(snapshot);
    const output = complete({
      format: "Curso digital organizado progresivamente",
      deliverables: ["Contenido principal"],
      modules: ["Comprensión", "Aplicación", "Revisión"],
    });

    expect(snapshot.authorizedCapabilities).toEqual([]);
    expect(validateJsonSchema(schema, output)).toEqual([]);
    expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit.ok).toBe(true);
    expect(schema).toMatchObject({
      "x-hallazia-product-capability-contract": {
        optionalAuthorizedCapabilities: [],
        optionalArrays: {
          templates: { requiredCapability: "TEMPLATES_OR_TOOLS", allowed: false },
          bonuses: { requiredCapability: "BONUS_FEATURE", allowed: false },
        },
      },
    });
  });

  it("closes optional arrays in the provider schema and keeps free-text capability checks fail-closed", () => {
    const snapshot = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Curso práctico" }] },
    });
    const schema = buildProductStructuredOutputSchema(snapshot);

    expect(validateJsonSchema(schema, complete({ templates: ["Plantilla de seguimiento"] })))
      .toContainEqual(expect.objectContaining({ path: "$.proposals[0].templates", expected: "array(maxItems 0)" }));
    expect(validateProductOutput(complete({ resources: ["Herramienta de seguimiento"] }), { groundingSnapshot: snapshot }).audit.issues)
      .toContainEqual(expect.objectContaining({ path: "$.proposals[0].resources", category: "TEMPLATES_OR_TOOLS" }));
    expect(validateProductOutput(complete({ format: "Curso con plantillas y herramientas" }), { groundingSnapshot: snapshot }).audit.issues)
      .toContainEqual(expect.objectContaining({ path: "$.proposals[0].format", category: "TEMPLATES_OR_TOOLS" }));
  });

  it("does not classify support materials or resources as HUMAN_SUPPORT", () => {
    for (const concept of [
      "Curso digital con materiales de apoyo y documentación",
      "Curso digital con recursos de apoyo y material complementario",
    ]) {
      const audit = validateProductOutput(complete({ concept })).audit;
      expect(audit.unsupportedClaims).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ category: "HUMAN_SUPPORT" }),
      ]));
      expect(audit.ok).toBe(true);
    }
  });

  it("continues to classify real human delivery as HUMAN_SUPPORT", () => {
    for (const format of ["Curso con coaching", "Curso con tutoría", "Curso con soporte humano"]) {
      expect(validateProductOutput(complete({ format })).audit.unsupportedClaims).toEqual(expect.arrayContaining([
        expect.objectContaining({ category: "HUMAN_SUPPORT", path: "$.proposals[0].format" }),
      ]));
    }
  });

  it("separates internal module materialization from externally claimed quantities", () => {
    const internal = validateProductOutput(complete({
      modules: [
        "Módulo 1: Comprensión",
        "Módulo 2: Desencadenantes",
        "Módulo 3: Manejo",
        "Módulo 4: Aplicación",
        "Módulo 5: Revisión",
      ],
    }));
    expect(internal.audit.ok).toBe(true);
    expect(internal.audit.unsupportedClaims).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "QUANTIFIED_STRUCTURE" }),
    ]));

    for (const format of ["Programa de 5 módulos", "Curso de 8 semanas"]) {
      expect(validateProductOutput(complete({ format })).audit.unsupportedClaims).toEqual(expect.arrayContaining([
        expect.objectContaining({ category: "QUANTIFIED_STRUCTURE", path: "$.proposals[0].format" }),
      ]));
    }
    expect(validateProductOutput(complete({ promise: "Resultados en 30 días" })).audit.unsupportedClaims)
      .toEqual(expect.arrayContaining([expect.objectContaining({ category: "TIME_BOUND_RESULT" })]));
  });

  it("opens only explicitly authorized capabilities in both provider contract and validator", () => {
    const snapshot = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Curso práctico" }] },
      productConfiguration: { generalNotes: "El producto incluye plantillas y una estructura de 4 módulos" },
    });
    const schema = buildProductStructuredOutputSchema(snapshot);
    const output = complete({
      format: "Curso digital de 4 módulos con plantillas",
      deliverables: ["Contenido principal", "Plantillas"],
      modules: ["Módulo 1", "Módulo 2", "Módulo 3", "Módulo 4"],
      templates: ["Plantilla de seguimiento"],
    });

    expect(snapshot.authorizedCapabilities).toEqual(expect.arrayContaining(["TEMPLATES_OR_TOOLS", "QUANTIFIED_STRUCTURE"]));
    expect(validateJsonSchema(schema, output)).toEqual([]);
    expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit.ok).toBe(true);
    expect(schema).toMatchObject({
      "x-hallazia-product-capability-contract": {
        optionalArrays: { templates: { requiredCapability: "TEMPLATES_OR_TOOLS", allowed: true } },
      },
    });
  });

  it("passes the Product v5 output offline when its two false positives are removed", () => {
    const evidenceIds = [
      "01a028a4-5c1f-759c-8cc4-d8339c2554ec",
      "01a028a4-5c1f-759c-8cc4-d5a5d14680f8",
      "01a028a4-5c26-7172-9aec-5e18896656ee",
      "01a028a5-166a-75da-8e13-b32a0fb0813f",
      "01a028a4-5f7f-70fa-b80f-935d87065b68",
      "01a028a4-5c1f-759c-8cc4-eb4a19f074c0",
    ];
    const snapshot = buildProductGroundingSnapshot({
      evidence: evidenceIds.map((id) => ({ id, quoteText: `Evidencia ${id}` })),
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Curso online para perros reactivos" }] },
    });
    const output = complete({
      id: "curso-online-reactividad-canina",
      name: "Curso online completo para perros reactivos",
      concept: "Un curso online estructurado que guía a los dueños de perros reactivos paso a paso para comprender y manejar la reactividad de sus mascotas, a través de lecciones en video, materiales de apoyo y ejercicios prácticos.",
      problem: "Muchos dueños de perros reactivos no saben cómo abordar el problema: carecen de conocimientos sobre las causas de la reactividad, las técnicas de manejo seguro y cómo educar a su perro sin recurrir a métodos inadecuados. Esto genera estrés, frustración y situaciones peligrosas en los paseos.",
      outcome: "Los participantes obtendrán una comprensión clara de la reactividad canina, aprenderán a manejar situaciones cotidianas con técnicas seguras y efectivas, y podrán comenzar a trabajar en la modificación de conducta con su perro, mejorando la calidad de vida de ambos.",
      promise: "Aprenderás las bases para entender a tu perro reactivo y empezar a aplicar pautas de manejo y educación en tu día a día, con un enfoque práctico y seguro.",
      format: "Curso online con módulos en video, guías descargables, ejercicios prácticos y un plan de acción semanal.",
      deliverables: ["Videos de las lecciones", "Guías descargables en PDF", "Ejercicios prácticos", "Plan de acción semanal"],
      modules: [
        "Modulo 1: Comprendiendo la reactividad canina",
        "Modulo 2: Identificando los desencadenantes",
        "Modulo 3: Técnicas de manejo y seguridad",
        "Modulo 4: Ejercicios de modificación de conducta",
        "Modulo 5: Avanzando en entornos reales",
      ],
      evidenceIds,
    });
    output.selectedId = "curso-online-reactividad-canina";

    expect(snapshot.authorizedCapabilities).toEqual([]);
    expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit).toMatchObject({
      ok: true,
      grounded: true,
      unresolvedEvidenceIds: [],
      unsupportedClaims: [],
    });
  });

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
    const schema = MODULE_OUTPUT_SCHEMAS.product as { properties: { proposals: { minItems: number; items: { required: string[]; properties: { format: { type: string; minLength: number } } } } } };
    expect(schema.properties.proposals.items.required).toEqual(expect.arrayContaining([
      "id", "name", "concept", "problem", "outcome", "promise", "format",
      "deliverables", "modules", "checklists", "templates", "resources", "bonuses", "evidenceIds",
    ]));
    expect(schema.properties.proposals.minItems).toBe(1);
    expect(schema.properties.proposals.items.properties.format).toMatchObject({ type: "string", minLength: 1 });
  });

  it("rejects unsupported time, efficacy and personalized-service claims", () => {
    const result = validateProductOutput(complete({
      promise: "Transforma el resultado en 30 días con un método probado, basado en la evidencia y apoyo personalizado",
    }));
    expect(result.audit.ok).toBe(false);
    expect(result.audit.unsupportedClaims.map((item) => item.category)).toEqual(expect.arrayContaining([
      "TIME_BOUND_RESULT", "EFFICACY_OR_PROOF", "PERSONALIZED_SERVICE",
    ]));
    expect(result.audit.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNSUPPORTED_PROMISE", path: "$.proposals[0].promise" }),
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

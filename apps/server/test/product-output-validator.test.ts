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
    const grounded = validateProductOutput(complete({ evidenceIds: ["allowed"] }), { groundingSnapshot: snapshot });
    expect(grounded.audit.ok).toBe(true);
    expect(grounded.audit.claimPolicy.GROUNDED).toMatchObject({ fields: ["problem", "outcome"], evidenceField: "evidenceIds" });

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
    expect(validateProductOutput(complete({ templates: ["Plantilla de seguimiento"] }), { groundingSnapshot: noCapabilities }).audit)
      .toMatchObject({
        ok: true,
        proposedDesignDecisions: [expect.objectContaining({
          path: "$.proposals[0].templates",
          category: "TEMPLATES_OR_TOOLS",
          classification: "PROPOSED",
        })],
      });

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
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
    });
    const schema = buildProductStructuredOutputSchema(snapshot);
    const output = complete({
      format: "Ebook digital organizado progresivamente",
      deliverables: ["Contenido principal"],
      modules: ["Comprensión", "Aplicación", "Revisión"],
    });

    expect(snapshot.authorizedCapabilities).toEqual([]);
    expect(validateJsonSchema(schema, output)).toEqual([]);
    expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit.ok).toBe(true);
    expect(schema).toMatchObject({
      "x-hallazia-product-capability-contract": {
        explicitAuthorization: {
          mode: "FAIL_CLOSED",
          authorizedCapabilities: [],
          instruction: expect.stringContaining("OMIT"),
          forbiddenCapabilities: expect.arrayContaining([
            "LIFETIME_ACCESS",
            "GUARANTEE_OR_ASSURED_RESULT",
            "TIME_BOUND_RESULT",
            "EFFICACY_OR_PROOF",
            "COACHING_OR_SESSIONS",
            "HUMAN_SUPPORT",
            "COMMUNITY_ACCESS",
            "CERTIFICATION",
            "LIVE_SESSIONS",
          ]),
        },
        optionalArrays: {
          templates: { category: "TEMPLATES_OR_TOOLS", classification: "PROPOSED", allowed: true },
          bonuses: { category: "BONUS_FEATURE", classification: "PROPOSED", allowed: true },
        },
      },
    });
  });

  it("allows lifetime access in the provider contract only after explicit authorization", () => {
    const unauthorizedSnapshot = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Curso práctico" }] },
    });
    const authorizedSnapshot = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Curso práctico" }] },
      productConfiguration: { generalNotes: "El producto incluye acceso de por vida" },
    });
    const unauthorizedSchema = buildProductStructuredOutputSchema(unauthorizedSnapshot);
    const authorizedSchema = buildProductStructuredOutputSchema(authorizedSnapshot);

    expect(unauthorizedSchema).toMatchObject({
      "x-hallazia-product-capability-contract": {
        explicitAuthorization: {
          authorizedCapabilities: [],
          instruction: expect.stringContaining("OMIT"),
          forbiddenCapabilities: expect.arrayContaining(["LIFETIME_ACCESS"]),
        },
        fields: {
          deliverables: { forbiddenExplicitCapabilities: expect.arrayContaining(["LIFETIME_ACCESS"]) },
        },
      },
    });
    expect(authorizedSchema).toMatchObject({
      "x-hallazia-product-capability-contract": {
        explicitAuthorization: {
          authorizedCapabilities: expect.arrayContaining(["LIFETIME_ACCESS"]),
          forbiddenCapabilities: expect.not.arrayContaining(["LIFETIME_ACCESS"]),
        },
        fields: {
          deliverables: {
            explicitAuthorizedCapabilities: expect.arrayContaining(["LIFETIME_ACCESS"]),
            forbiddenExplicitCapabilities: expect.not.arrayContaining(["LIFETIME_ACCESS"]),
          },
        },
      },
    });
    expect(validateProductOutput(complete({ deliverables: ["Acceso de por vida al curso"] }), {
      groundingSnapshot: unauthorizedSnapshot,
    }).audit.ok).toBe(false);
    expect(validateProductOutput(complete({ deliverables: ["Acceso de por vida al curso"] }), {
      groundingSnapshot: authorizedSnapshot,
    }).audit.ok).toBe(true);
  });

  it("allows proposed design arrays in the provider schema without treating them as grounded facts", () => {
    const snapshot = buildProductGroundingSnapshot({
      evidence: [],
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
    });
    const schema = buildProductStructuredOutputSchema(snapshot);

    expect(validateJsonSchema(schema, complete({ templates: ["Plantilla de seguimiento"] }))).toEqual([]);
    for (const [field, output] of [
      ["resources", complete({ resources: ["Workbook de seguimiento"] })],
      ["format", complete({ format: "Ebook con plantillas y herramientas" })],
    ] as const) {
      expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit).toMatchObject({
        ok: true,
        proposedDesignDecisions: [expect.objectContaining({
          path: `$.proposals[0].${field}`,
          category: "TEMPLATES_OR_TOOLS",
          classification: "PROPOSED",
        })],
      });
    }
  });

  describe("golden Product capability matrix", () => {
    it.each([
      { name: "support materials", overrides: { concept: "Curso digital con materiales de apoyo" } },
      { name: "support resources", overrides: { resources: ["Recursos de apoyo"] } },
      { name: "internal ordinal modules", overrides: { modules: ["Módulo 1: Comprensión", "Módulo 2: Aplicación"] } },
      { name: "roadmap offered in a promise", overrides: { promise: "El curso te ofrece una hoja de ruta completa" } },
      { name: "guide offered in a promise", overrides: { promise: "El curso ofrece una guía clara" } },
      { name: "explanation included in a promise", overrides: { promise: "Incluye una explicación paso a paso" } },
      { name: "proposed template", overrides: { templates: ["Plantilla de seguimiento"] } },
      { name: "proposed workbook", overrides: { resources: ["Workbook de práctica"] } },
      { name: "proposed checklist", overrides: { checklists: ["Checklist de preparación"] } },
      { name: "complementary resource", overrides: { resources: ["Recurso complementario"] } },
      { name: "generic modular structure", overrides: { format: "Estructura modular progresiva" } },
      { name: "demonstrations and action plans", overrides: { deliverables: ["Demostraciones grabadas", "Planes de acción"] } },
      { name: "English guide offer", overrides: { promise: "The course offers a clear roadmap" } },
      { name: "English explanation inclusion", overrides: { promise: "Includes a step-by-step explanation" } },
      { name: "English support materials", overrides: { resources: ["Supporting materials and complementary resources"] } },
      { name: "English ordinal modules", overrides: { modules: ["Module 1: Understand", "Module 2: Apply"] } },
    ])("allows $name without inventing a protected capability", ({ overrides }) => {
      const audit = validateProductOutput(complete(overrides)).audit;
      expect(audit.unsupportedClaims).toEqual([]);
      expect(audit.ok).toBe(true);
    });

    it.each([
      { name: "lifetime access", field: "format", claim: "Videolecciones grabadas con acceso de por vida", category: "LIFETIME_ACCESS" },
      { name: "permanent access equivalent", field: "format", claim: "Acceso a los materiales de forma permanente", category: "LIFETIME_ACCESS" },
      { name: "personalized support", field: "promise", claim: "Incluye soporte personalizado", category: "HUMAN_SUPPORT" },
      { name: "human coaching", field: "format", claim: "Curso con coaching humano", category: "COACHING_OR_SESSIONS" },
      { name: "private community", field: "format", claim: "Incluye una comunidad privada", category: "COMMUNITY_ACCESS" },
      { name: "certification", field: "format", claim: "Incluye certificación", category: "CERTIFICATION" },
      { name: "live sessions", field: "format", claim: "Incluye sesiones en vivo", category: "LIVE_SESSIONS" },
      { name: "guarantee", field: "promise", claim: "Garantía sin riesgo", category: "GUARANTEE_OR_ASSURED_RESULT" },
      { name: "assured result", field: "promise", claim: "Resultado garantizado", category: "GUARANTEE_OR_ASSURED_RESULT" },
      { name: "proven method", field: "promise", claim: "Método probado", category: "EFFICACY_OR_PROOF" },
      { name: "scientifically proven method", field: "promise", claim: "Método científicamente probado", category: "EFFICACY_OR_PROOF" },
      { name: "committed result duration", field: "promise", claim: "Resultados en 30 días", category: "TIME_BOUND_RESULT" },
      { name: "committed program duration", field: "format", claim: "Curso de 8 semanas", category: "QUANTIFIED_STRUCTURE" },
      { name: "marketed module quantity", field: "format", claim: "Programa de 5 módulos", category: "QUANTIFIED_STRUCTURE" },
      { name: "ongoing operation", field: "promise", claim: "Incluye seguimiento semanal", category: "OPERATIONAL_FEATURE" },
      { name: "English lifetime access", field: "format", claim: "Includes lifetime access", category: "LIFETIME_ACCESS" },
      { name: "English personalized support", field: "promise", claim: "Includes personalized support", category: "HUMAN_SUPPORT" },
      { name: "English private community", field: "format", claim: "Comes with a private community", category: "COMMUNITY_ACCESS" },
      { name: "English certification", field: "format", claim: "Includes certification", category: "CERTIFICATION" },
      { name: "English live sessions", field: "format", claim: "Includes live sessions", category: "LIVE_SESSIONS" },
      { name: "professional consultations", field: "concept", claim: "Incluye consultas profesionales individuales", category: "COACHING_OR_SESSIONS" },
      { name: "personalized consultation", field: "concept", claim: "Incluye una consulta personalizada", category: "COACHING_OR_SESSIONS" },
      { name: "English consultation", field: "concept", claim: "Includes professional consultations", category: "COACHING_OR_SESSIONS" },
      { name: "English guaranteed result", field: "promise", claim: "Guaranteed results", category: "GUARANTEE_OR_ASSURED_RESULT" },
      { name: "English proven efficacy", field: "promise", claim: "Scientifically proven method", category: "EFFICACY_OR_PROOF" },
      { name: "English committed duration", field: "promise", claim: "Results within 30 days", category: "TIME_BOUND_RESULT" },
      { name: "English program duration", field: "format", claim: "Program of 8 weeks", category: "QUANTIFIED_STRUCTURE" },
      { name: "English ongoing operation", field: "promise", claim: "Includes ongoing feedback", category: "OPERATIONAL_FEATURE" },
    ] as const)("blocks $name without explicit authorization", ({ field, claim, category }) => {
      const audit = validateProductOutput(complete({ [field]: claim })).audit;
      expect(audit.unsupportedClaims).toEqual(expect.arrayContaining([
        expect.objectContaining({ field, category, path: `$.proposals[0].${field}` }),
      ]));
      expect(audit.ok).toBe(false);
    });
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

  it("does not classify a reference guide as a professional consultation", () => {
    const audit = validateProductOutput(complete({
      concept: "Una publicación digital de manejo seguro con guías rápidas de consulta.",
      deliverables: ["Guía rápida de consulta sobre uso de correa y arnés."],
    })).audit;

    expect(audit.unsupportedClaims).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "COACHING_OR_SESSIONS" }),
    ]));
    expect(audit.ok).toBe(true);
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
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Guía práctica" }] },
      productConfiguration: { generalNotes: "El producto incluye plantillas y una estructura de 4 módulos" },
    });
    const schema = buildProductStructuredOutputSchema(snapshot);
    const output = complete({
      format: "Ebook digital de 4 módulos con plantillas",
      deliverables: ["Contenido principal", "Plantillas"],
      modules: ["Módulo 1", "Módulo 2", "Módulo 3", "Módulo 4"],
      templates: ["Plantilla de seguimiento"],
    });

    expect(snapshot.authorizedCapabilities).toEqual(expect.arrayContaining(["TEMPLATES_OR_TOOLS", "QUANTIFIED_STRUCTURE"]));
    expect(validateJsonSchema(schema, output)).toEqual([]);
    expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit.ok).toBe(true);
    expect(schema).toMatchObject({
      "x-hallazia-product-capability-contract": {
        optionalArrays: { templates: { category: "TEMPLATES_OR_TOOLS", classification: "PROPOSED", allowed: true } },
      },
    });
  });

  it("reclassifies the exact Product v4 design while retaining its marketed module quantity", () => {
    const result = validateProductOutput(complete({
      format: "Curso online en video con materiales descargables en PDF, incluyendo guías paso a paso, plantillas de seguimiento y listas de verificación.",
      deliverables: [
        "Acceso a 10 módulos en video",
        "Guías en PDF descargables para cada módulo",
        "Plantilla de diario de observación de conducta",
        "Lista de verificación de seguridad para paseos",
        "Biblioteca de recursos adicionales en línea",
      ],
    }));

    expect(result.audit.unsupportedClaims).toEqual([
      expect.objectContaining({ path: "$.proposals[0].deliverables", category: "QUANTIFIED_STRUCTURE" }),
    ]);
    expect(result.audit.proposedDesignDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.proposals[0].format", category: "TEMPLATES_OR_TOOLS", classification: "PROPOSED" }),
      expect.objectContaining({ path: "$.proposals[0].deliverables", category: "TEMPLATES_OR_TOOLS", classification: "PROPOSED" }),
    ]));
  });

  it("reclassifies the exact Product v6 design while retaining its real lifetime-access violation", () => {
    const format = "Ebook digital con guías en PDF y ejercicios prácticos. Incluye módulos progresivos y planes de acción descargables.";
    const deliverables = [
      "Guía descargable (acceso de por vida)",
      "Guías en PDF descargables por módulo",
      "Ejercicios prácticos con instrucciones paso a paso",
      "Plan de paseo estructurado para evitar situaciones estresantes",
      "Lista de verificación para identificar el tipo de reactividad de tu perro",
      "Plantilla de registro de progreso",
    ];
    const result = validateProductOutput(complete({ format, deliverables }));

    expect(result.audit.unsupportedClaims).toEqual([
      expect.objectContaining({ path: "$.proposals[0].deliverables", category: "LIFETIME_ACCESS" }),
    ]);
    expect(result.audit.proposedDesignDecisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.proposals[0].deliverables", category: "TEMPLATES_OR_TOOLS", classification: "PROPOSED" }),
    ]));
    expect(result.audit.proposedDesignDecisions).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "OPERATIONAL_FEATURE" }),
    ]));
    expect(result.audit).toMatchObject({ ok: false, grounded: false, unresolvedEvidenceIds: [] });

    const withoutLifetimeAccess = validateProductOutput(complete({
      format,
      deliverables: ["Guía principal descargable", ...deliverables.slice(1)],
    }));
    expect(withoutLifetimeAccess.audit).toMatchObject({ ok: true, grounded: true, unsupportedClaims: [] });
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
      opportunities: { selectedId: "selected", items: [{ id: "selected", name: "Ebook digital para perros reactivos" }] },
    });
    const output = complete({
      id: "ebook-reactividad-canina",
      name: "Ebook digital completo para perros reactivos",
      concept: "Un libro digital estructurado que guía a los dueños de perros reactivos paso a paso para comprender y manejar la reactividad de sus mascotas, a través de capítulos claros, materiales de apoyo y ejercicios prácticos.",
      problem: "Muchos dueños de perros reactivos no saben cómo abordar el problema: carecen de conocimientos sobre las causas de la reactividad, las técnicas de manejo seguro y cómo educar a su perro sin recurrir a métodos inadecuados. Esto genera estrés, frustración y situaciones peligrosas en los paseos.",
      outcome: "Los participantes obtendrán una comprensión clara de la reactividad canina, aprenderán a manejar situaciones cotidianas con técnicas seguras y efectivas, y podrán comenzar a trabajar en la modificación de conducta con su perro, mejorando la calidad de vida de ambos.",
      promise: "Aprenderás las bases para entender a tu perro reactivo y empezar a aplicar pautas de manejo y educación en tu día a día, con un enfoque práctico y seguro.",
      format: "Ebook digital en PDF/EPUB con guías descargables, ejercicios prácticos y un plan de acción semanal.",
      deliverables: ["Ebook en PDF y EPUB", "Guías descargables en PDF", "Ejercicios prácticos", "Plan de acción semanal"],
      modules: [
        "Capítulo 1: Comprendiendo la reactividad canina",
        "Capítulo 2: Identificando los desencadenantes",
        "Capítulo 3: Técnicas de manejo y seguridad",
        "Capítulo 4: Ejercicios de modificación de conducta",
        "Capítulo 5: Avanzando en entornos reales",
      ],
      evidenceIds,
    });
    output.selectedId = "ebook-reactividad-canina";

    expect(snapshot.authorizedCapabilities).toEqual([]);
    expect(validateProductOutput(output, { groundingSnapshot: snapshot }).audit).toMatchObject({
      ok: true,
      grounded: true,
      unresolvedEvidenceIds: [],
      unsupportedClaims: [],
    });
  });

  it("reclassifies the exact Product v7 promise without hiding its separate permanent-access violation", () => {
    const promise = "Obtendrás una guía clara, paso a paso, que te permitirá identificar las señales de tu perro y aplicar estrategias de manejo efectivas. El libro te ofrece una hoja de ruta completa para trabajar la reactividad desde casa, sin necesidad de depender únicamente de un profesional.";
    const result = validateProductOutput(complete({
      promise,
      format: "Ebook digital con acceso a los materiales de forma permanente.",
    }));

    expect(result.audit.unsupportedClaims).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.proposals[0].promise", category: "OPERATIONAL_FEATURE" }),
    ]));
    expect(result.audit.unsupportedClaims).toEqual([
      expect.objectContaining({ path: "$.proposals[0].format", category: "LIFETIME_ACCESS" }),
    ]);

    const withoutPermanentAccess = validateProductOutput(complete({
      promise,
      format: "Ebook digital con materiales descargables.",
    }));
    expect(withoutPermanentAccess.audit).toMatchObject({ ok: true, grounded: true, unsupportedClaims: [] });
  });

  it("rejects forbidden product formats like courses, memberships, coaching or communities", () => {
    for (const forbiddenFormat of [
      "Curso online completo",
      "Membresía mensual con acceso a comunidad",
      "Programa de coaching 1 a 1",
      "Masterclass en vivo",
      "Bootcamp intensivo",
    ]) {
      const result = validateProductOutput(complete({ format: forbiddenFormat }));
      expect(result.audit.ok).toBe(false);
      expect(result.audit.invalidFormatFields).toContain("proposals[0].format");
      expect(result.audit.errors).toContain(
        "Product format must be an Ebook or digital publication, not a course, membership, coaching or community",
      );
    }
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

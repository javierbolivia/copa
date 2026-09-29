import { describe, expect, it } from "vitest";
import { isCanonicalModuleOutput, MODULE_OUTPUT_SCHEMAS } from "../src/services/module-output-schema.js";
import { validateJsonSchema } from "../src/integrations/structured-output.js";

describe("Strategy & Product canonical schemas and output contracts", () => {
  describe("isCanonicalModuleOutput", () => {
    it("accepts canonical mechanism and normalizes schemaVersion if string or missing", () => {
      const mechanism = {
        schemaVersion: 1,
        perceivedProblem: "Ladrido excesivo",
        apparentCause: "Falta de liderazgo",
        rootCauseHypothesis: "Sobreestimulación por cruce de umbral",
        mechanism: "Desensibilización sistemática por distancia",
        solutionMechanism: "Control progresivo de umbral",
        differentiation: "Basado en etología sin castigo",
        simpleExplanation: "Aumentar distancia para evitar el detonante",
        detailedExplanation: "Protocolo progresivo por zonas de confort y recompensas de alto valor.",
        provenance: "AI_INFERENCE",
        evidenceIds: ["ev-1"],
      };
      expect(isCanonicalModuleOutput("mechanism", mechanism)).toBe(true);

      // When schemaVersion is string "1"
      const stringVersion = { ...mechanism, schemaVersion: "1" };
      expect(isCanonicalModuleOutput("mechanism", stringVersion)).toBe(true);
      expect((stringVersion as Record<string, unknown>).schemaVersion).toBe(1);

      // When schemaVersion is omitted
      const { schemaVersion, ...omittedVersion } = mechanism;
      expect(isCanonicalModuleOutput("mechanism", omittedVersion)).toBe(true);
      expect((omittedVersion as Record<string, unknown>).schemaVersion).toBe(1);
    });

    it("accepts canonical beliefs and normalizes schemaVersion", () => {
      const beliefs = {
        schemaVersion: 1,
        currentBeliefs: ["Creencia 1"],
        limitingBeliefs: ["Límite 1"],
        bridgeBeliefs: ["Puente 1"],
        requiredBeliefs: ["Necesaria 1"],
        objections: ["Objeción 1"],
        arguments: ["Argumento 1"],
        centralThesis: "Tesis central clara y aplicable.",
      };
      expect(isCanonicalModuleOutput("beliefs", beliefs)).toBe(true);

      const withoutVersion = { ...beliefs, schemaVersion: undefined };
      expect(isCanonicalModuleOutput("beliefs", withoutVersion)).toBe(true);
      expect((withoutVersion as Record<string, unknown>).schemaVersion).toBe(1);
    });

    it("accepts canonical offer with full digital publishing stack", () => {
      const offer = {
        schemaVersion: 1,
        name: "Ebook Perros Reactivos",
        promise: "Paseos tranquilos en 3 fases",
        benefits: ["Claridad", "Seguridad"],
        deliverables: ["Ebook digital", "Checklist"],
        bonuses: ["Guía rápida"],
        cta: "Comprar ahora",
        provenance: "AI_INFERENCE",
        evidenceIds: ["ev-1"],
      };
      expect(isCanonicalModuleOutput("offer", offer)).toBe(true);

      const withoutVersion = { ...offer, schemaVersion: undefined };
      expect(isCanonicalModuleOutput("offer", withoutVersion)).toBe(true);
      expect((withoutVersion as Record<string, unknown>).schemaVersion).toBe(1);
    });
  });

  describe("MODULE_OUTPUT_SCHEMAS compliance via validateJsonSchema", () => {
    it("validates full mechanism schema with optional steps and validationPlan", () => {
      const schema = MODULE_OUTPUT_SCHEMAS.mechanism;
      const richMechanism = {
        schemaVersion: 1,
        perceivedProblem: "El perro ladra descontrolado",
        apparentCause: "Territorialidad",
        rootCauseHypothesis: "Inseguridad y distancia insuficiente",
        mechanism: "Protocolo UMBRAL",
        solutionMechanism: "Identificación de zona segura, marcaje y premio",
        differentiation: "Medición exacta sin aversivos",
        simpleExplanation: "Premia la calma antes de la reacción",
        detailedExplanation: "Fase 1: Mapeo de umbrales. Fase 2: Exposición controlada. Fase 3: Integración en calle.",
        steps: ["Paso 1: Medir distancia", "Paso 2: Marcar y premiar"],
        alternatives: ["Evitación pasiva", "Uso de distractores olfativos"],
        limitations: ["No aplicable en episodios de dolor físico agudo"],
        validationPlan: ["Registro de distancia semanal en tabla de seguimiento"],
        provenance: "AI_INFERENCE",
        evidenceIds: ["ev-1"],
      };
      const issues = validateJsonSchema(schema, richMechanism);
      expect(issues).toHaveLength(0);
    });

    it("validates full offer schema with pricingSuggestion, bonusDetails and funnels", () => {
      const schema = MODULE_OUTPUT_SCHEMAS.offer;
      const richOffer = {
        schemaVersion: 1,
        name: "Método Paseos en Calma",
        promise: "Ruta estructurada para desensibilizar a tu perro reactivo",
        benefits: ["Paseos sin tirones", "Menos estrés diario"],
        deliverables: ["Ebook digital completo (PDF/EPUB)", "Hojas de trabajo prácticas"],
        bonuses: ["Checklist de señales de calma"],
        bonusDetails: [
          { name: "Checklist de señales de calma", description: "Detecta bostezos y giros de cabeza a tiempo." },
        ],
        pricingSuggestion: {
          amount: 27,
          currency: "USD",
          rationale: "Precio balanceado para libro digital con recursos",
          terms: "Pago único",
        },
        guaranteeSuggestion: "14 días de devolución completa",
        orderBump: { name: "Workbook impreso", description: "Versión para imprimir y rellenar" },
        upsell: { name: "Guía de parques concurridos", description: "Protocolos avanzados" },
        downsell: { name: "Checklist esencial", description: "Resumen directo en 2 páginas" },
        cta: "Acceder al Ebook ahora",
        provenance: "AI_INFERENCE",
        disclaimer: "Sin promesas de milagro en 24 horas ni adiestramiento mágico.",
        evidenceIds: ["ev-1"],
      };
      const issues = validateJsonSchema(schema, richOffer);
      expect(issues).toHaveLength(0);
    });

    it("validates offer with pricingSuggestion.amount as null when price is pending", () => {
      const schema = MODULE_OUTPUT_SCHEMAS.offer;
      const offerWithNullPrice = {
        schemaVersion: 1,
        name: "Ebook Pendiente",
        promise: "Transformación clara",
        benefits: ["Beneficio 1"],
        deliverables: ["Ebook digital"],
        bonuses: [],
        pricingSuggestion: {
          amount: null,
          currency: "USD",
        },
        cta: "Unirme a la lista",
        provenance: "AI_INFERENCE",
        evidenceIds: [],
      };
      const issues = validateJsonSchema(schema, offerWithNullPrice);
      expect(issues).toHaveLength(0);
    });
  });
});

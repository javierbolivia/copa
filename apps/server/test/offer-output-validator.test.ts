import { describe, expect, it } from "vitest";
import { validateOfferOutput } from "../src/services/offer-output-validator.js";

const evidence = [{ id: "ev-1" }, { id: "ev-2" }];

describe("Offer output validator", () => {
  const baseValidOffer = {
    name: "Ebook: Perros Reactivos",
    promise: "Avanza hacia paseos tranquilos con una secuencia de desensibilización progresiva.",
    benefits: [
      "Paz mental durante los paseos diarios",
      "Secuencia estructurada sin castigo físico",
      "Criterios de avance medibles",
    ],
    deliverables: [
      "Ebook digital completo (PDF/EPUB)",
      "Workbook de ejercicios prácticos",
      "Checklist de umbrales",
    ],
    bonuses: ["Guía rápida de lenguaje canino"],
    bonusDetails: [
      { name: "Guía rápida de lenguaje canino", description: "Identifica señales de estrés antes del ladrido." },
    ],
    pricingSuggestion: {
      amount: 27,
      currency: "USD",
      rationale: "Precio de libro digital con materiales complementarios",
    },
    guaranteeSuggestion: "14 días de devolución si no se adapta a tu caso",
    orderBump: { name: "Workbook impreso", description: "Hojas de trabajo en PDF imprimibles" },
    upsell: { name: "Guía avanzada de entornos complejos", description: "Estrategias para parques con alta densidad de perros" },
    downsell: { name: "Checklist de emergencia", description: "Pautas de gestión ante encuentros imprevistos" },
    cta: "Comprar el Ebook ahora",
    provenance: "AI_INFERENCE",
    evidenceIds: ["ev-1"],
  };

  it("accepts a complete, rich offer and preserves normalized fields and schemaVersion", () => {
    const result = validateOfferOutput(baseValidOffer, evidence);
    expect(result.audit.ok).toBe(true);
    expect(result.audit.errors).toHaveLength(0);
    expect(result.output.schemaVersion).toBe(1);
    expect(result.output.name).toBe(baseValidOffer.name);
  });

  it("accepts an offer when bonuses is omitted and defaults to empty array", () => {
    const { bonuses, bonusDetails, ...withoutBonuses } = baseValidOffer;
    const result = validateOfferOutput(withoutBonuses, evidence);
    expect(result.audit.ok).toBe(true);
    expect(Array.isArray(result.output.bonuses)).toBe(true);
    expect(result.output.bonuses).toHaveLength(0);
  });

  it.each([null, 0, 19.99, 47])("accepts pricingSuggestion amount %s", (amount) => {
    const patch = {
      pricingSuggestion: { amount, currency: "USD", rationale: "Propuesta de precio" },
    };
    const result = validateOfferOutput({ ...baseValidOffer, ...patch }, evidence);
    expect(result.audit.ok).toBe(true);
  });

  it("rejects negative prices and invalid currency codes", () => {
    const invalidNegative = validateOfferOutput(
      { ...baseValidOffer, pricingSuggestion: { amount: -5, currency: "USD" } },
      evidence,
    );
    expect(invalidNegative.audit.ok).toBe(false);
    expect(invalidNegative.audit.errors.some((e) => e.includes("precio"))).toBe(true);

    const invalidCurrency = validateOfferOutput(
      { ...baseValidOffer, pricingSuggestion: { amount: 27, currency: "dolares" } },
      evidence,
    );
    expect(invalidCurrency.audit.ok).toBe(false);
    expect(invalidCurrency.audit.errors.some((e) => e.includes("moneda"))).toBe(true);
  });

  it("rejects empty deliverables and empty cta", () => {
    expect(validateOfferOutput({ ...baseValidOffer, deliverables: [] }, evidence).audit.ok).toBe(false);
    expect(validateOfferOutput({ ...baseValidOffer, cta: "   " }, evidence).audit.ok).toBe(false);
    expect(validateOfferOutput({ ...baseValidOffer, name: "" }, evidence).audit.ok).toBe(false);
  });

  it("rejects ungrounded evidence references outside snapshot", () => {
    const result = validateOfferOutput({ ...baseValidOffer, evidenceIds: ["ev-unauthorized"] }, evidence);
    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors.some((e) => e.includes("referencias"))).toBe(true);
  });

  it("accepts null complements and string complements", () => {
    const result = validateOfferOutput(
      {
        ...baseValidOffer,
        orderBump: "Workbook impreso",
        upsell: null,
        downsell: null,
      },
      evidence,
    );
    expect(result.audit.ok).toBe(true);
  });
});

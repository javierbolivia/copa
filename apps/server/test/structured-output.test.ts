import { describe, expect, it } from "vitest";

import { parseStructuredJson, validateJsonSchema } from "../src/integrations/structured-output.js";
import { MODULE_OUTPUT_SCHEMAS } from "../src/services/module-output-schema.js";

const completeProduct = (): Record<string, unknown> => ({
  schemaVersion: 1,
  proposals: [{
    id: "product-1",
    name: "Guía práctica",
    concept: "Guía estructurada",
    problem: "Manejo difícil",
    outcome: "Mejor manejo",
    promise: "Una secuencia práctica",
    format: "Guía digital",
    deliverables: ["Guía"],
    modules: ["Plan"],
    checklists: [],
    templates: [],
    resources: [],
    bonuses: [],
    evidenceIds: [],
  }],
  selectedId: "product-1",
});

describe("safe structured-output diagnostics", () => {
  it("requires a channel and Ebook CTA for every newly generated Content piece", () => {
    const complete = { schemaVersion: 1, calendar: [{ day: 1, type: "educational", channel: "Instagram", hook: "Ordena sin agobio", body: "Un paso breve.", cta: "Descubre el Ebook" }], hooks: ["Ordena sin agobio"], channels: ["Instagram"], evidenceIds: [] };
    expect(validateJsonSchema(MODULE_OUTPUT_SCHEMAS.content, complete)).toEqual([]);
    delete (complete.calendar[0] as Record<string, unknown>).cta;
    expect(validateJsonSchema(MODULE_OUTPUT_SCHEMAS.content, complete)).toContainEqual(expect.objectContaining({ path: "$.calendar[0].cta", actual: "missing" }));
  });

  it("accepts an exact complete Product contract", () => {
    expect(validateJsonSchema(MODULE_OUTPUT_SCHEMAS.product, completeProduct())).toEqual([]);
  });

  it("reports a missing nested Product property without exposing values", () => {
    const output = completeProduct();
    delete (output.proposals as Array<Record<string, unknown>>)[0]!.format;

    expect(validateJsonSchema(MODULE_OUTPUT_SCHEMAS.product, output)).toContainEqual({
      path: "$.proposals[0].format",
      expected: "string",
      actual: "missing",
      missingRequiredProperties: ["format"],
    });
  });

  it("reports the expected and actual type for a wrong Product format", () => {
    const output = completeProduct();
    (output.proposals as Array<Record<string, unknown>>)[0]!.format = ["Guía digital"];

    expect(validateJsonSchema(MODULE_OUTPUT_SCHEMAS.product, output)).toContainEqual({
      path: "$.proposals[0].format",
      expected: "string",
      actual: "array(1 items)",
    });
  });

  it("reports an invalid nested array item type", () => {
    const output = completeProduct();
    (output.proposals as Array<Record<string, unknown>>)[0]!.modules = [1];

    expect(validateJsonSchema(MODULE_OUTPUT_SCHEMAS.product, output)).toContainEqual({
      path: "$.proposals[0].modules[0]",
      expected: "string",
      actual: "integer",
    });
  });

  it("preserves the current bounded parser policy for fences and surrounding prose", () => {
    expect(parseStructuredJson("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
    expect(parseStructuredJson("Respuesta:\n{\"ok\":true}\nFin.")).toEqual({ ok: true });
  });
});

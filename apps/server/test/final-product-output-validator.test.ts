import { describe, expect, it } from "vitest";

import { validateFinalProductOutput } from "../src/services/final-product-output-validator.js";

function completeManuscript(chapterCitation = "(R1, R2)", citeSecondReferenceInConclusion = true) {
  const developedText = Array.from({ length: 160 }, (_, index) => `contenido sustantivo ${index + 1}`).join(" ");
  return {
    guide: {
      title: "Guía de prueba",
      introduction: `${developedText} (R1)`,
      chapters: Array.from({ length: 3 }, (_, index) => ({
        title: `Capítulo ${index + 1}`,
        content: `${developedText} ${index === 0 ? chapterCitation : ""}`,
      })),
      conclusion: `${developedText}${citeSecondReferenceInConclusion ? " (R2)" : ""}`,
      references: [
        { id: "R1", title: "Fuente uno", organization: "Editorial de prueba", url: "https://example.invalid/one" },
        { id: "R2", title: "Fuente dos", organization: "Editorial de prueba", url: "https://example.invalid/two" },
      ],
    },
  };
}

describe("final product inline citation audit", () => {
  it("accepts citations that resolve to listed references and reports coverage", () => {
    const result = validateFinalProductOutput(completeManuscript());

    expect(result.audit).toMatchObject({
      ok: true,
      citationCount: 3,
      citedReferenceIds: ["R1", "R2"],
      errors: [],
    });
  });

  it("rejects an inline citation to an unlisted source", () => {
    const result = validateFinalProductOutput(completeManuscript("(R1, R9)"));

    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors).toContain("La cita R9 no corresponde a ninguna referencia del manuscrito.");
  });

  it("rejects listed references that the manuscript never cites", () => {
    const result = validateFinalProductOutput(completeManuscript("(R1)", false));

    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors).toContain("La referencia R2 está listada pero no se cita en el manuscrito.");
  });

  it("rejects citation IDs that do not follow the documented syntax", () => {
    const manuscript = completeManuscript();
    manuscript.guide.references[0]!.id = "source-one";
    const result = validateFinalProductOutput(manuscript);

    expect(result.audit.ok).toBe(false);
    expect(result.audit.errors).toContain("La referencia 1 debe usar un ID de cita como R1 o R2.");
    expect(result.audit.errors).toContain("La cita R1 no corresponde a ninguna referencia del manuscrito.");
  });
});

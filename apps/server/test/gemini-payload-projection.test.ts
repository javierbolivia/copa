import { describe, expect, it } from "vitest";

import { buildGeminiProjection } from "../src/services/gemini-payload-projection.js";

describe("Gemini provider payload projection", () => {
  it("redacts only classified sensitive spans across nested provider fields without mutating canonical input or IDs", () => {
    const canonical = {
      project: { id: "project-1", description: "Contexto con agresión y matar al perro." },
      evidence: [{ id: "evidence-1", sourceId: "source-1", quoteText: "Un maricón dijo hijo de puta." }],
      parentOutputs: { research: { insight: "No quiero sangre ni violencia." } },
      additionalInstructions: "No uses abuso sexual como ejemplo.",
    };
    const original = structuredClone(canonical);

    const projection = buildGeminiProjection(canonical, "Evita joder y conserva los IDs.");

    expect(canonical).toEqual(original);
    expect(projection.payload.evidence[0]).toMatchObject({ id: "evidence-1", sourceId: "source-1" });
    expect(JSON.stringify(projection.payload)).not.toMatch(/maric[oó]n|hijo de puta|sangre|violencia|matar/iu);
    expect(projection.systemInstructions).not.toContain("joder");
    expect(projection.audit).toMatchObject({ schemaVersion: 1, transformedStringCount: expect.any(Number) });
    expect(projection.audit.transformedStringCount).toBeGreaterThan(0);
    expect(projection.audit.transformations.every((item) => item.path.startsWith("payload.") || item.path === "systemInstructions")).toBe(true);
    expect(projection.audit.transformations.every((item) => /^[a-f0-9]{64}$/.test(item.originalFingerprint))).toBe(true);
  });

  it("leaves ordinary provider text byte-for-byte unchanged", () => {
    const payload = { evidence: [{ id: "evidence-safe", quoteText: "Mi perro se distrae durante el paseo." }] };
    const projection = buildGeminiProjection(payload, "Devuelve JSON.");

    expect(projection.payload).toEqual(payload);
    expect(projection.systemInstructions).toBe("Devuelve JSON.");
    expect(projection.audit.transformedStringCount).toBe(0);
  });

  it("projects conjugated bite and injury language in every nested Research-shaped field", () => {
    const canonical = {
      project: { description: "El perro mordió durante el paseo y hubo maltrato." },
      settings: { generalNotes: "Evita que muerda a otras mascotas." },
      researchFocus: "Lesiones causadas por mordidas.",
      parentOutputs: { upstream: { note: "Quedó herido tras el incidente." } },
      evidence: [{ id: "evidence-real-shape", quoteText: "Un perro mordía y dejó una herida." }],
      knowledge: { chunks: [{ content: "La familia habló de una mordida anterior." }] },
      additionalInstructions: "No reconstruyas textos de mordeduras ni daños.",
    };
    const original = structuredClone(canonical);

    const projection = buildGeminiProjection(canonical, "No uses ejemplos de perros que muerden o quedan heridos.");

    expect(canonical).toEqual(original);
    expect(JSON.stringify(projection.payload)).not.toMatch(/\b(?:mord\w*|muerd\w*|herid\w*|maltrat\w*|dañ\w*)\b/iu);
    expect(projection.systemInstructions).not.toMatch(/\b(?:mord\w*|muerd\w*|herid\w*|maltrat\w*|dañ\w*)\b/iu);
    expect(projection.payload.evidence[0]?.id).toBe("evidence-real-shape");
    expect(projection.audit.transformations.map((item) => item.path)).toEqual(expect.arrayContaining([
      "payload.project.description",
      "payload.settings.generalNotes",
      "payload.researchFocus",
      "payload.parentOutputs.upstream.note",
      "payload.evidence[0].quoteText",
      "payload.knowledge.chunks[0].content",
      "payload.additionalInstructions",
      "systemInstructions",
    ]));
  });
});

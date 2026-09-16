import { describe, expect, it } from "vitest";
import { projectEvidenceForProvider } from "../src/services/provider-evidence-projection.js";

describe("provider evidence projection", () => {
  it("keeps stored evidence identifiers and source text intact while replacing only unsafe payload spans", () => {
    const original = [{ id: "e-1", quoteText: "Dijo: hijo de puta y cortadas las dos manos.", sourceId: "s-1" }];
    const projection = projectEvidenceForProvider(original);

    expect(original).toEqual([{ id: "e-1", quoteText: "Dijo: hijo de puta y cortadas las dos manos.", sourceId: "s-1" }]);
    expect(projection.evidence[0]).toMatchObject({ id: "e-1", sourceId: "s-1", quoteText: "Dijo: [contenido sensible omitido para compatibilidad del proveedor] y [contenido sensible omitido para compatibilidad del proveedor]." });
    expect(projection.audit).toEqual({ schemaVersion: 1, transformedSnippetCount: 1, transformations: [{ evidenceId: "e-1", field: "quoteText", kind: "SENSITIVE_SPAN_REDACTED", originalLength: 44, projectedLength: 134 }] });
  });

  it("does not create an audit entry or alter ordinary evidence", () => {
    const original = [{ id: "e-2", quoteText: "El paseo resulta difícil al cruzarse con otros perros." }];
    const projection = projectEvidenceForProvider(original);

    expect(projection.evidence).toEqual(original);
    expect(projection.audit).toEqual({ schemaVersion: 1, transformedSnippetCount: 0, transformations: [] });
  });
});

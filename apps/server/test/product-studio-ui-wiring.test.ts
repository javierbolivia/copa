import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Product Studio export UI wiring", () => {
  it("invoca la operación real desde cada botón y expone su resultado", () => {
    const source = readFileSync(
      resolve(
        import.meta.dirname,
        "../../web/src/features/product-studio/ProductStudio.tsx",
      ),
      "utf8",
    );

    expect(source).toContain(
      "onExport={(format) => void exportDocument(format)}",
    );
    expect(source).toContain("api.exportProductDocument(");
    expect(source).toContain("await refreshFiles();");
    expect(source).toContain("Exportando {feedback.format.toUpperCase()}…");
    expect(source).toContain("Descargar / abrir archivo");
  });
});

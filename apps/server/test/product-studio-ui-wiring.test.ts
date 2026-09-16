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

  it("muestra los documentos stale como históricos y no intenta autosave", () => {
    const source = readFileSync(
      resolve(
        import.meta.dirname,
        "../../web/src/features/product-studio/ProductStudio.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('const readOnly = document.freshness === "stale";');
    expect(source).toContain("Versión histórica en solo lectura");
    expect(source).toContain('className="ps-document-surface" disabled={readOnly}');
    expect(source).toContain('document.freshness === "stale" || !theme');
    expect(source).toContain('restoreLocal && next.freshness !== "stale"');
  });

  it("isolates the initial load and ignores a late response after a project switch", () => {
    const source = readFileSync(
      resolve(
        import.meta.dirname,
        "../../web/src/features/product-studio/ProductStudio.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("let active = true;");
    expect(source).toContain("if (!active) return;");
    expect(source).toContain("active = false;");
    expect(source).toContain("Cargando documentos del proyecto");
    expect(source).toContain("hydrated.current = false;");
  });
});

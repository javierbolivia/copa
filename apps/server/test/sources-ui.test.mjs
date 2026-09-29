import { createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModuleView } from "../../web/src/features/modules/ModuleView.tsx";

describe("Sources initial state",()=>{
  it("does not represent unknown data and credentials as empty or missing",()=>{
    const html=renderToStaticMarkup(createElement(ModuleView,{projectId:"p",moduleKey:"sources",evidenceFocus:null,onOpenEvidence:()=>{},onChanged:()=>{}}));
    expect(html).toContain("Comprobando YouTube");
    expect(html).toContain("Cargando fuentes y comentarios");
    expect(html).not.toContain("YouTube no configurado");
    expect(html).not.toContain("No hay comentarios que coincidan");
  });

  it("uses an in-app destructive confirmation instead of window.confirm",()=>{
    const source=readFileSync(resolve(import.meta.dirname,"../../web/src/features/modules/ModuleView.tsx"),"utf8");
    expect(source).not.toContain("window.confirm");
    expect(source).toContain("sourceDeleteCandidate");
    expect(source).toContain("Se eliminarán");
  expect(source).toContain("sus comentarios y evidencia derivada");
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain("api.comments(projectId,commentFilter())");
    expect(source).not.toContain("loadAllComments");
  });
});

import { createElement } from "react";
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
});

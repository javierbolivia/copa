import {describe,it,expect} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {toLanding,fromLanding} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
import {LandingPreview} from "../../web/src/features/refinement/LandingBuilder.tsx";
import {LandingReactBlock} from "../../web/src/features/refinement/LandingVisualEditor.tsx";
import {applyLandingSectionImage,withStableLandingSectionIds} from "../../web/src/features/refinement/landing-adapter.ts";
const output={title:"Página",footerNote:"Nota propia",sections:[{type:"hero",headline:"Título",subheadline:"Subtítulo",body:"Cuerpo",cta:"Ver detalles",custom:"preserve"},{type:"faq",items:[{q:"¿Qué incluye?",a:"Guía y ejercicios"}]},{type:"offer",headline:"La oferta",body:"Contenido"},{type:"cta",headline:"Cierre",cta:"Ver propuesta"}],custom:"preserve"};
describe("Landing document fidelity",()=>{
  it("roundtrips section order, CTA, subtitle, footer and unknown metadata",()=>{expect(fromLanding(output,toLanding(output))).toEqual(output);});
  it("shows saved FAQ and footer in the preview",()=>{const html=renderToStaticMarkup(React.createElement(LandingPreview,{value:toLanding(output)}));expect(html).toContain("¿Qué incluye?");expect(html).toContain("Nota propia");});
  it("uses the same image URL validation in the visual canvas and exported landing",()=>{
    for(const imageUrl of ["https://", "/\\evil.png"]){
      const section={type:"hero",headline:"Imagen",imageUrl,imageAlt:"Prueba"};
      expect(renderToStaticMarkup(React.createElement(LandingReactBlock,{section}))).not.toContain("<img");
    }
  });
  it("assigns an image only to the selected legacy section after reordering",()=>{
    const legacy=toLanding({title:"Página antigua",sections:[{type:"hero",headline:"Primera"},{type:"hero",headline:"Segunda"}]});
    const normalized=withStableLandingSectionIds(legacy);
    const [first,second]=normalized.sections;
    expect(first.id).toBeTruthy();
    expect(second.id).toBeTruthy();
    expect(first.id).not.toBe(second.id);
    const reordered=[second,first];
    const updated=applyLandingSectionImage(reordered,first.id,"/assets/first.webp","Primera imagen");
    expect(updated[0].imageUrl).toBeUndefined();
    expect(updated[1].imageUrl).toBe("/assets/first.webp");
    expect(updated[1].imageAlt).toBe("Primera imagen");
  });
});

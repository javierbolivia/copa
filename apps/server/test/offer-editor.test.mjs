import {describe,it,expect} from "vitest";
import {toOffer,fromOffer} from "../../web/src/features/refinement/RefinedModuleOutput.tsx";
const output={name:"Curso",promise:"Resultado",benefits:["Beneficio"],deliverables:["Guía"],cta:"Ver plan",pricingSuggestion:{amount:25,currency:"USD",rationale:"Hipótesis de precio",terms:"Un pago",custom:"preserve"},bonuses:["Plantilla"],bonusDetails:[{name:"Plantilla",description:"Descripción que debe sobrevivir"}],guaranteeSuggestion:"Por definir",orderBump:{name:"Extra",description:"Complemento"},upsell:null,downsell:null};
describe("Offer editing persistence",()=>{
  it("restores bonus descriptions and separates rationale from terms",()=>{const value=toOffer(output);expect(value.bonuses[0].description).toBe(output.bonusDetails[0].description);expect(value.pricing.terms).toBe("Un pago");});
  it("allows removing a complementary offer",()=>{expect(fromOffer(output,{...toOffer(output),orderBump:{name:"",description:""}}).orderBump).toBeNull();});
  it("does not silently turn invalid price into an unspecified price",()=>{expect(()=>fromOffer(output,{...toOffer(output),pricing:{...toOffer(output).pricing,amount:"abc"}})).toThrow();});
});

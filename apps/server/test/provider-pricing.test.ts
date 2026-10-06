import { describe, expect, it } from "vitest";

import { estimateTokenCost, ratesForModel } from "../src/services/provider-pricing.js";

describe("estimaciones tarifarias por proveedor y modelo", () => {
  const fallback={inputPerMillion:1.25,outputPerMillion:10};

  it.each([
    ["gemini","gemini-3.5-flash-lite",{inputPerMillion:0.3,outputPerMillion:2.5}],
    ["deepseek","deepseek-flash",{inputPerMillion:0.3,outputPerMillion:1.2}],
    ["groq","qwen/qwen3.8-27b",{inputPerMillion:0.8,outputPerMillion:4}],
    ["openrouter","openrouter/free",{inputPerMillion:0,outputPerMillion:0}],
    ["openrouter","nvidia/example:free",{inputPerMillion:0,outputPerMillion:0}],
  ] as const)("resuelve %s/%s",(provider,model,rates)=>{
    expect(ratesForModel(provider,model,"powerful",fallback)).toEqual(rates);
  });

  it("conserva una estimación útil para rutas personalizadas sin fingir un precio reportado",()=>{
    const rates=ratesForModel("openrouter","vendor/custom-model","economy",{inputPerMillion:0.25,outputPerMillion:2});
    expect(estimateTokenCost(rates,1000,500)).toBe(0.00125);
  });
});

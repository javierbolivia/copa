import { describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "../src/integrations/gemini-provider.js";

describe("GeminiProvider",()=>{
  it("envía contexto estructurado y devuelve JSON sin exponer credenciales",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"schemaVersion":1,"summary":"Patrón","insights":[]}' }]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:8}}),{status:200,headers:{"content-type":"application/json"}}));
    const provider=new GeminiProvider({apiKey:"test-key",fetch:fetchMock as typeof fetch,endpoint:"https://gemini.test/models"});
    const result=await provider.generate<{schemaVersion:number}>({provider:"gemini",model:"gemini-test",systemInstructions:"solo JSON",input:"{}",structuredOutput:{name:"research",jsonSchema:{type:"object"}},maxOutputTokens:100});
    expect(result.output.schemaVersion).toBe(1);expect(result.usage).toMatchObject({inputTokens:12,outputTokens:8,usageKind:"provider_reported"});
    const [url,init]=fetchMock.mock.calls[0] as unknown as [string,RequestInit];expect(url).toContain("gemini-test:generateContent");expect(JSON.stringify(init.body)).toContain("responseJsonSchema");
  });
  it("rechaza salida inválida sin fallback",async()=>{
    const provider=new GeminiProvider({apiKey:"test",fetch:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:"no-json"}]}}]}),{status:200})});
    await expect(provider.generate({provider:"gemini",model:"m",systemInstructions:"x",input:"x",structuredOutput:{name:"x",jsonSchema:{type:"object"}}})).rejects.toMatchObject({code:"schema_mismatch"});
  });
});

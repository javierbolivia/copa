import { describe, expect, it, vi } from "vitest";
import { GeminiProvider, toGeminiResponseSchema } from "../src/integrations/gemini-provider.js";

describe("GeminiProvider",()=>{
  it("envía contexto estructurado y devuelve JSON sin exponer credenciales",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"schemaVersion":1,"summary":"Patrón","insights":[]}' }]}}],usageMetadata:{promptTokenCount:12,candidatesTokenCount:8}}),{status:200,headers:{"content-type":"application/json"}}));
    const provider=new GeminiProvider({apiKey:"test-key",fetch:fetchMock as typeof fetch,endpoint:"https://gemini.test/models"});
    const result=await provider.generate<{schemaVersion:number}>({provider:"gemini",model:"gemini-test",systemInstructions:"solo JSON",input:"{}",structuredOutput:{name:"research",jsonSchema:{type:"object"}},maxOutputTokens:100});
    expect(result.output.schemaVersion).toBe(1);expect(result.usage).toMatchObject({inputTokens:12,outputTokens:8,usageKind:"provider_reported"});
    const [url,init]=fetchMock.mock.calls[0] as unknown as [string,RequestInit];const body=JSON.parse(String(init.body));expect(url).toBe("https://gemini.test/models/gemini-test:generateContent");expect(init.headers).toMatchObject({"x-goog-api-key":"test-key"});expect(body.generationConfig).toMatchObject({responseMimeType:"application/json",responseSchema:{type:"OBJECT"}});expect(JSON.stringify(body)).not.toContain("responseJsonSchema");
  });
  it("rechaza salida inválida sin fallback",async()=>{
    const provider=new GeminiProvider({apiKey:"test",fetch:async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:"no-json"}]}}]}),{status:200})});
    await expect(provider.generate({provider:"gemini",model:"m",systemInstructions:"x",input:"x",structuredOutput:{name:"x",jsonSchema:{type:"object"}}})).rejects.toMatchObject({code:"schema_mismatch"});
  });
  it("traduce el 400 INVALID_ARGUMENT de schema a un error útil sin exponer la clave",async()=>{
    const fetchMock=vi.fn(async()=>new Response(JSON.stringify({error:{code:400,status:"INVALID_ARGUMENT",message:'Unknown name "responseJsonSchema" at generationConfig. key=AIzaSecretShouldNotAppear'}}),{status:400,headers:{"content-type":"application/json"}}));
    const provider=new GeminiProvider({apiKey:"test-key",fetch:fetchMock as typeof fetch});
    await expect(provider.generate({provider:"gemini",model:"gemini-2.5-flash-lite",systemInstructions:"x",input:"x",structuredOutput:{name:"x",jsonSchema:{type:"object",additionalProperties:true}}})).rejects.toMatchObject({code:"http_error",status:400,message:'Gemini INVALID_ARGUMENT: Unknown name "responseJsonSchema" at generationConfig. key=[redacted]'});
    expect(toGeminiResponseSchema({type:"object",additionalProperties:true,properties:{id:{type:"string"}}})).toEqual({type:"OBJECT",properties:{id:{type:"STRING"}}});
  });
});

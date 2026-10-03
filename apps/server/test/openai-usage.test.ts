import {describe,expect,it,vi} from "vitest";
import {OpenAIProvider} from "../src/integrations/openai-provider.js";

const request={provider:"openai",model:"test",systemInstructions:"Test",input:"Synthetic",structuredOutput:{name:"test",jsonSchema:{type:"object",properties:{answer:{type:"string"}},required:["answer"]}}};
const response=(output:unknown,usage?:Record<string,unknown>)=>new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(output)}]}],...(usage?{usage}:{})}),{status:200});
describe("OpenAI physical request usage",()=>{
  it("includes the discarded response and cached tokens in the repaired total",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(response({}, {input_tokens:100,output_tokens:20,input_tokens_details:{cached_tokens:40}})).mockResolvedValueOnce(response({answer:"ok"},{input_tokens:200,output_tokens:30,input_tokens_details:{cached_tokens:60}}));
    const result=await new OpenAIProvider({apiKey:"fake",fetch}).generate(request);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.usage).toMatchObject({inputTokens:300,outputTokens:50,cachedTokens:100,usageKind:"provider_reported"});
    expect(result.structuredOutputDiagnostics?.physicalRequests).toHaveLength(2);
  });
  it("retains known consumption when the repair also fails",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(response({}, {input_tokens:100,output_tokens:20})).mockRejectedValueOnce(new Error("offline transport"));
    await expect(new OpenAIProvider({apiKey:"fake",fetch}).generate(request)).rejects.toMatchObject({code:"network_error",physicalRequests:[{attempt:1,inputTokens:100,outputTokens:20,usageKind:"provider_reported"},{attempt:2,usageKind:"unknown"}]});
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not label partly unknown usage as fully provider reported",async()=>{
    const fetch=vi.fn().mockResolvedValueOnce(response({})).mockResolvedValueOnce(response({answer:"ok"},{input_tokens:200,output_tokens:30}));
    expect((await new OpenAIProvider({apiKey:"fake",fetch}).generate(request)).usage).toMatchObject({inputTokens:200,outputTokens:30,usageKind:"estimated"});
  });
  it("honors single-request mode while preserving the rejected response usage",async()=>{
    const fetch=vi.fn().mockResolvedValue(response({}, {input_tokens:100,output_tokens:20}));
    await expect(new OpenAIProvider({apiKey:"fake",fetch}).generate({...request,structuredOutput:{...request.structuredOutput,retryOnInvalidSchema:false}})).rejects.toMatchObject({code:"schema_mismatch",physicalRequests:[{attempt:1,inputTokens:100,outputTokens:20,usageKind:"provider_reported"}]});
    expect(fetch).toHaveBeenCalledOnce();
  });
});

import type { LlmGenerateRequest, LlmGenerateResult, LlmProvider } from "@our-platform/shared";
import { IntegrationError, httpIntegrationError, normalizeFetchError, readErrorType } from "./integration-error.js";

export interface GeminiProviderOptions { readonly apiKey?:string; readonly fetch?:typeof fetch; readonly timeoutMs?:number; readonly endpoint?:string; }
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined;

export class GeminiProvider implements LlmProvider {
  readonly name="gemini";private readonly apiKey:string|undefined;private readonly fetchFn:typeof fetch;private readonly timeoutMs:number;private readonly endpoint:string;
  constructor(options:GeminiProviderOptions={}){this.apiKey=options.apiKey;this.fetchFn=options.fetch??globalThis.fetch;this.timeoutMs=options.timeoutMs??60_000;this.endpoint=options.endpoint??"https://generativelanguage.googleapis.com/v1beta/models";}
  get configured():boolean{return typeof this.apiKey==="string"&&this.apiKey.trim().length>0;}
  async generate<TOutput=string>(request:LlmGenerateRequest):Promise<LlmGenerateResult<TOutput>>{
    if(!this.configured)throw new IntegrationError("missing_api_key","Gemini no está configurado.");
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    let response:Response;try{response=await this.fetchFn(`${this.endpoint}/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(this.apiKey!)}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:request.systemInstructions}]},contents:[{role:"user",parts:[{text:request.input}]}],generationConfig:{...(request.maxOutputTokens===undefined?{}:{maxOutputTokens:request.maxOutputTokens}),...(request.structuredOutput?{responseMimeType:"application/json",responseJsonSchema:request.structuredOutput.jsonSchema}:{})}}),signal:controller.signal});}catch(error){throw normalizeFetchError(error,"Gemini");}finally{clearTimeout(timer);}
    if(!response.ok)throw httpIntegrationError("Gemini",response.status,await readErrorType(response));
    let body:Record<string,unknown>;try{body=await response.json() as Record<string,unknown>;}catch(error){throw new IntegrationError("invalid_response","Gemini devolvió una respuesta que no es JSON.",{cause:error});}
    const candidates=body.candidates;if(!Array.isArray(candidates)||!candidates[0]||typeof candidates[0]!=="object")throw new IntegrationError("invalid_response","Gemini no devolvió candidatos.");
    const parts=(candidates[0] as {content?:{parts?:Array<{text?:unknown}>}}).content?.parts;const text=Array.isArray(parts)?parts.map(part=>typeof part.text==="string"?part.text:"").join("\n"):"";
    if(!text.trim())throw new IntegrationError("invalid_response","Gemini no devolvió texto.");
    let output:unknown=text;if(request.structuredOutput){try{output=JSON.parse(text);}catch(error){throw new IntegrationError("schema_mismatch","La salida estructurada de Gemini no contiene JSON válido.",{cause:error});}}
    const usage=body.usageMetadata as {promptTokenCount?:unknown;candidatesTokenCount?:unknown}|undefined,inputTokens=number(usage?.promptTokenCount),outputTokens=number(usage?.candidatesTokenCount);
    return {provider:this.name,requestedModel:request.model,reportedModel:request.model,output:output as TOutput,usage:{...(inputTokens===undefined?{}:{inputTokens}),...(outputTokens===undefined?{}:{outputTokens}),usageKind:usage?"provider_reported":"unknown"}};
  }
}

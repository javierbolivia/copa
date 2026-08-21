/** Parse the small set of structured-output envelopes accepted from LLMs. */
export function parseStructuredJson(text:string):unknown|undefined {
  const trimmed=text.trim();
  const candidates=[trimmed];
  const fenced=trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu)?.[1]?.trim();
  if(fenced)candidates.push(fenced);
  const firstBrace=trimmed.indexOf("{");
  const lastBrace=trimmed.lastIndexOf("}");
  if(firstBrace>=0&&lastBrace>firstBrace)candidates.push(trimmed.slice(firstBrace,lastBrace+1));
  for(const candidate of new Set(candidates)){
    try{return JSON.parse(candidate) as unknown;}
    catch{/* Try the next bounded envelope; never repair or invent fields. */}
  }
  return undefined;
}

/** Validate the JSON Schema subset used by module contracts. */
export function matchesJsonSchema(schema:Readonly<Record<string,unknown>>,value:unknown):boolean {
  if(Array.isArray(schema.enum)&&!schema.enum.some(item=>Object.is(item,value)))return false;
  if("const" in schema&&!Object.is(schema.const,value))return false;
  const type=schema.type;
  if(Array.isArray(type))return type.some(candidate=>matchesJsonSchema({...schema,type:candidate},value));
  if(type==="null")return value===null;
  if(type==="string")return typeof value==="string"&&(typeof schema.minLength!=="number"||value.length>=schema.minLength)&&(typeof schema.maxLength!=="number"||value.length<=schema.maxLength);
  if(type==="boolean")return typeof value==="boolean";
  if(type==="number")return typeof value==="number"&&Number.isFinite(value)&&(typeof schema.minimum!=="number"||value>=schema.minimum)&&(typeof schema.maximum!=="number"||value<=schema.maximum);
  if(type==="integer")return typeof value==="number"&&Number.isInteger(value)&&(typeof schema.minimum!=="number"||value>=schema.minimum)&&(typeof schema.maximum!=="number"||value<=schema.maximum);
  if(type==="array")return Array.isArray(value)&&(typeof schema.minItems!=="number"||value.length>=schema.minItems)&&(typeof schema.maxItems!=="number"||value.length<=schema.maxItems)&&value.every(item=>matchesJsonSchema((schema.items??{}) as Readonly<Record<string,unknown>>,item));
  if(type==="object"||schema.properties){
    if(typeof value!=="object"||value===null||Array.isArray(value))return false;
    const record=value as Record<string,unknown>,properties=(schema.properties??{}) as Record<string,Readonly<Record<string,unknown>>>;
    if(Array.isArray(schema.required)&&schema.required.some(key=>typeof key==="string"&&!(key in record)))return false;
    if(schema.additionalProperties===false&&Object.keys(record).some(key=>!(key in properties)))return false;
    return Object.entries(properties).every(([key,child])=>!(key in record)||matchesJsonSchema(child,record[key]));
  }
  return true;
}

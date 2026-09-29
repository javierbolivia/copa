/** Parse the small set of structured-output envelopes accepted from LLMs. */
export function parseStructuredJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  // Strip reasoning/thinking tags (e.g. <think>...</think>) emitted by reasoning LLMs
  const stripped = trimmed.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const candidates: string[] = [trimmed, stripped];

  // Extract all fenced code blocks (```json ... ``` or ``` ... ```)
  for (const source of [stripped, trimmed]) {
    for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
      if (match[1]?.trim()) candidates.push(match[1].trim());
    }
  }

  // Find outermost object/array bounds in stripped and trimmed text
  for (const source of [stripped, trimmed]) {
    const firstBrace = source.indexOf("{");
    const lastBrace = source.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidates.push(source.slice(firstBrace, lastBrace + 1));
    }
    const firstBracket = source.indexOf("[");
    const lastBracket = source.lastIndexOf("]");
    if (firstBracket >= 0 && lastBracket > firstBracket) {
      candidates.push(source.slice(firstBracket, lastBracket + 1));
    }
  }

  for (const candidate of new Set(candidates)) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      /* Try the next bounded envelope; never repair or invent fields. */
    }
  }
  return undefined;
}

export interface JsonSchemaValidationIssue {
  readonly path: string;
  readonly expected: string;
  readonly actual: string;
  readonly missingRequiredProperties?: readonly string[];
}

const valueType = (value: unknown): string => {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length} items)`;
  if (typeof value === "string") return `string(${value.length} chars)`;
  if (typeof value === "number" && Number.isInteger(value)) return "integer";
  return typeof value;
};

const expectedType = (schema: Readonly<Record<string, unknown>>): string => {
  if (Array.isArray(schema.type)) return schema.type.filter((item): item is string => typeof item === "string").join(" | ") || "schema value";
  if (typeof schema.type === "string") return schema.type;
  if (Array.isArray(schema.enum)) return `one of ${schema.enum.length} enum values`;
  if ("const" in schema) return "the declared constant";
  if (schema.properties) return "object";
  return "schema value";
};

const childPath = (path: string, key: string): string => /^[A-Za-z_$][\w$]*$/u.test(key)
  ? `${path}.${key}`
  : `${path}[${JSON.stringify(key)}]`;

/**
 * Validate the JSON Schema subset used by module contracts and return only
 * structural metadata. Values are deliberately excluded from diagnostics.
 */
export function validateJsonSchema(
  schema: Readonly<Record<string, unknown>>,
  value: unknown,
  path = "$",
): JsonSchemaValidationIssue[] {
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    return [{ path, expected: `one of ${schema.enum.length} enum values`, actual: valueType(value) }];
  }
  if ("const" in schema && !Object.is(schema.const, value)) {
    return [{ path, expected: "the declared constant", actual: valueType(value) }];
  }
  const type = schema.type;
  if (Array.isArray(type)) {
    const candidates = type.filter((item): item is string => typeof item === "string");
    if (candidates.some((candidate) => validateJsonSchema({ ...schema, type: candidate }, value, path).length === 0)) return [];
    return [{ path, expected: candidates.join(" | ") || "schema value", actual: valueType(value) }];
  }
  if (type === "null") return value === null ? [] : [{ path, expected: "null", actual: valueType(value) }];
  if (type === "string") {
    if (typeof value !== "string") return [{ path, expected: "string", actual: valueType(value) }];
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return [{ path, expected: `string(minLength ${schema.minLength})`, actual: valueType(value) }];
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return [{ path, expected: `string(maxLength ${schema.maxLength})`, actual: valueType(value) }];
    return [];
  }
  if (type === "boolean") return typeof value === "boolean" ? [] : [{ path, expected: "boolean", actual: valueType(value) }];
  if (type === "number" || type === "integer") {
    const valid = typeof value === "number" && Number.isFinite(value) && (type !== "integer" || Number.isInteger(value));
    if (!valid) return [{ path, expected: type, actual: valueType(value) }];
    if (typeof schema.minimum === "number" && value < schema.minimum) return [{ path, expected: `${type}(minimum ${schema.minimum})`, actual: valueType(value) }];
    if (typeof schema.maximum === "number" && value > schema.maximum) return [{ path, expected: `${type}(maximum ${schema.maximum})`, actual: valueType(value) }];
    return [];
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [{ path, expected: "array", actual: valueType(value) }];
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return [{ path, expected: `array(minItems ${schema.minItems})`, actual: valueType(value) }];
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return [{ path, expected: `array(maxItems ${schema.maxItems})`, actual: valueType(value) }];
    const itemSchema = (schema.items ?? {}) as Readonly<Record<string, unknown>>;
    return value.flatMap((item, index) => validateJsonSchema(itemSchema, item, `${path}[${index}]`));
  }
  if (type === "object" || schema.properties) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [{ path, expected: "object", actual: valueType(value) }];
    const record = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, Readonly<Record<string, unknown>>>;
    const missing = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === "string" && !(key in record))
      : [];
    const issues: JsonSchemaValidationIssue[] = missing.map((key) => ({
      path: childPath(path, key),
      expected: expectedType(properties[key] ?? {}),
      actual: "missing",
      missingRequiredProperties: [key],
    }));
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record).filter((item) => !(item in properties))) {
        issues.push({ path: childPath(path, key), expected: "no additional property", actual: valueType(record[key]) });
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in record) issues.push(...validateJsonSchema(child, record[key], childPath(path, key)));
    }
    return issues;
  }
  return [];
}

/** Validate the JSON Schema subset used by module contracts. */
export function matchesJsonSchema(schema:Readonly<Record<string,unknown>>,value:unknown):boolean {
  return validateJsonSchema(schema, value).length === 0;
}

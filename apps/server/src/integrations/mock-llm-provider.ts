import type {
  LlmGenerateRequest,
  LlmGenerateResult,
  LlmProvider,
} from "@our-platform/shared";
import { IntegrationError } from "./integration-error.js";

export type MockFixture = unknown | ((request: LlmGenerateRequest) => unknown | Promise<unknown>);

export interface MockLlmProviderOptions {
  readonly fixtures?: Readonly<Record<string, MockFixture>>;
  readonly strictFixtures?: boolean;
  readonly latencyMs?: number;
}

function sampleFromSchema(schema: Readonly<Record<string, unknown>>, label = "resultado"): unknown {
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if ("default" in schema) return schema.default;

  const type = schema.type;
  if (type === "object" || (type === undefined && typeof schema.properties === "object")) {
    const properties = (schema.properties ?? {}) as Record<string, Readonly<Record<string, unknown>>>;
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === "string") : Object.keys(properties));
    return Object.fromEntries(Object.entries(properties)
      .filter(([key]) => required.has(key))
      .map(([key, property]) => [key, sampleFromSchema(property, key)]));
  }
  if (type === "array") {
    const count = Math.max(typeof schema.minItems === "number" ? schema.minItems : 0, 1);
    const itemSchema = (schema.items ?? { type: "string" }) as Readonly<Record<string, unknown>>;
    return Array.from({ length: count }, () => sampleFromSchema(itemSchema, label));
  }
  if (type === "integer" || type === "number") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (type === "boolean") return false;
  if (Array.isArray(type)) {
    const selected = type.find((candidate) => candidate !== "null");
    return sampleFromSchema({ ...schema, type: selected }, label);
  }
  return `DEMO: ${label}`;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

export class MockLLMProvider implements LlmProvider {
  readonly name = "mock";
  private readonly fixtures: Readonly<Record<string, MockFixture>>;
  private readonly strictFixtures: boolean;
  private readonly latencyMs: number;

  constructor(options: MockLlmProviderOptions = {}) {
    this.fixtures = options.fixtures ?? {};
    this.strictFixtures = options.strictFixtures ?? false;
    this.latencyMs = options.latencyMs ?? 0;
  }

  async generate<TOutput = string>(request: LlmGenerateRequest): Promise<LlmGenerateResult<TOutput>> {
    if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    const fixtureKey = request.structuredOutput?.name ?? "text";
    const fixture = this.fixtures[fixtureKey];
    if (fixture === undefined && this.strictFixtures) {
      throw new IntegrationError("fixture_missing", `No existe un fixture mock para ${fixtureKey}.`);
    }

    let output: unknown;
    if (typeof fixture === "function") output = await fixture(request);
    else if (fixture !== undefined) output = structuredClone(fixture);
    else if (request.structuredOutput) output = sampleFromSchema(request.structuredOutput.jsonSchema, fixtureKey);
    else output = `DEMO: ${request.input}`;

    const serializedOutput = typeof output === "string" ? output : JSON.stringify(output);
    return {
      provider: this.name,
      requestedModel: request.model,
      reportedModel: `mock:${request.model}`,
      output: output as TOutput,
      usage: {
        inputTokens: estimateTokens(`${request.systemInstructions}\n${request.input}`),
        outputTokens: estimateTokens(serializedOutput),
        estimatedCost: 0,
        currency: "USD",
        usageKind: "estimated",
      },
      finishReason: "stop",
    };
  }
}

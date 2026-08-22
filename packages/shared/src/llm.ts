export type LlmProviderName = string;

export interface LlmStructuredOutput {
  readonly name: string;
  readonly jsonSchema: Readonly<Record<string, unknown>>;
  /** Disable the provider's schema-correction retry for explicitly single-attempt flows. */
  readonly retryOnInvalidSchema?: boolean;
}

export interface LlmGenerateRequest {
  readonly provider: LlmProviderName;
  readonly model: string;
  readonly systemInstructions: string;
  readonly input: string;
  readonly structuredOutput?: LlmStructuredOutput;
  readonly maxOutputTokens?: number;
}

export interface LlmUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cachedTokens?: number;
  readonly estimatedCost?: number;
  readonly currency?: string;
  readonly usageKind: "provider_reported" | "estimated" | "unknown";
}

export interface LlmGenerateResult<TOutput = string> {
  readonly provider: LlmProviderName;
  readonly requestedModel: string;
  readonly reportedModel?: string;
  readonly output: TOutput;
  readonly usage: LlmUsage;
  readonly finishReason?: string;
  readonly structuredOutputDiagnostics?: {
    readonly attemptCount: number;
    readonly recoveredAfterInvalidSchema: boolean;
    readonly firstAttemptIssues?: readonly {
      readonly path: string;
      readonly expected: string;
      readonly actual: string;
      readonly missingRequiredProperties?: readonly string[];
    }[];
  };
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  generate<TOutput = string>(
    request: LlmGenerateRequest,
  ): Promise<LlmGenerateResult<TOutput>>;
}

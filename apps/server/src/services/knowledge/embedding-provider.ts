export type EmbeddingBatchResult =
  | {
      readonly status: "ready";
      readonly provider: string;
      readonly dimensions: number;
      readonly vectors: readonly (readonly number[])[];
    }
  | {
      readonly status: "disabled";
      readonly provider: string;
      readonly reason: string;
    };

export interface EmbeddingProvider {
  readonly name: string;
  readonly available: boolean;
  embed(inputs: readonly string[]): Promise<EmbeddingBatchResult>;
}

/**
 * Explicit no-op provider used by the lexical-only installation. Returning a
 * discriminated state avoids treating empty arrays as valid embeddings.
 */
export class DisabledEmbeddingProvider implements EmbeddingProvider {
  readonly name = "disabled";
  readonly available = false;

  async embed(_inputs: readonly string[]): Promise<EmbeddingBatchResult> {
    return {
      status: "disabled",
      provider: this.name,
      reason: "Embeddings are disabled; lexical retrieval remains available.",
    };
  }
}

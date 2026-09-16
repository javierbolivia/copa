import { AutoModelForSequenceClassification, AutoTokenizer, pipeline } from "@huggingface/transformers";

import type {
  SemanticEmbeddingBatchResult,
  SemanticEmbeddingProvider,
  SemanticEmbeddingResult,
  SemanticRerankCandidate,
  SemanticRerankResult,
  SemanticReranker,
} from "./types.js";
import { BoundedEmbeddingCache } from "./embedding-cache.js";

export const LOCAL_EMBEDDING_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const LOCAL_RERANKER_MODEL = "SugoLabs/mmarco-mMiniLMv2-L12-H384-v1";
export const LOCAL_MODEL_LICENSE = "Apache-2.0";

export interface LocalSemanticModelOptions {
  readonly cacheDir?: string;
  /** Defaults to true so application inference never needs a network connection. */
  readonly localFilesOnly?: boolean;
  readonly maxCacheEntries?: number;
}

type FeatureExtractionOutput = { readonly data: ArrayLike<number>; readonly dims: readonly number[] };
type FeatureExtractor = (
  inputs: readonly string[],
  options: { readonly pooling: "mean"; readonly normalize: true },
) => Promise<FeatureExtractionOutput>;

function unavailable(provider: string, error: unknown): { readonly status: "unavailable"; readonly provider: string; readonly reason: string } {
  return {
    status: "unavailable",
    provider,
    reason: error instanceof Error ? error.message : "The local model could not be loaded.",
  };
}

function normalizedInput(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function vectorFrom(output: FeatureExtractionOutput, index: number): readonly number[] {
  const dimensions = output.dims[1] ?? 0;
  if (!Number.isInteger(dimensions) || dimensions <= 0) throw new Error("Embedding model returned invalid dimensions.");
  const start = index * dimensions;
  return Array.from({ length: dimensions }, (_value, offset) => output.data[start + offset] ?? 0);
}

/**
 * CPU/ONNX provider. It has no database access and only downloads a model when
 * explicitly constructed with localFilesOnly: false (the benchmark bootstrap).
 */
export class LocalTransformersEmbeddingProvider implements SemanticEmbeddingProvider {
  readonly name = `transformersjs:${LOCAL_EMBEDDING_MODEL}`;
  #available = false;
  #extractor: Promise<FeatureExtractor> | undefined;
  #cache: BoundedEmbeddingCache;
  readonly #cacheDir: string | undefined;
  readonly #localFilesOnly: boolean;
  readonly #maxCacheEntries: number;

  constructor(options: LocalSemanticModelOptions = {}) {
    this.#cacheDir = options.cacheDir;
    this.#localFilesOnly = options.localFilesOnly ?? true;
    this.#maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 256);
    this.#cache = new BoundedEmbeddingCache(this.#maxCacheEntries);
  }

  get available(): boolean { return this.#available; }

  async embed(input: string): Promise<SemanticEmbeddingResult> {
    const result = await this.embedBatch([input]);
    if (result.status === "unavailable") return result;
    const vector = result.vectors?.[0] ?? [];
    return { status: "ready", provider: result.provider, dimensions: vector.length, vector };
  }

  async embedBatch(inputs: readonly string[]): Promise<SemanticEmbeddingBatchResult> {
    const normalized = inputs.map(normalizedInput);
    if (normalized.some((input) => input === "")) {
      return unavailable(this.name, new Error("Embedding input must not be empty."));
    }
    try {
      const missing = [...new Set(normalized.filter((input) => this.#cache.get(input) === undefined))];
      if (missing.length > 0) {
        const extractor = await this.#getExtractor();
        const output = await extractor(missing, { pooling: "mean", normalize: true });
        missing.forEach((input, index) => this.#putCached(input, vectorFrom(output, index)));
      }
      const vectors = normalized.map((input) => this.#cache.get(input)!);
      return { status: "ready", provider: this.name, dimensions: vectors[0]?.length ?? 0, vectors };
    } catch (error) {
      this.#available = false;
      return unavailable(this.name, error);
    }
  }

  async #getExtractor(): Promise<FeatureExtractor> {
    this.#extractor ??= pipeline("feature-extraction", LOCAL_EMBEDDING_MODEL, {
      ...(this.#cacheDir === undefined ? {} : { cache_dir: this.#cacheDir }),
      local_files_only: this.#localFilesOnly,
      dtype: "q8",
    }) as unknown as Promise<FeatureExtractor>;
    const extractor = await this.#extractor;
    this.#available = true;
    return extractor;
  }

  #putCached(input: string, vector: readonly number[]): void {
    this.#cache.set(input, vector);
  }
}

/** Cross-encoder reranker applied only after a bounded candidate pool exists. */
export class LocalTransformersReranker implements SemanticReranker {
  readonly name = `transformersjs:${LOCAL_RERANKER_MODEL}`;
  #available = false;
  #model: Promise<Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>>> | undefined;
  #tokenizer: Promise<Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>> | undefined;
  readonly #cacheDir: string | undefined;
  readonly #localFilesOnly: boolean;

  constructor(options: LocalSemanticModelOptions = {}) {
    this.#cacheDir = options.cacheDir;
    this.#localFilesOnly = options.localFilesOnly ?? true;
  }

  get available(): boolean { return this.#available; }

  async rerank(query: string, candidates: readonly SemanticRerankCandidate[]): Promise<SemanticRerankResult> {
    const cleanQuery = normalizedInput(query);
    if (cleanQuery === "" || candidates.some((candidate) => normalizedInput(candidate.text) === "")) {
      return unavailable(this.name, new Error("Query and candidate text must not be empty."));
    }
    if (candidates.length === 0) return { status: "ready", provider: this.name, scores: [] };
    try {
      const [tokenizer, model] = await Promise.all([this.#getTokenizer(), this.#getModel()]);
      const inputs = tokenizer(Array.from({ length: candidates.length }, () => cleanQuery), {
        text_pair: candidates.map((candidate) => normalizedInput(candidate.text)),
        padding: true,
        truncation: true,
      });
      const output = await model(inputs);
      this.#available = true;
      return { status: "ready", provider: this.name, scores: Array.from(output.logits.data, Number) };
    } catch (error) {
      this.#available = false;
      return unavailable(this.name, error);
    }
  }

  #options(): { readonly cache_dir?: string; readonly local_files_only: boolean; readonly dtype: "q8" } {
    return { ...(this.#cacheDir === undefined ? {} : { cache_dir: this.#cacheDir }), local_files_only: this.#localFilesOnly, dtype: "q8" };
  }

  #getTokenizer() {
    this.#tokenizer ??= AutoTokenizer.from_pretrained(LOCAL_RERANKER_MODEL, this.#options());
    return this.#tokenizer;
  }

  #getModel() {
    this.#model ??= AutoModelForSequenceClassification.from_pretrained(LOCAL_RERANKER_MODEL, this.#options());
    return this.#model;
  }
}

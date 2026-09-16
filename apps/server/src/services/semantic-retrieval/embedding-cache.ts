/** Small FIFO cache used only for in-process vectors; it never persists user text. */
export class BoundedEmbeddingCache {
  readonly #values = new Map<string, readonly number[]>();
  readonly #maximum: number;

  constructor(maximum = 256) { this.#maximum = Math.max(1, maximum); }

  get(key: string): readonly number[] | undefined { return this.#values.get(key); }

  set(key: string, vector: readonly number[]): void {
    if (!this.#values.has(key) && this.#values.size >= this.#maximum) this.#values.delete(this.#values.keys().next().value!);
    this.#values.set(key, vector);
  }

  get size(): number { return this.#values.size; }
}

# Semantic Retrieval — Loop 1

This is an isolated local prototype. It does not alter Hallazia's existing
FTS5/BM25 retrieval, repository interfaces, Product Studio, ModuleService, or
SQLite data. `SEMANTIC_ENABLED` remains false unless explicitly set to `true`;
the current production path therefore remains lexical-only.

## Runtime decision

Node/TypeScript with `@huggingface/transformers` (Transformers.js) and
ONNX Runtime was chosen over a Python service. It runs in the existing server
process, ships through npm, supports deterministic CPU inference on Windows,
and loaded both required models locally. A Python service would add a process,
port, lifecycle, and distribution boundary without a demonstrated Loop 1 gain.

- Embedding: `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, Apache-2.0,
  multilingual, 384 dimensions, ONNX int8 (`q8`).
- Reranker: `SugoLabs/mmarco-mMiniLMv2-L12-H384-v1`, Apache-2.0,
  multilingual mMARCO cross-encoder (15 languages), ONNX int8 (`q8`).
- Runtime: Node.js + Transformers.js 4.3.0 + ONNX Runtime CPU. The model
  adapters default to `localFilesOnly: true`; the benchmark is the explicit
  one-time bootstrap that may download models into ignored `data/model-cache`.

## Prototype contract

`SemanticEmbeddingProvider` exposes `embed` and `embedBatch` with an explicit
`ready`/`unavailable` result. `SemanticReranker` accepts only a caller-provided,
bounded candidate pool. `hybridRank` filters project scope before embeddings;
`rerankHybrid` never scans a corpus. Neither component persists embeddings.

Run the local fixture benchmark with:

```powershell
npm.cmd run benchmark:semantic --workspace @our-platform/server
```

The fixture set covers exact lexical matches, Spanish/English paraphrases,
irrelevant semantic neighbors, spam, long and short texts, and another project.
It measures P@3, R@3, reciprocal rank, per-query latency, RSS, and verifies
that the other project's candidate is absent. It is not a claim about real user
data or a production rollout.

## Loop 1 benchmark on this machine

The first bootstrap query, including initial downloads and model sessions,
measured 19.64 s. On a subsequent cached process, its first query measured
2.82 s and the remaining queries measured 41–104 ms for embedding, hybrid
scoring and a top-five rerank. RSS after both CPU sessions loaded ranged from
799 to 953 MiB. The local model cache measured 258.2 MiB after the two int8
models and tokenizers.

| Mode | P@3 | R@3 | MRR |
| --- | ---: | ---: | ---: |
| FTS-style lexical fixture baseline | 0.417 | 0.792 | 0.708 |
| Semantic | 0.500 | 0.917 | 1.000 |
| Hybrid | 0.500 | 0.917 | 0.875 |
| Reranked hybrid | 0.500 | 0.917 | 1.000 |

The improvement is meaningful for the Spanish/English photo paraphrase and
the long description whose wording does not exactly match the query. FTS can
remain preferable for exact identifiers and rare literal terms; this fixture
does not establish a production quality threshold. Loop 2 should persist only
approved, scoped embeddings in a separate temporary schema, compare against a
larger curated evaluation set, and gate any runtime integration behind metrics
and the existing FTS fallback.

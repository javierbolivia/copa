# Semantic Retrieval — Loop 2 hardening

This remains an isolated subsystem. It has no connection to Hallazia's
production Knowledge retrieval, Product Studio, Problems, Opportunities, or
Research. All tests and benchmarks use `:memory:` SQLite databases and
synthetic fixtures; `data/our-platform.db` is never opened or changed.

## sqlite-vec decision

`sqlite-vec@0.1.9` loaded cleanly on Windows x64 through Node 24's
`node:sqlite` extension API and returned `vec_version() = v0.1.9`. The store
therefore uses a normal SQLite metadata table plus a `vec0` index. The normal
table keeps `project_id`, entity identity, text fingerprint, model identity,
dimension, timestamps, state and serialized vector. `vec0` uses an integer
project partition key, so KNN is restricted within the requested project
instead of filtering foreign results afterward.

## Hardening behavior

- `LocalSemanticRuntime` owns one embedding provider and one reranker per
  process. Construction is lazy; first embedding and first rerank load only
  their respective model.
- Unchanged fingerprint + model reuses its vector. Changed text updates only
  that row. Model changes mark old vectors stale and remove their index rows.
  Dimension mismatch marks active vectors stale without indexing the new one.
  Deletion is idempotent.
- Model/inference unavailability returns the original lexical order through
  `lexicalFallback`; semantic disabled is still the existing FTS-only path.

## Offline benchmark

`npm.cmd run benchmark:semantic-hardening --workspace @our-platform/server`
creates 80 queries and 160 fragments (Spanish, English, paraphrases, exact
IDs, URLs, colloquial requests, spam, near duplicates, long/short text and
hard negatives). It uses temporary FTS5, sqlite-vec, and local cached ONNX
models. No content is sent to a provider.

| Mode | P@1 | R@3 | MRR | NDCG@5 |
| --- | ---: | ---: | ---: | ---: |
| FTS5 | 1.000 | 0.750 | 1.000 | 0.809 |
| Semantic | 0.588 | 0.675 | 0.696 | 0.706 |
| RRF | 0.875 | 0.862 | 0.924 | 0.877 |
| Weighted (0.55 FTS / 0.45 semantic) | 1.000 | 0.900 | 1.000 | 0.939 |
| Weighted + rerank top-20 | 1.000 | 0.942 | 1.000 | 0.975 |
| Weighted + rerank top-50 | 1.000 | 0.963 | 1.000 | 0.982 |

The selected balance is weighted fusion plus top-20 reranking: its NDCG@5 is
within 0.007 of top-50 while p50/p95 reranking latency is 150/419 ms instead
of 357/678 ms. The benchmark run measured 1.26 s cold embedding, 7.7/33.7 ms
warm retrieval p50/p95, 201 MiB before models, 555 MiB after embedding and
1,153 MiB after reranker. The FTS fallback passed.

This is strong evidence for the controlled fixture set, not authorization to
advance to Loop 3. A production integration needs a separate approval gate,
real curated evaluation data, and an explicit schema/lifecycle design.

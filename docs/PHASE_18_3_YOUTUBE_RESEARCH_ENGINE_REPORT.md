# Phase 18.3 — YouTube Research Engine

The Sources workspace now adds a deliberate YouTube research flow without replacing URL import. Searches are initiated only by the user and call backend endpoints; the browser never receives the API key.

## Flow

`query → search.list → videos.list batch → deterministic Research Score → multi-select → queued import → RAW comments/replies → local Analysis Set`

- `GET /api/projects/:id/youtube/search` uses official `search` plus a single batched `videos` request (up to 50 IDs).
- `POST /api/projects/:id/youtube/import` queues the existing idempotent importer with a per-video top-level limit (100/250/500/1000/2000; 500 default; 2000 technical cap). Replies do not consume that cap and missing replies continue through `comments.list` pagination.
- Search never creates a source. Imported video IDs are marked as already imported per project.

## Analysis Set and provenance

Schema 8 adds `sources.include_in_analysis` and comment-level `analysis_eligible`, `noise_reason`, and `quality_score`. RAW comments and evidence snippets are retained. The local classifier only excludes empty/emoji-only values, context-free URLs, repetitive text, and very short replies. Module evidence selection uses only included sources and eligible comments; all eligible items retain their original evidence IDs.

## Research score

`youtube-research-score.ts` contains a documented, deterministic heuristic (0–100). It weights query relevance, comments, comment-to-view engagement and recency more than views alone. It is platform guidance, not a scientific truth.

## Errors and efficiency

Existing adapter error normalization is retained for missing/invalid keys, quota, network, private/deleted videos and disabled comments. Tests mock all HTTP. Search is explicit, metadata is batched, and imports remain cancelable/retryable without duplicate YouTube comment IDs.

## Known limits

Search pagination is exposed by the backend but the first UI iteration shows the first page only. Insight clustering remains governed by the existing Problems/Oportunidades module prompts and evidence IDs rather than a parallel classifier.

---
name: copa-market-research-engineering
description: Arquitectura operativa, invariantes y depuración segura del Market Research de Hallazia.
---

# Hallazia Market Research Engineering

Use this skill for changes or diagnostics in the production Market Research path. Inspect the current code and saved run telemetry before changing behavior. Keep acquisition, deterministic validation, semantic analysis, and persistence as separate boundaries.

## Pipeline

`Research Focus` → provider discovery → YouTube metadata/enrichment → deterministic video relevance → bounded comment acquisition → deterministic comment relevance and quality filtering → dedupe/ranking → semantic analysis → grounding/citations → persisted run.

- `MarketResearchService` composes acquisition, semantic mining, and persistence.
- `MarketResearchOrchestrator` isolates provider failures. A failed provider produces a `temporary_error` report and does not abort other selected providers.
- Market Research persists a bounded, validated `MarketResearchRun` in the generation ledger. Persisted telemetry contains safe failure categories, not raw provider bodies, headers, or credentials.
- Captured/acquired signals, semantically analyzed signals, and cited signals are distinct counters. Do not treat them as interchangeable.

## Research Focus

- The persisted project Research Focus is the source of truth for Market Research intent and downstream Problems interpretation.
- Focus changes stale interpretations, not sources or evidence.
- Use the undecorated persisted Focus as the eligibility basis. Discovery queries are retrieval mechanisms only.
- MUST NOT silently replace the Focus with decorated, translated, or shortened search queries. The YouTube planner may derive a bounded retrieval intent from Focus, but `topicTerms` and relevance decisions use the original topic.
- Keep future Content Research separate from Market Research; do not repurpose Market Research Focus or its evidence contracts for content discovery.

## YouTube acquisition

### Bounded discovery

`deriveYouTubeResearchQueries` is deterministic and LLM-free. It starts with one undecorated global lane and adds Spanish and English templates for: `direct_problem`, `frustration`, `mistakes`, `solution_seeking`, and `desired_outcome`. The current plan produces up to 11 distinct queries (hard ceiling: 12), deduped case/diacritic-insensitively.

Current server-side limits per run:

- 10 search results/query; 120 discovered candidates maximum.
- 40 selected pre-gate videos maximum; 3 maximum per channel; 30 final relevant-video target.
- Metadata batches contain at most 50 IDs. Missing metadata is fail-closed for that candidate.
- Minimum duration is 240 seconds by default; a caller may only set 240 seconds through 86,400 seconds.
- 300 retained-comment target; 500 retained-comment maximum; 2,000 raw-comment maximum.
- 25 retained comments/video; 2 comment pages/video; 50 records/page.
- At most 3 replies/thread and 10 reply requests/run.
- Saturation stops only after 3 consecutive comment-producing videos each yield fewer than 3 new unique comments.

### Metadata and video relevance

- Discovery deduplicates by video ID, then performs channel-diverse selection.
- Metadata and duration are evaluated before comment I/O. Missing metadata, missing/invalid duration, and duration below the minimum are deterministic rejections.
- Deterministic relevance uses only the Research Focus and provider-declared metadata: title, description, tags, channel title, duration, and optional query provenance. It does not use popularity, external knowledge, inferred language, or a search-query decorator as eligibility.
- Decisions are `relevant`, `borderline`, or `irrelevant`; retain decision provenance and final rejection reason in the video audit.
- A borderline LLM review runs only when deterministic relevant videos are below the 30-video target. It considers at most 8 borderline videos using metadata only. DeepSeek reviews one bounded batch; Gemini is invoked only for unresolved individual candidates. Failed or malformed reviews fail closed.
- MUST NOT change relevance logic when acquisition did not reach the relevance stage.

### Comments, filtering, and dedupe

- Comment-thread failures or unavailable comments skip that video without retrying. Reply expansion is optional and never retried.
- Comment topicality is deterministic and local. It rejects off-focus content and creator/affiliate promotion before semantic quality filtering. Comments are never sent to an LLM for relevance classification.
- Apply structural validation, topical relevance, quality rejection, exact/near dedupe, and per-video/global caps in that order. Keep their counters disjoint.
- Captured off-focus evidence is not automatically a pipeline failure; it must simply remain uncited unless it survives every relevant gate.

## Semantic layer and grounding

- Acquisition evidence is not cited evidence. Semantic mining may analyze only a bounded subset, and valid analyzed evidence may still yield no finding.
- Non-YouTube evidence is capped at 20 signals. YouTube evidence is handled in at most 12 batches of 25 signals, with 600 characters/signal, 8 candidate findings/batch, and 1,200 output tokens/batch.
- Each model output is grounded against exactly the input batch. A finding MUST reference only valid, delivered signal IDs and have at least one surviving citation. Invalid IDs and ungrounded claims are dropped.
- Customer-language text is retained only when it appears literally in cited evidence.
- YouTube candidates consolidate deterministically; final finding metrics and evidence diversity are computed locally, never accepted from a model.
- Findings MUST cite relevant evidence. Evidence IDs and their signal→finding traceability MUST remain valid after any refactor.
- DeepSeek is primary. Gemini is fallback only after the primary fails or leaves an unresolved unit. A successful primary request MUST NOT trigger Gemini. For YouTube relevance review, fallback is one unresolved candidate at a time; for semantic mining, fallback is the failed batch only.

## Provider routing and failure boundaries

- Market Research providers are YouTube, Tavily, Exa, Brave, and Firecrawl. The UI may narrow the selected set but cannot raise server budgets.
- Firecrawl deepens at most 2 retained non-YouTube URL signals after dedupe; it must not run when disabled or for YouTube signals.
- Provider credentials remain server-side. Never expose keys, headers, raw provider bodies, or `.env`.
- Normalize provider failures to safe `IntegrationError` categories. `rate_limited` is a runtime/provider classification, not evidence of a relevance defect.
- A provider returning zero must be diagnosed at its earliest zero stage; do not add duplicate calls, broad retries, or unrelated provider calls.

## Zero-signal debugging

Diagnose read-only first. Determine the first stage at which the provider reached zero, in this exact order:

1. `QUERY_GENERATION`
2. `SEARCH`
3. `METADATA`
4. `DURATION`
5. `VIDEO_RELEVANCE`
6. `COMMENTS`
7. `COMMENT_RELEVANCE`
8. `SEMANTIC`

Use the saved run’s provider report and YouTube telemetry (`queries`, discovery, metadata/duration rejections, deterministic decisions, final relevant videos, comment counters, semantic batch counters, and citations). If raw provider response attributes were intentionally not persisted, report them as unknown; do not infer them or issue another provider request merely to improve diagnosis.

MUST NOT rewrite multiple stages at once. Fix only the confirmed earliest failing stage and preserve the downstream gates.

## Acceptance workflow

1. Reproduce or identify a concrete saved/runtime failure.
2. Perform read-only diagnosis: isolate the first failed stage and collect relevant telemetry.
3. Form one minimal hypothesis and make one localized fix.
4. Add or update focused deterministic tests for the changed invariant.
5. Run focused tests, affected typecheck, and `git diff --check` when code changes.
6. Run one real production Market Research execution only when required and explicitly authorized.
7. Inspect that one saved result, verify its acceptance criteria, then stop. Do not repeat runs to diagnose a provider failure.

## Non-negotiable lessons

- `rate_limited` does not prove a query, relevance, metadata, or comment-gate bug.
- If acquisition never reaches relevance, do not modify relevance code.
- Do not conflate local/manual source or comment counters with automatic Market Research results.
- Never read, print, commit, or otherwise expose API keys or `.env` without explicit authorization; never place secrets in logs, prompts, tests, or this skill.
- Do not change contract thresholds merely to raise retained-signal, finding, or citation counts.

## Current status

The YouTube Research Relevance Gate work represented by 20.7D is complete in the current repository state. Keep volatile branch, commit, and handoff state out of this skill; record it only in `COPA_ACTIVE_CHECKPOINT.md` when that file is in use.

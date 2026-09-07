# Research and Problems

## Pipeline boundaries
Persisted Research Focus preserves user intent; discovery queries do not silently replace it.
Trace only the relevant boundary: discovery → metadata → video relevance → comments → quality/deduplication → semantic grouping → grounding → persistence. For zero output, locate the earliest empty/rejected stage.
Captured, analyzed and cited counts differ; raw ingestion is not approved knowledge. Provider variability is distinct from deterministic validation.

## Quality Engine
Authority: apps/server/src/services/problem-quality-engine.ts (PROBLEM_QUALITY_CONFIG, qualityProblems, analysisSetSnapshot).
Preserve DIRECT / INFERRED / NOT_SUPPORTED / CONTEXT_ONLY audit traceability. Supported evidence is DIRECT or INFERRED; NOT_SUPPORTED/CONTEXT_ONLY must not inflate cohesion denominators.
Evidence IDs must belong to the Analysis Set: include_in_analysis=1, analysis_eligible=1, source ready/completed. Keep negative controls and distinguish pre-merge candidates from post-merge validated problems.
Do not lower thresholds or inflate validated counts to force success. Threshold changes require explicit task scope:
- authors emerging/pattern/strong: 2/4/6; strongSources: 2
- relevance core/related/tangential: 80/60/40
- precision validated/tentative: 60/40; strength pattern/strong: 55/75; minCohesion: 55; batch size: 60
Preserve low-cohesion, low-precision, out-of-scope and miscellaneous rejection gates.

## Vocabulary
Aliases must not fabricate evidence support: block artificial REJECTED_NO_SUPPORT → VALIDATED promotion.
Audit correlation cluster IDs must be nonempty and unique; malformed identities must fail closed.
For Focus races or vocabulary publication side effects, read the relevant heading in invariants.md.

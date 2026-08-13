# Phase 18.4 — Problem Quality Engine

`problem-quality-v1` validates Gemini problem candidates locally before persistence. Only evidence from an included, ready source and an `analysis_eligible` comment is considered.

## Evidence and scoring

Each candidate evidence relationship is classified as `DIRECT`, `INFERRED`, `CONTEXT_ONLY`, or `NOT_SUPPORTED`. Only the first two survive into `evidenceIds`; invalid and invented IDs are discarded. The persisted result contains counts of evidence, independent authors, sources, direct/inferred evidence, likes, precision, relevance, strength, and a user-facing level.

Levels are deterministic: `SIGNAL` (one author), `EMERGING` (two), `PATTERN` (four), and `STRONG_PATTERN` (six authors or four across two sources). Strength uses precision, author/source recurrence, focus relevance and a small engagement contribution. One-author results cap at 35 and precision below 60 caps at 45.

## Focus, clustering, and wording

Research focus is derived from selected source titles, falling back to project niche. Candidate duplicates with overlapping meaningful terms merge before metrics are calculated. The UI presents a signal/pattern label, real metrics, quotations, source, and support type; UUIDs remain internal.

The engine does not turn a question into a fact, excludes the disabled Demo source, and preserves positive comments that state a historical pain. Gemini receives only the existing analysis set; local validation avoids per-comment model calls.

## Limitations

The first version uses conservative lexical semantic matching for deterministic, explainable validation. Ambiguous claims are discarded rather than attached as weak support. Future quality iterations may add an audited semantic classifier, but no generated evidence may bypass this validator.

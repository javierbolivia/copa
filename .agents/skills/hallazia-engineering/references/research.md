# Research invariants

Research Focus is the persisted intent. Discovery queries retrieve candidates; they do not replace the original Focus for relevance decisions.

Keep these boundaries distinct:

1. provider discovery;
2. metadata enrichment;
3. deterministic video relevance;
4. bounded comment acquisition;
5. deterministic comment relevance/quality and dedupe;
6. semantic analysis;
7. grounding/citations;
8. persisted run and telemetry.

Diagnose zero results at the earliest zero stage:

`QUERY_GENERATION → SEARCH → METADATA → DURATION → VIDEO_RELEVANCE → COMMENTS → COMMENT_RELEVANCE → SEMANTIC`

Do not change downstream gates when an earlier stage did not run. Keep captured, analyzed, and cited signal counts distinct. Every material finding must retain valid evidence IDs and source provenance. Treat raw comments and provider metadata as evidence inputs, never as automatically promoted reusable memory.

Problem Quality changes must preserve `DIRECT`, `INFERRED`, `NOT_SUPPORTED`, and `CONTEXT_ONLY`; the configured thresholds in root `AGENTS.md` require explicit authorization to change.

# Module invariants

Read only the heading implicated by the task; these are preservation rules, not a request to audit the pipeline.

## Workflow and history
- Sidebar state comes from workflow_steps via WorkflowRepository → workflow API → App/loadProjectSystem.
- Artifact existence is not freshness. Upstream replacement can correctly make downstream STALE; never cosmetically relabel it COMPLETED.
- Preserve lineage and historical approved payloads: readable and immutable, even when lifecycle status/freshness changes. No implicit backfills; legacy editing may need explicit normalization.

## Publication and concurrency
- Generation and approval must preserve compare-and-swap (CAS) semantics. Revalidate the active pointer and exact active/fresh parents inside the final transaction, after acquiring its lock.
- Capture semantic context before awaits; an obsolete response cannot publish over replaced context. Missing parents/pointers and critical validation failures must fail closed, including SQL NULL cases.
- Artifact publication, generation persistence and critical side effects must be atomic where coupled. A CAS loser must leave no orphan ACTIVE vocabulary or other critical side effect.

## Research Focus
- Focus is part of Problems' semantic context: capture once for the whole generation and validate before publishing/approving.
- Semantically identical effective Focus changes are idempotent, including ignored youtube_query updates. Real changes invalidate dependent Problems drafts/active versions and descendants, not source evidence.

## Opportunities
- Backend scoring is authoritative: recompute total and scoreFormula; never trust provider/user values. All nine scores must satisfy the contract (0–100).
- selectedId must identify an item; IDs must be unique; problemId must belong to the exact Problems parent and evidenceIds to that problem.
- Generation, drafts, approval and mock/demo fixtures must respect the same contract.

## Product authorization
- Evidence or knowledge does not authorize a product capability or commercial claim. Preserve explicit authorization and the distinction between grounded content and proposals.

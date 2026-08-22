# Skill and memory architecture

Do not confuse a Codex repository Skill with Hallazia's internal Skill contract.

- Internal Skill: versioned declarative policy describing how Hallazia performs a bounded task.
- Memory: persisted, auditable learned knowledge describing what Hallazia has learned.
- LLM: optional executor, never part of Skill identity.
- Tool/API: capability invoked under Skill budgets and evidence policy.

## Existing Knowledge Engine

Libraries/documents/chunks provide project or selected-global FTS5/BM25 knowledge. `approved_output_memory` records an artifact approval/rejection and may be reusable, but remains FK-bound to its origin artifact/project and intentionally cascades on deletion.

Persistent learned memories extend this engine with canonical semantic identity, bounded scopes, eligibility gates, reinforcement observations, contradiction state, compact provenance, and FTS5 retrieval. They do not retain raw comments/videos or duplicate approved artifact outputs.

## Scope and promotion

- PROJECT memory belongs to one project and cascades with it.
- DOMAIN memory is reusable only for the same normalized domain.
- GLOBAL is reserved for sufficiently supported cross-domain `RESEARCH_INTELLIGENCE`.
- Rejected, weak, mock/demo, raw, generation-wide, or product-copy candidates are not promoted.

Canonical identity combines kind, scope identity, and normalized semantic identity. Repeated eligible observations reinforce one row; duplicate observation keys are idempotent. A conflicting statement marks the memory `CONTRADICTED` without overwriting the accepted statement.

## Deletion and retrieval

Project deletion removes project memory and project-owned observation rows. Eligible already-distilled DOMAIN/GLOBAL memory survives without retaining raw project evidence. No external provider or corpus scan runs during deletion.

`getRelevantKnowledge` must remain bounded, FTS-ranked, kind-filtered, scope-aware, and restricted to usable statuses. Internal Skill resolution combines a definition, current project/domain context, retrieved memories, and bounded evidence context without provider coupling.

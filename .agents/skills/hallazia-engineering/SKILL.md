---
name: hallazia-engineering
description: Engineer, diagnose, test, or review the Hallazia npm-workspaces repository with its local SQLite, evidence, provider, Research, and Git invariants. Use for code/runtime work in this repo; do not use for product copy or market analysis that does not change or inspect the software.
---

# Hallazia Engineering

Treat root `AGENTS.md` as the repository policy and this skill as the operating workflow. Current code and runtime state outrank historical phase reports.

## Orient narrowly

1. Run `scripts/repo-baseline.ps1` or inspect branch, HEAD, status, and the relevant package scripts.
2. Read only the files on the request path. Use `rg`/`rg --files`; avoid a global re-audit.
3. Preserve unrelated user changes. Stop before editing if ownership or scope is unclear.
4. For architecture boundaries and source locations, read [references/architecture.md](references/architecture.md).

## Diagnose before editing

Classify the work as a deterministic defect, expected behavior, generative/provider variability, inconsistent persisted data, technical debt, or a product improvement.

For a defect:

1. Establish a tight pass/fail reproduction at the real failing seam.
2. Collect bounded evidence from local runtime, sanitized logs, HTTP, or read-only SQLite queries.
3. Trace the request from caller through contracts, service, repository, and persistence.
4. Form one falsifiable root-cause hypothesis and verify it before changing production code.
5. Add a regression test, apply the smallest localized fix, and rerun the original reproduction.

Never change Problem Quality thresholds or hardcode a favorable result to make a failure disappear. Preserve evidence IDs, support classifications, denominators, provenance, and pre/post-merge audit stages.

## Control scope and persistence

- Prefer additive schema migrations; migrations must be transactional and preserve foreign-key integrity.
- Inspect real FK/cascade behavior before changing deletion, memory, or artifact ownership.
- Do not edit `data/our-platform.db` directly. Use repositories/services for authorized mutations and in-memory/temp databases for tests.
- Never read or edit `.env`; never print credentials, raw provider headers/bodies, or connection secrets.
- Keep frontend, backend, and shared contracts synchronized. Read [references/architecture.md](references/architecture.md) when a response shape crosses workspaces.
- For Knowledge, learned memory, or internal Skill work, read [references/memory.md](references/memory.md).

## Provider and Research boundaries

Local code, fixtures, persisted telemetry, and deterministic tests come before any external call. External API use requires explicit task authorization, a named unresolved fact, a bounded call budget, and a stop condition.

- Read [references/providers.md](references/providers.md) before touching provider clients, routing, fallbacks, credentials, or live acceptance.
- Read [references/research.md](references/research.md) before changing Market Research, Research Focus, YouTube acquisition, relevance, grounding, or Problem Quality behavior.

## Implement and verify

Keep the diff minimal. Avoid incidental refactors and speculative abstractions. Reuse shared contracts and existing services instead of building parallel systems.

Run the smallest sufficient validation in this order:

1. focused Vitest test(s);
2. typecheck for each affected workspace;
3. frontend/server build only when the changed boundary warrants it;
4. safe local runtime/browser verification when behavior is visual or persisted;
5. `scripts/safe-diff.ps1` or `git --no-pager diff --check` plus final scope/secrets review.

Read [references/testing.md](references/testing.md) for canonical commands and escalation criteria. `scripts/targeted-verify.ps1` provides a fail-closed local wrapper for a single workspace/test filter. `scripts/runtime-health.ps1` checks only the configured localhost services and never starts them.

## Git safety

- Inspect status before and after work.
- Never reset hard, clean, overwrite user changes, rewrite history, or force-push.
- Commit or push only when explicitly authorized; stage named in-scope files and inspect the staged patch first.
- Keep secrets, databases, logs, screenshots, profiling output, caches, and generated junk out of Git.

## Done

Finish only when the root cause or architectural decision is evidenced, relevant tests and typechecks pass, runtime behavior is checked in proportion to risk, `diff --check` passes, the diff is in scope, secrets are absent, and Git actions match the user’s authorization.

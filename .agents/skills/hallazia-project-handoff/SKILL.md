---
name: hallazia-project-handoff
description: Resume or audit Hallazia safely when a new terminal has no memory; use for repository state, architecture, SQLite lineage, providers, and bounded validation.
---

# Hallazia project handoff

Use this local handoff before modifying or running Hallazia. It gives a new terminal the project identity, architecture, safety constraints, current state, and controlled validation workflow.

## Identity

- Workspace: `C:\Users\user23\Downloads\copa 2`
- Application: Hallazia, a local TypeScript/npm-workspaces research-to-ebook platform.
- Workspaces: `packages/shared`, `apps/server`, `apps/web`.
- Runtime DB: `data/our-platform.db`.
- Real project: `Perros Reactivos – Seed QA`.
- Project ID: `01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`.
- Branch at this handoff: `codex/fix-20.7d-relevance-regression`.

Never create another project, initialize Git, recreate the database, or replace the real database with a temporary one. Temporary/in-memory DBs are for tests only.

## Mandatory first inspection

```powershell
Get-Location
git rev-parse HEAD
git branch --show-current
git status --short
git log --oneline -15
git diff --check
git diff --cached --check
```

Then read, in this order:

```text
AGENTS.md
.agents/skills/hallazia-engineering/SKILL.md
docs/SECTION_REVIEW_CHECKPOINT.md
.codex-loop/STATE.md
```

Current code and those checkpoint documents override this handoff when they differ.

## Safety boundaries

- Preserve evidence, comments, sources, transcripts, artifact versions, lineage, freshness, and historical outputs.
- Inspect SQLite read-only unless a request explicitly authorizes a canonical lifecycle write.
- Never manipulate artifact status, scores, workflow state, or lineage with direct SQL.
- Do not open, print, modify, or commit `.env`; never expose secrets.
- No `git reset --hard`, `git clean`, destructive checkout, history rewrite, force push, DB rebuild, push, or deploy.
- Commit/push require explicit authorization. Stage only intended source/test/docs files; exclude DBs, logs, temp files, and `node_modules`.
- Provider quota requires explicit authorization. Do not run diagnostic calls, connectivity tests, or module generation merely to investigate.

## Architecture and persistence

```text
Research -> Sources -> Problems -> Opportunities -> Product -> strategy/content -> Product Studio / Ebook
```

- `artifacts` owns an active version pointer.
- `artifact_versions` preserves immutable historical outputs, status, and freshness.
- `lineage_edges` tracks parent-to-child derivation.
- Replacing an active parent marks descendants stale. Do not cosmetically restore them to complete.
- Publication uses compare-and-swap checks: active pointer, exact active/fresh parents, and Research Focus must be rechecked inside the final transaction.
- `generations` / `llm_usage` are telemetry; they never replace canonical artifact lineage.
- Provider projections are copies only; canonical evidence and original text stay intact.

| Responsibility | Location |
|---|---|
| App setup / real DB resolution | `apps/server/src/app.ts`, `apps/server/src/config.ts` |
| Module orchestration/publication | `apps/server/src/services/module-service.ts` |
| Artifact lifecycle/staleness | `apps/server/src/repositories/artifact-repository.ts` |
| Workflow | `apps/server/src/repositories/workflow-repository.ts` |
| Problems quality authority | `apps/server/src/services/problem-quality-engine.ts` |
| Evidence clustering | `apps/server/src/services/local-evidence-preprocessor.ts` |
| Stage routing | `apps/server/src/services/stage-provider-router.ts` |
| Provider clients | `apps/server/src/integrations/*-provider.ts` |
| Structured output | `apps/server/src/integrations/structured-output.ts` |
| Vocabulary | `apps/server/src/services/domain-vocabulary-*.ts` |
| Product Studio | `apps/server/src/services/product-studio-service.ts` |
| YouTube/transcripts | `apps/server/src/services/youtube-import-service.ts` |
| Shared contracts | `packages/shared/src` |

## Quality invariants

`qualityProblems()` and `problem-quality-engine.ts` are the authority for Problems quality. Do not change formulas, thresholds, strength levels, precision, cohesion, connectedness, relevance, or scoring to force a desirable result.

Never hardcode scores, lower thresholds, treat corpus coverage as semantic support, expand a cluster without claim support, or use praise/instructions/duplicates/generic comments to inflate a Problem.

Opportunities have backend-authoritative deterministic totals. Preserve `problemId` and evidence-reference validation. The provider cannot override the computed total.

Known product decision, not an automatic fix: Opportunity `evidenceConfidence` is not deterministically constrained by Problem metrics such as evidence count, diversity, precision, or strength. Altering that behavior requires explicit product direction.

## Real project baseline

At the last read-only audit:

- `PRAGMA integrity_check`: `ok`.
- Schema: `13`.
- Research, Sources, Problems, Opportunities: active `approved / fresh`.
- Product: active `approved / stale`.
- Eligible Problems corpus: 3,359 evidence rows.
- No validation-session table or run exists in the real DB.

Re-check dynamically before relying on these facts:

```js
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("data/our-platform.db", { readOnly: true });
// Query only.
db.close();
```

## Relevant committed history

The old external checkpoint `89facbd` exists but is not HEAD. Important commits above or around it:

```text
72a35dc fix: stabilize clustered problems and compact opportunity context
6580c1e feat: integrated stage router, OpenRouter provider, and clustered Problems pipeline
ee601c7 feat: local evidence preprocessor and Groq provider
a245879 fix: preflight Gemini Problems request plan
83e1e5a fix: omit raw Research evidence from Gemini payload
89facbd fix: skip re-fetching an already ready transcript on retry
d161989 feat: surface video transcripts as chapter knowledge context
482ad60 feat: acquire youtube transcript during import
82e66db test: assert FTS5 resolves exact transcript segment
bd5b97c feat: index ready video transcripts into knowledge corpus
```

Transcript rules:

- A persisted `ready` transcript must not be fetched again on retry.
- Ready transcript segments may reach Product Studio as `KNOWLEDGE`, never automatically as market evidence.
- Transcript segments must not become `evidence_links` as if they were comment evidence.

## Sequential review status

Source of truth: `docs/SECTION_REVIEW_CHECKPOINT.md`.

- Overview through Funnel: `SECTION PASS`.
- Content, Final Product, Library, History, Settings: `OFFLINE REVIEW PASS`.
- Remaining review condition: real global visual/UX pass when a browser surface is available.

`STATE.md` is chronological. Its initial generic pending list is superseded by later checkpoints; do not reopen every area solely because the initial list is old.

The optional `scripts/frontend-request-races.mjs` may be unavailable because Playwright is not declared/installed. Do not add a dependency solely for that diagnostic without authorization.

## In-progress staged work: bounded multi-provider validation

This work may be staged and uncommitted. Inspect `git status --short` before changing it. It is a one-shot validation flow, not normal provider fallback.

Exact allowed physical request plan:

```text
1. DeepSeek / problems/map / batch 1
2. DeepSeek / problems/map / batch 2
3. Gemini   / problems/global_reduce
4. Gemini   / opportunities/direct
```

Validation-mode requirements:

- Build and freeze exactly two MAP payloads before any HTTP.
- Maximum four physical external LLM requests.
- Block request #5 before any network transport call.
- Count at each physical HTTP boundary, not only at logical `generate()` calls.
- Persist a unique validation session and request ledger, so restart/concurrency/duplicate submission cannot reset quota.
- Disable Gemini 429/503 retry, DeepSeek invalid-schema repair, vocabulary retry, and wrapper retries.
- Disable fallback. DeepSeek/Gemini failure stops; Groq/OpenRouter receive zero automatic requests.
- Reuse a matching vocabulary or resolve it deterministically. If LLM vocabulary discovery would be needed, abort before request #1.
- Freeze/revalidate Analysis Set, Research Focus, and parent context. An obsolete response must not publish.
- Use canonical ArtifactRepository/workflow/lineage publication only.
- After any failure, quality rejection, schema failure, or snapshot conflict: stop; do not retry, externally diagnose, or start another run.

Expected staged components:

```text
apps/server/src/services/validation-session.ts
apps/server/src/services/bounded-validation-plan.ts
apps/server/src/scripts/bounded-validation.ts
apps/server/src/services/module-service.ts
apps/server/src/services/stage-provider-router.ts
apps/server/test/bounded-validation.test.ts
```

The staged migration adds the persistent session/request ledger. Test it only on isolated DBs until the implementation is reviewed and explicitly approved for the real DB.

`bounded-validation.ts --run-once` consumes provider quota by design. Never run it for audit, smoke testing, debugging, or ordinary validation. It needs explicit authorization for the exact one-shot run.

## Offline validation

Use fake provider transports, mocks, and isolated/in-memory DBs. Tests must not use real credentials or network access.

```powershell
npm.cmd run test --workspace @our-platform/server -- test/bounded-validation.test.ts
npm.cmd run typecheck --workspace @our-platform/server
npm.cmd run build --workspace @our-platform/server
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
git diff --cached --check
```

Before claiming the staged implementation is fully green, run the complete offline gate against the exact final index. If a timing-only failure occurs, report it and rerun the affected test in isolation; do not silently call the complete gate green.

## New-terminal workflow

1. Identify whether the request is read-only, implementation, visual review, or an authorized provider run.
2. Inspect Git once and preserve staged/uncommitted work as user work unless scope is known.
3. Use `rg` for targeted source discovery; read only the required subsystem.
4. Make the smallest scoped change, with focused offline tests first.
5. For persistence/provider changes, test failure, race, retry, fallback, and stale-snapshot paths.
6. Run affected typechecks; run full suite/build after final code changes when warranted.
7. Inspect scoped diff, `git diff --check`, and final Git status.
8. Do not commit or push without authorization.

## Current safest next step

Before any commit or provider request, conduct an adversarial offline review of the staged bounded-validation diff:

1. Confirm every physical fetch is behind a persistent reservation.
2. Confirm internal retries cannot bypass it.
3. Confirm failure blocks subsequent stages and fallback.
4. Confirm migration/session behavior preserves CAS, lineage, and historical versions.
5. Run the complete offline test/typecheck/build gate on the exact staged snapshot.

Only after this can a user decide whether to commit. A real one-shot run is a separate authorization and must stop permanently after the first failure or request #4.

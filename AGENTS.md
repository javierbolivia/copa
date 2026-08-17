# COPA Engineering Instructions

Persistent engineering guidance for the COPA repository (`our-platform`). Read this before
any change. It constrains behavior but does not override an explicit user instruction in a
given session; when an explicit instruction conflicts with a rule here, follow the explicit
instruction and report the deviation.

## Repository Architecture

npm workspaces monorepo. Root: `package.json` (`name: our-platform`, `private: true`).

Workspaces (root `workspaces: ["apps/*", "packages/*"]`):
- `packages/shared` — `@our-platform/shared`. Shared TypeScript types/contracts (TypeBox).
  Build with `tsc`, emits to `dist/`. Consumed by server and web.
- `apps/server` — `@our-platform/server`. Fastify backend (`src/index.ts` -> `src/app.ts`).
  TypeScript, run via `tsx watch` in dev; compiled to `dist/` for production.
- `apps/web` — `@our-platform/web`. Vite + React 19 + TypeScript frontend (`src/main.tsx`).

Other relevant top-level locations:
- `scripts/` — `sqlite-spike.mjs`, `fresh-start-verify.mjs` (root npm scripts).
- `prompts/` — versioned LLM prompt templates.
- `docs/` — phase reports and architecture notes (human reference, not authoritative over code).
- `data/` — runtime SQLite DB (`our-platform.db`) and generated artifacts. Do not edit directly.
- `backups/` — pre-phase data backups. Read-only reference.
- `.env` / `.env.example` — runtime secrets/config. See Secrets below.

### Backend structure (`apps/server/src`)
- `database/` — SQLite connection (`database.ts`) and migrations (`migrations.ts`).
- `repositories/` — persistence layer (project, source, knowledge, artifact, workflow, etc.).
- `services/` — domain logic:
  - `problem-quality-engine.ts` — Problem Quality Engine (see below).
  - `module-service.ts` — module pipeline; imports from the engine.
  - `youtube-import-service.ts`, `youtube-research-score.ts`, `youtube-adapter.ts`.
  - `knowledge/` — ingestion, extraction, chunking, embeddings, retrieval.
  - `product-studio-service.ts`, `product-export-service.ts`, `backup-service.ts`,
    `traceability-service.ts`, `prompt-registry.ts`.
- `integrations/` — `gemini-provider.ts`, `openai-provider.ts`, `mock-llm-provider.ts`,
  `youtube-adapter.ts`. These generative providers are intentionally NOT changed by default.
- `routes/` — Fastify route handlers (health, projects, sources, knowledge, modules,
  product-studio, product-exports, research-focus, traceability, demo, files).

### Frontend structure (`apps/web/src`)
- `api/client.ts` — HTTP client to the server API.
- `features/` — feature areas: `overview`, `projects`, `knowledge`, `modules`, `refinement`,
  `product-studio`, `settings`.
- `components/AppShell.tsx`, `App.tsx`, `main.tsx`, plus styling (`styles.css`, etc.).
- `config/modules.ts` — module definitions.

### Testing
- Test framework: **Vitest** (`apps/server/test/*.test.ts`). The root script runs server tests.
- `shared` must be built before server tests (`npm run build:shared`).

## Engineering Principles
- Diagnose before modifying. Find the root cause; do not patch symptoms.
- Classify the situation before acting:
  - deterministic bug (reproducible, same input -> same wrong output);
  - expected behavior (works as designed, possibly confusing);
  - AI variability (non-deterministic output from Gemini/OpenAI/YouTube pipelines);
  - inconsistent data (persisted state differs from expectations);
  - technical debt (known suboptimal design, not a live defect);
  - product improvement (new capability, out of bug-fix scope).
- Prefer minimal, localized changes. Do NOT rewrite whole files to fix small issues.
- Do NOT change thresholds to make results pass.
- Do NOT hardcode results to hide a defect.
- Avoid incidental refactors.

## Runtime as Source of Truth
- Tests validate invariants but do not replace real runtime behavior.
- When a bug depends on persisted data, inspect the DB (`data/our-platform.db`) via read-only
  queries; do not mutate it outside an explicit task.
- Gemini, OpenAI and YouTube are generative; their outputs can vary run to run.
- Clearly separate the generative pipeline (LLM/YouTube) from deterministic validation
  (the Problem Quality Engine gates).

## Problem Quality Engine
Real location: `apps/server/src/services/problem-quality-engine.ts`

Public surface (confirmed exports):
- Types: `SupportType` (`DIRECT | INFERRED | CONTEXT_ONLY | NOT_SUPPORTED`),
  `CommentKind`, `ProblemStrength`, `ResearchRelevance`, `ClusterAuditDecision`.
- Config: `PROBLEM_QUALITY_CONFIG` (see thresholds below).
- Functions: `relevanceLevel`, `createProblemBatches`, `classifyCommentKind`,
  `normalizeQualityText`, `analyzeEvidenceSupport`, `classifyEvidenceSupport`,
  `scoreProblem`, `strengthLevel`, `mergeProblemCandidates`, `analysisSetSnapshot`,
  `qualityProblems`, `deriveResearchFocus`.
- Consumed by `apps/server/src/services/module-service.ts` (`qualityProblems`,
  `createProblemBatches`).

Auditability categories that MUST be preserved in `EvidenceQualityAudit` /
`ClusterAuditRecord`: `DIRECT`, `INFERRED`, `NOT_SUPPORTED`, `CONTEXT_ONLY`
(`supportType`). Always keep evidence classification traceable.

### Current thresholds (from `PROBLEM_QUALITY_CONFIG`, do not change without explicit task)
```
emergingAuthors: 2
patternAuthors: 4
strongAuthors: 6
strongSources: 2
coreRelevance: 80
relatedRelevance: 60
tangentialRelevance: 40
validatedPrecision: 60
tentativePrecision: 40
patternStrength: 55
strongStrength: 75
minCohesion: 55
PROBLEM_BATCH_SIZE = 60
```
Gate effects (confirmed in code):
- `REJECTED_LOW_COHESION` when `cohesionScore < minCohesion` (55).
- `REJECTED_LOW_PRECISION` when `precision < validatedPrecision` (60).
- `REJECTED_OUT_OF_SCOPE` when relevance is `OUT_OF_SCOPE`.
- `REJECTED_MISCELLANEOUS` for miscellaneous multi-problem candidates.

Rules:
- Do NOT change precision/cohesion/relevance/strength thresholds unless the task explicitly
  asks.
- Verify evidence IDs exist against the Analysis Set (`analysisSetSnapshot` joins
  `evidence_snippets`, `comments`, `sources` where `include_in_analysis=1`,
  `analysis_eligible=1`, status `ready`/`completed`).
- Protect the precision and cohesion denominators (supported evidence =
  `DIRECT` or `INFERRED`; `NOT_SUPPORTED`/`CONTEXT_ONLY` excluded from cohesion denominator).
- Maintain negative controls (e.g. instruction-only / context-only evidence must not inflate
  validated problems).
- Distinguish pre-merge (candidate clusters) and post-merge (validated problems) stages.
- Never increase validated problem counts by sacrificing evidence quality.

## Testing Workflow
Use the REAL commands from `package.json`:

Localized change (preferred):
1. Run the specific test:
   `npm run test --workspace @our-platform/server -- <test-file>`
   (e.g. `npm run test --workspace @our-platform/server -- problem-quality-engine`)
   or `npx vitest run apps/server/test/<file>` from repo root.
2. Typecheck the affected workspace:
   `npm run typecheck --workspace @our-platform/server`
   `npm run typecheck --workspace @our-platform/web`
   `npm run typecheck --workspace @our-platform/shared`
3. `git --no-pager diff --check` (no whitespace/trailing issues).

Broader change:
- Full local test: `npm test` (runs `build:shared` then server vitest).
- Full typecheck: `npm run typecheck` (shared build + typecheck for all three workspaces).
- Avoid the full suite when a targeted test is sufficient.

Frontend build sanity (non-dev): `npm run build --workspace @our-platform/web`
(then `npm run typecheck --workspace @our-platform/web`).

## Git Safety
- Run `git status` before and after any change.
- NEVER commit without explicit instruction.
- NEVER push without explicit instruction.
- Use `git --no-pager diff` for review.
- Do NOT `git reset --hard`, `git clean -fd`, or destructive `git checkout`.
- Do NOT delete untracked files belonging to the user.
- Preserve existing commits; do not rewrite history.

## Secrets
- NEVER open `.env` except under explicit instruction. Use `.env.example` for shape only.
- NEVER print API keys/tokens/connection strings.
- NEVER copy secrets into logs, prompts, or documentation.
- NEVER add secrets to Git.

## Bug Workflow
1. Locate / reproduce at runtime (server logs in `data/*.log`, or run the app).
2. Collect evidence (specific test output, DB rows, request/response).
3. Locate the responsible symbol (`grep`/`glob` in `apps/server/src`, `apps/web/src`).
4. Formulate a hypothesis.
5. Verify the hypothesis (isolated test or targeted inspection).
6. Propose the minimal change.
7. Implement tests that cover the fix.
8. Run validations (targeted test + typecheck + `git diff --check`).
9. Review the diff for scope and secrets.
10. Wait for authorization before committing.

During a diagnostic task: do NOT edit code until the cause is confirmed.

## Scope Discipline
- Touch only files necessary for the task.
- Problems outside scope: report them, do not fix unless asked.
- No incidental cosmetic changes.

## Frontend / Backend Contracts
Shared contracts live in `packages/shared`. If you change a backend response shape,
an audit field, or a shared type:
- Update the relevant `packages/shared` type.
- Rebuild shared (`npm run build:shared`) so server/web consume new types.
- Check frontend consumers in `apps/web/src` (especially `api/client.ts` and feature views).
- Verify compatibility (typecheck both workspaces).

## Definition of Done
A task is not done until:
- Root cause is explained.
- Relevant tests pass.
- Typecheck passes where applicable.
- `git --no-pager diff --check` passes.
- The diff is exclusively within scope.
- No secrets are present.
- No unauthorized commit/push occurred.

---
name: diagnosing-bugs
description: Diagnosis workflow for hard bugs and runtime regressions in the COPA monorepo. Use ONLY when something is broken, a test passes but the real runtime differs, a regression appeared, or the root cause is unknown. Do NOT use for documentation, simple commits, cosmetic changes, clearly-specified features, or routine Git tasks.
---

# Diagnosing Bugs (COPA adaptation)

A discipline for hard bugs, adapted for the COPA monorepo. **AGENTS.md is the superior
authority** and the **COPA Senior Engineer** agent defines the surrounding workflow; this
skill is the specialized diagnostic loop invoked inside that workflow. Skip phases only when
explicitly justified.

When exploring the codebase, read `AGENTS.md` (repo root) for the architectural mental model,
the Problem Quality Engine rules, and the testing/Git safety policies. Do not rely on an
external `CONTEXT.md` or ADRs — COPA documents architecture in `AGENTS.md` and `docs/`.

## Redact & protect (COPA)

This skill has you show commands, outputs and captured artifacts. **Before showing anything,
redact every secret** — write `<REDACTED>` in its place.
- **Never open or read `.env` / `.env.*`.** Use `.env.example` only for shape.
- If a log or artifact may contain secrets (API keys, tokens, connection strings), sanitize it
  before printing or pasting. If redaction is insufficient to diagnose, say so and ask the user.
- **Never upload artifacts, logs, or DB dumps outside the local environment.**

## COPA-specific constraints

- Distinguish a **deterministic bug** (same input -> same wrong output) from **generative-model
  variability** (Gemini / OpenAI / YouTube output varies run to run). The Problem Quality Engine
  gates are deterministic; do not blame them for non-deterministic LLM output, and do not let
  LLM variability mask a real deterministic defect.
- **Do not modify `PROBLEM_QUALITY_CONFIG` thresholds** (precision/cohesion/relevance/strength)
  to make a test or count pass. Validate the cause, not the metric.
- **Do not edit code while diagnosing** until the root cause is confirmed (Phase 5).
- Confirming cause may require the real runtime and persisted data (`data/our-platform.db`) via
  **read-only** queries; never mutate the DB outside an explicit task.
- **No `git commit` or `git push`** without explicit authorization. Destructive Git commands
  (`git reset --hard`, `git clean -fd`, destructive checkout/restore) are off-limits.

## Phase 1 — Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal
for the bug — one that goes red on _this_ bug — you will find the cause. Spend disproportionate
effort here. Be aggressive, creative, refuse to give up.

Construct one, roughly in this order:
1. **Failing test** at the seam reaching the bug (unit / integration / e2e under `apps/server/test`).
2. **Curl / HTTP script** against the running dev server (Fastify routes in `apps/server/src/routes`).
3. **CLI / script** with a fixture input, diffing output against a known-good snapshot.
4. **Replay a captured artifact** — save a real request/payload/event log to disk; replay it through
   the code path in isolation.
5. **Throwaway harness** — a minimal subset (one service, mocked deps) exercising the bug path.
6. **Property / fuzz loop** — for "sometimes wrong output", run many random inputs and look for the
   failure mode.
7. **Bisection / differential loop** — old vs new version, or two configs, diff outputs.
8. **HITL fallback** — if a human must click, drive _them_ with a structured loop; captured output
   feeds back. (No `scripts/hitl-loop.template.sh` exists in COPA; describe the steps instead.)

A tight, deterministic, fast, agent-runnable loop that can go red on the user's exact symptom is
the bar. If you catch yourself reading code to build a theory before this command exists, **stop**.

For **non-deterministic bugs**, raise the reproduction rate (loop 100×, narrow timing, stress) until
debuggable. For **Gemini/OpenAI/YouTube** variability, confirm first whether the symptom is expected
generative behavior before treating it as a bug.

If you genuinely cannot build a loop, stop and say so; list what you tried and ask the user for access
or a redacted artifact.

## Phase 2 — Reproduce + minimise

Run the loop; watch it go red. Confirm it reproduces the **user's** symptom (not a nearby different
one). Then **minimise**: cut inputs, callers, config, data and steps one at a time, re-running the loop
after each cut. Stop when every remaining element is load-bearing. A minimal repro shrinks the
hypothesis space and becomes the regression test in Phase 5.

## Phase 3 — Hypothesise

Generate **3–5 ranked, falsifiable hypotheses** before testing any. Each must predict:
"If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."
Show the ranked list to the user before testing (cheap domain-knowledge checkpoint). Do not block if AFK.

## Phase 4 — Instrument

Each probe maps to a Phase-3 prediction. Change **one variable at a time**.
1. Debugger / REPL inspection if available.
2. Targeted logs at boundaries that distinguish hypotheses — **never "log everything and grep"**.
3. Tag every debug log with a unique prefix, e.g. `[DEBUG-a4f2]`, so cleanup is a single grep.
For **performance regressions**, measure first (timing harness, profiler, query plan), then bisect.
For COPA persisted data, prefer read-only DB queries over mutating instrumentation.

## Phase 5 — Fix + regression test

Write the regression test **before the fix**, only if a **correct seam** exists (one that exercises
the real bug pattern at the call site). If the only seam is too shallow, that absence is itself a
finding — flag it.
1. Turn the minimised repro into a failing test at that seam. 2. Watch it fail. 3. Apply the **minimal
fix** — no incidental refactors, no threshold changes. 4. Watch it pass. 5. Re-run the Phase 1 loop
against the original scenario. Then run `npm run test --workspace @our-platform/server -- <file>` and
`npm run typecheck` for the affected workspace, and `git --no-pager diff --check`.

## Phase 6 — Cleanup

Required before declaring done:
- [ ] Original repro no longer reproduces (re-run the Phase 1 loop).
- [ ] Regression test passes (or absence of seam is documented).
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix).
- [ ] Throwaway prototypes deleted.
- [ ] No secrets leaked into shown logs/artifacts; `.env` untouched.
- [ ] The confirmed hypothesis is recorded so the next debugger learns.
- [ ] **No commit/push** performed; wait for explicit authorization.

## Provenance

Adapted from `mattpocock/skills` → `skills/engineering/diagnosing-bugs/SKILL.md`.
Source repository: https://github.com/mattpocock/skills (MIT License, © 2026 Matt Pocock).
Upstream commit referenced: `1dab98299c3b81f560026c01b7ebf55ed5d91373` (2026-08-15).
Adapted for COPA: AGENTS.md made the superior authority; `.env`/secret handling, Git safety,
Problem Quality Engine threshold protection, and deterministic-vs-generative distinction added per
COPA policy. MIT permission notice retained; reuse/modification permitted with attribution.

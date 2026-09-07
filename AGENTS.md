# Hallazia agent instructions

Applies to every model/agent. Explicit session scope overrides repository defaults, subject to higher-priority instructions. Current code and verified runtime evidence outrank historical reports.

## Scope and autonomy
- Resolve the exact request and necessary direct dependencies. Decide reversible, low-risk technical details autonomously; do not ask approval for files, tools, tests, implementation or sequence.
- Ask only for materially missing information, genuine product decisions, or destructive/external actions lacking authorization. Reuse authorization already given.
- Nonblocking lateral findings are OUT-OF-SCOPE: report briefly without investigating. Expand only for a blocker, threatened data integrity/loss, or evidence invalidating the solution.
- Prefer the smallest correct solution. No unrelated refactors. Do not create infrastructure for a one-off task unless recurrence justifies it.

## Safety
- Preserve existing user changes and untracked files; no destructive reset, clean, checkout or history rewriting.
- Commit and push each require explicit authorization. Never infer either from permission to edit.
- When authorized, stage only intended files and inspect the staged diff; exclude runtime databases, logs and generated junk unless explicitly requested.
- Do not open .env without explicit instruction; use .env.example for shape. Never expose or commit secrets.
- Inspect runtime data read-only; direct DB/data edits require explicit scope. Backups are read-only references.

## Routing
- Typo or ordinary documentation: edit the requested text, check consistency/links and diff, then stop. No engineering skill or product knowledge needed.
- Engineering, debugging, audits, runtime, tests, Git operations or instruction-system redesign: use [.agents/skills/hallazia-engineering/SKILL.md](.agents/skills/hallazia-engineering/SKILL.md). Load only its task-relevant references.

## Completion
Review Git once initially and once finally (status and scoped diff; diff --check after edits). Repeat only if concurrent work or a material scope change requires protecting new work.
Stop when the requested success criteria and required checks pass, no CONFIRMED in-scope issue remains, remaining risks are nonblocking, and Git is reviewed.
Do not continue searching for hypothetical improvements after the requested success condition is met.
Do not optimize beyond the requested success condition.

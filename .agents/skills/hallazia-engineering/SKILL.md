---
name: hallazia-engineering
description: Scoped engineering, debugging, audits, runtime, testing and instruction-system work in Hallazia. Use task-specific references only; ordinary text edits and non-software market analysis do not need this skill.
---

# Hallazia engineering

Follow root AGENTS.md for scope, autonomy, safety and completion.

## Execute
INSPECT → UNDERSTAND / REPRODUCE → CHANGE → VERIFY → REPORT → STOP.

1. Establish the success condition and permitted changes. Reuse the initial Git inspection; read recent history only when relevant to continuation. A diagnostic/review-only request stays read-only.
2. Make one targeted search round using rg, then batch related reads of responsible functions/ranges. Follow a dependency only to answer a concrete unresolved question.
3. Classify findings: CONFIRMED = reproduction or unequivocal code/data; LIKELY = evidence incomplete; OUT-OF-SCOPE = nonblocking lateral finding; NO ISSUE = correct behavior. LIKELY alone does not justify prolonged investigation.
4. Stop searching at sufficient evidence. Reuse verified context. Do not re-read unchanged evidence unless a later change invalidates it. Do not repeat directory inventories, equivalent searches or completed audits.
5. Implement only the necessary change, using the task route below. Never mask defects with hardcoded results, weakened validation or disabled tests.
6. Make one short adversarial review of the changed behavior and direct dependencies. A second is justified only for concurrency, persistence, security, migrations, data integrity or destructive operations. Lateral findings do not start another audit.
7. Validate proportionately, review the final diff, report and apply the root stop condition.

Optional internal state: TASK / SCOPE / FACTS / FILES / INVARIANTS / CHANGES / VALIDATION. Do not repeatedly print it.

## Task routes
| Task | Required path |
| --- | --- |
| Instructions/docs | Edit → structure, routing, consistency and diff checks → stop; no product suite/build/typecheck |
| Bug | Reproduce or prove root cause → meaningful focused RED → smallest fix → GREEN/related checks and applicable typecheck |
| Feature | Define contract → implement → focused/related checks and applicable typecheck |
| Critical persistence/concurrency/schema | RED/GREEN → related checks → adversarial review → final full suite and typecheck/build |
| Read-only audit | Bounded question → sufficient code/data evidence → findings; no fixes or mandatory full suite |
| Run app | Inspect startup commands → start existing app → health/visual check; no improvements |

## Load only what the task needs
- Unknown subsystem or shared API contract: [architecture](references/architecture.md).
- Workflow/sidebar, lineage, publication, concurrency, Focus or Opportunities: [invariants](references/invariants.md), relevant heading only.
- Research/import, Problems quality or vocabulary: [research](references/research.md).
- Executing code checks or persistence validation: [testing](references/testing.md).
- External provider behavior or live smoke: [providers](references/providers.md).
- Knowledge retrieval, approval memory or deletion semantics: [memory](references/memory.md).

Do not preload all references. A frontend presentation bug does not require SQLite knowledge unless persistence is implicated. An instruction edit needs routing checks, not a product audit.
Existing optional wrappers live in this skill's scripts/ directory: repo-baseline.ps1, safe-diff.ps1, targeted-verify.ps1, runtime-health.ps1. Use only if they save work and fit scope.

## Execution budget
Batch independent tools and reads. During development use focused tests; do not repeat a tool simply because available.
Subagents default to 0; at most 1 for a normal task, only for independently parallelizable work or critical independent review that saves time/context. Never duplicate the same audit; honor session restrictions on delegation.
Communicate meaningful decisions, blockers, relevant confirmed findings and results, without narrating each operation.
Normal final: RESULT / CHANGES / TESTS / RISKS / GIT, compactly; follow an explicit user format instead.

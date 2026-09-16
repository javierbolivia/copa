# Sequential section review

## Scope and environment

Primary visual project: **Perros Reactivos – Seed QA**, `01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`.
Keep the original database at `data/our-platform.db` and the project `.env`. Development is running with `npm.cmd run dev`, frontend 5173 → backend 4310. No paid provider requests, commits, pushes or deployment. Do not create new projects or perform destructive experiments in the real project. Mutation/error fixtures belong in isolated test databases.

This is the current sequential review, superseding earlier broad visual visits as completion evidence. A visit is not SECTION PASS. Full final test/typecheck/build/diff gate is still pending.

## Order

1. Overview — **SECTION PASS**, 2026-09-16.
2. Research — **SECTION PASS**, 2026-09-16.
3. Sources — **SECTION PASS**, 2026-09-16.
4. Problems — **SECTION PASS**, 2026-09-16.
5. Opportunities — **SECTION PASS**, 2026-09-16.
6. Product — **SECTION PASS**, 2026-09-16.
7. Avatar — **SECTION PASS**, 2026-09-16.
8. Mechanism — **SECTION PASS**, 2026-09-16.
9. Beliefs — **SECTION PASS**, 2026-09-16.
10. Offer — **SECTION PASS**, 2026-09-16.
11. Landing — **SECTION PASS**, 2026-09-16.
12. Funnel — **SECTION PASS**, 2026-09-16.
13. Emails — **ELIMINATED / DEPRECATED BY ARCHITECTURAL DECISION**, 2026-09-16.
14. Content — **OFFLINE REVIEW PASS**, 2026-09-16; visual verification remains part of the global visual pass.
15. Final Product — **OFFLINE REVIEW PASS**, 2026-09-16; visual verification remains part of the global visual pass.
16. Library — **OFFLINE REVIEW PASS**, 2026-09-16; visual verification remains part of the global visual pass.
17. History — **OFFLINE REVIEW PASS**, 2026-09-16; visual verification remains part of the global visual pass.
18. Settings — **OFFLINE REVIEW PASS**, 2026-09-16; visual verification remains part of the global visual pass.

## Late-loop verification status — 2026-09-16

Content, Final Product, Library, History and Settings have their targeted offline regressions and affected typechecks recorded in `.codex-loop/STATE.md`; no real project data or external provider was used. The complete offline gate (`npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`) is GREEN on the current uncommitted worktree, with only Vite's non-blocking production chunk-size warning.

The remaining global condition is a real visual pass on `http://127.0.0.1:5173`. Computer Use currently exposes no application or browser surface (`apps: []`, `browsers: []`), so that inspection cannot be claimed. The optional `scripts/frontend-request-races.mjs` harness is also unavailable in this checkout because its required `playwright` package is neither declared nor installed; no dependency was added solely for a diagnostic.

## Overview

Purpose: orient the user in the persisted project, distinguish technical execution from editorial approval, show the first unfinished/stale stage and why, provide navigation, and show recent outputs with lifecycle/freshness/history preserved. Does not generate content, edit lineage or call providers.

Initial classification: **PARTIAL**. Confirmed gaps: null/empty workflow could claim all 14 stages completed; metrics could use an older project-list snapshot; the header's update timestamp ignored later workflow/artifact activity; the current stale reason existed only in node tooltips or historical cards; latest activity assumed input ordering.

Implemented: explicit initial loading/error/retry; workflow-authoritative progress; empty workflow messaging; visible current stale reason; chronological artifact ordering; latest persisted activity timestamp; completed workflow points to the final deliverable. Overview rejects a previous project's workflow during project switching. Historical approved/superseded outputs are unchanged.

Validation: seven rendered React regression tests in `apps/server/test/overview-ui.test.mjs` (five initially RED, then seven GREEN including error recovery/all-completed destination). Web and server typechecks pass. `git diff --check` passes. Real browser screenshot verifies 1/14 execution, current Sources/STALE reason, 19 preserved versions and latest activity 7 September instead of project metadata 22 August. Read-only workflow API agrees. Browser console has no errors/warnings; 165 retained request-completion log entries had no HTTP errors (older log output was truncated; not a claim about the entire historical log). No runtime DB writes or external costs in this section.

Remaining overall work: every section below Overview and a full end-to-end gate. Do not mark the goal complete on the strength of Overview alone.

## Research

Purpose: deliver a bounded, structured discovery brief for Sources: scope summary, candidate subsegments, testable hypotheses, research questions, discovery queries and evidence-qualified observations. It is an initial research plan, not representative market validation or professional advice. The six existing structured fields remain the downstream contract. Source acquisition belongs to Sources; problem synthesis belongs to Problems.

Initial classification: **PARTIAL**. The real v5 brief contains all fields and five accessible citations, but expands into adjacent topics; the prompt requested the project description while backend omitted it. Generation validated references, yet draft/save/approval could bypass that validation. Unsupported provenance and evidence-bearing AI_INFERENCE items passed. UI did not expose citations per claim or explain audit/sample limitations; historical selections were labeled active.

Implemented: project description, persisted Focus and optional per-run instructions reach Research; scope and expected active version are snapshotted. New output only samples ready/completed, included, eligible local sources, max 20 items. Publication rechecks exact context/evidence/Focus/active version under its transaction. Manual drafts and approval enforce the complete Research validator; approval checks original evidence still eligible and rejects an older draft after a newer active version, inside the approval lock. Focus changes invalidate new focus-aware Research versions and descendant manifests, preserving original source rows/comments and historical payloads. Legacy briefs without that dependency metadata are not retroactively rewritten. Validator enforces provenance and separates input/cited counts. Prompt 1.1.0 defines actionable questions, contrary evidence, scope discipline and inference limits.

UI: optional instructions field, claim-level expandable quote/source, honest missing-citation message, readable validation reasons, bounded-sample/claim-validity explanation, historical version label. No raw JSON editor or automatic external search. Existing structured brief is still the source of truth; no dependency/library adoption needed.

Validation: 54 related tests passed across Research validator/integration/rendered UI, module invariants and mocked OpenAI/Gemini/DeepSeek routes, followed by one additional GREEN isolated SQLite test for ready/included evidence and zero provider calls (55 relevant tests in total, the extra test run separately). Newly reproduced failures included missing description, incomplete drafts, invalid manual approvals, old draft replacing new brief, unsupported provenance and Focus invalidation. Both affected typechecks pass. Browser on the real project verified new instructions/disclosure, expanding/collapsing original quote and v4 historical → v5 selection; console empty. Full-window capture temporarily failed; clipped screenshots succeeded without viewport override. API confirms original Research still has five versions, latest v5 approved dated 2026-09-07T09:09:25.148Z. No real project mutations or paid requests.

Limits: deterministic validation proves structure and reference membership, not semantic truth of an LLM claim. The UI and prompt now state this. No new live provider output was requested. Final full-suite/typecheck/build/end-to-end gate remains pending after all sections.

## Sources

Purpose: acquire a bounded local corpus through Demo/manual/YouTube, preserve original comments and source provenance, select the technically eligible Analysis Set, and inspect stored multichannel research with citations, history and explicit limits. Collection, technical eligibility and editorial validation are separate. Market Research ledger signals are a complementary discovery record; they do not automatically become local comments or approved Problems evidence.

Initial classification: **PARTIAL**. Confirmed: loading falsely showed zero records/missing YouTube credentials; the Analysis Set endpoint admitted incomplete/failed sources; manual imports bypassed quality classification; job actions had unhandled failures; sequential import partial failure hid queued work until reload. Source cards/comments lacked a usable way to inspect inclusion and source-specific evidence. Persisted Market Research restoration, citations, bounded provider routing and history already worked.

Implemented: explicit unknown/loading/error/retry states and truthful counts; queued + running import job counts; source-ready eligibility at Analysis Set and module evidence boundary; manual/Demo quality classification on new imports while preserving raw text; source/eligibility comment filters with source name/reason; partial import tracking without offering successful videos twice; caught cancel/retry errors and disabled pending actions; source-only job list; two-character search validation; real navigation to URL import form; clear synthetic Demo notice; Research Focus updates synchronize pristine discovery fields and disclose active Research/Problems scope. Added retry for Focus and automatic research read failures. Market Research explains source diversity and inference limits and its separate persistence.

Validation: initial REDs for missing loading disclosure, incomplete-source eligibility and manual noise; 16 Sources/UI/selection tests GREEN, 44 related Market Research/import lifecycle/recovery/shutdown/Research tests GREEN and seven module invariants GREEN. Both affected typechecks pass. A fixture initially tried the unsupported source status `completed`; corrected it to the actual schema's `ready`, retaining checks for pending/importing/failed/cancelled. No schema or real-data changes. UI verified actual 20 sources, 3,420 originals, 3,337 eligible; search empty state and reset; exclusion filters and original quotes; persisted multichannel evidence and Brave filter; manual URL navigation. HMR caused transient proxy ECONNREFUSED while backend restarted, then the UI retry successfully restored all source counts. No subsequent console errors; 17 subsequent request completions had no HTTP errors or server errors. Full screenshots remain unreliable; clipped evidence screenshots show the real cards and source controls.

Cost/persistence: zero external provider calls, all mutations tested in memory, original runtime corpus untouched. Existing historical manual quality flags are not backfilled. No OSS dependency needed. Deliberate limitation: multichannel signals are not silently promoted to local customer evidence; UI discloses this boundary. Broad final gate remains pending.

## Problems

Purpose: synthesize concrete, scoped customer difficulties from the eligible corpus, retain supporting quotes and contrary/context-only evidence in the audit, admit groups through deterministic quality gates, and provide versioned grounded inputs for Opportunities. Technical admission is not proof of market size, commercial demand, causality or professional advice.

Initial classification: **PARTIAL**. Existing quality engine, support classifications, cohesion/precision/focus/internal-coherence gates and vocabulary discovery are substantial and remain unchanged. Confirmed gaps: API manual drafts could fabricate evidence IDs, quotes/support counts/scores; an older draft could replace newer active Problems; UI had no version selector, no meaningful zero-result state, and fabricated zero scores for legacy data. Shared provider loading had the same false missing-credential symptom.

Implemented: draft normalization reruns existing quality validation against original-context evidence still eligible, preserves exact vocabulary dependency, rejects unsupported/duplicate/foreign candidates and recalculates claims/quotes/metrics. Approval checks the active interpretation and normalized items/audit/metrics under the existing transaction; old drafts cannot replace newer interpretations. No thresholds changed. Prompt 1.1.0 specifies concrete scoped difficulties, negative/contrary evidence, and inference limits. UI adds lifecycle/provider/date/version navigation, honest missing scores and zero-result guidance, loading provider state, technical-versus-market validation explanation, and explicit historical-corpus labeling.

Validation: three reproduced backend failures RED→GREEN plus four rendered UI tests (three RED→GREEN); 42 focused tests GREEN across draft/UI/quality/audit, and 72 related vocabulary/dry-run/discovery/module invariants/provider tests GREEN. Both affected typechecks and diff check pass. Read-only API confirms real v2 remains approved/stale with two problems, 17 post-merge rejects, 554 raw/551 eligible and processed; v1 remains superseded/stale with seven problems. Real browser selected v1, opened historical analysis and a rejected cluster (no DIRECT/INFERRED support), then returned to v2. Quotes, rejection reasons and historical corpus counts are visible. No regeneration or writes to the real project and zero external provider calls. No OSS needed; no hypothetical threshold tuning. Final broad gate remains pending.

## Opportunities

Purpose: compare opportunity hypotheses linked to an exact Problems parent, inspect original supporting quotes, understand the nine weighted criteria and uncertainty, and choose via a reviewable draft followed by explicit approval. High scores are estimates of favorable conditions, not probabilities, demand proof or authorization to diagnose/treat/guarantee outcomes.

Initial classification: **PARTIAL**. Backend score/reference validation already existed. UI hid all nine scores, totals and actual parent problem, had an artificial evidence-count rail and no selection action. Backend replaced substantive rationale with a generic formula sentence; old drafts could overwrite newer decisions and edits could silently rebase to an unseen active version. Real v1 is stale and lacks complete scores; preserved as read-only without backfill.

Implemented: dedicated OpportunityWorkspace with exact parent-version lookup, local candidate inspection, actual scores/weights/total, unique evidence count, stored selection distinct from inspected item, original parent quotes, rationale, optional criterion explanations/missing-data/validation-plan contract, and honest absent-data states. Saving selection produces a draft using expectedBaseVersionId; approval remains explicit, checks current decision inside transaction, and preserves previous active selection until approval. Rationale is preserved while totals remain backend-calculated. Prompt 1.1.0 explains criteria, favorable direction of competition, uncertainty and limits. Existing historical payloads are unchanged.

Validation: four backend RED findings (rationale loss, stale base save, old draft approval, malformed explanation contract) → GREEN; isolated selection save→review→approve verified. 22 backend related tests GREEN; 15 rendered UI/reference tests GREEN; 70 downstream Product tests GREEN. A screenshot caught inherited rank-column CSS compressing titles; corrected single-column cards and captured readable titles afterward, with document width equal to viewport (1207px). Real UI examined a second candidate and its two original quotes, then returned to stored selection. Read-only API confirms one existing version with six proposals, approved/stale, unchanged selection.

Network audit discovered generic evidence extraction treating every UUID as a citation (including comment/problem IDs and rejected audit candidates), producing 404s. Reproduced two RED tests, fixed semantic evidenceId/evidenceIds extraction and audit exclusion, GREEN. Real browser reload/reopen then logged 36 completed requests, 15 actual evidence reads, zero HTTP/server errors, untruncated. Console empty. Backend HMR remains active; full screenshots intermittently fail but clipped screenshots verify results. Both affected typechecks and diff check pass. No paid calls or real-data writes; no OSS dependency needed.

End-to-end follow-up: reloading Project Hub briefly displays zero projects/first-project empty state before the successful fetch restores one active + one archived project. Confirmed initial loading presentation issue; resolve at the final end-to-end pass (steady-state environment/data is correct). Avoid creating projects to test it.

## Product

Purpose: define the selected product hypothesis, problem, proposed outcome, promise, format, learning sequence, deliverables and resources; distinguish inspection from persisted selection; preserve every proposal and exact lineage; edit through drafts and explicitly approve a complete current definition for Strategy and delivery. Problem evidence does not certify product efficacy or authorize commercial obligations.

Initial classification: **PARTIAL**. Confirmed: adapter opened and overwrote first proposal regardless of selectedId, dropped saved module outcomes, omitted concept/problem/outcome/checklists/templates/resources; failed saves closed the editor; stale versions offered editing/approval; no history/selection or actionable validation. Backend allowed older drafts to replace newer Product, rejected editing the first draft without an approved Product, and could approve a generated draft after its invalid evidence IDs had been filtered away despite its failed original audit.

Implemented: complete selected-proposal adapter preserving all other proposals/unknown fields/evidence, module-outcome roundtrip, selection inspection versus explicit draft selection, all contract fields, version navigation, readonly stale/historical outputs, current audit reasons and unsupported-claim details, explicit product instructions for generation, retained editor contents on failed save and accessible field names. Successful Product writes reload authoritative history. User edits explicitly authorize their own product decisions under existing policy; the UI discloses this and approval remains separate.

Backend: sourceVersionId for Product drafts validates exact project/type/lifecycle/base and preserves that version's context and parents, supports the first generated draft with no approved Product, rejects old drafts after current Product changes. Approval checks original base and validation inside transaction. Failed original generated audits remain blocking until explicit review or regeneration; missing historical audits are calculated for display without rewriting stored payloads. Other modules retain previous draft behavior. No changed provider costs or quality thresholds.

Validation: RED→GREEN for selection/roundtrip, old draft approval, first draft edit, missing audit and filtered-evidence approval bypass. Final section run: **85 tests GREEN** (66 validator, 4 contract, 3 decision, 2 adapter, 3 rendered UI, 7 invariants); five Opportunities selection tests also GREEN. Both affected typechecks and diff check pass. In a temporary frontend-only fixture mounted on the existing Vite server, real browser verified second-proposal opening, editing, simulated save failure retaining text, successful retry, restored module outcome, checklists/templates/resources, and alternative selection saved only in memory. Fixture/tab removed afterward; no database/API calls from it.

Real browser inspected v6 → v7, disabled stale editing/approval, all definition fields, reasons and lineage modal with original evidence. Cold reload and reopening Product produced no new console errors/warnings (earlier intermediate HMR had a Field error during a partial adapter change; resolved before cold verification). Final retained untruncated runtime window: 37 completed requests, zero HTTP/server errors. Screenshot confirms history/read-only state; DOM has no horizontal overflow at the user's current 560px viewport. Runtime API still has exactly seven original Product versions dated 22 August. No real project edits, external calls, commits, pushes or deployment. No OSS component needed. Full end-to-end/test/build gate remains pending after remaining sections.

Environment recheck before resuming this section: original DB quick_check OK and exactly two original projects, same direct/proxy response, root npm dev PID6236 and Vite25004 retained, backend PID changes only with tsx HMR. Process cwd and DATA_DIR were read directly from Windows process parameters. Original .env untouched; OpenAI missing, the seven requested other keys present and available in backend status. Both active/archive project cards visually verified.

## Avatar

Purpose: maintain a bounded, evidence-aware customer profile for the chosen Product and Problems: name plus nine separate groups (situations, desired outcomes, pains, frustrations, desires, objections, motivations, literal language, purchase concerns). Preserve multiple observations, distinguish inference from sourced statements and retain exact references for downstream strategy. Unknown optional groups remain empty; no invented demographics or representative-market claims.

Initial classification: **PARTIAL**. Real project has no Avatar output; its empty state was visually inspected without generating into real data. Confirmed adapter lost every situation after the first, mixed desired outcomes with desires and flattened evidence-bearing objects to strings. Three groups absent from editor; profile drafts accepted fabricated evidence, fabricated literal quotations and old drafts over newer approvals.

Implemented: shared Avatar contract, bounded per-field validation of provenance/references/literal quote membership against the original eligible evidence snapshot; invalid new generation remains draft, original failed audit cannot silently disappear, approval checks base and validation inside transaction. Product's exact source-version edit capability also applies to Avatar, with original lineage/context preserved. Invalid approved legacy profile is presented read-only/draft/stale without stored-data rewriting and cannot serve downstream or approved memory. Demo/context output normalized to structured claims, language drawn directly from its actual source quotes. Prompt 1.1.0 distinguishes hypothesis/quote, outcome/desire, purchase concern/objection, unknowns and sample limits.

Editor preserves all nine lists, multiple situations, metadata and references; displays name, per-claim provenance and source excerpts. Rewriting a claim explicitly converts it to inference without old citations; literal language can be removed but not rewritten as a quotation. History, stale readonly guards, audit reasons and authoritative history refresh are connected. No provider calls from browsing or fixtures.

Validation: four initial REDs (adapter roundtrip, invalid evidence, invented quote, old draft approval) now GREEN. 16 directed tests across adapter/validator/API include save→approve→reload and mocked provider invalid generation→explicit corrected draft→approval. Shared build and both affected typechecks pass. Full section suite ran once: **776 passed / 3 failed (779 total)**. Two provider matrix failures came from old evidence-backed fixtures with empty references; made those explicit inference fixtures (language empty) and added approved/audit assertions, both GREEN. Third failure was ebook export timeout under full-suite load; same unchanged test GREEN alone in 2.2s. Did not rerun already-passing tests. Final whole-goal clean suite/build gate still required.

Browser: all nine editor groups visited in temporary frontend-only fixture, edited first of two situations, saved in memory, verified second situation and references preserved, edited statement became inference, expanded original quote/source. Screenshot confirms readable grouped editor. Shared build caused temporary fixture createRoot HMR warnings; after build, cold fixture reload→edit→save has zero new console warnings/errors. Fixture files/tab removed. Real Avatar API remains empty, original project unmodified. Diff check passes; no external API costs, commits/push/deployment or OSS additions.

Resume policy: user explicitly resumed after pause, asks for lower consumption, directed tests first, no repeated successful section validation, browser only when needed and full suite at section closure. Product remains SECTION PASS; never redo prior sections.


## Mechanism

Purpose: distinguish the observed problem, apparent cause, causal hypothesis and proposed solution process; preserve differentiation and separate brief/detailed explanations. Citations describe problem context, never certify efficacy. Optional steps, alternatives, limitations and validation plan stay distinct and unknown values remain empty.

Initial classification: **PARTIAL**. Four reproduced RED regressions: brief explanation overwritten by detailed text; steps incorrectly saved as alternatives; incomplete hypotheses/fabricated references accepted as drafts; older drafts could replace newer interpretations. UI also exposed evidence IDs as editable proof and omitted hypothesis/differentiation.

Implemented: complete adapter/editor preserving unknown metadata and independent fields, readonly contextual citations, hypothesis disclosure, version navigation and stale/historical readonly state, audit reasons and authoritative history reload. Backend validates eight required text fields, optional bounded lists, provenance and original eligible snapshot references on generation/edit/approval; invalid generation remains draft; failed original audit remains blocking; exact source-version edit and transactional base checks extended to Mechanism. Invalid historical approval is quarantined for display/downstream/memory without rewriting stored data. Prompt 1.1.0 separates observed context from causal/effectiveness inference. No added libraries or provider calls.

Validation: 11 focused tests GREEN (2 adapter, 3 API contract including save→approve→reload, 6 validator). Both affected typechecks pass. Closing full suite: **790 tests / 88 files GREEN**. Real browser inspected the project's empty Mechanism without generation. Frontend-only fixture mounted actual editor: edited brief text while detailed text stayed intact, simulated save error retained draft, retry succeeded, changed steps without changing alternatives, inspected readonly evidence section. Screenshot confirms readable sections; isolated console had zero errors/warnings. Fixture files/tab removed. Real project untouched, server retained, no paid API calls, commit/push/deploy.


## Beliefs

Purpose: maintain the proposed central thesis and distinct current, limiting, bridge and required beliefs, objections and response arguments. These are interpretations for customer validation, not verbatim quotations or evidence of efficacy; legitimate doubts and not buying remain acceptable outcomes.

Initial classification: **PARTIAL**. Four RED regressions confirmed: bridge beliefs read/wrote arguments, limiting beliefs could not be edited, empty thesis/malformed lists accepted, and old drafts could override newer interpretations. Real project has no output; visually inspected empty state without generation.

Implemented: independent editor fields and adapter preserving extra fields, optional bridge list without fabricated entries, Spanish title and inference disclosure; exact source edit, current-base approval, audit validation and quarantine, version navigation/read-only states and history reload. Contextual Demo extracts actual Avatar text into the canonical string lists instead of passing objects through to downstream. Prompt 1.1.0 distinguishes perspectives and arguments and prohibits invented proof/urgency. Original data unchanged.

Validation: five focused tests GREEN (2 adapter, 3 API including save→approve→reload with all distinct lists). Both typechecks and diff check GREEN. Closing full suite **795 tests / 90 files GREEN**. Browser fixture mounted actual editor, edited limiting belief and verified separate bridge/argument contents; screenshot readable, zero console errors/warnings. Temporary fixture/tab removed. Retained server log segment across strategy review had 139 completed requests and zero HTTP/server errors; buffer was truncated, so this is not a claim about the entire runtime history. No real writes or paid API calls, no commits/push/deploy or libraries added.


## Active visual follow-up (user priority)

User requests visual-only pass now over Overview, Research, Sources, Problems, Opportunities, Product, Avatar and Mechanism. Preserve all SECTION PASS, historical timestamps and real outputs; no backend re-audit or repeated approved tests. Show actual states, validation, evidence and versions more clearly; verify each real screen on 5173. After this pass resume Offer, whose adapter/editor changes are in progress (five RED tests reproduced; frontend fixes started, backend validator created but not yet wired). Beliefs remains SECTION PASS. Do not label Offer complete yet.


## Visual follow-up — completed on real 5173 UI

The requested eight-screen pass is complete without rerunning backend validation or prior section suites. No generated data, database updates, timestamp edits or restart. Current real screens visibly served the new Vite code; screenshots and DOM inspected after HMR, console empty at final check. Frontend typecheck and diff check pass.

- Overview: wrapping workflow cards replace overflowing horizontal rails; Spanish labels and state legend (1 executed / 4 need review / 9 pending) distinguish stored project progress from engineering review. DOM rails have equal content/client width and page no horizontal overflow.
- Research: top status card shows original v5/date, five saved versions, five distinct references and persisted contract validation. Generation instructions collapse so saved content remains prominent. States translated.
- Sources: fourth metric exposes actual 3337 eligible/included comments out of 3420; three quick links jump to saved sources, comments/eligibility and market research. Comment anchor verified at viewport top; provider availability/selection labels now occupy separate rows without collision. No source settings changed.
- Problems: top state card exposes v2/date, two versions, seven references and two admitted problems. Obsolete status is explicit; strength labels shown as Solidez/Emergente/Patrón. Existing evidence/audit contents preserved.
- Opportunities: state card exposes v1 original date, 15 references and honest historical lack of complete scores, alongside readonly revision state. No scores backfilled.
- Product: top card exposes v7 original August date, seven versions, 19 references and correction state; generation instructions collapsed, version selectors show original dates, editorial states translated. Existing selection/validation/editor preserved.
- Avatar: real empty screen now explains dependencies, nine profile dimensions, citation/inference distinction and review flow. Clearly says no saved versions; no synthetic output displayed as real.
- Mechanism: real empty screen explains dependencies, causal hypothesis/solution structure, limits, context evidence and review flow. Clearly no saved versions; no generation.

All eight have actual UI presentation changes, verified on the existing real project. A browser resize during the pass changed screenshot crop; final Product DOM confirmed page width=scrollWidth (1611), no actual page overflow. Resume Offer in progress next; all prior SECTION PASS intact.


## Persistent technical review timestamps — user priority implemented

Added separate global section-code metadata in data/technical-reviews.json, outside SQLite/artifact outputs. GET /api/technical-reviews fingerprints explicit section/shared files and atomically persists real server-clock UTC review times only when content changes; normal reads/reloads/service reconstruction preserve prior times. Missing source tree retains saved metadata; corrupt file is not silently replaced. No source secrets scanned. Shared component changes intentionally affect associated sections. UI checks on section entry, browser focus and every 30s while open.

Eight requested sections display a dedicated top strip: “Última revisión técnica: DD/MM/AAAA HH:MM”, browser-local time. Document status cards explicitly label original “Fecha de la versión”. Initial actual persistence occurred 2026-09-16T05:22:52Z (01:22 local), never hardcoded into app. All eight visited on real 5173 and timestamps matched persisted response; screenshot evidence verified each. Fixed a brief previous-section date during navigation by keying stamp per section. Clean post-reload console had zero errors/warnings. Two isolated tests passed: service reconstruction persistence/affected-section-only update and corrupt-file preservation. Both typechecks pass. No full approved-section suites repeated. Dev process retained, no real artifact or version timestamp changes. Offer stays IN PROGRESS; its five directed tests are GREEN after validator wiring, final UI/good persistence test and section closure still pending.


## Offer

Purpose: separate product promise, concrete benefits/deliverables, CTA, proposed price/currency, rationale and payment terms, suggested guarantee, detailed bonuses and optional complementary offers. No checkout, publishing or real transactions are triggered by approval.

Initial classification: **PARTIAL**. Five RED regressions: bonus descriptions disappeared on reopening; rationale occupied payment terms; complementary offers could not be removed; invalid price silently became null; negative price/empty deliverables and older draft approvals were accepted.

Implemented: complete offer adapter/editor with distinct named sections and preservation of price metadata/bonus descriptions, clear price errors retaining draft, null versus zero semantics, optional complements removable. Backend validates required text/lists, proposed price/currency, references and complements; generated invalid output remains draft, failed audit retained, exact source/base checks protect edits and approval, history/readonly/audit and memory gates connected. Prompt 1.1.0 distinguishes actual deliverables from claims and proposed commercial conditions from authorization. New real empty-state preparation panel explains scope, price/guarantee and optional complements without fabricating an offer.

Validation: eight focused tests GREEN (3 adapter, 5 API including null/zero/25.5 price and description/removal persistence through approval/reload); affected typechecks pass. Closing full suite ran once: **804 passed / 1 failed of 805**. Only failure was Overview's old English Research label after requested Spanish UI; updated expectation and added positive presence assertions, exact affected test GREEN. No repeated passing suites. Final goal-wide clean gate still pending.

Browser: real 5173 Offer remains honestly empty and shows new preparation panel; actual editor fixture verified price abc error retains input, zero stays zero, rationale/terms separate, descriptions shown, complementary offer saved as null. Tool fill("") did not clear the field; keyboard select-all/backspace did, so no product defect inferred from that tool no-op. Fixture console empty, fixture removed. Screenshot API temporarily failed while browser hidden; visibility capability restored real screenshot. No real writes, dates/regeneration, paid APIs, commits/push/deploy. Technical-review timestamps for the previously requested eight sections persist separately; normal reload preserved exact timestamp.


## Landing — **SECTION PASS**, 2026-09-16

Purpose: transform upstream project intelligence (Research, Problems, Opportunities, Product, Avatar, Mechanism, Beliefs, Offer) plus an optional concise user prompt into a high-converting, 15-block landing page, editable visually in Puck, previewable responsively, and exportable to clean HTML and standalone React code.

Architecture & Implementation:
- **Primary flow: PROMPT → LANDING COMPLETA AUTOMÁTICA**. Upstream modules are aggregated automatically via `parentOutputs` (`offer`, `product`, `avatar`, `mechanism`, `beliefs`, `problem`, `research`, `opportunities`) and injected into the LLM system prompt along with user instructions.
- **15 Canonical Blocks**: Complete structured generation across `hero`, `problem`, `agitation`, `mechanism`, `benefits`, `product`, `deliverables`, `bonuses`, `proof`, `objections`, `faq`, `offer`, `guarantee`, `cta`, `footer`.
- **Visual Parity**: Full styling alignment across the Puck visual editor, the responsive React preview (`LandingPreview`), the static HTML export (`renderLandingHtml`), and the standalone React component export (`renderLandingReactCode`).
- **Puck Visual Editor**: Configured as a post-generation refinement tool (drag-and-drop, block reordering, visibility toggle, inline text editing, and theme customization) rather than a mandatory block-by-block construction hurdle.
- **Standalone React Export**: Single-file `.tsx` component with embedded types and inline CSS variables, containing zero `@measured/puck` or third-party dependencies, ready for production Vite/Next.js/Remix.
- **Theme Presets**: 5 curated themes (`modern`, `warm`, `dark`, `editorial`, `minimal`) selectable with 1 click without losing copy or block configuration.
- **Regeneration Capabilities**: Full-page AI regeneration with custom user prompt, plus contextual single-block regeneration dialog.
- **Model routing**: Gemini (`gemini-3.5-flash-lite`, Free Tier) configured as the primary LLM provider; DeepSeek retained as alternative/fallback; Mock provider used in automated tests. Zero live paid API calls during development/tests.
- **Lifecycle & Safety**: Validated draft save → approval flow with strict base-version checking to prevent overwriting newer versions. Automatic file export of both `landing.html` and `landing.tsx` to `generated_files` on generation and approval.
- **Preservation of Real Data**: Seed QA project (`01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`) remained completely untouched; all live verifications performed via synthetic test fixtures and in-memory databases.

Validation:
- 9/9 focused landing tests GREEN across `landing-canvas.test.mjs`, `landing-contract.test.ts`, and `landing-editor.test.mjs`.
- Typechecks across `apps/server`, `apps/web`, and `packages/shared` pass cleanly with zero errors (`tsc -p tsconfig.json --noEmit`, `tsc -b`, `npx tsc`).
- `git diff --check` passes with zero whitespace or line-ending errors.
- Verified live on running local servers (port 5173 for Vite frontend, port 4310 for Fastify backend). Both responding HTTP 200.


## Funnel — **SECTION PASS**, 2026-09-16

Purpose: model, generate, and visualize the complete commercial conversion journey connecting the approved Landing page and the Offer structure into a strictly directed, acyclic graph (DAG) with safe simulated checkout (no real payments).

Architecture & Implementation:
- **Shared Contract & Document (`packages/shared/src/funnel-document.ts`)**:
  - Defined `FunnelNode`, `FunnelEdge`, `FunnelValidationAudit`, and `FunnelDocument` with strict `exactOptionalPropertyTypes` compatibility (`| undefined` unions).
  - Implemented `renderFunnelMarkdown(input: unknown): string` generating clean Markdown documentation with node step breakdown, prices, linked artifacts, and an edge transition table.
  - Exported in `packages/shared/src/index.ts`.
- **DAG & Cycle Detection Validator (`apps/server/src/services/funnel-output-validator.ts`)**:
  - Enforces 2 to 30 nodes, uniqueness of IDs, required non-empty label/type.
  - Validates edge connections: `from` and `to` nodes must exist in the node set.
  - Forbids self-loops (`from === to` rejected immediately).
  - Detects graph cycles via depth-first search (DFS) with node visitation and recursion stack states, guaranteeing a true DAG.
  - Enforces Hallazia's safe simulation policy: `paymentsEnabled: false` is strictly mandatory (`paymentsEnabled: true` rejected with 409).
- **Server Module Service (`apps/server/src/services/module-service.ts`)**:
  - Registered funnel in `get`, `saveDraft`, `approve`, `canPromoteToMemory`, and `modules.run`.
  - Added `validatePersistedFunnel` ensuring historical or newly created versions adhere to the DAG contract.
  - Enriched `createContextOutput` and `createDemoOutput` for `funnel` with grounded prices from Offer, canonical nodes, and structured edge events.
  - Integrated `fileExporter.exportFunnel(projectId, versionId, output)` automatically generating `funnel.md` in `generated_files` on run and approval.
  - Protected drafts against concurrent overwrites using `expectedBaseVersionId`.
- **UI Workspace & Refinement (`apps/web`)**:
  - Created empty state `<FunnelPreparation>` (`apps/web/src/features/refinement/FunnelPreparation.tsx`) with user prompt input, provider selector, safe simulation disclaimer, and canonical journey cards.
  - Upgraded `<FunnelWorkspace>` (`apps/web/src/features/refinement/CampaignWorkspaces.tsx`) with dynamic transition map badges (`continue`, `accept`, `decline`), active status toggle, drag-and-drop reordering, and "Exportar Funnel (.md)" action.
  - Updated `<RefinedModuleOutput>` with `FunnelAdapter` passing edges, export trigger, version strip, and audit warning banners.
  - Updated `<ModuleView>` to render `<FunnelPreparation>` on empty state and pass custom instructions to `api.runModule`.
- **Prompt 1.1.0 (`prompts/funnel-builder.md`)**:
  - Strict DAG specification, canonical 6-node catalog (`landing`, `checkout`, `order_bump`, `upsell`, `downsell`, `thank_you`), event definitions (`continue`, `accept`, `decline`, `complete`), price grounding against Offer, and zero external payment credentials.
- **Preservation of Real Data & Safety**:
  - Real Seed QA project (`01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`) remained completely untouched; all tests and runs executed via isolated in-memory instances and synthetic mocks.
  - No git commits, no git push, no deployment.

Validation:
- 3/3 tests in `apps/server/test/funnel-contract.test.ts` GREEN (self-loop/cycle/payment rejection, draft base version protection, contextual run with file export and approval).
- 11/11 contract tests passing across `landing-contract.test.ts`, `funnel-contract.test.ts`, and `offer-contract.test.ts`.
- Typechecks across `apps/server` (`tsc -p tsconfig.json --noEmit`), `apps/web` (`tsc -b`), and `packages/shared` pass cleanly with zero errors.
- `git diff --check` passes with zero errors.
- Dev servers on port 5173 and port 4310 healthy (HTTP 200).




## Emails — **ELIMINATED / DEPRECATED BY ARCHITECTURAL DECISION**, 2026-09-16

Status: **ELIMINATED / DEPRECATED BY ARCHITECTURAL DECISION**.

Context & Decision:
- The core commercial conversion flow of Hallazia is streamlined to:
  `Meta Ads → Landing de Hallazia → Meta Pixel / tracking de conversiones → Checkout externo en Hotmart o Skool → Compra`.
- Consequently, `Emails` as a module and workflow section is removed from the product scope.
- Historical data preservation: Existing database rows and historical artifacts are preserved without destructive wipes or schema drops. The `ModuleKey` schema union retains `"emails"` compatibility for read-only historical deserialization.
- Clean removal executed across:
  - Sidebar and navigation (`apps/web/src/components/AppShell.tsx`, `apps/web/src/App.tsx`, `apps/web/src/config/modules.ts`, `apps/web/src/features/overview/OverviewView.tsx`, `apps/web/src/features/modules/ModuleView.tsx`).
  - Workspaces and adapters: Removed `EmailsWorkspace`, `EmailsAdapter`, and `toEmails` from `apps/web/src/features/refinement/CampaignWorkspaces.tsx` and `RefinedModuleOutput.tsx`. Kept `ContentWorkspace` intact.
  - Active module registry & knowledge policies: Removed `emails` from `apps/server/src/domain/module-registry.ts` and `agent-knowledge-policies.ts`.
  - Workflow steps: Removed `emails` from `apps/server/src/repositories/project-repository.ts` workflow initialization (13 active workflow steps remain).
  - Prompts: Archived/deleted `prompts/email-agent.md`, removed from `prompt-registry.ts`.
  - Content module dependencies: Updated `content` parents in `module-registry.ts` to `["offer", "avatar", "mechanism", "beliefs"]` with optional parents `["landing", "funnel"]`.
- Architecture readiness for tracking & external checkouts:
  - `LandingDocument` and `FunnelDocument` prepared with optional `MetaPixelConfig` (`pixelId`, `events: ViewContent, Lead, InitiateCheckout, Purchase`) and `ExternalCheckoutConfig` (`platform: "hotmart" | "skool" | "custom" | "none"`, `checkoutUrl`).
  - Landing HTML/React exporters inject Meta Pixel script and CTA button `onclick="if(window.fbq)fbq('track','InitiateCheckout');"`.
  - Safe simulation: payments remain external or simulated (`paymentsEnabled: false` strictly enforced).
- Validation:
  - All 97 test suites (817 tests) passing GREEN across `apps/server`.
  - Server, web, and shared TypeScript checks pass with 0 errors.


## Architectural Pivot: Universal Research-to-Ebook Platform (EBOOK_ONLY), 2026-09-16

Status: **PIVOT IMPLEMENTED & VALIDATED**.

Context & Scope:
- **Core Purpose**: Hallazia is a universal platform to research *any topic* (pets, gardening, photography, parenting, cooking, business, hobbies, education, etc.) and convert that research into a complete, saleable, grounded **EBOOK** (`PRODUCT_FORMAT = EBOOK_ONLY`, `TOPIC_SCOPE = ANY_TOPIC`, `CONTEXT_SCOPE = PROJECT_ISOLATED`).
- Hallazia is **not** a platform for online courses, video academies, memberships, coaching, mentoring, communities, live sessions, or consulting services.
- Test case note: The "Perros Reactivos – Seed QA" project is strictly an isolated test fixture; no dog-specific logic or hardcoding is permitted.

Architectural Adjustments across the 10 System Areas:
1. **Prompts (`prompts/`)**:
   - `product-builder.md`: Enforces `PRODUCT_FORMAT = EBOOK_ONLY`. Modules represent chapters/parts of the Ebook; deliverables are the digital book (PDF/EPUB) and direct companion materials (Checklists, Workbooks, Quick Guides). Explicitly forbids courses, memberships, coaching, communities, or live sessions.
   - `opportunity-scorer.md`: Evaluates solving validated market problems through a complete, saleable Ebook and companion resources.
   - `offer-builder.md`: Structures the core commercial offer around the Ebook ($17–$47 book pricing range, digital bumps/upsells like Workbooks/Checklists, zero live/human delivery overhead).
   - `landing-builder.md`: Tailors the 15 canonical blocks for selling the Ebook (covers, table of contents/chapters, PDF/EPUB deliverables, bonuses, proof, guarantee, checkout CTA).
   - `funnel-builder.md`: Aligns the funnel graph to digital publication checkout (Meta Ads → Landing → External Checkout Hotmart/Skool → Ebook Delivery).
   - `content-engine.md`: Aligns organic and paid angles to drive targeted readers to the Ebook Landing page.
   - `product-generator.md`: Instructs generation of the complete, grounded, substantive Ebook with practical chapters and real depth.

2. **Module Registry (`module-registry.ts`)**:
   - Registered `final_product` with optional parents covering the entire upstream pipeline (`research`, `sources`, `problems`, `opportunities`, `product`, `avatar`, `mechanism`, `beliefs`, `offer`, `landing`, `funnel`, `content`).

3. **Dependencies & Upstream Flow**:
   - Upstream context feeds forward into the Ebook generation: Research, Market Problems, Selected Opportunity, Product Concept & Chapters, Target Avatar, Unique Mechanism, Belief Bridges, and Commercial Offer.

4. **Contracts & Capability Policy**:
   - Product capability contract in `product-output-validator.ts` maintains FAIL_CLOSED semantics on non-ebook capabilities (`COACHING_OR_SESSIONS`, `COMMUNITY_ACCESS`, `LIVE_SESSIONS`, `HUMAN_SUPPORT`, `CERTIFICATION`).

5. **Validators (`product-output-validator.ts`)**:
   - Integrated `FORBIDDEN_PRODUCT_FORMAT` regex and `isForbiddenProductFormat(value)` detector checking for `curso`, `course`, `membresia`, `membership`, `comunidad`, `community`, `coaching`, `mentoria`, `sesiones en vivo`, `talleres en vivo`, `masterclass`, `bootcamp`.
   - Populates `invalidFormatFields` and reports structural error if any forbidden format is proposed.

6. **Demo Outputs (`demo-outputs.ts` & `module-service.ts`)**:
   - Updated mock and contextual fallbacks across `product`, `offer`, `landing`, and `final_product` to `"Ebook digital"`, chapter breakdowns, PDF/EPUB deliverables, and Ebook purchase CTAs.

7. **UI / Texts (`apps/web/src/`)**:
   - `config/modules.ts`: Updated descriptions to highlight Ebook generation, chapters, and reader persona.
   - `ProductEditor.tsx`: Replaced generic placeholders with "Ebook digital (PDF/EPUB)" and renamed sections to "Capítulos".
   - `LandingBuilder.tsx`: Fixed FAQ and Offer fallbacks from "programa" to "Ebook".
   - `ModuleView.tsx`: Updated instructions placeholders and hints for Product and Funnel to Ebook digital goods.
   - `ProductStudio.tsx`: Updated creation wizard header and subtitle to focus on Ebook structure and substance.

8. **Product Studio / Producto Final (`product-studio-service.ts`)**:
   - `parentContext`: Automatically loads all 12 approved upstream stages (`research`, `sources`, `problems`, `opportunities`, `product`, `avatar`, `mechanism`, `beliefs`, `offer`, `landing`, `funnel`, `content`) via `resolveParent(projectId, stage)`.
   - `generateOutline`: Prompts generation of a complete, saleable, grounded Ebook table of contents with practical chapters.
   - `generateChapter`: Enforces substantive, practical chapter content with real depth.

9. **Memory / Context**:
   - Strict project isolation (`CONTEXT_SCOPE = PROJECT_ISOLATED`) with automatic upstream context retrieval. No cross-project leakage.

10. **Documentation**:
    - Updated `docs/SECTION_REVIEW_CHECKPOINT.md` and codebase references to reflect the universal Ebook architecture.

Validation:
- All product validator tests passing (67/67 GREEN, including dedicated tests rejecting courses, memberships, and coaching).
- All Product Studio tests passing (32/32 GREEN across `product-studio.test.ts`, `product-studio-revisions.test.ts`, `product-decisions.test.ts`, `product-studio-ui-wiring.test.ts`, `product-export.test.ts`).
- `product-contract.test.ts` passing (4/4 GREEN).
- TypeScript checks across `apps/server`, `apps/web`, and `packages/shared` pass with 0 errors.
- `git diff --check` passes with zero whitespace/merge errors.

# Sequential section review

## Scope and environment

Primary visual project: **Perros Reactivos – Seed QA**, `01a0289f-9377-70b0-b9ac-a0eb5a9dd35a`.
Keep the original database at `data/our-platform.db` and the project `.env`. Development is running with `npm.cmd run dev`, frontend 5173 → backend 4310. No paid provider requests, pushes or deployment. The local commit for this change was explicitly requested; do not create further commits without authorization. Do not create new projects or perform destructive experiments in the real project. Mutation/error fixtures belong in isolated test databases.

This is the current sequential review, superseding earlier broad visual visits as completion evidence. A visit is not SECTION PASS. On 2026-10-07 the full offline suite passed (1,142 tests); after the latest UI changes, web typecheck and web build also passed. Global visual review remains open: the complete section coverage and exact target breakpoints still need verification.

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

The remaining global condition is a pixel-level visual pass. The integrated browser has exposed local `:4310` tabs and accessibility trees, but not screenshots; two isolated Edge headless attempts also produced no PNG (GPU startup failure in sandbox, then no output with SwiftShader). Do not claim geometry/color/overflow QA from accessibility text alone. `playwright` remains undeclared and uninstalled, so no dependency was added just for a diagnostic.

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

## Checkpoint ejecución real de Oportunidades — 2026-10-01

- Con autorización explícita y límite máximo de 4 llamadas físicas, se ejecutó una sola petición real al módulo canónico de Oportunidades con DeepSeek. Registro interno: generación `01a0f5ab-381f-7489-bf89-1fb4b9854d80`, `deepseek-flash`, `COMPLETED`, `attemptCount=1`, sin reintento ni fallback; 10.192 tokens de entrada, 5.852 de salida, costo registrado USD 0,07126. Al funcionar la primera llamada, no se hizo una segunda.
- Se creó Oportunidades v7 (`01a0f5ab-a638-77cb-8717-dbddf0f4a565`), `approved/fresh`, basada en Problemas v7 (`01a0ebf9-c18e-709b-a71d-161f2961cab3`). El módulo aceptó 8 oportunidades; resultado real: seleccionada `opp-2` (“Método de seguridad y manejo físico para dueños que pierden el control del perro reactivo”), total determinista 75/100; rango 62–75.
- La verificación posterior confirmó IDs únicos, referencias al problema padre, scores válidos, fórmula determinista y `selectedId` válido. Nota: en el lifecycle actual, Oportunidades nuevas se persisten como `approved` automáticamente; no equivale a revisión humana.
- El Producto aprobado v9 (`01a0ec13-d04e-70cb-88c4-8c4779769c94`) quedó `stale` por cambio de padre; historial preservado y sin regeneración. No hubo Gemini, escritura manual de SQLite ni deploy.
- Revisión visual: la oportunidad seleccionada muestra cinco citas del Problema padre y los extractos visibles corresponden al tema de pérdida de control durante el paseo. El panel genérico inferior reúne hasta 20 citas de toda la versión; se ajustó su etiqueta para que no parezcan citas exclusivas de la oportunidad seleccionada.
- Límite de procedencia: el backend puede conciliar `evidenceIds` inválidos o ausentes con las primeras cinco citas del Problema y no conserva el arreglo previo a esa conciliación. Siete de las ocho oportunidades terminaron con exactamente esas primeras cinco citas; no se puede afirmar si las eligió DeepSeek o las completó el backend. La validación estructural es del artefacto persistido.
- Seguimiento de trazabilidad (posterior a v7): se añadió al `inputSnapshot` de futuras generaciones de Oportunidades `opportunityEvidenceResolution`, con las citas originales, aceptadas/rechazadas, persistidas y la resolución aplicada por oportunidad. Es evidencia prospectiva; no reconstruye ni altera la generación v7 ya guardada. La prueba offline cubre selección válida, descarte de ID ajeno y fallback del backend, sin llamadas externas.
- Preflight de Producto sin generación real: `product-contract.test.ts` comprueba con SQLite en memoria y fetch simulado que, al cambiar el seleccionado, el prompt de Producto recibe esa oportunidad y la nueva versión exacta queda como padre del artefacto. También exige que una respuesta DeepSeek estructuralmente inutilizable se detenga tras una sola petición y no cree versión. Pasó 6/6; no toca el proyecto real ni sustituye una futura ejecución autorizada.
- La selección anterior (v6) provenía de `item-1` y trataba la reactividad general durante el paseo; la nueva (v7) proviene de `item-2` y se centra en seguridad y control físico. Producto v9 describe todavía la guía general, por lo que no basta con cambiarle el enlace de versión: requiere una revisión de contenido antes de volver a quedar vigente.

### Seguimiento de Producto real desde Oportunidades v7 — 2026-10-01

- Se hizo una sola llamada real a DeepSeek (`deepseek-flash`) para Producto v10, generación `01a0fa6d-ce54-74e4-9c53-b0e469d58cde`: `COMPLETED`, intento directo 1, sin retry/fallback; 11.304 tokens de entrada, 2.500 de salida, costo registrado USD 0,03913. Padre exacto: Oportunidades v7 `01a0f5ab-a638-77cb-8717-dbddf0f4a565`.
- La primera versión quedó `draft/fresh` por dos promesas no respaldadas. Se corrigieron únicamente esas dos cadenas mediante el endpoint canónico de borrador, preservando los demás campos y sin proveedor ni edición directa de SQLite. Producto v11 (`01a0fa71-2996-71c9-a642-6bd29deb14cf`) sigue `draft/fresh`; la validación recomputada por el endpoint del módulo devuelve `ok=true`, cero afirmaciones no respaldadas. No se aprobó.
- En la validación posterior autorizada por el usuario para Oportunidades, no se volvió a llamar a DeepSeek: la petición real previa ya había sido exitosa (un intento), por lo que se detuvo según el límite “si la primera funciona, no hagas la segunda”. Sin commit ni push.
- El workflow permanece en Producto `IN_PROGRESS`; las etapas descendientes continúan `STALE` y no se regeneraron. El artefacto crudo del endpoint de artefactos conserva la auditoría original de v10, pero el endpoint canónico del módulo recalcula la auditoría correcta para v11; no se creó otra versión para sincronizar metadatos redundantes.

### Revalidación local y visual — 2026-10-01

- El API local de solo lectura confirma Oportunidades v7 `approved/fresh`, Producto v11 `draft/fresh` con `productValidationAudit.ok=true` y `unsupportedClaims=[]`; el workflow mantiene Producto `IN_PROGRESS` y los descendientes `STALE`. Health: SQLite `ok`, schema 15.
- El `inputSnapshot` persistido de Oportunidades v7 no contiene `opportunityEvidenceResolution`; fue creado antes de la mejora prospectiva. El código persiste `output_data` después de conciliar las citas, así que no se puede reconstruir de forma fiable cuáles IDs eligió DeepSeek frente al fallback local, sin repetir generación.
- Se dejó visible la vista local de Oportunidades en el navegador: Versión 7 vigente, ocho oportunidades, 39 citas/evidencias en la versión, selección `opp-2` con puntuación 75/100 y cinco citas vinculadas. No se modificó ni aprobó ningún artefacto desde la UI.
- No hubo llamadas a proveedores en esta revalidación, ni commit, push o deploy. La única decisión pendiente para avanzar es la aprobación humana de Producto v11.

### Telemetría de solicitudes físicas DeepSeek — 2026-10-01

- Cada petición física del adapter DeepSeek conserva su número de intento y tokens reportados. Si la recuperación de schema tiene éxito, `LlmUsage` suma ambos intentos y `structuredOutputDiagnostics.physicalRequests` conserva el desglose; si falla, `IntegrationError` transporta el detalle a `generations.input_snapshot.providerAttempts` y la fila fallida registra tokens y costo estimado disponibles.
- Verificación local: `deepseek-provider.test.ts` cubre recuperación y fallo tras dos intentos; `product-contract.test.ts` comprueba persistencia de uso en SQLite temporal con respuesta simulada. Esto no reejecuta ni altera Oportunidades v7, y no hizo llamadas reales a proveedores.

### Reanudación y auditoría offline de Producto v11 — 2026-10-02

- Lectura SQLite estrictamente `readOnly`: Oportunidades v7 sigue activa `approved/fresh`; Producto v9 sigue activa pero `stale`; Producto v11 es `draft/fresh` con padre exacto Oportunidades v7. El workflow conserva Producto `IN_PROGRESS` y sus descendientes `STALE`.
- Se recalculó el contrato de v11 desde su `input_snapshot` y `output_data` persistidos usando `validateProductOutput` compilado, sin iniciar servicios ni llamar proveedores: `ok=true`, `complete=true`, `grounded=true`, cero claims no respaldados, cero IDs de evidencia sin resolver y sin errores estructurales. Sus 15 citas están dentro del snapshot permitido.
- El `productValidationAudit` almacenado dentro de `output_data` aún arrastra el resultado de v10 (dos claims no respaldados); no se editó directamente la BD ni se creó una versión para sincronizar ese metadato. La validación canónica recalculada es la evidencia actual para el borrador de origen `user`.
- El usuario aprobó explícitamente Producto v11. Se ejecutó el endpoint canónico de aprobación tras verificar que el borrador seguía `draft/fresh`, el contrato recalculado estaba `ok=true` y Oportunidades v7 seguía `approved/fresh`. v11 quedó activa `approved/fresh`; v9 pasó a `superseded/stale`; el workflow marca Producto `COMPLETED`.
- Las ocho etapas descendientes continúan `STALE` y no se generaron. Verificación posterior de SQLite: `integrity_check=ok`, `foreign_key_check` sin filas; la última generación sigue siendo Producto v10. Cero llamadas a proveedores en la aprobación, sin edición directa de SQLite, commit, push ni deploy.
- Continuación acotada: Avatar se generó una vez con Gemini (`gemini-3.5-flash-lite`), generación `01a0fb23-4c2d-76bb-8f90-e223afdaf499`, `COMPLETED`, un intento HTTP 200; 12.614 tokens de entrada, 1.684 de salida, costo registrado USD 0,0326075. No hubo segundo intento ni fallback.
- Avatar v4 (`01a0fb23-7c77-725f-ad00-e886ca26c93b`) quedó `approved/fresh`, con padre Producto v11, auditoría canónica `ok=true` y sin errores. Verificación posterior: workflow Avatar `COMPLETED`; Mecanismo, Creencias, Oferta, Landing, Funnel, Content y Final Product siguen `STALE`; integridad SQLite `ok`, sin violaciones FK.
- Próximo módulo pendiente: Mecanismo. No se generó en esta continuación; detenerse antes de más consumo de proveedor. No se reutilizó la autorización anterior de DeepSeek para Oportunidades; sin commit, push ni deploy.

### Continuación real de Mecanismo — 2026-10-02

- Tras la aprobación de Producto v11 y Avatar v4, se ejecutó una sola solicitud al endpoint canónico de Mecanismo con Gemini. Generación `01a0fb2b-a4c8-7406-aeaa-0c8d3010255c`, versión `01a0fb2b-bd56-72ac-950e-2f77d83455c8` (v3), modelo `gemini-3.5-flash-lite`, `COMPLETED`, 13.822 tokens de entrada, 1.251 de salida, costo estimado USD 0,0297875; 6,38 s. No se lanzó una segunda generación.
- La v3 quedó `approved/fresh` y el audit estructural devuelve `ok=true`, pero una inspección del contenido confirma un bloqueo de calidad: presenta como explicación que la tensión del tutor se transmite al perro y causa/reactiva su respuesta; asegura que mantener la calma y manejar la correa hará que el perro recupere la tranquilidad; atribuye efectos fisiológicos y recomienda una posición concreta de correa/refuerzos. Producto v11 limita expresamente el material a manejo educativo, sin causalidad ni eficacia demostrada, y Avatar v4 solo respalda experiencias reportadas, no esos mecanismos causales.
- Causa técnica confirmada en `validateMechanismOutput`: verifica campos de texto/listas, pertenencia de IDs de evidencia y `provenance`; no comprueba respaldo semántico, consistencia con el producto padre ni seguridad de las recomendaciones. Por eso un resultado inferido y contradictorio pudo quedar aprobado automáticamente.
- Mecanismo v3 no se propagó a Creencias ni Oferta. Sin otra llamada a proveedor, se creó por el endpoint canónico el borrador v4 `01a0fb32-bdac-702a-8c65-805ce5c03ae5`, basado en v3 con CAS; separa observaciones de hipótesis, quita causalidad/eficacia no demostradas y conserva límites y revisión profesional. Su auditoría estructural es `ok=true`; sigue `draft/fresh` y no se autoaprobó. El activo v3 permanece aprobado hasta revisión y aprobación explícitas, así que no generar descendientes mientras siga activo.
- Para evitar repetir la autoaprobación, las generaciones nuevas de Mecanismo ahora quedan `draft` por defecto; solo los fixtures sintéticos de Demo se autoaprueban para mantener su flujo de prueba. Además, toda etapa dependiente se bloquea antes de llamar al proveedor si existe un borrador fresco de Mecanismo basado en el activo actual; la misma condición se vuelve a comprobar dentro de la transacción antes de publicar, cubriendo cambios concurrentes. Borradores cuya versión base ya cambió no bloquean.
- Pruebas de guardado/aprobación/CAS y bloqueo sin nueva generación, más Demo E2E: 8/8 pasan. Build, typecheck y `git diff --check` del servidor pasan. (Estado actualizado el 2026-10-02: el usuario autorizó y aprobó después Mecanismo v4 y Creencias v4; véase el checkpoint de reanudación y la verificación runtime posterior.) No hubo edición directa de SQLite, commit, push o deploy.

### Reanudación de Oferta y revisión segura de estrategia — 2026-10-02

- Estado runtime confirmado antes de generar: API `ok`, SQLite `ok`, schema 15; Gemini configurado. Producto v11, Avatar v4, Mecanismo v4 y Creencias v4 estaban `approved/fresh`; Oferta v2 estaba obsoleta.
- Se corrigió `toGeminiResponseSchema` para convertir uniones JSON Schema en `anyOf`, con campos específicos solo en ramas del tipo correcto; Gemini usa `generationConfig.responseJsonSchema`. Una única generación real de Oferta con Gemini terminó `COMPLETED`, generación `01a0fb59-7c08-7469-b1e3-ba5d40c9df8d`, intento 1 HTTP 200, modelo `gemini-3.5-flash-lite`, 11.138 tokens de entrada, 860 de salida, costo USD 0,0225225, 6,812 s. No se hizo otra llamada ni fallback.
- La salida estructuralmente válida se autoaprobó como Oferta v3, pero incluía garantía de devolución de 7 días, condiciones de pago/acceso inmediato, un precio apoyado en un rango de mercado no verificado y un order bump no autorizado. El hallazgo confirmó que el validador estructural no es revisión comercial.
- Sin editar SQLite ni llamar proveedores de nuevo, endpoints canónicos guardaron y aprobaron Oferta v5 (`01a0fb64-5eec-7194-875d-0e3f648c1aea`) por CAS. La versión activa está `approved/fresh`, con auditoría `ok=true`, precio `null`, sin garantía, sin bonos propuestos presentados como incluidos, y sin order bump/upsell/downsell. v3/v4 y el historial se conservaron.
- El código nuevo deja las Ofertas y Landings generadas en `draft`, bloquea dependientes mientras exista un borrador fresco basado en el padre activo, repite el gate al confirmar contexto de generación y difiere exportar Landing hasta aprobación. La ruta Demo aprueba explícitamente solo estos fixtures sintéticos para no alterar su recorrido.
- Tests focalizados tras esos cambios: Landing, Oferta, sus validadores, matriz de proveedores Gemini/DeepSeek y Demo E2E, 34/34; typecheck del servidor y `git diff --check` pasan. El endpoint runtime confirma Oferta v5 `approved/fresh`, precio nulo y ausencia de garantía. No hubo edición directa de SQLite, commit, push ni deploy.
- Siguiente etapa: Landing queda por generar una sola vez con el proveedor configurado, revisar el borrador y sus afirmaciones antes de aprobarlo; todavía no se generó en esta reanudación.

### Reanudación Landing → Funnel → Contenido → Producto final — 2026-10-02

- Una sola generación real Gemini para Landing creó v7; SQLite de solo lectura confirma un intento directo HTTP 200, 23.443 tokens de entrada y 448 de salida. El contenido llegó con 15 bloques que solo tenían `type`; el esquema anterior no requería texto. La auditoría lo mantuvo en draft (16 errores). El esquema de proveedor ahora exige `type`, `headline` y `body` por bloque, y el Demo sintético completa esos campos sin afirmarlos como reales.
- Por endpoint canónico se guardó Landing v8 (`01a0fb6c-1171-7328-81a4-983bffa4b4e8`) desde los padres vigentes: 15 bloques informativos, cero IDs de evidencia inventados, precio/bonos/garantía no definidos y etiqueta de borrador interno. Auditoría `ok=true`, `approved/fresh`; solo entonces se exportaron HTML/React.
- Funnel: Gemini intentó una sola vez y devolvió `PROHIBITED_CONTENT` (candidato 0, no reintentable); no se insistió con Gemini. Con autorización de proveedor alterno, una solicitud DeepSeek (`deepseek-flash`) completó en intento 1 (8.325/1.062 tokens, USD 0,00420525). Funnel v5 fue draft y su revisión detectó Hotmart/Skool, bump/upsell/downsell activos y eventos de compra no autorizados. Se conservó el historial; v7 (`01a0fb73-8d45-7301-98e8-444a54d3a7f4`) quedó `approved/fresh` con checkout y entrega placeholders inactivos, plataforma `none`, pagos false y cero eventos de tracking. La versión v6 conservada falló CAS; eso descubrió y corrigió el guardado de borradores Funnel para registrar el puntero activo, sin reescribir versiones previas.
- Contenido: una generación real Gemini, intento 1 HTTP 200 (9.385/693 tokens, USD 0,01866125). El borrador v3 se reformuló sin otra llamada mediante endpoint canónico; Contenido v4 (`01a0fb7b-42fe-7440-975f-9e12751be019`) está `approved/fresh`, con canales orgánicos/Landing, `PROPOSED_NOT_PUBLISHED`, sin anuncios pagados ni promesas de precio, garantía o resultado.
- Producto final: una generación real Gemini, intento 1 HTTP 200 (24.842/1.155 tokens, USD 0,0426025). La versión v2 (`01a0fb7b-f7af-76df-ab59-e38a0d3069a5`) sigue `draft/fresh`: contiene nueve títulos de capítulo, cuatro checklists, tres plantillas y un esquema de mini-herramienta, no los capítulos redactados. No se aprobó ni se exportaron archivos del v2; el exportador deja texto marcador “Contenido de trabajo para completar y editar”, por lo que todavía no es un producto editorial terminado.
- Los módulos Oferta, Landing, Funnel, Contenido y Producto final generados por proveedor ahora quedan en draft; se bloquean dependientes mientras el borrador vigente espera aprobación. Landing/Funnel/Producto final exportan solo después de aprobar. Demo conserva su recorrido con aprobación explícita de fixtures sintéticos. Content/Final Product admiten edición de borrador por endpoint canónico y CAS.
- Validación tras cambios finales: 37 tests focalizados pasaron, typecheck del servidor pasó y `git diff --check` pasó. La suite completa se ejecutó una vez antes de los últimos gates: 973/987 tests; las 14 fallas pertenecían a `product-studio-revisions.test.ts`. Se corrigió el fixture para seleccionar explícitamente `mock` en el setup determinista; las pruebas que examinan el proveedor habilitan su fake OpenAI deliberadamente. La ejecución focalizada posterior pasó 14/14. No se repitió la suite completa, así que no se afirma que el total haya sido rerun ni que esté confirmado verde.
- Estado runtime final: salud API/SQLite `ok`, schema 15; Producto v11, Avatar v4, Mecanismo v4, Creencias v4, Oferta v5, Landing v8, Funnel v7 y Contenido v4 `approved/fresh`; Producto final v2 `draft/fresh`, aún sin export. No hubo edición directa de SQLite, commit, push ni deploy.

### Gate de manuscrito final y reanudación de ProductStudio — 2026-10-02

- El esquema del módulo `final_product` ahora pide introducción, conclusión y capítulos estructurados con título/contenido; se acepta el formato histórico de títulos para repararlo, pero la auditoría lo marca incompleto. Para aprobar se requieren al menos tres capítulos, 150 palabras por capítulo y 60 por introducción/conclusión. Es un umbral mecánico de completitud, no una certificación factual/editorial.
- La aprobación y exportación quedan bloqueadas hasta cumplir ese umbral. El exportador compone el manuscrito con el texto recibido y ya no agrega “Contenido de trabajo para completar y editar.”. Demo deja Producto final en `draft/IN_PROGRESS`, con muestra marcada sintética, sin exportarlo como ebook.
- Verificación focalizada: `content-review-contract.test.ts` confirma rechazo de manuscrito incompleto, aprobación/exportación tras revisión completa y contenido real en la descarga; `module-provider-routing.test.ts` (DeepSeek/Gemini simulados estructuralmente, solo pruebas locales) y `demo-e2e.test.ts` pasan; `product-studio-revisions.test.ts` pasa 14/14 tras configurar su fixture determinista como `mock`. No se repitió la suite completa: su última ejecución histórica fue 973/987 antes de estos cambios.
- Sin llamadas a proveedores en esta continuación; Oportunidades v7 conserva la única llamada real autorizada ya registrada arriba. No hubo edición directa de SQLite, commit, push o deploy. El manuscrito runtime v2 sigue draft y no se ha regenerado ni exportado.

### Revisión editorial real del manuscrito final — 2026-10-02

- Continuación con autorización de una sola ejecución real de Gemini para intentar completar Producto final: generación `01a0fba0-4988-779b-aefb-57023f0eb5bb`, modelo `gemini-3.5-flash-lite`, un intento directo HTTP 200 (`STOP`, candidato 1), 24.962 tokens de entrada y 3.435 de salida; costo estimado USD 0,0655525. No se hizo otro intento ni se repitió DeepSeek de Oportunidades v7, cuya llamada real exitosa ya consta arriba.
- La generación produjo nueve capítulos demasiado breves (92–127 palabras cada uno), por debajo del mínimo de 150, y con afirmaciones causales y recomendaciones de manejo no respaldadas por el corpus. Se conservó como borrador v3, no se aprobó ni exportó. Revisión contrastada con la posición de AVSAB sobre entrenamiento humano y guía de manejo de perros temerosos; las fuentes respaldan priorizar métodos basados en recompensa, manejo del entorno/espacio y consulta veterinaria cuando corresponde, pero no las causalidades o técnicas concretas del borrador.
- El endpoint canónico guardó v4 como borrador, pero la primera corrección no adjuntó las referencias requeridas por un problema de serialización en PowerShell; la auditoría la rechazó (`draft`, no exportada). Sin editar SQLite ni volver al proveedor, una segunda revisión por endpoint canónico creó v5 `01a0fbae-be8c-7469-b7e8-0d194351d036`, derivada de v4. Auditoría actual: `ok=true`, `complete=true`, 9 capítulos, referencias HTTPS de AVSAB, 1.859 palabras totales y cero errores. Los capítulos contienen 176–198 palabras; introducción y conclusión, 94 y 117. `evidenceIds` está vacío para no atribuir recomendaciones generales a comentarios del corpus.
- La v5 fue revisada manualmente para quitar causalidad tutor-perro no demostrada, instrucciones de tensión/dirección de correa y promesas de eficacia. Incluye límites de alcance, medidas ambientales de seguridad y derivación veterinaria ante cambios repentinos o riesgo. Es un borrador educativo, no diagnóstico ni consejo clínico individual. La completitud estructural no certifica por sí sola el respaldo factual ni sustituye aprobación editorial.
- Estado runtime al guardar: Producto final v5 `draft/fresh`; workflow `IN_PROGRESS`; no exportación y ningún archivo asociado. v3 y v4 se conservaron en el historial. No se ejecutó endpoint de aprobación. La UI observada en navegador local permanece en Oportunidades v7; no se interactuó con el control de regeneración ni con controles de publicación.
- Código relacionado añade requisito de dos referencias HTTPS, auditoría de completitud al guardar/generar y bloqueo de aprobación si está incompleto; el exportador incluye capítulo y referencias. Gemini para Producto final queda limitado a un intento por generación. Verificación focalizada de servidor: contrato de revisión, ruta de proveedores (incluido test de corte tras 503) y Demo E2E, 7/7; pruebas de revisión de producto final/proveedores, 4/4; typecheck servidor correcto. `product-studio-revisions.test.ts`, 14/14, y typecheck anteriores también pasaron. La suite completa no se repitió; última cifra conocida sigue siendo 973/987 antes de las correcciones focalizadas.
- Sin cambios directos a SQLite, sin nuevas llamadas tras Gemini, sin commit/push/deploy. La interfaz/versión visual de Producto final no se abrió durante esta inspección; por tanto no se afirma QA visual de ese manuscrito.

### Corrección canónica de títulos y archivos del manuscrito — 2026-10-02

- La lectura GET del módulo confirmó que v5 enumeraba nombres DOCX/PDF que el exportador no produce; no había archivos generados asociados a v5. El exportador real produce `guide.md`, `checklist.md`, `workbook.md` y `mini-tool.html` solo al aprobar. También se detectó desalineación entre varios títulos de capítulo y su contenido.
- Sin proveedor ni modificación directa de SQLite, se guardó por endpoint canónico Producto final v6 `01a0fbb8-3c13-761d-af86-9f0b1d10c14d`, con CAS desde v5. Se alinearon nueve títulos con sus textos y se dejó `files: []` para no anunciar formatos inexistentes. Sigue `draft/fresh`; no se aprobó, exportó ni publicó. La v5 histórica se conserva.
- Persisten limitaciones no resueltas: el manuscrito es breve (~1.859 palabras), el mínimo de palabras solo demuestra completitud mecánica y las dos referencias no son citas por párrafo. No se presenta como ebook profesional terminado ni como revisión clínica. El paso siguiente requiere una expansión sustantiva y una revisión editorial/factual antes de aprobar o exportar.
- No hubo llamadas externas adicionales, edición directa de SQLite, commit, push o deploy.
- Como continuación autónoma de la revisión, se amplió el borrador sin usar proveedor: versión 7 `01a0fbbc-e04e-7298-9eb0-0e87b414c85e`, guardada por endpoint canónico desde v6. Nueve capítulos ahora tienen 234–251 palabras cada uno; el total auditado es 2.383 palabras, con siete puntos de checklist y cinco ejercicios/hojas de trabajo. Los títulos corresponden al contenido, `files: []`, `audit.ok=true`, `draft/fresh`.
- v7 sigue siendo un borrador breve y educativo, no un ebook profesional terminado: la validación mecánica no comprueba rigor de cada afirmación, las referencias son generales y no hay citas por párrafo ni revisión independiente de especialista. No se aprobó ni exportó. La inspección UI de solo lectura no llegó a la vista de Producto final; no se afirma QA visual del manuscrito.
- La salud de la API local respondió `ok`; verificación final Git queda sin commit/push/deploy.

### Recuperación de interfaz local y fuentes AVSAB actuales — 2026-10-03

- Revisión visual detectó que `127.0.0.1:5173` y API `:4310` ya no aceptaban conexiones; la pestaña retenía estado cacheado y mostraba `Failed to fetch`. `Get-NetTCPConnection` fue denegado por el entorno. Inspección confirmó configuración del frontend: proxy `/api` hacia backend `127.0.0.1:4310`; startup completo de monorepo falló (`tsx` recibió `uv_os_get_passwd ENOMEM`, Vite fue denegado al leer ruta superior) y los procesos de ese intento terminaron.
- Verificación SQLite solo lectura en `data/our-platform.db`: `integrity_check=ok`, esquema 15 (igual a `LATEST_SCHEMA_VERSION`), proyecto Perros Reactivos presente. La tabla jobs tenía 26 `COMPLETED`, ningún trabajo pendiente; el `resumePending()` normal del servidor no lanzó llamadas externas.
- Build shared y build del servidor pasaron. Se levantó servidor compilado de fuente actual en `127.0.0.1:4310` con `DATA_DIR=./data`, salud API/SQLite `ok`, schema 15 y GET `/api/projects` devuelve el proyecto activo. El servidor sirve `apps/web/dist`. Build web actual pasó (`tsc -b` + Vite; 2.247 módulos), con advertencia no bloqueante de chunks de 545/600 kB. La UI tras recarga ya muestra el hub y el proyecto real (12/13 etapas, 92%); se mantiene abierta en `http://127.0.0.1:4310/`. La interacción visual para entrar en el workspace no respondió, así que no se afirma QA visual de su pantalla Producto final. El Vite dev original `:5173` sigue detenido.
- Navegación web oficial de AVSAB actualizada para la revisión editorial: su página pública presenta el comunicado de 2025 que reafirma el position statement de entrenamiento humano 2021; la guía “How to Choose a Trainer” actualmente enlazada es un PDF de 2026 y recomienda consultar veterinario con conocimiento avanzado de conducta/DACVB/consultor conductual acreditado ante miedo, ansiedad o agresión, aclarando que credenciales no garantizan calidad por sí solas. Página AVSAB sobre cambios súbitos aporta cautela para valorar salud/dolor con veterinario.
- Nueva revisión canónica, sin proveedor, Producto final v9 `01a10055-6db5-73a2-9e6a-6600fca21630`: bibliografía actualizada a cinco referencias AVSAB y marcadores de fuente en seis capítulos. Auditoría `ok=true`, 9 capítulos (234–297 palabras cada uno), 2.575 palabras, sin errores; `files=[]`, ningún archivo generado. Sigue `draft/fresh`, workflow `IN_PROGRESS`; no aprobación, exportación ni publicación.
- No hubo llamadas a Gemini/DeepSeek ni otros proveedores, edición directa de SQLite, commit, push o deploy. La última suite focalizada permanece la de la revisión anterior (no invalidada por cambios de código, pues en esta continuación no se cambió código fuente); full suite histórica 973/987 sigue sin repetirse.

### Auditoría de citas en Producto final — 2026-10-03

- Se endureció `validateFinalProductOutput`: ahora exige IDs de fuente `R1`, `R2`, etc., marcadores en línea con formato `(R1)` / `(R1, R2)`, rechaza IDs citados no listados y referencias listadas nunca citadas, y registra `citationCount` más `citedReferenceIds` en el audit. El prompt del generador especifica la misma sintaxis y exige no inventar ni dejar referencias sin uso.
- Pruebas unitarias nuevas cubren cobertura válida, cita huérfana, referencia no utilizada e ID con formato inválido. La prueba de contrato de aprobación/exportación usa marcadores válidos en sus fixtures. Resultado focalizado: `final-product-output-validator.test.ts` + `content-review-contract.test.ts`, 5/5; typecheck server y build server pasan; `git diff --check` sin errores (solo advertencias CRLF previas).
- Sin modificar el proyecto, se aplicó el validador compilado a la v9 recuperada por el endpoint local: `ok=true`, 7 citas, todas las referencias `R1`–`R5` citadas, cero errores; permanece `draft/fresh`, sin archivos. Se reinició el servidor local con el build actual y el nuevo proceso escucha en `127.0.0.1:4310`.
- No se repitió suite completa, no hubo llamadas de proveedor, edición directa de SQLite, commit, push o deploy. Vite `:5173` sigue sin arrancar por restricción de lectura del sandbox; el frontend de producción local sigue en `:4310`.

### Expansión editorial aplicada al borrador de Producto final — 2026-10-03

- Sin proveedor, se amplió manualmente Producto final v9 mediante el endpoint canónico del módulo, conservando su bibliografía, marcadores de citas, `files: []` y el estado de borrador. La v10 guardada inicialmente tenía separadores de párrafo serializados como texto literal; se detectó en la lectura de respuesta y se corrigió mediante otra revisión canónica, sin tocar SQLite directamente.
- La versión vigente es v11 `01a10069-c086-756d-a14a-894718b8d6d7`, derivada de v10 con CAS contra la base activa. GET posterior confirma `draft/fresh`, 9 capítulos de 336–416 palabras, 3.670 palabras auditadas, 10 citas en línea que cubren R1–R5, 10 elementos de workbook, 11 campos de mini-herramienta, cero errores y cero archivos exportados. No se aprobó ni publicó.
- La expansión añade fichas prácticas para separar observaciones de hipótesis, registrar episodios, planificar alternativas, priorizar seguridad, preparar consultas y revisar el entorno sin sugerir exposición deliberada ni evaluación clínica casera. La auditoría es estructural/de citas; no certifica por sí sola calidad clínica/editorial. El borrador sigue requiriendo revisión profesional antes de publicarse.
- Salud API/SQLite verificada: `ok`, esquema 15. No hubo llamadas a Gemini/DeepSeek, commit, push ni deploy.

### QA visual responsive del hub — 2026-10-03

- La captura real del navegador en un viewport de 663 px confirmó que la vista inicial del Hub comprimía el encabezado y distribuía acciones de la tarjeta de proyecto en una columna estrecha. Se ajustó el layout para el rango hasta 760 px: encabezado y acciones de proyecto apilados y métricas en una columna legible.
- `npm run typecheck --workspace @our-platform/web` y `npm run build --workspace @our-platform/web` pasaron; Vite transformó 2.247 módulos. Se mantiene la advertencia existente de bundles grandes (545/600 kB), no bloqueante para este cambio.
- Tras recargar el frontend servido en `:4310`, la captura y la geometría confirmaron: botones de encabezado completos; botones de proyecto dentro del ancho visible; tres métricas apiladas; `document.scrollWidth` igual a `innerWidth` (663 px), sin desplazamiento horizontal. El halo visual de las métricas desborda su `scrollWidth` interno por diseño, pero queda recortado por `overflow:hidden` y no causa overflow del documento.
- La navegación automatizada no salió del Hub al activar «Abrir workspace» en este intento; por ello esta pasada no verifica visualmente la pantalla de Producto final ni el estado del manuscrito dentro de ese editor. No se tocó aprobación/exportación ni se generaron llamadas a proveedores.
- En la inspección de la tarjeta se confirmó que la descripción persistida comenzaba con «nvestigación» (faltaba la I inicial). Se corrigió solo ese carácter mediante PATCH canónico del proyecto y se comprobó por GET que la descripción ahora comienza «Investigación», conservando nombre, nicho y estado `active`; la tarjeta recargada refleja el texto corregido.

### Vista del manuscrito canónico en Producto final — 2026-10-03

- La API tenía Producto final v11 vigente (`draft/fresh`, auditoría estructural válida), pero la ruta React `final_product` mostraba exclusivamente Product Studio, cuyo documento independiente v65 estaba marcado `STALE`. Se añadió una vista de lectura predeterminada para el manuscrito seleccionado, con capítulos, conclusión, checklist, workbook, bibliografía y resumen de auditoría; Product Studio permanece accesible en una segunda pestaña como espacio y lineage separados.
- QA local de interfaz en pestaña nueva: se abrió el workspace y Producto final; el árbol accesible muestra Manuscrito v11 con 9 capítulos, 3.670 palabras, 5 referencias y auditoría estructural aprobada. Al cambiar de pestaña, Product Studio muestra su documento v65 `STALE`, histórico y de solo lectura; se volvió a dejar abierta la pestaña del manuscrito. La captura de pantalla falló dos veces, así que no se afirma inspección visual de píxeles ni de geometría responsive de esa pantalla.
- No se modificó ningún documento persistido ni se aprobó/exportó el manuscrito. Typecheck web y build de producción pasan; Vite transformó 2.247 módulos y conserva la advertencia no bloqueante de bundles grandes. `git diff --check` pasa para los archivos del cambio.
- No hubo llamadas a proveedores, edición directa de SQLite, commit, push ni deploy.

### Edición segura del manuscrito y ajuste del hub — 2026-10-03

- Se añadió edición de borrador en la vista del manuscrito canónico (título, introducción, capítulos, conclusión, checklist y workbook). El guardado utiliza el endpoint canónico con `sourceVersionId` exacto; referencias/citas permanecen intactas y el servidor vuelve a validar antes de persistir una versión nueva. No se guardó ninguna edición ni se modificó el manuscrito runtime.
- La captura del Hub tras recompilar muestra encabezado, acciones y métricas apiladas en el pane estrecho; los rótulos quedan visibles en la interfaz y el árbol accesible conserva todos los controles. El ajuste responsive queda limitado al Hub en 761–1.700 px.
- Navegación visual local completada: abrí el workspace y Producto final; v11 aparece con 9 capítulos, 3.670 palabras, 5 referencias y auditoría estructural aprobada. Expandí el capítulo 1 y confirmé campos editables para título/contenido; el título general, introducción, conclusión, checklist y workbook también son campos editables. El botón de guardado está deshabilitado sin cambios. No escribí ni edité contenido durante esta prueba.
- `npm run typecheck --workspace @our-platform/web` pasó y el build web pasó (2.247 módulos); continúa la advertencia no bloqueante de chunks JS >500 kB. La captura confirma la estructura y controles del manuscrito; no se afirma medición DOM de overflow en todos los tamaños.
- Continuación: una edición temporal del título en navegador activó el aviso de cambios y el botón de guardado, pero no se envió el formulario; tras recargar, GET local confirmó v11 `draft/fresh`, título original y ausencia del marcador temporal. `final-product-output-validator.test.ts` + `content-review-contract.test.ts` pasaron 5/5 en SQLite en memoria; fixtures locales, sin egress de proveedores.
- No se hicieron llamadas a proveedores, escrituras runtime, aprobación, exportación, commit ni push en esta continuación.

### Overview: conteo de estados y pane estrecho — 2026-10-03

- QA del Overview local detectó que una etapa `IN_PROGRESS` desaparecía del resumen: mostraba 12 ejecutadas, 0 requieren revisión y 0 pendientes, aunque Producto final estaba «En curso» y el workflow era 12/13. El resumen ahora contabiliza explícitamente los seis estados (`COMPLETED`, `IN_PROGRESS`, `READY`, `STALE`, `PENDING`, `BLOCKED`); en el proyecto real se observa 12 ejecutadas + 1 en curso = 13.
- Se añadió el regression test `overview-ui.test.mjs`; resultado 8/8. Typecheck y build web pasan. La verificación del navegador después de recargar confirma el conteo corregido, y la captura muestra el progreso apilado y la leyenda en una grilla legible para el pane estrecho.
- Sin llamada a proveedor, mutación runtime, aprobación o exportación. El producto sigue en draft y la aprobación editorial sigue pendiente; no commit/push/deploy.

### Numeración visible de etapas en Overview — 2026-10-03

- La UI mostraba 13 etapas, pero numeraba Contenido como 13 y Producto final como 14. La migración conserva la posición histórica de Emails (12), mientras `WorkflowRepository` excluye ese paso del workflow activo. Se mantiene intacta la posición persistida y el Overview ahora asigna ordinales consecutivos a los pasos presentados.
- Regression test rojo antes del cambio (`01, 13, 14` en vez de `01, 02, 03`) y verde después: `overview-ui.test.mjs` 9/9. Typecheck web y build web pasan; el build conserva la advertencia no bloqueante de bundles >500 kB.
- La pestaña preexistente conservaba un Overview antiguo; tras recargar el frontend de `:4310`, el árbol accesible del runtime confirmó `12 Contenido` y `13 Producto final`, y el resumen `12 ejecutadas + 1 en curso`. La captura de pantalla del navegador no estuvo disponible, así que esto verifica contenido/accesibilidad tras la recarga, no píxeles ni geometría visual. No hubo mutación del workflow/runtime, llamada a proveedor, aprobación, commit ni push.
- En la misma sesión se abrió Producto final en solo lectura: manuscrito v11 `Borrador · Vigente`, 9 capítulos, 3.670 palabras, 5 referencias y auditoría estructural aprobada. El control de guardado estaba deshabilitado sin cambios. No se aprobó, rechazó, regeneró ni exportó; el gate editorial humano sigue pendiente.

### Gate de validación offline integral — 2026-10-03

- La primera ejecución completa encontró 2 fallos en la matriz compartida de rutas de proveedores: los fixtures de Final Product no citaban sus referencias en línea, como ahora exige el validador. Se corrigió únicamente el fixture para incluir `(R1, R2)`; no se debilitó el validador.
- Revalidación focalizada: `module-provider-routing.test.ts` 3/3. Suite final: `npm test`, 123 archivos y 997 pruebas pasaron. `npm run typecheck` pasó en shared/server/web; `npm run build` pasó (2.247 módulos). Vite mantiene advertencia no bloqueante de chunks grandes (~552 y ~600 kB).
- Sin llamadas reales a proveedores, escritura runtime, aprobación, exportación, commit ni push. El gate de aprobación editorial de Producto final v11 y la revisión humana siguen pendientes.

### Revisión factual y nueva versión de Producto final — 2026-10-03

- Se contrastó la atribución de R2–R5 con material oficial alojado por AVSAB. Dos páginas citadas son artículos de autores invitados, no declaraciones institucionales: R2 es de Zazie Todd, PhD, y trata manejo ambiental como parte —no la totalidad— de la ayuda a perros temerosos; R5 es una entrada invitada sobre cambios repentinos de conducta y posible dolor. La guía institucional de selección de entrenador menciona señales relacionadas con dominancia/sumisión, pero no respalda por sí sola etiquetar “agresivo” como diagnóstico ni como señal profesional equivalente.
- Se corrigieron esas atribuciones y el alcance de las afirmaciones en una revisión canónica del borrador. Producto final v12 (`01a100df-b43b-74ad-ba81-782373c96c35`) deriva de v11 (`01a10069-c086-756d-a14a-894718b8d6d7`) usando `sourceVersionId` como control de concurrencia; v11 se conserva intacta.
- GET posterior confirmó v12 `draft/fresh`, 9 capítulos, 3.718 palabras, 10 citas en línea que cubren R1–R5, cinco referencias y auditoría `ok=true`, `complete=true`, sin errores. La API de workflow conserva Producto final `IN_PROGRESS`; etapas previas completadas. La UI local refleja v12, sin cambios pendientes de guardado.
- Fuentes consultadas: [AVSAB, Position Statements](https://avsab.org/resources/position-statements/); [AVSAB, How to Choose a Trainer (2026)](https://avsab.org/wp-content/uploads/2026/08/How-to-Choose-a-Trainer-final-final.pdf); [artículo invitado de Zazie Todd alojado por AVSAB](https://avsab.org/staying-safe-management-for-fearful-dogs/); [artículo invitado sobre cambios repentinos de conducta](https://avsab.org/sudden-change-in-your-dogs-behavior-he-could-be-in-pain/).
- Sin Gemini/DeepSeek, otras llamadas externas, escritura directa de SQLite, aprobación, exportación, commit, push o deploy. La revisión editorial humana y cualquier aprobación/publicación siguen pendientes.

### Guardia de aprobación del manuscrito en UI — 2026-10-03

- Auditoría adversarial del flujo detectó que el servidor rechazaba correctamente Producto final con auditoría estructural inválida, pero el botón React “Aprobar versión” no consideraba `finalProductValidationAudit`; el usuario podía pulsar una acción que necesariamente terminaría en 409. La UI ahora deshabilita el botón y presenta los errores guardados junto al manuscrito.
- Se cerró además el caso de cambios locales sin guardar: la barra global de aprobación queda deshabilitada mientras los campos visibles difieren de la versión persistida, se rehabilita al revertirlos y se limpia al guardar con éxito o cambiar de versión.
- `final-product-ui.test.mjs` reproduce validación inválida, válida y edición/reversión real en DOM virtual: 3/3 GREEN. `npm run typecheck --workspace @our-platform/web` GREEN. No se modificó la API/validador ni datos del proyecto.
- Sin llamadas externas, escritura runtime, aprobación, exportación, commit o push. No es un cambio a la calidad editorial de v12; solo hace que la interfaz refleje los gates existentes.

### Reintento idempotente de exportaciones aprobadas — 2026-10-03

- El test de contrato reprodujo una segunda aprobación del mismo Producto final activo: `approveVersion` devolvía correctamente la versión aprobada, pero la exportación repetía `INSERT` sobre `generated_files.relative_path`, que es único; API respondía 409 aunque la aprobación ya existía. El test rojo verificó ese 409.
- `FileExporterService.write` ahora persiste metadatos con `ON CONFLICT(project_id, relative_path) DO UPDATE ... RETURNING id`. Repetir aprobación sobreescribe el archivo determinista, conserva el ID existente y mantiene sus cuatro filas/descargas. Reintentos también pueden completar exportaciones parciales sin colisionar con rutas ya guardadas.
- Verificación: `content-review-contract.test.ts` GREEN y prueba integrada comprueba respuesta 200, exactamente cuatro archivos y mismos IDs tras aprobar dos veces. Gate completo: `npm test` 124 archivos / 1.000 pruebas; `npm run typecheck` shared/server/web; `npm run build` shared/server/web; todos pasaron. Advertencia de Vite por chunks grandes (~553 y ~600 kB), no bloqueante.
- Sin proveedores ni acceso/escritura a datos del proyecto real, aprobación real, commit, push o deploy.

### Revisión factual y activación local de Producto final — 2026-10-03

- GET del runtime local confirmó SQLite `ok`, schema 15; v12 (`01a100df-b43b-74ad-ba81-782373c96c35`) estaba `draft/fresh`, auditoría completa y sus dependencias aprobadas/vigentes. Se cotejó el manuscrito con las fuentes oficiales AVSAB R1–R5: afirmaciones concordantes, R2/R5 correctamente atribuidas como artículos invitados, sin diagnóstico ni prescripción terapéutica.
- Se aprobó v12 por API canónica bajo la autorización delegada del Goal. Un GET del payload mostró un `reviewNote` heredado que todavía decía “no aprobado”; se corrigió mediante CAS en v13 (`01a100fe-0ff2-701e-a8dd-b30bb85a9136`). El texto del libro se conserva salvo una minúscula editorial; la nueva nota limita el alcance a revisión editorial/factual local y deja explícita la revisión clínica profesional pendiente antes de distribución pública. v13 quedó `approved/fresh`; v12 `superseded/fresh`; workflow Producto final `COMPLETED` (13/13 etapas).
- GET verificó cuatro archivos para v13 (`guide.md`, `checklist.md`, `workbook.md`, `mini-tool.html`); todas las descargas respondieron 200 y sus SHA-256 coincidieron con el checksum guardado. Los archivos son locales; no se publicó fuera de Hallazia.
- UI ahora muestra el `reviewNote` en el manuscrito; prueba `final-product-ui.test.mjs` 4/4, typecheck web y build web pasaron. Advertencia Vite por bundles grandes (~553 y ~600 kB). El runtime está en [Hallazia local](http://127.0.0.1:4310/); el Hub muestra 13/13. Se verificó el árbol accesible, no captura visual de píxeles.
- Sin Gemini/DeepSeek, SQL manual, commit, push o deploy. La aprobación solo activa workflow/export interno; no equivale a revisión veterinaria ni autoriza por sí sola distribución pública.

### Revalidación de Goal: estado local y prueba del aviso — 2026-10-03

- GET de solo lectura confirma API/SQLite `ok`, schema 15; workflow 13/13 `COMPLETED`; Producto final v13 `approved/fresh`, auditoría válida, nota de revisión presente y cuatro exportaciones locales.
- La prueba de interfaz `final-product-ui.test.mjs` pasó 4/4, incluida la visualización del alcance de revisión y la advertencia de revisión profesional pendiente.
- La captura visual de la vista del manuscrito no se completó: el navegador de escritorio detectó entrada concurrente del usuario y se dejó intacto. El árbol accesible del Hub sigue disponible, pero no sustituye esa inspección visual. Próximo paso: repetir QA visual en una superficie estable y libre, sin guardar/aprobar/publicar.
- No hubo llamadas a proveedores ni mutaciones del runtime; tampoco commit, push o deploy. Revisar el diff y ejecutar `git diff --check` al cierre de este cambio documental.

### Auditoría de consistencia de exportaciones v13 — 2026-10-03

- Se descargaron por GET local las cuatro exportaciones activas (`guide.md`, `checklist.md`, `workbook.md`, `mini-tool.html`). HTTP 200 en todas; tamaño en bytes y SHA-256 coinciden con la metadata de `generated_files`. El guide contiene los 9 títulos canónicos.
- La guía independiente abre con alcance educativo explícito: no identifica causa, no diagnostica ni prescribe, no fija equipo/distancia universal y no sustituye evaluación profesional. Checklist, workbook y mini-tool contienen ayudas de seguridad y consulta veterinaria/profesional, no generan diagnósticos ni tratamientos. El `reviewNote` interno no se copia a los archivos, de manera coherente con el hecho de que describe el proceso de revisión local, no contenido para el lector.
- No se halló inconsistencia material entre v13 y sus archivos exportados. Esta comprobación de contenido/metadata no sustituye la revisión clínica profesional ni la inspección visual de la pantalla del manuscrito, que sigue pendiente porque el navegador de escritorio detectó actividad concurrente.
- Solo lecturas locales; sin proveedores, escrituras runtime, reexportación, aprobación, publicación, commit o push.

### Enlace directo y carga real de Producto final — 2026-10-03

- Se añadió navegación profunda de lectura por `?projectId=<id>&section=<key>`. Solo acepta secciones conocidas y proyectos activos; un enlace de proyecto sin sección abre Overview. La URL se sincroniza al navegar con `history.replaceState`, preservando parámetros ajenos como `refresh` y el hash, sin recargar ni mutar el proyecto. La inicialización ocurre con la respuesta de proyectos vigente y un guard ref, para tolerar que una petición inicial quede sustituida.
- Prueba nueva `workspace-deep-link.test.mjs`: 3/3; web typecheck pasó. `npm run build --workspace @our-platform/web` pasó con 2.248 módulos; siguen las advertencias conocidas por chunks de ~554 y ~600 kB.
- Smoke real de solo lectura en el navegador integrado con el enlace del proyecto Perros Reactivos a `final_product`: carga v13 `approved/fresh`, 9 capítulos, 3.718 palabras, 5 referencias, auditoría válida, nota de revisión y cuatro descargas. El árbol accesible confirma contenido de la página; la captura de píxeles aún no está disponible.
- El acceso se dejó abierto para inspección visual: `http://127.0.0.1:4310/?projectId=01a0289f-9377-70b0-b9ac-a0eb5a9dd35a&section=final_product`. Sin llamadas a proveedores, escrituras runtime, aprobación, exportación nueva, publicación, commit o push.

### División de carga inicial del frontend — 2026-10-03

- `App.tsx` importaba estáticamente el dispatcher completo de módulos (82 KB de fuente) junto con historial, biblioteca y configuración. Se convirtieron esas vistas a `React.lazy` con estados de carga accesibles; los módulos solo se descargan al entrar en esa sección.
- Build de producción: entry HTML `index-B9H2Wsof.js` = 241.82 kB, frente al entry anterior de 554 kB; el chunk diferido `ModuleView` es 294.88 kB, `KnowledgeView` 12.87 kB y `SettingsView` 4.90 kB. `LandingVisualEditor` sigue siendo un chunk de 599.65 kB (173.23 kB gzip), importa `@puckeditor/core` 0.23.0 y ya se solicita solo al abrir el editor. El warning de Vite queda visible; un manual chunk no reduciría el total transferido de ese editor.
- `workspace-deep-link.test.mjs` 3/3, web typecheck y build pasaron. Smoke real con el deep link de Producto final primero mostró el fallback accesible “Cargando módulo” y luego cargó v13 con contenido, nota de revisión y archivos.
- No se escribieron datos runtime, no hubo llamadas a proveedores ni exportación/publicación, commit o push.

### Entrega gzip real del frontend — 2026-10-03

- La primera auditoría HTTP local encontró que el entry JS se servía sin `Content-Encoding` pese a que Vite ya calculaba un gzip estimado de 75,91 kB para 241,82 kB originales.
- El build ahora escribe sidecars gzip de JS/CSS/HTML después de que Vite haya escrito los bytes finales, y `@fastify/static` negocia esos archivos precomprimidos. Una primera prueba detectó que comprimir dentro de `generateBundle` podía usar bytes anteriores a la transformación final; se movió la operación a `writeBundle` y se volvió a verificar.
- Build web y typecheck web pasaron; build de servidor pasó. Prueba HTTP por TCP en un puerto efímero recibió 200, `Content-Encoding: gzip`, `Vary: accept-encoding`, MIME JavaScript correcto y 75.911 bytes; al descomprimir, los bytes coinciden exactamente con el bundle de 241.816 bytes.
- El servidor que ya estaba abierto en `127.0.0.1:4310` no se reinició y todavía sirve su proceso anterior sin gzip. El nuevo comportamiento queda activo al reiniciar/volver a lanzar ese servidor con el build actualizado. No se tocó runtime/SQLite ni hubo proveedores, commit, push o deploy.

### Revisión en navegador del manuscrito vigente — 2026-10-03

- Se abrió una pestaña nueva y aislada con el deep link de Producto final. Tras el fallback de carga, la vista presentó el manuscrito v13 aprobado/vigente, 9 capítulos, 3.718 palabras, cinco referencias, auditoría aprobada y nota que limita el alcance editorial y mantiene pendiente la revisión clínica profesional. El guardado está deshabilitado sin cambios.
- Se verificó el árbol accesible completo de la pantalla, incluyendo los nueve capítulos, campos de lectura/edición, referencias y los cuatro enlaces de descarga. No se activó regeneración, aprobación ni exportación.
- La primera lectura del selector de proveedor se hizo durante la hidratación y marcó transitoriamente las opciones como deshabilitadas. Una lectura estable posterior muestra Mock, Gemini y DeepSeek disponibles, solo OpenAI deshabilitado; coincide con Ajustes y con el GET local (`defaultProvider=gemini`, Gemini/DeepSeek configurados, sin bloqueo). No se confirmó defecto.
- El navegador integrado solo entregó el árbol accesible, no píxeles. Dos intentos de captura con Edge headless no generaron PNG: el primero falló fatalmente al inicializar GPU en sandbox; el reintento SwiftShader fuera del sandbox terminó sin archivo. No se instaló ninguna dependencia ni se alteraron las pestañas existentes. La geometría/estética visual sigue sin verificar.
- Sin nuevas llamadas externas ni cambios runtime.

### Revisión read-only de Product Studio histórico — 2026-10-03

- GET local del Product Studio `01a0f3fa-4cb3-7401-92be-48d358c0237e` confirma versión 65 (`STALE`, `freshness=stale`), 10 capítulos y 265 bloques. El documento conserva como padres Product v9 (`01a0ec13-d04e-70cb-88c4-8c4779769c94`, hoy `superseded/stale`) y Opportunities v6 (`01a0ebfa-a70d-72ba-96b0-39a4ff11f7c2`, hoy `superseded/fresh`), mientras los activos son Product v11 y Opportunities v7, ambos `approved/fresh`. La razón guardada indica que cambió una versión del artefacto padre.
- El frontend deriva `readOnly` de `document.freshness === "stale"`, muestra “Versión histórica en solo lectura”, deshabilita el fieldset y evita autosave; la prueba existente `product-studio-ui-wiring.test.ts` cubre esas guardias. La UI no se abrió en la subpestaña Studio en esta pasada, así que la verificación es API + código/contrato, no visual.
- No se editó ni regeneró el documento v65: el manuscrito canónico Producto final v13 ya está aprobado/fresco; regenerar el documento independiente sería trabajo y costo de proveedor adicional, no una reparación requerida para conservar el lineage histórico. Sin proveedores ni mutaciones runtime.
- Relectura agregada del runtime: workflow 13/13 `COMPLETED`; los 13 tipos canónicos (`research` hasta `final_product`) están en su última versión `approved/fresh`. El único artefacto `STALE` es Product Studio (`product_document`) separado e histórico. No hay descendientes canónicos pendientes de regeneración en el proyecto.

### Continuación Goal: intento real de Oportunidades con DeepSeek — 2026-10-03

- GET previo confirmó DeepSeek configurado, sin bloqueo de generación, y Oportunidades v7 (`01a0f5ab-a638-77cb-8717-dbddf0f4a565`) `approved/fresh`. Se envió una única ejecución canónica con proveedor explícito `deepseek`; no se usó mock, Gemini ni fallback.
- Generación fallida `01a1014f-ef38-77d4-8ea5-ca9ecb59af8e`: `transport_error`, `No se pudo conectar con DeepSeek`, intento 1; sin respuesta HTTP, status o tokens registrados. Se detuvo ahí, sin reintento. El intento pudo no alcanzar a emitir una solicitud HTTP completa; no se puede afirmar recepción por DeepSeek.
- GET posterior confirma que Oportunidades sigue en v7 `approved/fresh`; no se publicó versión nueva. No reintentar esta validación sin nueva autorización/decisión y resolver antes el estado de conectividad.
- Se añadió prueba de regresión para sidecars gzip: descompresión byte por byte de JS/CSS/HTML finales y ausencia de sidecar SVG. Gate final local: 126 archivos/1.005 pruebas, typecheck y build completos; `git diff --check` pasó. Vite conserva warning no bloqueante por `LandingVisualEditor` de 599,65 kB.
- Sin commit, push ni deploy. El checkout sigue con cambios preexistentes sin commit.

### Revisión visual del manuscrito en viewport estrecho — 2026-10-03

- La captura normal falló; una captura de página completa sí mostró el Hub, su navegación, Producto final v13, la nota de revisión y las tarjetas de capítulo/descarga. Esa captura quedó recortada por la derecha, así que no sirve para declarar aprobación visual de geometría.
- Lectura DOM de la pestaña: `innerWidth=811`, `visualViewport=792.5`, `documentElement.scrollWidth=792`; nav estrecha (~51 px), contenido principal (~719 px) y botones/tarjetas consultados terminan dentro del viewport. Los cinco `<li>` de referencias están presentes y sus contenedores usan `overflow: visible`. Esto descarta overflow horizontal DOM en ese ancho, no sustituye la inspección de píxeles.
- No se interactuó con controles que regeneren, guarden, aprueben o exporten; no hubo mutación adicional ni llamada a proveedor. QA visual de ancho completo/viewport estándar sigue pendiente por el recorte de captura.

### Corrección visual responsive de Oportunidades — 2026-10-03

- La vista real de Oportunidades v7 aprobada mostraba overflow horizontal en 390 px: el workspace/grid conservaba el ancho mínimo intrínseco y la franja de siete versiones no envolvía. Se ajustó el track a `minmax(0,1fr)`, se permitió encoger el grid maestro-detalle y se habilitó el wrapping de la franja en móvil.
- Validación visual en la aplicación local con el proyecto/corpus existente, sin activar generación ni guardar: a 390 CSS px `documentElement.scrollWidth=371` y no quedan elementos del contenido principal fuera del viewport; los anchos probados de 768, 1024 y 1600 CSS px tampoco exceden su viewport. La v7, sus 8 oportunidades, 39 evidencias y selección guardada permanecen intactas.
- Build/typecheck web pasaron (`npm run build --workspace @our-platform/web -- --configLoader native`). Persiste la advertencia conocida de Vite por `LandingVisualEditor` (~600 kB). No hubo llamadas a proveedores, cambios de SQLite, commit, push ni deploy.

### Revisión visual global de módulos — 2026-10-03

- En la aplicación local `127.0.0.1:4310`, con el proyecto existente y sin guardar/aprobar/exportar, las rutas reales cargan Oportunidades v7, Producto v11, Avatar v4, Mecanismo v4, Creencias v4, Oferta v5, Landing v8, Funnel v7, Contenido v4 y Producto final v13; todas se muestran aprobadas/vigentes. La hidratación tarda varios segundos; una lectura temprana puede mostrar solo el estado transitorio de carga.
- A 811 px de viewport no se observó overflow horizontal del documento ni alertas runtime. Las pestañas horizontales de `rf-section-nav`, el preview de Landing y el mapa de Funnel tienen scroll interno explícito; no desbordan el documento. A 390 px solicitados, el navegador impuso un ancho efectivo mínimo de 487 px; en ese ancho efectivo tampoco hubo overflow del documento y las versiones siguieron aprobadas. El override de viewport se restauró.
- Biblioteca presenta el empty state “Aún no hay bibliotecas”; Historial carga 111 resultados, coste acumulado mostrado $4.45 y deja visible un fallo reciente de Opportunity Scorer. No se reintentó DeepSeek: persiste la incertidumbre de transporte documentada arriba.
- La vista Producto final v13 quedó abierta para inspección: `http://127.0.0.1:4310/?projectId=01a0289f-9377-70b0-b9ac-a0eb5a9dd35a&section=final_product`. Sin llamadas nuevas a proveedores, escrituras en SQLite, commit, push o deploy. `git diff --check` pasó; solo mostró advertencias de conversión LF/CRLF.

### Activación real de entrega gzip en el runtime — 2026-10-03

- Se confirmó en HTTP que el proceso previo de `:4310` no negociaba gzip aunque el frontend tenía sidecars actuales (`.js.gz`, `.css.gz`, `.html.gz`) y el `dist/app.js` ya incluía `preCompressed: true`. El proceso previo había comenzado antes del build vigente; con `Accept-Encoding: gzip` entregaba el bundle JS sin comprimir (241.816 bytes).
- Antes de reiniciar, una consulta SQLite estrictamente de solo lectura confirmó que los 26 jobs YouTube estaban `COMPLETED`, sin jobs pendientes que el hook de recuperación pudiera volver a ejecutar. No se abrió `.env` ni se hicieron llamadas externas.
- `Stop-Process` se limitó al PID del listener confirmado en `127.0.0.1:4310`. El arranque habitual `tsx watch` falló antes de cargar la app (`uv_os_get_passwd returned ENOMEM`); luego se lanzó `node apps/server/dist/index.js`, usando el build existente que es más reciente que los fuentes relevantes. El server quedó escuchando en `:4310`.
- Verificación HTTP del proceso nuevo: `/api/health` `ok`, schema 15; HTML 200 con `Content-Encoding: gzip`, `Vary: accept-encoding`, 442 bytes; JS 200 con gzip, 75.910 bytes en la red; gunzip coincide exactamente con el bundle de 241.816 bytes. `PRAGMA integrity_check` siguió en `ok`; los 26 jobs permanecen `COMPLETED`.
- Se recargó en navegador la vista final_product: manuscrito v13 aprobado/vigente, 9 capítulos, 3.718 palabras, auditoría estructural aprobada y sin overflow horizontal del documento a 811 px. No se editó ni aprobó contenido. El server de `:4310` permanece ejecutándose para inspección local. Sin llamadas de proveedor, commit, push o deploy.
- Verificación del enlace original de desarrollo `http://127.0.0.1:5173/?projectId=01a0289f-9377-70b0-b9ac-a0eb5a9dd35a&section=final_product`: Vite responde 200, `/api/health` proxied devuelve `ok`, y la UI carga v13 aprobada. A 923 px, `documentElement.scrollWidth=905`; el heading tiene 741 px disponibles y el texto completo cabe, por lo que el aparente recorte de la imagen es del visor de captura, no truncación del DOM.

### Gate offline y build actuales — 2026-10-03

- `npm run test --workspace @our-platform/server -- --configLoader runner`: 126/126 archivos, 1.005/1.005 pruebas pasaron fuera del sandbox. En sandbox, 4 pruebas de `product-export.test.ts` fallaron porque Edge no pudo usar DPAPI (`os_crypt_win`, error de cifrado); la misma prueba aislada pasó 9/9 fuera del sandbox, sin cambios de producto. Vitest en modo `bundle` también requería leer `../../../..`; `runner` resolvió la configuración sin esa lectura. Los fixtures usan DB temporal y la red de proveedores queda bloqueada.
- `npm run typecheck`: shared, server y web pasan. `npm run build`: shared, server y web pasan; Vite transforma 2.248 módulos. Persiste la advertencia de chunk `LandingVisualEditor` de 599,65 kB (~173,24 kB gzip).
- Después del build, `:4310` entrega HTML y JS con `Content-Encoding: gzip` y `Vary: accept-encoding`; `/api/health` sigue `ok` schema 15. El proxy de `:5173` responde `ok` y la UI recargada mantiene Producto final v13 `aprobada/vigente`, 9 capítulos y 3.718 palabras, sin overflow del documento a 923 px.
- Sin Gemini/DeepSeek, mutaciones a la base real, aprobación nueva, commit, push ni deploy. El servidor compilado de `:4310` y el frontend Vite `:5173` permanecen disponibles.

### Captura visual adicional de Producto final — 2026-10-03

- Se abrió una pestaña aislada de `:5173` con el deep link real del proyecto y se capturó la vista renderizada. La composición visible conserva navegación lateral, contexto del proyecto, controles de versión, pestañas, manuscrito, resumen de auditoría y referencias; el árbol accesible confirma v13 aprobada/vigente, 9 capítulos, 3.718 palabras, 5 referencias, nota de revisión y cuatro descargas.
- La captura queda truncada en el borde derecho de la superficie mostrada (también recorta parte del título y del grupo de acciones). Con esta captura sola no se puede distinguir un límite del viewport/visor de un defecto geométrico del layout; por eso no se declara aprobado el pase de píxeles ni se hace un cambio CSS especulativo. El análisis DOM anterior de 923 px reportó `scrollWidth=905`, pero no reemplaza evidencia visual completa.
- No se activaron controles de edición, generación, aprobación o exportación. Sin llamadas a proveedores ni escrituras runtime; no se repitieron pruebas/build porque no hubo cambios de producto.

### Corrección de detalle de ejecuciones fallidas en Historial — 2026-10-03

- En Historial, la generación fallida de Opportunity Scorer (`01a1014f-ef38-77d4-8ea5-ca9ecb59af8e`, `transport_error`) se presentaba con el mensaje contradictorio “Resultado estructurado guardado.”. `generations` ya conserva `error_code`/`error_message`, pero el DTO de API descartaba esa señal; no se reintentó ni modificó la generación.
- El contrato de generación ahora transmite `errorCode` solamente (no el mensaje crudo). El detalle de Historial distingue ejecuciones fallidas, en curso, canceladas y completadas; para fallos de transporte muestra que no se guardó resultado, identifica el proveedor y oculta toda salida parcial. La salida nula ya no se describe como guardada.
- Se agregaron pruebas de contrato/UI que verifican que el DTO expone el código sin exponer `error_message`, el fallo no se confunde con resultado guardado ni revela salida parcial y las ejecuciones completadas mantienen sus campos.
- Verificación tras el cambio: suite de servidor 128 archivos/1.008 pruebas, typecheck de shared/servidor/web y build de shared/servidor/web pasan. El build mantiene la advertencia no bloqueante existente de Vite por `LandingVisualEditor` (~599,65 kB, ~173,24 kB gzip). `git diff --check` pasa con avisos habituales LF/CRLF.
- Para activar el código, GET de `/api/projects` enumeró el único proyecto y GET de sus jobs confirmó 24 imports de YouTube `COMPLETED`, ninguno `QUEUED/RUNNING`; se reinició únicamente el PID Node que escuchaba en `127.0.0.1:4310`. Health volvió `ok` con SQLite `ok`, schema 15; GET de generaciones ahora devuelve `errorCode=transport_error`, sin `errorMessage` y `outputData=null` para el fallo original.
- Verificación en pestaña aislada del Historial real: al seleccionar la generación, la UI muestra “EJECUCIÓN FALLIDA”, “No se pudo establecer conexión con DeepSeek. No se guardó un resultado.” y `transport_error`; no muestra salida parcial ni la frase falsa de resultado guardado. Evidencia DOM/accesible, sin captura de píxeles. Los 111 resultados, coste agregado y jobs de importación aparecen estables tras el reinicio.
- Sin llamadas a DeepSeek/Gemini ni escrituras a SQLite; sin commit, push ni deploy. El servidor actualizado queda activo en `:4310`.

### Límite de reintentos del adaptador DeepSeek — 2026-10-03

- La ejecución fallida de Oportunidades quedó registrada como `transport_error`, intento 1, sin respuesta HTTP ni consumo de tokens registrado. No se reintentó ni se atribuyó la causa a DeepSeek, a las credenciales o a la conectividad del proveedor.
- Se añadió cobertura unitaria con `fetch` simulado: aunque `transport_error` se marca retryable para clasificación, el adaptador no repite la solicitud; el test exige exactamente una llamada. Los reintentos del adaptador quedan limitados a la reparación explícita de `invalid_schema`.
- `npm run test --workspace @our-platform/server -- --configLoader runner test/deepseek-provider.test.ts`: 13/13 pasaron. El comando estándar falló al cargar Vitest porque esbuild no pudo leer `../../../..` en el sandbox; el loader `runner` resolvió la configuración sin ampliar permisos.
- No hubo petición HTTP externa, cambios de producción, escritura runtime/SQLite, aprobación, commit, push ni deploy. Cualquier nueva validación real de Oportunidades requiere resolver la conectividad y una nueva autorización; se conserva intacta la ejecución fallida.

### Suite completa tras endurecer el límite de transporte — 2026-10-03

- El pase completo dentro del sandbox ejecutó 1.009 pruebas: 1.005 pasaron y cuatro de `product-export.test.ts` fallaron porque Chromium/Edge no pudo usar DPAPI (`os_crypt_win`). No se ocultaron esos fallos ni se modificó la suite para sortearlos.
- Se repitió una sola vez el mismo comando fuera del sandbox, con autorización del ejecutor para acceso a DPAPI. Resultado: 128/128 archivos y 1.009/1.009 pruebas pasaron; incluye la nueva prueba de `transport_error` con una sola llamada simulada. Typecheck del servidor también pasa.
- Este cambio solo afecta la prueba y este checkpoint; no invalida el build integral previo. No hubo llamadas a proveedores ni escrituras runtime/SQLite. Sin commit, push o deploy.

### Reanudación: Oportunidades DeepSeek y bloqueo de Producto — 2026-10-03

- Tras dos ejecuciones de Oportunidades que terminaron `transport_error`, se reinició solo el proceso de API local después de verificar que los 24 jobs de YouTube estaban `COMPLETED` y que SQLite estaba sana. La siguiente llamada real y acotada a DeepSeek (`deepseek-flash`) creó Oportunidades v8 `01a101df-342f-771f-9af5-281e288aeea1`, `approved/fresh`; generación `01a101de-b996-71ca-816d-202b8107cf9e`, `COMPLETED`, 10.192 tokens de entrada, 5.502 de salida y costo estimado USD 0,06776.
- v8 contiene 9 oportunidades con IDs únicos, `selectedId=opportunity-2` existente, puntajes completos dentro de 0–100 y referencias de problemas/evidencia válidas. Conserva el mismo ángulo prioritario de manejo y seguridad que v7 (score 77 frente a 75). Las 9 etapas descendientes quedaron `STALE` por el cambio de padre. No se hicieron más llamadas de Oportunidades. Las dos ejecuciones fallidas no reportaron tokens/costo; por el flujo sin fallback y el límite de reparación de schema, el total físico de las tres ejecuciones queda dentro del máximo autorizado de cuatro; no se usó una cuarta.
- Para reanudar la cadena se hizo una sola ejecución adicional, independiente de Oportunidades, de Producto con DeepSeek; quedó Producto v12 `01a10215-b359-75c0-ae5b-13e86faef83f`, `draft/fresh`. El audit bloqueó dos campos por `COACHING_OR_SESSIONS`, pero ambos solo dicen “guía(s) rápida(s) de consulta”: el detector léxico confundía material de referencia con prestación profesional.
- El detector se estrechó para que consultas en plural y servicios cualificados sigan bloqueados, mientras que “guía rápida de consulta” pasa. Pruebas focalizadas: 71/71; build del servidor pasa. La API mantiene el audit fallido original en v12 por la política fail-closed de generaciones del proveedor; no se editó SQLite ni se guardó una revisión canónica. v12 sigue borrador fresco, no aprobable automáticamente, y no se generaron descendientes. Requiere revisión de la versión/producto antes de continuar la cadena.
- Health local `/api/health`: `ok`, SQLite `ok`, schema 15. No más llamadas a proveedores en esta reanudación, sin escrituras runtime/SQLite, aprobación, commit, push ni deploy.

### Revisión segura de Producto tras Oportunidades v8 — 2026-10-03

- Producto v12 contenía recomendaciones prescriptivas sobre anclaje/posturas, ajuste de equipo y manejo físico. Mediante el endpoint canónico de borradores, con CAS sobre Producto activo v11 y origen v12, se guardó v13 `01a10222-aafd-7139-af3b-7aadc88df4ad` como `draft/fresh`, con padre Oportunidades v8; no hubo edición directa de SQLite ni llamada a proveedor.
- La revisión replantea el Ebook en observación y planificación preventiva, separación de hechos/interpretaciones, límites para señales y equipo, opciones de retirada y búsqueda de evaluación cualificada. Se eliminaron instrucciones de contención/ajuste y afirmaciones de resultados. Auditoría canónica: `ok=true`, `grounded=true`, completa, sin claims no autorizados ni IDs fuera del snapshot.
- La primera petición de aprobación recibió `415 Unsupported Media Type` por omitir el body JSON requerido y no produjo cambios. Con precondiciones revalidadas, el endpoint canónico aprobó v13; ahora Producto está `approved/fresh`, workflow `COMPLETED`. v12 continúa legible en el historial como borrador fallido; v11 conserva su historial como `approved/stale`. Las nueve etapas descendientes siguen `STALE`; no se propagaron ni generaron automáticamente.
- Revisión de Avatar: `validateAvatarOutput` verifica forma, pertenencia de citas y literalidad de `language`, pero no la semántica del perfil. Las generaciones reales de Avatar ahora quedan `draft` incluso cuando la auditoría estructural pasa; una persona puede revisarlas y aprobarlas por el endpoint existente. El proyecto Demo aún aprueba explícitamente su Avatar sintético para completar el fixture; las matrices simuladas DeepSeek/Gemini prueban aprobación explícita del borrador.
- Pruebas focalizadas de Avatar, routing de proveedores y Demo: 11/11 pasan. `npm run build --workspace @our-platform/server` y `npm run typecheck --workspace @our-platform/server` pasan. API local reiniciada después de verificar el proceso Node exacto; `/api/health` queda `ok`, SQLite `ok`, schema 15.
- Tras reafirmarse el Goal y revalidar producto/payload, se hizo una sola ejecución real de Avatar con Gemini (`gemini-3.5-flash-lite`), generation `01a10234-c768-745d-9641-e00af11e7cfd`. Gemini respondió `INVALID_ARGUMENT`; el API persistió `FAILED/http_error`, 0 tokens y costo USD 0. El adaptador solo reintenta HTTP 429/503, así que no hubo retry. No se creó una versión nueva; Avatar v4 permanece intacto `approved/stale`. Esto sí fue egress a Gemini, aunque sin uso/costo reportados.
- Después del fallo se intentó preparar el fallback autorizado por el Goal con DeepSeek para el mismo Avatar, pero el control de permisos lo bloqueó antes de ejecutar: el permiso concreto registrado para DeepSeek cubría Oportunidades, no este payload. No hubo envío a DeepSeek. Queda solicitada autorización explícita para enviar Producto v13 y hasta 20 extractos sin nombre de autor; no se usó otra ruta ni proveedor para eludir el control.
- Sin commit, push ni deploy.

### Avatar: validación real acotada con DeepSeek — 2026-10-03

- Con autorización explícita para enviar el contexto de Producto v13 y hasta 20 extractos sin nombres de autor, se hizo una sola ejecución real de Avatar con DeepSeek (`deepseek-flash`). La generación `01a1023a-48af-763d-9f62-770c2ed5d190` quedó `COMPLETED`; telemetría: 12.981 tokens de entrada, 3.624 de salida, costo estimado USD 0,05246625. No hubo reparación de schema ni segunda solicitud.
- La versión canónica creada es Avatar v5 (`01a1023a-80a2-71f7-8f66-f561b060e428`), `draft/fresh`. La auditoría no pasa: cuatro afirmaciones (situaciones actuales 6 y 7, dolor 4 y frustración 4) carecen de evidencia válida; el auditor también registra que la generación requiere revisión explícita o regeneración. Se deja como borrador, sin aprobación ni reintento.
- DeepSeek recibió el payload autorizado del proyecto; no se enviaron nombres de autores. No hubo Gemini adicional, commit, push ni deploy. Vista local: `http://127.0.0.1:5173/?projectId=01a0289f-9377-70b0-b9ac-a0eb5a9dd35a&section=avatar`.

### Revisión explícita de trazabilidad de Avatar — 2026-10-03

- Se compararon las afirmaciones de Avatar v5 con los extractos fuente por medio del API local de lectura, sin nombres de autor ni nuevo egress. Además de cuatro afirmaciones sin IDs, se detectaron citas ajenas a una afirmación y formulaciones más amplias que sus fuentes; el validador de pertenencia por sí solo no detectaba estos errores semánticos.
- Por el endpoint canónico de revisión se creó Avatar v6 (`01a10245-8f91-7211-b89e-5e8c84647639`) desde v5, conservando v5 en historial. Se eliminaron afirmaciones sin respaldo, se retiraron las citas no pertinentes, se acotaron otras afirmaciones a lo literalmente respaldado, se dejó una hipótesis como `AI_INFERENCE` sin IDs y se quitaron inferencias de compra. v6 permanece `draft/fresh`, con auditoría estructural aprobada, 13 IDs citados y cero errores; esto no equivale a aprobación semántica ni publicación.
- Verificación posterior del runtime: Producto v13 sigue `approved/fresh`; Avatar v6 `draft/fresh`; v5 conserva su auditoría fallida y v4 sigue `approved/stale`. El workflow de Avatar queda `IN_PROGRESS`; Mechanism, Beliefs, Offer, Landing, Funnel, Content y Final Product siguen `STALE`, sin generación ni propagación automática.
- La generación real autorizada de DeepSeek sigue siendo una sola (`01a1023a-48af-763d-9f62-770c2ed5d190`, 12.981/3.624 tokens, costo estimado USD 0,05246625). La revisión v6 no llamó a ningún proveedor ni aprobó el perfil. Sin commit, push ni deploy.

### Alcance de auditoría visible en Avatar — 2026-10-03

- Se añadió el resumen de estado y alcance de auditoría a la vista especializada de Avatar. Ahora la UI distingue que formato y pertenencia de citas son válidos de que el respaldo semántico sigue por revisar, y advierte que cada cita debe contrastarse antes de aprobar.
- Prueba de render `avatar-review-summary-ui.test.ts`: 2/2 pasan, incluida la regresión que conserva el rótulo anterior para otros módulos. `npm run typecheck --workspace @our-platform/web` pasa. `npm run build --workspace @our-platform/web` pasa fuera del sandbox; Vite transformó 2.248 módulos. Persiste el aviso existente de chunk `LandingVisualEditor` de 599,65 kB (~173,23 kB gzip).
- Inspección visual mediante `http://127.0.0.1:5173/?projectId=01a0289f-9377-70b0-b9ac-a0eb5a9dd35a&section=avatar`: API/SQLite `ok`, versión 6 visible `Borrador · Vigente`, 13 citas y el nuevo aviso legible. No se aprobó Avatar ni se generaron descendientes.

### Bloqueo fail-closed de descendientes con Avatar en revisión — 2026-10-03

- Una prueba aislada reprodujo un hueco: con Avatar aprobado y vigente más un borrador fresco de Avatar pendiente, el endpoint de Mecanismo respondía 200 y podía crear una versión usando el Avatar anterior. No había llamada externa, pero el downstream avanzaba mientras la UI mostraba una revisión más reciente pendiente.
- `ModuleService.run` ahora detecta un borrador vigente de Avatar en cualquier dependencia obligatoria u opcional y responde `409` indicando que se revise/apruebe antes de continuar. El test nuevo confirma el bloqueo; la matriz de proveedores confirma que los flujos sin borradores pendientes siguen funcionando. Suite focalizada Avatar, routing de proveedores y render UI: 11/11; typecheck y build del servidor pasan.
- Se reconstruyó y reinició el listener local `:4310` con el build nuevo tras comprobar salud `ok` y cero jobs activos. El GET posterior confirma Producto v13 `approved/fresh`, Avatar v6 `draft/fresh`, Mecanismo v4 `approved/stale`, workflow Avatar `IN_PROGRESS` y etapas posteriores `STALE`; no se generaron versiones ni se hicieron nuevas llamadas a proveedores.

### Bloqueo fail-closed de descendientes con Creencias en revisión — 2026-10-03

- Una segunda prueba aislada reprodujo el patrón para Creencias: con un borrador fresco y la versión aprobada anterior intacta, Oferta respondía `200` en vez de esperar la revisión explícita. La prueba corre en SQLite `:memory:` y no llama proveedores.
- `ModuleService.run` ahora bloquea cualquier dependencia obligatoria u opcional de Creencias mientras haya un borrador vigente pendiente, con error `409` claro. Pruebas de Avatar, Creencias, Oferta y matriz de proveedores: 18/18; typecheck y build del servidor pasan.
- El servicio local `:4310` se reconstruyó y reinició; salud posterior `ok`, cero jobs activos y sin versiones nuevas. Producto v13 sigue `approved/fresh`; Avatar v6 permanece `draft/fresh`; Creencias v4 y Oferta v5 permanecen `approved/stale`; etapas downstream continúan `STALE`.

### Revalidación de carreras y propagación de frescura — 2026-10-03

- Se cerró también la ventana entre el preflight y la publicación: la transacción final vuelve a comprobar si Avatar o Creencias obtuvo un borrador pendiente mientras el proveedor trabajaba. Pruebas de carrera aisladas verifican `409`, preservación de la versión anterior y una sola llamada al proveedor simulado; Avatar y Creencias: 10/10.
- La única suite completa ejecutada en esta reanudación pasó 1.018/1.019 pruebas; la falla de Product Studio esperaba que generar Avatar lo activara inmediatamente. Esa expectativa ya no corresponde al contrato: Avatar generado queda en revisión como `draft`, y no reemplaza el padre activo hasta aprobación. Se actualizó la prueba para exigir que el ebook siga `fresh` mientras Avatar está pendiente y pase a `stale` tras aprobarlo.
- Verificación focalizada posterior: `product-studio.test.ts` 8/8; Avatar y Creencias 10/10; typecheck y build del servidor pasan. No se repitió la suite completa. `git diff --check` no reporta errores de whitespace (solo avisos LF/CRLF).
- No hubo nuevas llamadas reales a proveedores ni cambios de runtime/SQLite. Producto v13 sigue `approved/fresh`; Avatar v6 sigue `draft/fresh`; los descendientes continúan sin regenerarse. Sin aprobación nueva, commit, push ni deploy.

### Product Studio: contexto pendiente y linaje de revisiones — 2026-10-03

- La prueba roja confirmó dos huecos: se podía crear un documento con Avatar en revisión, y las revisiones posteriores de Product Studio omitían el enlace directo a Avatar en `lineage_edges`. La invalidación aparentaba funcionar por rutas indirectas como Mecanismo, pero no estaba garantizada para todos los snapshots.
- Product Studio ahora comprueba que cada padre capturado siga activo/fresco y sin borradores vigentes pendientes; aplica el chequeo antes de crear, antes/después de generación y dentro de la transacción final. Cada revisión conserva los IDs del snapshot completo como padres directos. La creación del artefacto y el documento quedó atómica también cuando el repositorio participa en una transacción externa.
- Pruebas nuevas cubren bloqueo de creación, edge directo Avatar→revisión, obsolescencia tras aprobar Avatar y carrera con Avatar pendiente durante respuesta de proveedor simulado. Suites Product Studio, revisiones, Avatar y Creencias: 34/34; suite servidor completa: 129 archivos y 1.021/1.021 pruebas; typecheck/build del servidor pasan.
- Tras el build se reinició solo el listener Node confirmado de `127.0.0.1:4310`, con 0 jobs activos; la API volvió `ok`, SQLite `ok` (schema 15), sin cambios de versiones/workflow. Verificación del navegador: `5173` muestra Producto final v13 `Aprobada · Vigente`, 9 capítulos, 3.718 palabras y 5 referencias. Sin nuevas llamadas a proveedores ni escrituras intencionales a datos reales; sin aprobación, commit, push ni deploy.

### Gate integral de monorepo — 2026-10-03

- `npm run typecheck` y `npm run build` pasan para shared, server y web. La suite completa del servidor sigue en 129 archivos/1.021 pruebas verdes; no se repitió porque el código no cambió después de ese gate.
- `scripts/frontend-request-races.mjs` se intentó y quedó omitido porque Playwright no está instalado. El propio script prohíbe añadir una dependencia solo para ese diagnóstico; el smoke visual de la app se hizo aparte en el navegador local.
- Vite mantiene el aviso de `LandingVisualEditor` (599,65 kB minificado, 173,23 kB gzip). El componente se carga con `import()` diferido al abrir el constructor Puck; el aviso no corresponde al chunk inicial. Se conserva como optimización pendiente, sin elevar artificialmente el umbral.
- Health posterior: API/SQLite `ok`, schema 15; web `5173` devuelve 200. Rama `codex/fix-20.7d-relevance-regression`, `HEAD c8ce1ed`, un commit local adelante y muchos cambios WIP preservados. Sin commit/push/deploy.

### Auditoría de uso de proveedores — 2026-10-03

- Lectura del API real, sin egress: el proyecto Perros Reactivos prefiere Gemini; el estado reporta Gemini y DeepSeek configurados. El historial contiene 17 generaciones Gemini `COMPLETED` y 49 DeepSeek `COMPLETED`, por lo que ambos proveedores se usan efectivamente.
- Hay además 14 fallas Gemini `invalid_response` y 2 `http_error`; el DTO histórico solo conserva el código de error, insuficiente para atribuir causa común. DeepSeek registra 22 fallas de varias clases. No se intentó repetirlas ni activar fallback automático; el selector de proveedor sigue siendo explícito y cada llamada externa mantiene su propia autorización/límite.
- Sin cambios de versiones/settings/SQLite y sin llamadas a Gemini o DeepSeek durante esta auditoría.

### Product Studio: comparación actual de linaje — 2026-10-04

- Lectura GET del API local, sin escrituras: Producto v13 (`01a10222-aafd-7139-af3b-7aadc88df4ad`), Mecanismo v6 (`01a10294-62c0-72a9-82e5-239effa5b740`) y Oportunidades v8 (`01a101df-342f-771f-9af5-281e288aeea1`) están `approved/fresh`. El documento `01a0f3fa-4cb3-7401-92be-48d358c0237e`, “Perros reactivos en el paseo — guía práctica”, sigue `STALE/stale` porque conserva Producto v9 (`01a0ec13-d04e-70cb-88c4-8c4779769c94`), Oportunidades v6 (`01a0ebfa-a70d-72ba-96b0-39a4ff11f7c2`) y Mecanismo v2 (`01a0f3b9-e6c2-708f-8761-eafc300f1079`) como snapshots padre.
- Su versión activa es v65, `AUTOSAVE`, con 265 bloques y un esquema de 10 capítulos: solo el capítulo inicial sobre seguridad, alcance y uso está `APPROVED`; los otros nueve siguen `DRAFT`. El documento no equivale a Producto final aprobado y su obsolescencia no invalida por sí misma los artefactos canónicos actuales.
- Riesgo de actualización: regenerar o cambiar los padres puede reemplazar texto editorial guardado en esos 265 bloques y alterar referencias/lineage. Una migración requeriría mapear explícitamente los capítulos a Producto v13/Mecanismo v6/Oportunidades v8 y revisar el resultado antes de aprobarlo. No se sincronizó, regeneró, aprobó ni migró nada.
- Comparación adicional de solo lectura con Final Product v17 (`01a10332-8675-7129-a946-051f5ba6a0d7`, `approved/fresh`): su guía aprobada tiene **9 capítulos** sobre observación, seguridad y preparación de consulta; Product Studio v65 tiene **10 capítulos** con títulos y orden distintos, 265 bloques y 9 capítulos `DRAFT`. No hay correspondencia uno-a-uno ni justificación para reetiquetar v65 como vigente o aprobado. Ambos documentos conservan valor histórico independiente; v17 no reemplaza automáticamente el contenido de Product Studio.
- La interfaz de Product Studio muestra el documento obsoleto en solo lectura y explica que un documento nuevo debe partir del contexto vigente. Overview cuenta las 13 etapas del workflow, **no** la aprobación de Product Studio; por eso `13/13 ejecutadas` y Product Studio `STALE` no son estados contradictorios. No se modificaron datos ni se hizo egress para esta comparación.
- **Decisión editorial del usuario — 2026-10-04:** conservar Product Studio v65 como documento histórico y usar Final Product v17 como manuscrito canónico. No crear un nuevo documento Studio ni rebasar v65 solo para quitar `STALE`; tampoco marcar sus nueve capítulos pendientes como aprobados. Se revalidó por API local que v65 conserva sus 265 bloques `STALE/stale` y v17 permanece `approved/fresh` con 9 capítulos. Esta decisión resuelve la discrepancia de producto sin modificar datos ni linaje.

### Landing v12: revisión de bloques en runtime — 2026-10-04

- **Decisión de linaje del usuario:** conservar Final Product v17 como canónico y dejar Landing v12 en `draft/fresh`. Landing v11 continúa `approved/fresh` y es el padre vigente de Funnel v9, Contenido v5 y Final Product v17. Aprobar v12 sustituiría la Landing activa y volvería obsoletos esos descendientes; no hacerlo sin una nueva decisión explícita y revisión de toda la cadena. v12 solo cambia el Hero (texto e imagen) respecto de v11; los otros 13 bloques permanecen iguales. No se aprobó, archivó ni editó ninguna versión por esta decisión.
- **Comprobación de UI tras el build (2026-10-04):** al recargar Landing en `:4310`, el árbol accesible muestra v12 `Borrador · Vigente`, botón «Aprobar versión» con advertencia «Puede obsoletar dependientes», v11 disponible en el selector, y preview de v12 «Sin publicación · Sin checkout». Overview continúa mostrando Final Product v17 aprobada y Landing v11 aprobada. La captura de pantalla del navegador falló tanto sola como junto al árbol accesible; esto verifica el texto y estado funcionales, no la composición visual de píxeles. No se pulsó aprobar, regenerar ni guardar.
- **Captura visual posterior (2026-10-04):** se restauró el Vite local en `127.0.0.1:5173` (`GET /` 200; proxy `/api/health` `ok`, SQLite schema 15). En una pestaña aislada de ese origen sí se capturaron las vistas del constructor con preview de escritorio y preview móvil de Landing v12. En el Hero móvil, antetítulo, título, subtítulo, cuerpo, CTA e imagen permanecen dentro del marco visible; no se observó texto recortado ni desplazamiento horizontal en esa captura. El marco de preview tiene su propio scroll vertical. Esta evidencia supera el fallo de captura anterior para el Hero, pero no constituye QA visual completo de los 14 bloques ni de breakpoints exactos. La versión siguió en borrador; no se guardó ni aprobó nada.
- Inspección de solo lectura del preview `srcDoc` en Hallazia local: 14/14 secciones tienen ID `section-0`…`section-13`, encabezado y cuerpo; solo Hero lleva imagen y esta carga correctamente. La vista mide 425 px de ancho y conserva `document.scrollWidth=425`; no hay desbordamiento horizontal de página. Hero reporta 449 px de `scrollWidth`, pero su CSS recorta el pseudo-elemento decorativo con `overflow:hidden`; el screenshot no muestra texto ni media cortados. Las otras 13 secciones no desbordan (`scrollWidth` máximo 401 px).
- El CTA Hero apunta a `#section-11` (Oferta informativa), cuyo destino existe; el click real ya se verificó sin navegar fuera del preview. No hay checkout, precio ni condiciones aprobados. El bloque FAQ del borrador contiene dos preguntas como un solo párrafo (`items` vacío), no como pares pregunta/respuesta visuales; se deja como observación para decisión de QA, sin reinterpretar ni reestructurar contenido editorial.
- Alcance visual: además del preview estrecho (425 px), el override solicitado de 1280 px quedó limitado por el host del navegador a `innerWidth=1600` (`clientWidth=1581`), con preview de 650 px y sin overflow; el pedido de 390 px se limitó a `innerWidth=487`, con preview de 412 px. El override se restauró al terminar. No se declara inspección pixel-completa en breakpoints exactos. Pendiente QA visual de Antigravity en su navegador y tamaños objetivo.
- Verificación final read-only: Landing sigue v12 `draft/fresh`, Avatar workflow devuelve `COMPLETED`, el API no muestra una versión nueva durante la inspección y la consola del tab no registró errores ni warnings. No se usaron proveedores ni se guardó contenido.
- QA visual de Avatar: Overview muestra `13/13 etapas ejecutadas`, `0 en curso` y la etapa Avatar como `Ejecutada`; al seleccionar Avatar v7, la tarjeta muestra `Aprobada · Vigente`. Confirmado el estado visible frente al endpoint; la selección fue solo de lectura y luego se volvió a Landing.

### Revalidación visual aislada de Landing v12 — 2026-10-07

- El runtime se abrió sobre una copia SQLite aislada del proyecto; los diez proveedores se iniciaron sin claves y no se ejecutó ninguna acción de generación, guardado, aprobación ni archivo. La base original no se usó como runtime.
- En la UI, Landing v12 continúa `Borrador · Vigente` y Landing v11 sigue `Aprobada · Vigente`. La imagen del Hero carga y su CTA apunta a `#section-11`, que corresponde al bloque Oferta existente. No se cambió el linaje ni el contenido.
- En el viewport disponible (`innerWidth=403`, `innerHeight=880`), el documento mide 385 px de ancho, sin overflow horizontal de página. Esto es una comprobación limitada al tamaño que ofreció el navegador, no un pase de todos los breakpoints.
- Hallazgo para QA/editorial: FAQ muestra dos preguntas dentro de un solo texto de cuerpo y el editor de Preguntas y respuestas indica `Sin elementos registrados` (`items` vacío). No se separó ni reescribió el contenido porque hacerlo requiere preservar la intención editorial; mantener v12 como borrador hasta revisión.
- Resultado: QA funcional/visual acotado; no declarar `VISUAL_PASS` global. Sin llamadas a proveedores ni cambios de datos del proyecto.

### Continuación Goal — gate integral y acciones responsive de Landing — 2026-10-07

- Suite offline final: `npm.cmd test` pasó **150 archivos / 1.142 pruebas**. Tras los cambios de UI, `npm.cmd run typecheck --workspace @our-platform/web`, las pruebas dirigidas (2 archivos / 4 pruebas) y `npm.cmd run build --workspace @our-platform/web` pasaron. Vite conserva la advertencia de chunk grande de `LandingVisualEditor` (~601.40 kB minificado); no bloquea el build.
- En la Landing real de Perros Reactivos, el toolbar de cinco acciones se comprimía en una sola fila dentro del pane estrecho: “Abrir constructor visual (Puck)” y “Exportar React (.tsx)” quedaban partidos en varias líneas y eran difíciles de leer. Se cambió solo `refinement.css`: dos columnas bajo 700 px y una bajo 420 px, con objetivos táctiles de 42 px. HMR mostró la distribución legible en el viewport disponible; el build web posterior pasó. No se verificó aún cada breakpoint exacto.
- En Funnel y Content, `Guardar cambios` estaba habilitado aunque no hubiera ediciones. Ahora permanece deshabilitado sin cambios y durante un guardado. Funnel conserva al serializar nodos los campos existentes de checkout externo, evento de tracking y precio, que antes se omitían al mapear desde el editor. Se añadieron regresiones UI para no-op/edición en ambos módulos y persistencia de esos metadatos en Funnel; las 4 pruebas dirigidas pasan. La UI real confirmó el botón deshabilitado en Funnel sin editar.
- Se seleccionó v12 para lectura, sin guardarla ni aprobarla. La versión sigue `draft/fresh`; v11 sigue `approved/fresh`. En el panel FAQ, el cuerpo conserva texto con dos preguntas y una nota comercial, mientras `items` está vacío y la vista previa no los presenta como pares estructurados. No hay pérdida del texto; se mantiene como observación editorial, sin inventar respuestas ni alterar la versión.
- La pestaña local identificó el proyecto correcto. No se ejecutaron proveedores, backups, exportaciones ni acciones de workflow; no hubo escritura de base de datos ni aprobación. El commit local se limitó a los cambios enumerados; no se hizo push.
- SIGUIENTE: continuar el pase visual global de secciones y breakpoints. El gate de código queda verde para este estado; no declarar `VISUAL_PASS` global ni `DONE` todavía.

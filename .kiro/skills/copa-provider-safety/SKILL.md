---
name: copa-provider-safety
description: Reglas operativas para evitar llamadas innecesarias, desperdicio de cuota y reintentos de producción en COPA.
---

# COPA Provider Safety

## Default rule

- NEVER use a real provider call as the first debugging step when logs, persisted runs, telemetry, contracts, or code can answer the question.
- State the exact unresolved fact before any provider call. If the fact is already established, STOP.
- Do not broaden a diagnostic into an architecture audit or unrelated fix.

## Before any provider call

MUST define all of the following:

1. The exact unresolved question.
2. The one provider required to answer it.
3. Why read-only evidence is insufficient.
4. Which unrelated providers are disabled.
5. The maximum authorized calls or production runs.
6. The result/telemetry that will establish success or failure.

Do not make a provider call without explicit authorization when it consumes quota, tokens, or production state.

## YouTube isolation

When debugging YouTube, enable only YouTube:

- YouTube: ON
- Tavily: OFF
- Exa: OFF
- Brave: OFF
- Firecrawl: OFF

Enable another provider only when the task explicitly requires a comparison. Do not use manual YouTube search or a direct provider call as a substitute for the authorized production path.

## Failure-first diagnosis

For `temporary_error`, `rate_limited`, quota errors, authentication errors, timeouts, or other provider failures:

- Diagnose the provider failure before changing query, relevance, filtering, business, semantic, or UI logic.
- Inspect saved provider reports, logs, error category, status/reason when retained, and deterministic mapping code first.
- Keep provider failure separate from zero acquisition, filtering/relevance rejection, semantic rejection, and UI display defects.

## Zero-result rule

Before changing code for a zero result, determine the first zero stage:

`QUERY_GENERATION → SEARCH → METADATA → DURATION → VIDEO_RELEVANCE → COMMENTS → COMMENT_RELEVANCE → SEMANTIC`

- Fix only the confirmed earliest zero stage.
- NEVER rewrite multiple stages in one diagnostic change.
- Do not modify relevance or semantic logic if acquisition never reached that stage.

## Rate-limit rule

- Do not repeatedly retry a rate-limited request.
- Inspect the persisted error/status/reason and local mapping first.
- Never assume a replacement API key resolves quota or rate limits without evidence.
- If the remote response was not retained, report it as unknown; do not invent a cause.
- Never expose credentials while diagnosing a provider failure.

## LLM cost rule

- Use deterministic inspection and local tests before model calls.
- No reviewer swarm, duplicate model run, or speculative fallback.
- Use fallback only for the exact failed unresolved unit; a successful primary call MUST NOT trigger fallback.
- Do not use expensive models for mechanical validation, formatting, filtering, dedupe, or inspection.
- STOP after sufficient evidence is collected.

## Real-run rule

- A real production acceptance run is permitted only after targeted static/unit validation passes, unless the defect can only be reproduced through that provider.
- Define the single authorized run, expected telemetry, and stop condition before starting it.
- Do not run a broad provider test to diagnose a localized failure.

## One-run principle

- If one production run is authorized, execute it once only.
- Do not silently retry, change the topic, re-enable providers, or run a second confirmation pass.
- Inspect the saved result from that run and STOP.

## Secrets and `.env`

- Never print, copy, commit, or place `.env` values in prompts, logs, tests, or documentation.
- Never reveal full or partial credentials.
- Safe fingerprinting is allowed only when explicitly required, does not expose secret material, and is necessary to establish the requested fact.

## Error classification

Classify evidence before proposing a fix:

- `provider unavailable/error`: configuration, auth, quota, rate limit, timeout, network, or upstream failure.
- `zero acquisition results`: provider completed but returned no source evidence.
- `filtering/relevance rejection`: evidence was acquired and deterministically rejected.
- `semantic rejection`: evidence reached semantic processing but produced no grounded/cited finding.
- `UI display issue`: saved run data differs from what the UI renders.

Do not conflate classes. Preserve the source telemetry and failure boundaries.

## Stop conditions

Stop immediately when the requested fact is established or the authorized run completes.

MUST NOT continue with retries, extra providers, extra model calls, architecture reviews, unrelated fixes, or broad tests unless newly authorized.

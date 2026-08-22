# Provider safety

Provider calls are never the first diagnostic step. Inspect code, persisted run telemetry, sanitized logs, and local fixtures first.

Before an external call, record the unresolved fact, exact provider, why local evidence is insufficient, disabled unrelated providers, maximum calls, expected telemetry, and stop condition. Require explicit authorization when calls consume quota/tokens or mutate external state.

- Never expose `.env`, API keys, headers, or raw provider bodies.
- Keep provider errors separate from acquisition zeros, deterministic filtering, semantic rejection, and UI rendering.
- Do not retry rate limits blindly or assume a new key fixes quota.
- A successful primary model call must not invoke fallback. Fallback handles only the exact unresolved unit.
- Do not use models for deterministic filtering, formatting, dedupe, inspection, or mechanical validation.
- Stop after the authorized acceptance run; do not silently repeat it.

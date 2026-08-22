# Architecture routing

Read only the section needed for the current change. Code is authoritative over phase reports.

## Workspaces

- `packages/shared`: TypeBox contracts and shared TypeScript types. Rebuild it before server/web consume changed contracts.
- `apps/server`: Fastify routes, services, repositories, integrations, and SQLite migrations.
- `apps/web`: React/Vite UI and `api/client.ts`.

Cross-boundary changes normally flow `packages/shared` → server route/service/repository → web API/feature consumer.

## Persistence

- `apps/server/src/database/database.ts`: connection, foreign keys, WAL, transactional migrations.
- `apps/server/src/database/migrations.ts`: append-only schema evolution.
- `apps/server/src/repositories`: persistence boundary. Do not mutate `data/our-platform.db` directly.
- Project-owned rows normally cascade on permanent deletion; verify actual FKs and triggers before relying on that rule.

## Evidence and generation

- `problem-quality-engine.ts` owns deterministic quality gates.
- `module-service.ts` composes module generation, Knowledge retrieval, validation, persistence, and audit data.
- Provider adapters live under `integrations/`; provider-independent policy belongs in services/contracts.

## Knowledge and internal Skills

- `knowledge-repository.ts` owns libraries, chunks, approved artifact memory, retrieval logs, and persistent learned-memory access.
- `services/knowledge/` owns bounded ranking/context policy.
- `services/skills/` owns provider-independent internal Skill definitions and resolution.
- Approved artifact memory is a project/artifact decision record. Learned reusable knowledge is separately distilled inside the same Knowledge Engine because artifact FKs intentionally cascade.

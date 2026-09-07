# Architecture and contracts

Load for subsystem discovery or cross-workspace changes, not ordinary text edits.
- npm workspaces: packages/shared (@our-platform/shared, TypeBox contracts, tsc → dist), apps/server (@our-platform/server, Fastify/TypeScript, tsx development), apps/web (@our-platform/web, React 19/Vite).
- Server: src/routes → services → repositories → database. module-service.ts composes module generation; problem-quality-engine.ts owns deterministic evidence gates; integrations/ contains provider adapters.
- Web: src/api/client.ts consumes APIs; features/ owns screens; config/modules.ts defines modules. Inspect the affected view instead of all frontend features.
- Runtime: data/our-platform.db is SQLite; database/database.ts configures connections and migrations.ts owns schema. Use repository/service boundaries for application writes.
- Shared response/audit/type changes require the matching packages/shared contract, build:shared and server/web consumer typechecks. Read actual package.json scripts before inventing commands.
- Prompts are versioned under prompts/; generative adapters are not changed by default. Phase reports in docs/ are historical context, not current-state proof.

# Verification commands and isolation

Use the validation level selected by SKILL.md's task routes.

Run the full suite at most once at the end; if it passed and code is unchanged, do not repeat it. Rerun only checks invalidated by a later change or failure; report unresolved failures honestly.
Server tests use Vitest. Build shared first if its dist is absent/stale or contracts changed.
From repo root (PowerShell may use npm.cmd):
- Focused: npm run test --workspace @our-platform/server -- <test-file>
- Shared build: npm run build:shared
- Affected typecheck: npm run typecheck --workspace @our-platform/<server|web|shared>
- Full tests: npm test
- Full typecheck/build: npm run typecheck / npm run build (separate commands).

Use in-memory/temp DBs and fake providers; assert zero external calls where required. Never use user data as test fixtures.
Prefer additive, transactional migrations. Before changing ownership/deletion inspect actual foreign keys and cascades; verify rollback, foreign_key_check and integrity_check in isolated data.
Runtime-dependent defects need relevant runtime evidence; tests do not prove the user's persisted state. UI changes warrant a focused visual check when available, not unrelated live generation.

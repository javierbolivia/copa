# Validation routing

Start focused and expand only when the changed boundary requires it.

## Canonical commands

```powershell
npm.cmd run test --workspace @our-platform/server -- <test-filter>
npm.cmd run typecheck --workspace @our-platform/server
npm.cmd run typecheck --workspace @our-platform/web
npm.cmd run typecheck --workspace @our-platform/shared
npm.cmd run build --workspace @our-platform/web
git --no-pager diff --check
```

Use root `npm.cmd test` only when shared schema or broad server behavior makes the full suite proportionate. Use root `npm.cmd run typecheck` when all workspaces cross a shared contract.

## Test data

- Prefer `AppDatabase(":memory:")` or an explicit temp directory.
- Keep provider tests on injected fakes; assert zero calls when the feature is deterministic/local.
- Check `PRAGMA foreign_key_check` and `PRAGMA integrity_check` for migration/deletion changes.
- Never delete or mutate a real user project during automated tests.

## Runtime/browser

Use runtime checks for route, persisted-data, or UI behavior after deterministic tests pass. Keep them local and bounded. Browser QA must use the real UI and target temporary data by exact identity.

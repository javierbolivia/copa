---
name: copa-git-recovery
description: Reglas operativas para inspección, recuperación, commits y pushes Git seguros en Hallazia.
---

# Hallazia Safe Git Recovery

## Safe inspection

Use read-only Git commands first:

- `git status --short --branch`
- `git diff`
- `git diff --check`
- `git diff --cached`
- `git log`, `git show`, and `git branch` inspection as needed.

Inspect only the scope required to answer the task. Do not mutate Git state during diagnosis.

## Before any mutation

Before staging, committing, merging, cherry-picking, pushing, or creating a recovery ref, establish:

1. Current branch.
2. Working-tree and index state.
3. Untracked files and whether they belong to the user.
4. Existing recovery branches/refs when recovery is relevant.
5. Whether user work, generated files, secrets, or runtime data are present.
6. The exact authorized mutation and its reversible path.

If user work or recovery state is unclear, stop and ask before acting.

## Default prohibitions

Never automatically:

- reset;
- restore;
- checkout over user changes;
- clean;
- stash;
- rebase;
- amend;
- force push;
- delete branches;
- delete recovery refs;
- overwrite recovered work.

Do not use destructive cleanup as a substitute for understanding the worktree.

## Commits

- Commit only when explicitly requested.
- Stage only legitimate repository files named for the authorized change.
- Exclude `.env`, credentials, runtime files, logs, caches, local databases, generated junk, and unrelated user files.
- Inspect the staged patch with `git diff --cached`.
- Run `git diff --cached --check` before committing.
- Never create an empty commit unless explicitly requested.
- Preserve hooks; do not use `--no-verify` unless explicitly authorized.
- If a hook fails, fix the reported issue, re-stage the affected files, and create a new commit. Do not amend by default.

## Push

- Push the CURRENT branch only unless explicitly instructed otherwise.
- For a new remote branch, use `git push -u <remote> <current-branch>`.
- Never force push by default.
- Do not push directly to `main` or `master` without explicit authorization.
- Verify final worktree status after a successful push.

## Recovery

- Preserve work before integration. Prefer a branch or ref as a protection boundary.
- Recovery branches and refs are not cleanup targets; never destroy them automatically.
- Inspect commit ancestry, diffs, and affected paths before merging or cherry-picking recovered work.
- Keep recovered changes isolated until their scope, tests, and ownership are understood.
- Do not overwrite a recovery result with current worktree changes.

## Reporting

For any Git-facing completion, report clearly:

- `BRANCH`
- `DIFF_CHECK`
- `UNEXPECTED_FILES`
- `COMMIT`
- `PUSH`
- `WORKTREE_AFTER`

Report only facts verified by the commands executed. If a value was not inspected, state that it is unknown rather than inferring it.

## Volatile state

Do not place volatile branch names, commit hashes, remote state, or current project status in this skill. Record volatile handoff state only in `docs/COPA_ACTIVE_CHECKPOINT.md` when that file is in use.

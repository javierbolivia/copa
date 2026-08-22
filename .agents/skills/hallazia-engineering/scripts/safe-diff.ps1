[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw "Run inside a Git repository." }

git -C $repoRoot diff --check
if ($LASTEXITCODE -ne 0) { throw "git diff --check failed." }
git -C $repoRoot diff --cached --check
if ($LASTEXITCODE -ne 0) { throw "git diff --cached --check failed." }
git -C $repoRoot status --short --branch
git -C $repoRoot diff --stat
git -C $repoRoot diff --cached --stat
if ($LASTEXITCODE -ne 0) { throw "Safe diff inspection failed." }

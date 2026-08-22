[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $repoRoot "package.json"))) {
  throw "Run inside the Hallazia Git repository."
}

git -C $repoRoot status --short --branch
git -C $repoRoot branch --show-current
git -C $repoRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw "Git baseline failed." }

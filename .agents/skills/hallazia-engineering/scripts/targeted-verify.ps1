[CmdletBinding()]
param(
  [ValidateSet("server", "web", "shared")]
  [string]$Workspace = "server",
  [string]$TestFilter = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$repoRoot = (& git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw "Run inside the Hallazia repository." }
$package = "@our-platform/$Workspace"

Push-Location $repoRoot
try {
  if ($TestFilter.Trim() -ne "") {
    if ($Workspace -ne "server") { throw "Focused Vitest filters are supported only for server." }
    & npm.cmd run test --workspace $package -- $TestFilter
    if ($LASTEXITCODE -ne 0) { throw "Focused tests failed." }
  }
  & npm.cmd run typecheck --workspace $package
  if ($LASTEXITCODE -ne 0) { throw "Workspace typecheck failed." }
  git diff --check
  if ($LASTEXITCODE -ne 0) { throw "git diff --check failed." }
  git diff --cached --check
  if ($LASTEXITCODE -ne 0) { throw "git diff --cached --check failed." }
} finally {
  Pop-Location
}

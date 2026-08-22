[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$checks = @(
  @{ Name = "frontend"; Url = "http://127.0.0.1:5173/" },
  @{ Name = "backend"; Url = "http://127.0.0.1:4310/" },
  @{ Name = "health"; Url = "http://127.0.0.1:4310/api/health" }
)

foreach ($check in $checks) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $check.Url -TimeoutSec 5
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
    throw "$($check.Name) returned HTTP $($response.StatusCode)."
  }
  "$($check.Name): HTTP $($response.StatusCode)"
}

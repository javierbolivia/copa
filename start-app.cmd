@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [Our Platform] Node.js 24 o posterior no esta instalado o no esta en PATH.
  echo Descargalo desde https://nodejs.org/ y vuelve a intentarlo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [Our Platform] npm.cmd no esta disponible.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [Our Platform] Instalando dependencias locales...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

if not exist "apps\server\dist\index.js" goto :build
if not exist "apps\web\dist\index.html" goto :build
goto :ready

:build
echo [Our Platform] Preparando la aplicacion...
call npm.cmd run build
if errorlevel 1 goto :failed

:ready
if /I "%~1"=="--check" (
  echo [Our Platform] Launcher listo.
  exit /b 0
)

echo [Our Platform] Iniciando servidor local en http://127.0.0.1:4310 ...
start "Our Platform Server" /min cmd.exe /d /s /c "npm.cmd start"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:4310'; for($i=0;$i -lt 40;$i++){ try { $response=Invoke-WebRequest -UseBasicParsing -Uri ($url + '/api/health') -TimeoutSec 1; if($response.StatusCode -eq 200){ Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; Write-Host '[Our Platform] El servidor no respondio a tiempo.'; exit 1"
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo [Our Platform] No se pudo iniciar. Revisa el mensaje anterior.
pause
exit /b 1

@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [Hallazia] Node.js 24 o posterior no esta instalado o no esta en PATH.
  echo Descargalo desde https://nodejs.org/ y vuelve a intentarlo.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [Hallazia] npm.cmd no esta disponible.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node.exe -p "process.versions.node"') do set "OUR_PLATFORM_NODE_MAJOR=%%V"
if %OUR_PLATFORM_NODE_MAJOR% LSS 24 (
  echo [Hallazia] Se requiere Node.js 24 o posterior. Version detectada: %OUR_PLATFORM_NODE_MAJOR%.
  pause
  exit /b 1
)

set "OUR_PLATFORM_PORT=4310"
if exist ".env" for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b /c:"PORT=" ".env"`) do if not "%%B"=="" set "OUR_PLATFORM_PORT=%%B"

if not exist "node_modules\" (
  echo [Hallazia] Instalando dependencias locales...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

if not exist "apps\server\dist\index.js" goto :build
if not exist "apps\web\dist\index.html" goto :build
goto :ready

:build
echo [Hallazia] Preparando la aplicacion...
call npm.cmd run build
if errorlevel 1 goto :failed

:ready
if /I "%~1"=="--check" (
  echo [Hallazia] Launcher listo.
  exit /b 0
)

echo [Hallazia] Iniciando servidor local en http://127.0.0.1:%OUR_PLATFORM_PORT% ...
start "Hallazia Server" /min cmd.exe /d /s /c "npm.cmd start"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%OUR_PLATFORM_PORT%'; for($i=0;$i -lt 40;$i++){ try { $response=Invoke-WebRequest -UseBasicParsing -Uri ($url + '/api/health') -TimeoutSec 1; if($response.StatusCode -eq 200){ Start-Process $url; exit 0 } } catch {}; Start-Sleep -Milliseconds 250 }; Write-Host '[Hallazia] El servidor no respondio a tiempo.'; exit 1"
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo [Hallazia] No se pudo iniciar. Revisa el mensaje anterior.
pause
exit /b 1

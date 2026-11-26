@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js 22.23.4 o superior en el PATH.
  pause
  exit /b 1
)

if not exist "node_modules\.package-lock.json" (
  call npm ci
  if errorlevel 1 goto :fail
)

if not exist "dist\server\entry.mjs" (
  call npm run build
  if errorlevel 1 goto :fail
)

set "HOST=127.0.0.1"
set "PORT=4321"

call npm start
goto :eof

:fail
echo No se pudo preparar Diskgroup Center.
pause
exit /b 1
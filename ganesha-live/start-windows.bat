@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Please install the LTS version from https://nodejs.org then run this file again.
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)
echo Checking components, please wait...
call npm install --omit=dev --no-audit --no-fund
node server.js
pause

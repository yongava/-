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
if not exist node_modules (
  echo Installing for the first time, please wait...
  call npm install --omit=dev
)
node server.js
pause

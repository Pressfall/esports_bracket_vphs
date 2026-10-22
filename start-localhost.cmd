@echo off
rem Starts the Smash Rankings site at http://localhost:8080 and opens it in your browser.
rem Keep this window open while you use the site. Close it (or press Ctrl+C) to stop.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)
node serve.js --open
pause

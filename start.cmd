@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo A supported Node.js LTS release is required. Install it, then run this file again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:4173 in your browser once the server is ready.
echo Keep this window open. Press Ctrl+C to stop the application.
node server.mjs
if errorlevel 1 pause

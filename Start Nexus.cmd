@echo off
cd /d "%~dp0"
set "npm_config_cache=%~dp0.cache\npm"
set "TEMP=%~dp0.cache"
set "TMP=%~dp0.cache"
node scripts\start.mjs --open
if errorlevel 1 (
  echo Could not start Nexus. If it is already running, open http://127.0.0.1:5174 in your browser.
  pause
)

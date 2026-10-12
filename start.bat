@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22 or newer from nodejs.org
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo Install Git for Windows from git-scm.com
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Paste your BOT_TOKEN into .env, save it and close Notepad.
  start /wait notepad .env
)
node scripts/auto.js
pause

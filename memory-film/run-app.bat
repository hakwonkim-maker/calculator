@echo off
REM MEMORIA Film Studio - run without installing (for testing)
REM Requires: Node.js 22 LTS  (https://nodejs.org/ko/download)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed. Opening download page...
  start https://nodejs.org/ko/download
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing packages (first time only)...
  call npm install
)
call npm run start

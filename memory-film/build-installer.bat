@echo off
REM ============================================================
REM  MEMORIA Film Studio - Windows installer build
REM  Requires: Node.js 22 LTS  (https://nodejs.org/ko/download)
REM  Result  : release\MEMORIA-Film-Studio-Setup-x.y.z.exe
REM ============================================================
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed. Opening download page...
  start https://nodejs.org/ko/download
  pause
  exit /b 1
)
echo [1/3] Installing packages (first time takes a few minutes)...
call npm ci || call npm install
if errorlevel 1 ( echo [!] npm install failed & pause & exit /b 1 )
echo [2/3] Downloading free music library (CC0, about 100MB, skipped if offline)...
call node scripts\fetch-music.cjs
echo [3/3] Building installer...
call npm run dist:win
if errorlevel 1 ( echo [!] Build failed & pause & exit /b 1 )
echo.
echo Done! Opening the release folder...
start "" "%~dp0release"
pause

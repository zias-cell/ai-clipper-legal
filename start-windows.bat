@echo off
REM Double-click launcher for Windows. Starts the News-Tok dashboard and opens
REM it in your browser. Keep this window open while using it; close it to stop.
cd /d "%~dp0"
title News-Tok
cls
echo.
echo  Starting News-Tok...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed ^(it's free^).
  echo  Opening https://nodejs.org - install the big green LTS button,
  echo  then double-click this file again.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo  First-time setup ^(about a minute^)...
  call npm install || ( echo  Setup failed. & pause & exit /b 1 )
)

start "" http://localhost:4321
echo.
echo  Opening http://localhost:4321 in your browser.
echo  Keep THIS window open while you use it. Close it to stop the app.
echo.
call npm run dashboard
pause

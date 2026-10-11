@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed.
  echo Install it from https://nodejs.org and then run start.bat again.
  pause
  exit /b 1
)
echo Keep this window open while you practice. Closing it stops the save.
echo Finger timings save in progress\sparsh-rssb-v1.json
echo Gemini reads the finger file when gemini.key is in this folder.
node server.js --open
if errorlevel 1 pause

@echo off
rem Builds Derivo-Setup.exe on this PC. Needs Node.js (https://nodejs.org, LTS version).
cd /d "%~dp0"
where npm >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again. & pause & exit /b 1)
echo Installing build tools (first time takes a few minutes)...
call npm install || (pause & exit /b 1)
echo Building the installer...
call npm run dist || (pause & exit /b 1)
echo.
echo Done! Your installer is in the "dist" folder: Derivo-Setup.exe
explorer dist
pause

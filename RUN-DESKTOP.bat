@echo off
rem Runs the desktop app without building an installer (for quick testing). Needs Node.js.
cd /d "%~dp0"
if not exist node_modules call npm install
call npm start

@echo off
cd /d "%~dp0"
echo Building...
call npm.cmd run build
echo.
echo Done. Exit code: %errorlevel%
echo Press any key to close.
pause

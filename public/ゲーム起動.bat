@echo off
start "" cmd /c "npx -y serve . -l 3000"
timeout /t 3 /nobreak >nul
start http://localhost:3000
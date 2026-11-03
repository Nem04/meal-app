@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
echo 正在启动家庭点菜...
node src\server.js
pause

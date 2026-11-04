@echo off
chcp 65001 >nul
cd /d "%~dp0backend"
if exist "%~dp0runtime\node.exe" (
  set "NODE=%~dp0runtime\node.exe"
  echo 检测到项目自带的 Node.js 运行时
) else (
  set "NODE=node"
)
echo 正在启动家庭点菜...
"%NODE%" src\server.js
if errorlevel 1 (
  echo.
  echo 启动失败：请确认已安装 Node.js 或项目 runtime 文件夹存在 node.exe
)
pause

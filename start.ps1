# 家庭点菜启动脚本（Windows PowerShell）
Set-Location $PSScriptRoot\backend
if (-not $env:PORT) { $env:PORT = '8080' }
Write-Host "家庭点菜启动，端口 $env:PORT ..."
node src\server.js

# 停止家庭点菜服务
$ErrorActionPreference = 'SilentlyContinue'
$port = '8080'
$conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if (-not $conn) {
  Write-Host '家庭点菜服务当前没有在运行。' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 0
}
$ids = $conn | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($id in $ids) {
  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
}
Write-Host '家庭点菜服务已停止。' -ForegroundColor Green
Read-Host '按回车退出'
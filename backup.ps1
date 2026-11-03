# 备份脚本：复制数据库到 backups/，保留最近 30 份。
$root = $PSScriptRoot
$data = Join-Path $root 'data\app.db'
$backupDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
if (Test-Path $data) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  Copy-Item -LiteralPath $data -Destination (Join-Path $backupDir "app-$stamp.db")
  Get-ChildItem $backupDir -Filter 'app-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force
  Write-Host "备份完成：app-$stamp.db"
} else {
  Write-Host "尚未生成数据库文件，无需备份。"
}

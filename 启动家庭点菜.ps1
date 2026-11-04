# 启动家庭点菜（后台静默，不弹黑窗口）
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root 'backend')

$nodeCandidates = @(
  'C:\Program Files\nodejs\node.exe',
  (Join-Path $root 'runtime\node.exe'),
  (Get-Command node -ErrorAction SilentlyContinue).Source
)
$node = $null
foreach ($cand in $nodeCandidates) {
  if ($cand -and (Test-Path -LiteralPath $cand)) { $node = $cand; break }
}
if (-not $node) {
  Write-Host '没有找到 Node.js。' -ForegroundColor Yellow
  Read-Host '按回车退出'
  exit 1
}
if (-not $env:PORT) { $env:PORT = '8080' }

# 如果已在运行，先提醒。
$listening = Get-NetTCPConnection -LocalPort $env:PORT -State Listen -ErrorAction SilentlyContinue
if ($listening) {
  Write-Host "服务已经在运行中（端口 $env:PORT 已监听）。" -ForegroundColor Green
  Write-Host "访问 http://localhost:$env:PORT"
  Read-Host '按回车退出'
  exit 0
}

$log = Join-Path $root 'server.log'
$err = Join-Path $root 'server.err.log'
Start-Process -FilePath $node -ArgumentList 'src\server.js' -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err
Write-Host '家庭点菜已启动。' -ForegroundColor Green
Write-Host "本机访问 http://localhost:$env:PORT"
Write-Host "手机访问（连同一 WiFi）http://192.168.5.2:$env:PORT"
Write-Host ''
Read-Host '服务已在后台运行，按回车关闭本提示'
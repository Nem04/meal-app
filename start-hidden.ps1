# 后台静默启动脚本：不显示窗口，用于计划任务/开机自启。
$ErrorActionPreference = 'Stop'

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
if (-not $node) { exit 1 }

if (-not $env:PORT) { $env:PORT = '8080' }

# 启动 node 服务，输出写日志。
$log = Join-Path $root 'server.log'
$err = Join-Path $root 'server.err.log'
Start-Process -FilePath $node -ArgumentList 'src\server.js' -WorkingDirectory (Join-Path $root 'backend') -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err
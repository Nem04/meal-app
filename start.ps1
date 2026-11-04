# 家庭点菜启动脚本（双击「家庭点菜」快捷方式即可）
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $root 'backend')

# 自动寻找 Node.js：优先项目自带运行时，其次常见安装位置，其次系统 PATH。
$nodeCandidates = @(
  (Join-Path $root 'runtime\node.exe'),
  'C:\Program Files\nodejs\node.exe',
  'C:\Program Files (x86)\nodejs\node.exe',
  "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
  "$env:APPDATA\npm\node.exe",
  (Get-Command node -ErrorAction SilentlyContinue).Source
)

$node = $null
foreach ($cand in $nodeCandidates) {
  if ($cand -and (Test-Path -LiteralPath $cand)) { $node = $cand; break }
}

if (-not $node) {
  Write-Host ''
  Write-Host '没有找到 Node.js。' -ForegroundColor Yellow
  Write-Host '请先安装 Node.js 22 或更新版本：https://nodejs.org/zh-cn/download' -ForegroundColor Yellow
  Write-Host ''
  Read-Host '按回车退出'
  exit 1
}

if (-not $env:PORT) { $env:PORT = '8080' }

Write-Host '正在启动家庭点菜...' -ForegroundColor Green
Write-Host "使用 Node: $node"
Write-Host "启动后请访问 http://localhost:$env:PORT"
Write-Host ''
& $node 'src\server.js'
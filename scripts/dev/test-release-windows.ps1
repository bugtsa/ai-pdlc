param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [string]$Version = "0.1.1",

    [string]$WorkDir = "$env:TEMP\\ai-pdlc-smoke"
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Name"
    }
}

Require-Command "node"
Require-Command "powershell"

if (-not (Test-Path $RepoRoot)) {
    throw "Repo root does not exist: $RepoRoot"
}

$releaseUrl = "https://github.com/bugtsa/ai-pdlc/releases/download/v$Version/ai-pdlc-$Version-windows-portable.zip"
$zipPath = Join-Path $WorkDir "ai-pdlc-$Version-windows-portable.zip"
$extractPath = Join-Path $WorkDir "ai-pdlc-$Version"

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
if (Test-Path $extractPath) {
    Remove-Item -Recurse -Force $extractPath
}

Write-Host "Downloading $releaseUrl"
Invoke-WebRequest -Uri $releaseUrl -OutFile $zipPath

Write-Host "Expanding archive"
Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force

$cli = Join-Path $extractPath "bin\\ai-pdlc.exe"
if (-not (Test-Path $cli)) {
    throw "CLI not found after extraction: $cli"
}

Write-Host "`n=== help ==="
& $cli help

Write-Host "`n=== doctor ==="
& $cli doctor --repo-root $RepoRoot --json

Write-Host "`n=== setup-codex dry-run ==="
& $cli setup-codex --dry-run --repo-root $RepoRoot --json

Write-Host "`n=== setup-claude-code dry-run ==="
& $cli setup-claude-code --dry-run --repo-root $RepoRoot --json

Write-Host "`nWindows release smoke passed."

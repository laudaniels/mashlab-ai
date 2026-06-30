# Start MashLab sidecar inside WSL using .venv-rhythm
param(
    [string]$Distro = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Test-WslAvailable {
    try {
        $null = wsl --status 2>$null
        return $LASTEXITCODE -eq 0
    } catch {
        return $false
    }
}

if (-not (Test-WslAvailable)) {
    Write-Host "WSL not available. Use Windows sidecar: cd local-engine\service; python -m uvicorn main:app --host 127.0.0.1 --port 47831"
    exit 0
}

$linuxPath = (wsl wslpath -a $Root).Trim()
$distroArg = if ($Distro) { "-d $Distro" } else { "" }

Write-Host "Starting WSL sidecar (Ctrl+C to stop)..."
wsl $distroArg bash -lc "cd '$linuxPath' && bash scripts/run-sidecar-linux.sh"

# Optional WSL rhythm sidecar setup — does not modify Windows MVP.
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
    Write-Host "WSL is not installed on this host."
    Write-Host "Windows MVP works without WSL. Optional verified rhythm engines require WSL2/Linux."
    Write-Host "Install: wsl.exe --install"
    Write-Host "See docs/WSL_RHYTHM_ENGINE_SETUP.md"
    exit 0
}

$linuxPath = (wsl wslpath -a $Root).Trim()
$distroArg = if ($Distro) { "-d $Distro" } else { "" }

Write-Host "Running rhythm bootstrap in WSL for: $linuxPath"
wsl $distroArg bash -lc "cd '$linuxPath' && bash scripts/setup-rhythm-linux.sh"
exit $LASTEXITCODE

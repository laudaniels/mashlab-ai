# Phase 32 - full local workflow API QA (non-copyright synthetic audio)
$ErrorActionPreference = "Stop"
$LogDir = Join-Path $PSScriptRoot "logs"
$AudioDir = Join-Path $PSScriptRoot "test-audio"
$Base = "http://127.0.0.1:47831"
New-Item -ItemType Directory -Force -Path $LogDir, $AudioDir | Out-Null

function Save-Json($Name, $Obj) {
  $path = Join-Path $LogDir "$Name.json"
  ($Obj | ConvertTo-Json -Depth 20) | Set-Content -Path $path -Encoding UTF8
  return $path
}

$results = @()

function Record($Step, $Pass, $Detail) {
  $script:results += [pscustomobject]@{ Step = $Step; Pass = $Pass; Detail = $Detail }
  $tag = if ($Pass) { "PASS" } else { "FAIL" }
  Write-Host "[$tag] $Step - $Detail"
}

$trackA = Join-Path $AudioDir "track-a-vocal-like-15s.wav"
$trackB = Join-Path $AudioDir "track-b-instrumental-15s.wav"

if (-not (Test-Path $trackA)) {
  $fcA = '[0]volume=0.75[a];[1]volume=0.2[b];[a][b]amix=inputs=2:duration=first'
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & ffmpeg -y -f lavfi -i "sine=frequency=440:duration=15" -f lavfi -i "sine=frequency=220:duration=15" `
    -filter_complex $fcA -ac 2 -ar 44100 $trackA 2>&1 | Out-Null
  $ErrorActionPreference = $prevEap
}
if (-not (Test-Path $trackB)) {
  $fcB = '[0]volume=0.6[a];[1]volume=0.4[b];[a][b]amix=inputs=2:duration=first'
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & ffmpeg -y -f lavfi -i "sine=frequency=110:duration=15" -f lavfi -i "anoisesrc=d=15:c=pink:a=0.015" `
    -filter_complex $fcB -ac 2 -ar 44100 $trackB 2>&1 | Out-Null
  $ErrorActionPreference = $prevEap
}
Record "Generate test audio" ((Test-Path $trackA) -and (Test-Path $trackB)) "track-a + track-b synthetic WAV"

$health = curl.exe -s "$Base/health" | ConvertFrom-Json
Save-Json "01-health" $health | Out-Null
Record "Sidecar health" $health.ok $health.bind

$caps = curl.exe -s "$Base/v1/capabilities" | ConvertFrom-Json
Save-Json "02-capabilities" $caps | Out-Null
foreach ($id in @("ffmpeg","ffprobe","rubberband","torch","demucs")) {
  $c = $caps.capabilities | Where-Object { $_.id -eq $id } | Select-Object -First 1
  $ver = if ($c.version) { $c.version } else { $c.message }
  Record "Capability $id" ($c.status -eq "available") $ver
}

$metaA = curl.exe -s -X POST "$Base/v1/analyze/metadata" -F "file=@$trackA" | ConvertFrom-Json
Save-Json "03-metadata-track-a" $metaA | Out-Null
Record "Metadata Track A" $metaA.ok $metaA.message

$metaB = curl.exe -s -X POST "$Base/v1/analyze/metadata" -F "file=@$trackB" | ConvertFrom-Json
Save-Json "04-metadata-track-b" $metaB | Out-Null
Record "Metadata Track B" $metaB.ok $metaB.message

foreach ($pair in @(@("track-a",$trackA,"05"), @("track-b",$trackB,"06"))) {
  $label, $path, $pfx = $pair
  foreach ($lane in @("beat","key","phrases")) {
    $resp = curl.exe -s -X POST "$Base/v1/analyze/$lane" -F "file=@$path" | ConvertFrom-Json
    Save-Json "$pfx-analyze-$lane-$label" $resp | Out-Null
    $laneOk = ($resp.ok -eq $true) -or ($resp.status -match "missing|not_configured|planned|dependency")
    Record "Analyze $lane ($label)" $laneOk $resp.message
  }
}

$stemA = curl.exe -s -X POST "$Base/v1/process/stem-preview" -F "file=@$trackA" -F "split_mode=vocals_no_vocals" -F "max_preview_seconds=15" | ConvertFrom-Json
Save-Json "07-stem-preview-track-a" $stemA | Out-Null
Record "Stem preview Track A" ($stemA.ok -and $stemA.audio_processed) $stemA.artifact_id

$stemB = curl.exe -s -X POST "$Base/v1/process/stem-preview" -F "file=@$trackB" -F "split_mode=vocals_no_vocals" -F "max_preview_seconds=15" | ConvertFrom-Json
Save-Json "08-stem-preview-track-b" $stemB | Out-Null
Record "Stem preview Track B" ($stemB.ok -and $stemB.audio_processed) $stemB.artifact_id

$stemAId = $stemA.artifact_id
$stemBId = $stemB.artifact_id

$combinedBody = @{
  mash_intent = "vocal_a_over_beat_b"
  source_vocal_artifact_id = $stemAId
  target_instrumental_artifact_id = $stemBId
  max_preview_seconds = 15
  pitch_shift_semitones = 0
  alignment_offset_ms = 0
  vocal_gain_db = -2
  instrumental_gain_db = 1
  master_gain_db = 0
  vocal_fade_in_ms = 100
  vocal_fade_out_ms = 200
  limiter_safety = $true
  neutral_processing = $true
} | ConvertTo-Json -Compress
$combinedPath = Join-Path $LogDir "09-combined-preview-body.json"
Set-Content -Path $combinedPath -Value $combinedBody -Encoding UTF8 -NoNewline
$combined = curl.exe -s -X POST "$Base/v1/process/combined-preview" -H "Content-Type: application/json" --data-binary "@$combinedPath" | ConvertFrom-Json
Save-Json "09-combined-preview" $combined | Out-Null
Record "Combined preview" ($combined.ok -and $combined.audio_processed) $combined.artifact_id

$fullBody = @{
  mash_intent = "vocal_a_over_beat_b"
  source_vocal_stem_artifact_id = $stemAId
  target_instrumental_stem_artifact_id = $stemBId
  export_label = "phase32-full-wav"
  vocal_gain_db = -2
  instrumental_gain_db = 1
  master_gain_db = 0
  max_test_seconds = 15
  neutral_processing = $true
  confirm_neutral_settings = $true
} | ConvertTo-Json -Compress
$fullPath = Join-Path $LogDir "10-full-wav-body.json"
Set-Content -Path $fullPath -Value $fullBody -Encoding UTF8 -NoNewline
$fullWav = curl.exe -s -X POST "$Base/v1/export/full-wav" -H "Content-Type: application/json" --data-binary "@$fullPath" | ConvertFrom-Json
Save-Json "10-full-wav-export" $fullWav | Out-Null
Record "Full WAV export" ($fullWav.ok -and $fullWav.final_export) $fullWav.export_artifact_id

$wavExportId = $fullWav.export_artifact_id

$mp3Body = @{ source_wav_export_artifact_id = $wavExportId; bitrate_kbps = 320; export_label = "phase32-mp3" } | ConvertTo-Json -Compress
$mp3Path = Join-Path $LogDir "11-mp3-body.json"
Set-Content -Path $mp3Path -Value $mp3Body -Encoding UTF8 -NoNewline
$mp3 = curl.exe -s -X POST "$Base/v1/export/mp3" -H "Content-Type: application/json" --data-binary "@$mp3Path" | ConvertFrom-Json
Save-Json "11-mp3-export" $mp3 | Out-Null
Record "MP3 export" ($mp3.ok -and $mp3.final_export) $mp3.export_artifact_id

$masterBody = @{ source_wav_export_artifact_id = $wavExportId; preset = "club_loudness_prototype"; export_label = "phase32-master" } | ConvertTo-Json -Compress
$masterPath = Join-Path $LogDir "12-master-body.json"
Set-Content -Path $masterPath -Value $masterBody -Encoding UTF8 -NoNewline
$master = curl.exe -s -X POST "$Base/v1/master/wav" -H "Content-Type: application/json" --data-binary "@$masterPath" | ConvertFrom-Json
Save-Json "12-master-export" $master | Out-Null
Record "Mastering preset" ($master.ok -and $master.final_export) $master.master_artifact_id

$artifacts = curl.exe -s "$Base/v1/artifacts" | ConvertFrom-Json
Save-Json "13-artifact-list" $artifacts | Out-Null
Record "Artifact browser list" $artifacts.ok ("count=" + $artifacts.artifacts.Count)

$metaStem = curl.exe -s "$Base/v1/artifacts/$stemAId/metadata" | ConvertFrom-Json
Save-Json "14-artifact-metadata-stem-a" $metaStem | Out-Null
Record "Artifact metadata loudness" $metaStem.ok $metaStem.message

$packageIds = @($stemAId, $stemBId, $combined.artifact_id, $wavExportId, $mp3.export_artifact_id, $master.master_artifact_id) | Where-Object { $_ }
$pkgBody = @{
  package_label = "phase32-local-qa"
  selected_artifact_ids = @($packageIds)
  package_type = "folder"
  include_technical_report = $true
} | ConvertTo-Json -Compress
$pkgPath = Join-Path $LogDir "15-package-body.json"
Set-Content -Path $pkgPath -Value $pkgBody -Encoding UTF8 -NoNewline
$package = curl.exe -s -X POST "$Base/v1/export/package" -H "Content-Type: application/json" --data-binary "@$pkgPath" | ConvertFrom-Json
Save-Json "15-package-export" $package | Out-Null
Record "Project package" ($package.ok -and (-not $package.public_share)) $package.package_artifact_id

$delId = $mp3.export_artifact_id
$delete = curl.exe -s -X DELETE "$Base/v1/artifacts/$delId" | ConvertFrom-Json
Save-Json "16-delete-mp3-artifact" $delete | Out-Null
Record "Delete artifact safely" $delete.ok $delId

$results | Export-Csv -Path (Join-Path $LogDir "pass-fail-table.csv") -NoTypeInformation
$results | Format-Table -AutoSize | Out-String | Set-Content (Join-Path $LogDir "pass-fail-table.txt") -Encoding UTF8

@{
  stem_a = "local-engine/service/.work/artifacts/stems/$stemAId"
  stem_b = "local-engine/service/.work/artifacts/stems/$stemBId"
  combined = "local-engine/service/.work/artifacts/combined-preview/$($combined.artifact_id)"
  full_wav = "local-engine/service/.work/artifacts/exports/$wavExportId"
  master = "local-engine/service/.work/artifacts/masters/$($master.master_artifact_id)"
  package = $package.local_folder_path
} | ConvertTo-Json | Set-Content (Join-Path $LogDir "artifact-paths.json") -Encoding UTF8

Write-Host ""
Write-Host "Phase 32 API QA complete. Logs: $LogDir"

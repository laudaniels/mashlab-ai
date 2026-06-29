"""Local WAV export from existing combined-preview artifacts."""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import config
from artifact_management import (
    COMBINED_DIR,
    analyze_technical_readout,
    is_valid_artifact_id,
    _resolve_under,
)

EXPORTS_DIR = config.WORK_DIR / "artifacts" / "exports"
EXPORT_FILE_NAME = "export.wav"
META_FILE_NAME = "export.meta.json"

RIGHTS_NOTICE = (
    "Upload audio you own or are authorized to use. MashLab AI helps process and "
    "arrange it. Rights to publish or distribute are separate and remain the user's "
    "responsibility."
)

LOCAL_EXPORT_LABEL = (
    "Local export — user responsible for rights. No public distribution rights granted."
)

LOUDNESS_TARGET_MODES = frozenset({"measurement_only", "normalize_preview"})


@dataclass
class ExportWavSuccess:
    ok: True
    status: str
    message: str
    export_artifact_id: str
    source_combined_preview_artifact_id: str
    artifact_url: str
    download_url: str
    file_size_bytes: int | None
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    codec: str | None
    loudness: object
    final_export: bool
    public_share: bool
    rights_notice: str
    warnings: list[str]
    limitations: list[str]
    export_label: str | None


@dataclass
class ExportWavFailure:
    ok: False
    status: str
    message: str
    validation_errors: list[str] | None = None


ExportWavResult = ExportWavSuccess | ExportWavFailure


def create_wav_export(
    source_combined_preview_artifact_id: str,
    export_format: str = "wav",
    export_label: str | None = None,
    loudness_target_mode: str = "measurement_only",
) -> ExportWavResult:
    errors: list[str] = []

    if export_format != "wav":
        errors.append("Only WAV export is supported in this phase.")

    if not is_valid_artifact_id(source_combined_preview_artifact_id):
        errors.append("Invalid source combined preview artifact id.")

    if loudness_target_mode not in LOUDNESS_TARGET_MODES:
        errors.append(
            "loudness_target_mode must be measurement_only or normalize_preview."
        )

    if export_label is not None and len(export_label.strip()) > 120:
        errors.append("export_label must be 120 characters or fewer.")

    if errors:
        return ExportWavFailure(
            ok=False,
            status="validation_error",
            message="Export request validation failed.",
            validation_errors=errors,
        )

    source_path = _combined_preview_path(source_combined_preview_artifact_id)
    if source_path is None:
        return ExportWavFailure(
            ok=False,
            status="missing_artifact",
            message="Combined preview artifact not found.",
        )

    export_id = uuid.uuid4().hex
    export_dir = _resolve_under(EXPORTS_DIR, export_id)
    if export_dir is None:
        return ExportWavFailure(
            ok=False,
            status="processing_failed",
            message="Could not resolve export artifact directory.",
        )

    export_dir.mkdir(parents=True, exist_ok=True)
    export_path = export_dir / EXPORT_FILE_NAME

    warnings: list[str] = [
        "This is a local user-generated WAV export prototype — not a published release.",
        "Source material is the combined preview WAV; full-length arrangement rendering is not implemented.",
    ]
    limitations: list[str] = [
        "No MP3, stem package, club mastering, or public sharing in this phase.",
        "Export does not grant distribution or publishing rights.",
    ]

    if loudness_target_mode == "normalize_preview":
        warnings.append(
            "Normalize preview copy applies FFmpeg loudnorm to the preview copy only — "
            "not full mastering and not club-ready output."
        )
        copy_ok, copy_message = _normalize_preview_copy(source_path, export_path)
    else:
        copy_ok, copy_message = _copy_preview_wav(source_path, export_path)
        limitations.append(
            "Loudness is measured only; no normalization applied unless normalize_preview is selected."
        )

    if not copy_ok:
        shutil.rmtree(export_dir, ignore_errors=True)
        return ExportWavFailure(
            ok=False,
            status="processing_failed",
            message=copy_message,
        )

    meta = {
        "source_combined_preview_artifact_id": source_combined_preview_artifact_id,
        "export_label": export_label.strip() if export_label else None,
        "loudness_target_mode": loudness_target_mode,
        "export_format": "wav",
        "created_at": datetime.now(tz=UTC).isoformat(),
        "public_share": False,
        "final_export": True,
    }
    (export_dir / META_FILE_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    technical = analyze_technical_readout(export_path)
    artifact_url = f"/v1/artifacts/exports/{export_id}/export"
    download_url = artifact_url

    return ExportWavSuccess(
        ok=True,
        status="ready",
        message="Local WAV export created from combined preview artifact.",
        export_artifact_id=export_id,
        source_combined_preview_artifact_id=source_combined_preview_artifact_id,
        artifact_url=artifact_url,
        download_url=download_url,
        file_size_bytes=technical.file_size_bytes,
        duration_seconds=technical.duration_seconds,
        sample_rate=technical.sample_rate,
        channel_count=technical.channel_count,
        codec=technical.codec,
        loudness=technical.loudness,
        final_export=True,
        public_share=False,
        rights_notice=RIGHTS_NOTICE,
        warnings=warnings,
        limitations=limitations,
        export_label=export_label.strip() if export_label else None,
    )


def read_export_meta(export_dir: Path) -> dict | None:
    meta_path = export_dir / META_FILE_NAME
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _combined_preview_path(artifact_id: str) -> Path | None:
    combined_dir = _resolve_under(COMBINED_DIR, artifact_id)
    if combined_dir is None or not combined_dir.is_dir():
        return None
    preview = combined_dir / "preview.wav"
    return preview if preview.is_file() else None


def _copy_preview_wav(source: Path, destination: Path) -> tuple[bool, str]:
    try:
        shutil.copy2(source, destination)
        return True, "Copied combined preview WAV to local export artifact."
    except OSError as error:
        return False, f"Could not copy preview WAV: {error}"


def _normalize_preview_copy(source: Path, destination: Path) -> tuple[bool, str]:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return False, "FFmpeg is required for normalize_preview mode."

    command = [
        ffmpeg,
        "-hide_banner",
        "-y",
        "-i",
        str(source),
        "-af",
        "loudnorm=I=-14:TP=-1:LRA=11",
        str(destination),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=300,
        )
    except (subprocess.SubprocessError, OSError) as error:
        return False, f"FFmpeg normalize preview copy failed: {error}"

    if result.returncode != 0 or not destination.is_file():
        return False, "FFmpeg loudnorm normalize preview copy did not produce output."

    return True, "Normalized preview copy written with FFmpeg loudnorm (prototype only)."

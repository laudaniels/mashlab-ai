"""Local MP3 reference export from existing WAV export artifacts."""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from artifact_management import analyze_technical_readout, is_valid_artifact_id, _resolve_under
from arrangement_context import inherit_arrangement_context, merge_arrangement_context_into_meta
from export_processing import (
    EXPORTS_DIR,
    META_FILE_NAME,
    RIGHTS_NOTICE,
    find_wav_export_path,
    read_export_meta,
)

EXPORT_MP3_FILE_NAME = "export.mp3"
MP3_EXPORT_SUBTYPE = "mp3"

LOCAL_MP3_EXPORT_LABEL = (
    "Local MP3 reference export — user responsible for rights. "
    "No public distribution rights granted."
)

ALLOWED_MP3_BITRATES = frozenset({320, 256, 192})
DEFAULT_MP3_BITRATE = 320


@dataclass
class ExportMp3Success:
    ok: True
    status: str
    message: str
    export_artifact_id: str
    source_wav_export_artifact_id: str
    artifact_url: str
    download_url: str
    export_format: str
    bitrate_kbps: int
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
class ExportMp3Failure:
    ok: False
    status: str
    message: str
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None


ExportMp3Result = ExportMp3Success | ExportMp3Failure


def build_ffmpeg_mp3_command(
    ffmpeg_binary: str,
    source_wav: Path,
    output_mp3: Path,
    *,
    bitrate_kbps: int,
) -> list[str]:
    return [
        ffmpeg_binary,
        "-hide_banner",
        "-y",
        "-i",
        str(source_wav),
        "-codec:a",
        "libmp3lame",
        "-b:a",
        f"{bitrate_kbps}k",
        str(output_mp3),
    ]


def create_mp3_export(
    source_wav_export_artifact_id: str,
    bitrate_kbps: int = DEFAULT_MP3_BITRATE,
    export_label: str | None = None,
) -> ExportMp3Result:
    errors: list[str] = []

    if not is_valid_artifact_id(source_wav_export_artifact_id):
        errors.append("Invalid source WAV export artifact id.")

    if bitrate_kbps not in ALLOWED_MP3_BITRATES:
        errors.append("bitrate_kbps must be 320, 256, or 192.")

    if export_label is not None and len(export_label.strip()) > 120:
        errors.append("export_label must be 120 characters or fewer.")

    if errors:
        return ExportMp3Failure(
            ok=False,
            status="validation_error",
            message="MP3 export request validation failed.",
            validation_errors=errors,
        )

    source_path = find_wav_export_path(source_wav_export_artifact_id)
    if source_path is None:
        export_dir = _resolve_under(EXPORTS_DIR, source_wav_export_artifact_id)
        if export_dir and export_dir.is_dir() and (export_dir / EXPORT_MP3_FILE_NAME).is_file():
            return ExportMp3Failure(
                ok=False,
                status="wrong_artifact_type",
                message="Source artifact is not a WAV export.",
                setup_guidance="Select a WAV export artifact, not an MP3 reference export.",
            )
        return ExportMp3Failure(
            ok=False,
            status="missing_artifact",
            message="WAV export artifact not found.",
            setup_guidance="Create a local WAV export before MP3 reference export.",
        )

    source_meta = read_export_meta(source_path.parent)
    if source_meta and source_meta.get("export_format") == "mp3":
        return ExportMp3Failure(
            ok=False,
            status="wrong_artifact_type",
            message="Source artifact is not a WAV export.",
            setup_guidance="Select a WAV export artifact, not an MP3 reference export.",
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return ExportMp3Failure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to encode MP3 reference exports.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    export_id = uuid.uuid4().hex
    export_dir = _resolve_under(EXPORTS_DIR, export_id)
    if export_dir is None:
        return ExportMp3Failure(
            ok=False,
            status="processing_failed",
            message="Could not resolve export artifact directory.",
        )

    export_dir.mkdir(parents=True, exist_ok=True)
    export_path = export_dir / EXPORT_MP3_FILE_NAME

    encode_command = build_ffmpeg_mp3_command(
        ffmpeg,
        source_path,
        export_path,
        bitrate_kbps=bitrate_kbps,
    )

    try:
        result = subprocess.run(
            encode_command,
            capture_output=True,
            text=True,
            check=False,
            timeout=600,
        )
    except (subprocess.SubprocessError, OSError) as error:
        shutil.rmtree(export_dir, ignore_errors=True)
        return ExportMp3Failure(
            ok=False,
            status="processing_failed",
            message=f"FFmpeg MP3 encode failed: {error}",
        )

    if result.returncode != 0 or not export_path.is_file():
        shutil.rmtree(export_dir, ignore_errors=True)
        return ExportMp3Failure(
            ok=False,
            status="processing_failed",
            message="FFmpeg did not produce MP3 output.",
            setup_guidance=result.stderr.strip() or None,
        )

    meta = {
        "export_subtype": MP3_EXPORT_SUBTYPE,
        "export_format": "mp3",
        "source_wav_export_artifact_id": source_wav_export_artifact_id,
        "bitrate_kbps": bitrate_kbps,
        "export_label": export_label.strip() if export_label else None,
        "created_at": datetime.now(tz=UTC).isoformat(),
        "public_share": False,
        "final_export": True,
    }
    inherited_context = inherit_arrangement_context(source_meta)
    merge_arrangement_context_into_meta(meta, inherited_context)
    (export_dir / META_FILE_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    technical = analyze_technical_readout(export_path)
    artifact_url = f"/v1/artifacts/exports/{export_id}/export.mp3"

    warnings: list[str] = [
        "Local MP3 reference export — user-generated, not a published release.",
        "MP3 is a reference/export format, not proof of distribution rights.",
        "MP3 is not a mastered club version.",
    ]
    limitations: list[str] = [
        "No public sharing, streaming integration, or distribution rights granted.",
        "Lossy MP3 encoding — use WAV export for primary local master reference.",
    ]

    return ExportMp3Success(
        ok=True,
        status="ready",
        message="Local MP3 reference export created from WAV export artifact.",
        export_artifact_id=export_id,
        source_wav_export_artifact_id=source_wav_export_artifact_id,
        artifact_url=artifact_url,
        download_url=artifact_url,
        export_format="mp3",
        bitrate_kbps=bitrate_kbps,
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

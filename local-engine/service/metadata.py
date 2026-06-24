"""ffprobe-backed metadata analysis."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

from models import MetadataAnalysisResponse, MetadataAnalysisResult

FFPROBE_SETUP_GUIDANCE = (
    "Install FFmpeg and ensure ffprobe is on PATH. "
    "Windows: download FFmpeg builds and add the bin folder to PATH. "
    "macOS: brew install ffmpeg. Linux: install ffmpeg from your package manager."
)


def ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def analyze_metadata_file(file_path: Path, original_name: str) -> MetadataAnalysisResponse:
    if not ffprobe_available():
        return MetadataAnalysisResponse(
            ok=False,
            status="missing",
            message="ffprobe is not available on PATH.",
            setup_guidance=FFPROBE_SETUP_GUIDANCE,
        )

    try:
        payload = _run_ffprobe(file_path)
    except subprocess.CalledProcessError as error:
        return MetadataAnalysisResponse(
            ok=False,
            status="failed",
            message=f"ffprobe could not inspect this file. {error}",
            setup_guidance=FFPROBE_SETUP_GUIDANCE,
        )
    except json.JSONDecodeError:
        return MetadataAnalysisResponse(
            ok=False,
            status="failed",
            message="ffprobe returned unreadable JSON output.",
            setup_guidance=FFPROBE_SETUP_GUIDANCE,
        )

    audio_stream = _first_audio_stream(payload)
    format_data = payload.get("format", {})

    result = MetadataAnalysisResult(
        file_name=original_name,
        file_size_bytes=file_path.stat().st_size,
        duration_seconds=_safe_float(format_data.get("duration")),
        bitrate=_safe_int(format_data.get("bit_rate")),
        codec=audio_stream.get("codec_name") if audio_stream else None,
        container=format_data.get("format_long_name") or format_data.get("format_name"),
        sample_rate=_safe_int(audio_stream.get("sample_rate")) if audio_stream else None,
        channel_count=_safe_int(audio_stream.get("channels")) if audio_stream else None,
        format_name=format_data.get("format_name"),
        source="ffprobe",
    )

    return MetadataAnalysisResponse(
        ok=True,
        status="implemented",
        message="Metadata returned from local ffprobe inspection.",
        result=result,
    )


def _run_ffprobe(file_path: Path) -> dict:
    command = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    completed = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return json.loads(completed.stdout)


def _first_audio_stream(payload: dict) -> dict | None:
    for stream in payload.get("streams", []):
        if stream.get("codec_type") == "audio":
            return stream
    return None


def _safe_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: object) -> int | None:
    try:
        if value is None:
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None

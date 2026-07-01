"""Prepare Quick Mix source audio — trim to MVP window from optional start offset."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from metadata import analyze_metadata_file
from rubber_band_processing import build_ffmpeg_trim_command, probe_wav_metadata

import config

QUICK_MIX_PREP_MAX_SECONDS = 180
QUICK_MIX_PREP_FADE_SECONDS = 1.0
QUICK_MIX_PREP_SAMPLE_RATE = 44100
QUICK_MIX_PREP_CHANNELS = 2


@dataclass
class QuickMixSourcePrepSuccess:
    ok: True
    output_path: Path
    output_file_name: str
    source_duration_seconds: float | None
    output_duration_seconds: float | None
    start_offset_seconds: float
    trimmed: bool
    fade_out_applied: bool


@dataclass
class QuickMixSourcePrepFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


QuickMixSourcePrepResult = QuickMixSourcePrepSuccess | QuickMixSourcePrepFailure


def validate_quick_mix_prep_request(
    *,
    max_seconds: int,
    start_offset_seconds: float,
    source_duration_seconds: float | None = None,
) -> list[str]:
    errors: list[str] = []

    if max_seconds < 1 or max_seconds > QUICK_MIX_PREP_MAX_SECONDS:
        errors.append(f"max_seconds must be between 1 and {QUICK_MIX_PREP_MAX_SECONDS}.")

    if start_offset_seconds < 0:
        errors.append("Start time cannot be negative.")

    if source_duration_seconds is not None:
        if start_offset_seconds >= source_duration_seconds - 0.05:
            errors.append("Start time is past the end of this file.")
            return errors
        available = max(0.0, source_duration_seconds - start_offset_seconds)
        if available <= 0.05:
            errors.append("This file is shorter than the selected section.")
        elif available < max_seconds - 0.05 and available < 1.0:
            errors.append("This file is shorter than the selected section.")

    return errors


def build_quick_mix_prep_ffmpeg_command(
    ffmpeg_binary: str,
    input_path: Path,
    output_path: Path,
    *,
    max_seconds: int,
    start_offset_seconds: float = 0.0,
    apply_fade_out: bool,
) -> list[str]:
    command = [
        ffmpeg_binary,
        "-y",
    ]
    if start_offset_seconds > 0:
        command.extend(["-ss", str(start_offset_seconds)])
    command.extend(
        [
            "-i",
            str(input_path),
            "-t",
            str(max_seconds),
        ]
    )
    if apply_fade_out and max_seconds > QUICK_MIX_PREP_FADE_SECONDS:
        fade_start = max(0.0, max_seconds - QUICK_MIX_PREP_FADE_SECONDS)
        command.extend(
            [
                "-af",
                f"afade=t=out:st={fade_start}:d={QUICK_MIX_PREP_FADE_SECONDS}",
            ]
        )
    command.extend(
        [
            "-acodec",
            "pcm_s16le",
            "-ar",
            str(QUICK_MIX_PREP_SAMPLE_RATE),
            "-ac",
            str(QUICK_MIX_PREP_CHANNELS),
            str(output_path),
        ]
    )
    return command


def resolve_output_window_seconds(
    *,
    max_seconds: int,
    start_offset_seconds: float,
    source_duration_seconds: float | None = None,
) -> int:
    if source_duration_seconds is None:
        return max_seconds
    available = max(0.0, source_duration_seconds - start_offset_seconds)
    return int(min(max_seconds, max(1.0, available)))


def prepare_quick_mix_source(
    input_path: Path,
    original_name: str,
    *,
    max_seconds: int = QUICK_MIX_PREP_MAX_SECONDS,
    start_offset_seconds: float = 0.0,
) -> QuickMixSourcePrepResult:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return QuickMixSourcePrepFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to prepare Quick Mix sources.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    metadata = analyze_metadata_file(input_path, original_name)
    source_duration = metadata.result.duration_seconds if metadata.ok and metadata.result else None

    validation_errors = validate_quick_mix_prep_request(
        max_seconds=max_seconds,
        start_offset_seconds=start_offset_seconds,
        source_duration_seconds=source_duration,
    )
    if validation_errors:
        return QuickMixSourcePrepFailure(
            ok=False,
            status="validation_error",
            message="Quick Mix source prep failed validation.",
            validation_errors=validation_errors,
            setup_guidance="; ".join(validation_errors),
        )

    output_window = resolve_output_window_seconds(
        max_seconds=max_seconds,
        start_offset_seconds=start_offset_seconds,
        source_duration_seconds=source_duration,
    )

    trimmed = (
        start_offset_seconds > 0.05
        or (source_duration is not None and source_duration > max_seconds + 0.05)
    )
    apply_fade_out = (
        source_duration is not None
        and start_offset_seconds + output_window < source_duration - 0.05
        and output_window >= max_seconds - 0.05
    )

    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    artifact_id = uuid4().hex
    output_path = config.TEMP_DIR / f"quick-mix-prep-{artifact_id}.wav"
    stem = Path(original_name).stem or "quick-mix-source"
    start_tag = int(start_offset_seconds) if start_offset_seconds > 0 else 0
    output_file_name = f"{stem}-quick-mix-{start_tag}s-{output_window}s.wav"

    if (
        not trimmed
        and input_path.suffix.lower() == ".wav"
        and start_offset_seconds <= 0.05
    ):
        command = build_ffmpeg_trim_command(
            ffmpeg,
            input_path,
            output_path,
            output_window,
        )
    else:
        command = build_quick_mix_prep_ffmpeg_command(
            ffmpeg,
            input_path,
            output_path,
            max_seconds=output_window,
            start_offset_seconds=start_offset_seconds,
            apply_fade_out=apply_fade_out,
        )

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return QuickMixSourcePrepFailure(
            ok=False,
            status="processing_failed",
            message="FFmpeg could not prepare the Quick Mix source clip.",
            setup_guidance=result.stderr.strip() or "Verify the uploaded audio format.",
        )

    output_duration, _, _ = probe_wav_metadata(output_path)

    return QuickMixSourcePrepSuccess(
        ok=True,
        output_path=output_path,
        output_file_name=output_file_name,
        source_duration_seconds=source_duration,
        output_duration_seconds=output_duration,
        start_offset_seconds=start_offset_seconds,
        trimmed=trimmed,
        fade_out_applied=apply_fade_out,
    )

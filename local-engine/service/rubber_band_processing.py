"""Rubber Band pitch/time preview processing — short clips only."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from capabilities import get_capability

import config

DEFAULT_MAX_PREVIEW_SECONDS = 30
MAX_PREVIEW_SECONDS_LIMIT = 60
MIN_TEMPO_RATIO = 0.5
MAX_TEMPO_RATIO = 2.0
MIN_PITCH_SEMITONES = -12.0
MAX_PITCH_SEMITONES = 12.0

RUBBERBAND_BINARY_NAMES = ["rubberband", "rubberband-cli", "rubberband.exe", "rubberband-cli.exe"]

PREVIEW_LIMITATIONS = [
    "Preview only — not a final mashup, stem separation, or export.",
    "No vocal/instrumental isolation has occurred.",
    "DJ review required before any publish or distribute decision.",
]


@dataclass
class PreviewInputSummary:
    file_name: str
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    tempo_ratio: float | None
    pitch_shift_semitones: float
    max_preview_seconds: int
    formant_preservation: bool


@dataclass
class PreviewOutputSummary:
    file_name: str
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    artifact_id: str


@dataclass
class PitchTimePreviewSuccess:
    ok: True
    status: str
    message: str
    method: str
    audio_processed: bool
    input_summary: PreviewInputSummary
    output_summary: PreviewOutputSummary
    artifact_path: str
    artifact_url: str
    warnings: list[str]
    limitations: list[str]


@dataclass
class PitchTimePreviewFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


PitchTimePreviewResult = PitchTimePreviewSuccess | PitchTimePreviewFailure


def find_rubberband_binary() -> str | None:
    for name in RUBBERBAND_BINARY_NAMES:
        path = shutil.which(name)
        if path:
            return path
    return None


def resolve_tempo_ratio(
    tempo_ratio: float | None,
    source_bpm: float | None,
    target_bpm: float | None,
) -> tuple[float | None, list[str]]:
    errors: list[str] = []

    if tempo_ratio is not None:
        if tempo_ratio < MIN_TEMPO_RATIO or tempo_ratio > MAX_TEMPO_RATIO:
            errors.append(
                f"tempo_ratio must be between {MIN_TEMPO_RATIO} and {MAX_TEMPO_RATIO}."
            )
        return tempo_ratio, errors

    if source_bpm is not None and target_bpm is not None:
        if source_bpm <= 0 or target_bpm <= 0:
            errors.append("source_bpm and target_bpm must be positive when provided.")
            return None, errors
        ratio = round(target_bpm / source_bpm, 4)
        if ratio < MIN_TEMPO_RATIO or ratio > MAX_TEMPO_RATIO:
            errors.append(
                f"Computed tempo ratio {ratio} is outside the allowed preview range."
            )
        return ratio, errors

    return 1.0, errors


def rubberband_time_stretch_ratio(tempo_ratio: float | None) -> float:
    """Convert planning tempo ratio (target/source) to Rubber Band duration ratio."""
    if tempo_ratio is None or tempo_ratio <= 0:
        return 1.0
    return round(1.0 / tempo_ratio, 4)


def build_rubberband_command(
    binary: str,
    input_path: Path,
    output_path: Path,
    *,
    tempo_ratio: float | None,
    pitch_shift_semitones: float,
    formant_preservation: bool,
) -> list[str]:
    rb_time = rubberband_time_stretch_ratio(tempo_ratio)
    command = [binary, "-t", str(rb_time)]

    if pitch_shift_semitones != 0:
        command.extend(["-p", str(pitch_shift_semitones)])

    if formant_preservation and pitch_shift_semitones != 0:
        command.append("-F")

    command.extend([str(input_path), str(output_path)])
    return command


def build_ffmpeg_trim_command(
    ffmpeg_binary: str,
    input_path: Path,
    output_path: Path,
    max_seconds: int,
) -> list[str]:
    return [
        ffmpeg_binary,
        "-y",
        "-i",
        str(input_path),
        "-t",
        str(max_seconds),
        "-acodec",
        "pcm_s16le",
        str(output_path),
    ]


def validate_preview_request(
    *,
    tempo_ratio: float | None,
    source_bpm: float | None,
    target_bpm: float | None,
    pitch_shift_semitones: float,
    max_preview_seconds: int,
) -> tuple[float | None, list[str]]:
    errors: list[str] = []

    if max_preview_seconds < 1 or max_preview_seconds > MAX_PREVIEW_SECONDS_LIMIT:
        errors.append(f"max_preview_seconds must be between 1 and {MAX_PREVIEW_SECONDS_LIMIT}.")

    if pitch_shift_semitones < MIN_PITCH_SEMITONES or pitch_shift_semitones > MAX_PITCH_SEMITONES:
        errors.append(
            f"pitch_shift_semitones must be between {MIN_PITCH_SEMITONES} and {MAX_PITCH_SEMITONES}."
        )

    resolved_ratio, ratio_errors = resolve_tempo_ratio(tempo_ratio, source_bpm, target_bpm)
    errors.extend(ratio_errors)

    if resolved_ratio is not None:
        if abs(resolved_ratio - 1.0) < 0.001 and pitch_shift_semitones == 0:
            errors.append(
                "At least one actionable tempo or pitch adjustment is required for preview processing."
            )

    return resolved_ratio, errors


def probe_wav_metadata(path: Path) -> tuple[float | None, int | None, int | None]:
    try:
        import wave

        with wave.open(str(path), "rb") as handle:
            frames = handle.getnframes()
            rate = handle.getframerate()
            channels = handle.getnchannels()
            duration = frames / rate if rate else None
            return duration, rate, channels
    except Exception:
        return None, None, None


def process_pitch_time_preview(
    input_path: Path,
    file_name: str,
    *,
    tempo_ratio: float | None = None,
    source_bpm: float | None = None,
    target_bpm: float | None = None,
    pitch_shift_semitones: float = 0.0,
    max_preview_seconds: int = DEFAULT_MAX_PREVIEW_SECONDS,
    formant_preservation: bool = True,
) -> PitchTimePreviewResult:
    resolved_ratio, validation_errors = validate_preview_request(
        tempo_ratio=tempo_ratio,
        source_bpm=source_bpm,
        target_bpm=target_bpm,
        pitch_shift_semitones=pitch_shift_semitones,
        max_preview_seconds=max_preview_seconds,
    )

    if validation_errors:
        return PitchTimePreviewFailure(
            ok=False,
            status="validation_error",
            message="Pitch/time preview request failed validation.",
            validation_errors=validation_errors,
        )

    rubberband = find_rubberband_binary()
    if rubberband is None:
        capability = get_capability("rubberband")
        return PitchTimePreviewFailure(
            ok=False,
            status="missing_dependency",
            message=capability.message if capability else "Rubber Band CLI is not available.",
            setup_guidance=(
                "Install Rubber Band CLI and ensure rubberband or rubberband-cli is on PATH. "
                "MashLab planning still works without it."
            ),
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return PitchTimePreviewFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to trim and normalize preview input.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    artifact_dir = config.WORK_DIR / "artifacts" / "pitch-time-preview"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_id = uuid4().hex
    trim_path = config.TEMP_DIR / f"preview-trim-{artifact_id}.wav"
    output_path = artifact_dir / f"{artifact_id}.wav"
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    warnings: list[str] = []

    try:
        trim_result = subprocess.run(
            build_ffmpeg_trim_command(ffmpeg, input_path, trim_path, max_preview_seconds),
            capture_output=True,
            text=True,
            check=False,
        )
        if trim_result.returncode != 0:
            return PitchTimePreviewFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not prepare the preview input clip.",
                setup_guidance=trim_result.stderr.strip() or "Verify the uploaded audio format.",
            )

        input_duration, input_rate, input_channels = probe_wav_metadata(trim_path)

        command = build_rubberband_command(
            rubberband,
            trim_path,
            output_path,
            tempo_ratio=resolved_ratio,
            pitch_shift_semitones=pitch_shift_semitones,
            formant_preservation=formant_preservation,
        )

        rb_result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if rb_result.returncode != 0:
            return PitchTimePreviewFailure(
                ok=False,
                status="processing_failed",
                message="Rubber Band preview processing failed.",
                setup_guidance=rb_result.stderr.strip() or "Check Rubber Band CLI installation.",
            )

        output_duration, output_rate, output_channels = probe_wav_metadata(output_path)

        if abs(pitch_shift_semitones) > 4:
            warnings.append(
                f"Pitch shift of {pitch_shift_semitones} semitones may cause audible artifacts. DJ review required."
            )

        return PitchTimePreviewSuccess(
            ok=True,
            status="preview_complete",
            message="Pitch/time preview processed locally. Preview only — not a final mashup or export.",
            method="rubberband-cli preview",
            audio_processed=True,
            input_summary=PreviewInputSummary(
                file_name=file_name,
                duration_seconds=input_duration,
                sample_rate=input_rate,
                channel_count=input_channels,
                tempo_ratio=resolved_ratio,
                pitch_shift_semitones=pitch_shift_semitones,
                max_preview_seconds=max_preview_seconds,
                formant_preservation=formant_preservation,
            ),
            output_summary=PreviewOutputSummary(
                file_name=output_path.name,
                duration_seconds=output_duration,
                sample_rate=output_rate,
                channel_count=output_channels,
                artifact_id=artifact_id,
            ),
            artifact_path=str(output_path),
            artifact_url=f"/v1/artifacts/pitch-time-preview/{artifact_id}",
            warnings=warnings,
            limitations=list(PREVIEW_LIMITATIONS),
        )
    finally:
        trim_path.unlink(missing_ok=True)
        if input_path.exists() and input_path.parent == config.TEMP_DIR:
            input_path.unlink(missing_ok=True)

"""Demucs two-stem vocal preview separation — local, user-initiated only."""

from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from capabilities import get_capability, is_demucs_ready
from rubber_band_processing import build_ffmpeg_trim_command, probe_wav_metadata

import config

DEFAULT_MAX_PREVIEW_SECONDS = 60
MAX_PREVIEW_SECONDS_LIMIT = 180
ALLOWED_SPLIT_MODES = {"vocals_no_vocals"}

PREVIEW_LIMITATIONS = [
    "Preview only — not studio-quality stem separation, final mashup, or export.",
    "Demucs two-stem output is heuristic. DJ review required before any publish decision.",
    "One uploaded track at a time. No batch or library processing.",
]


@dataclass
class StemArtifactSummary:
    file_name: str
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    artifact_url: str


@dataclass
class StemPreviewInputSummary:
    file_name: str
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    split_mode: str
    max_preview_seconds: int | None


@dataclass
class StemPreviewSuccess:
    ok: True
    status: str
    message: str
    method: str
    audio_processed: bool
    artifact_id: str
    input_summary: StemPreviewInputSummary
    vocals: StemArtifactSummary
    no_vocals: StemArtifactSummary
    warnings: list[str]
    limitations: list[str]


@dataclass
class StemPreviewFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


StemPreviewResult = StemPreviewSuccess | StemPreviewFailure


def find_demucs_command() -> list[str] | None:
    binary = shutil.which("demucs")
    if binary:
        return [binary]

    try:
        if importlib.util.find_spec("demucs.separate") is not None:
            return [sys.executable, "-m", "demucs.separate"]
    except ModuleNotFoundError:
        return None

    return None


def validate_stem_preview_request(
    *,
    split_mode: str,
    max_preview_seconds: int | None,
) -> list[str]:
    errors: list[str] = []

    if split_mode not in ALLOWED_SPLIT_MODES:
        errors.append(
            f"split_mode must be one of: {', '.join(sorted(ALLOWED_SPLIT_MODES))}."
        )

    if max_preview_seconds is not None:
        if max_preview_seconds < 1 or max_preview_seconds > MAX_PREVIEW_SECONDS_LIMIT:
            errors.append(
                f"max_preview_seconds must be between 1 and {MAX_PREVIEW_SECONDS_LIMIT}."
            )

    return errors


def build_demucs_command(
    demucs_command: list[str],
    input_path: Path,
    output_dir: Path,
) -> list[str]:
    return [
        *demucs_command,
        "--two-stems",
        "vocals",
        "-o",
        str(output_dir),
        str(input_path),
    ]


def locate_two_stem_outputs(output_dir: Path, input_stem: str) -> tuple[Path | None, Path | None]:
    candidates = list(output_dir.rglob("vocals.wav"))
    if not candidates:
        return None, None

    for vocals_path in candidates:
        parent = vocals_path.parent
        if parent.name != input_stem and input_stem not in str(parent):
            continue
        no_vocals_path = parent / "no_vocals.wav"
        if no_vocals_path.exists():
            return vocals_path, no_vocals_path

    vocals_path = candidates[0]
    no_vocals_path = vocals_path.parent / "no_vocals.wav"
    if no_vocals_path.exists():
        return vocals_path, no_vocals_path

    return vocals_path, None


def process_stem_preview(
    input_path: Path,
    file_name: str,
    *,
    split_mode: str = "vocals_no_vocals",
    max_preview_seconds: int | None = DEFAULT_MAX_PREVIEW_SECONDS,
) -> StemPreviewResult:
    validation_errors = validate_stem_preview_request(
        split_mode=split_mode,
        max_preview_seconds=max_preview_seconds,
    )
    if validation_errors:
        return StemPreviewFailure(
            ok=False,
            status="validation_error",
            message="Stem preview request failed validation.",
            validation_errors=validation_errors,
        )

    if not is_demucs_ready():
        capability = get_capability("demucs")
        return StemPreviewFailure(
            ok=False,
            status="missing_dependency",
            message=capability.message if capability else "Demucs is not available.",
            setup_guidance=(
                "Install Demucs and PyTorch in the local sidecar environment. "
                "First run may download model weights to the local cache. "
                "See docs/STEM_SEPARATION.md."
            ),
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return StemPreviewFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to prepare preview input.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    demucs_command = find_demucs_command()
    if demucs_command is None:
        return StemPreviewFailure(
            ok=False,
            status="missing_dependency",
            message="Demucs CLI/module was not found.",
            setup_guidance="pip install demucs torch in the sidecar venv.",
        )

    artifact_id = uuid4().hex
    artifact_dir = config.WORK_DIR / "artifacts" / "stems" / artifact_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    trim_path = config.TEMP_DIR / f"stem-trim-{artifact_id}.wav"
    demucs_output_dir = config.TEMP_DIR / f"stem-demucs-{artifact_id}"
    demucs_input_path = input_path
    warnings: list[str] = [
        "Demucs preview output is not studio-quality. Use for arrangement testing only.",
    ]

    try:
        if max_preview_seconds is not None:
            trim_result = subprocess.run(
                build_ffmpeg_trim_command(ffmpeg, input_path, trim_path, max_preview_seconds),
                capture_output=True,
                text=True,
                check=False,
            )
            if trim_result.returncode != 0:
                return StemPreviewFailure(
                    ok=False,
                    status="processing_failed",
                    message="FFmpeg could not prepare the stem preview input clip.",
                    setup_guidance=trim_result.stderr.strip() or "Verify the uploaded audio format.",
                )
            demucs_input_path = trim_path

        if demucs_input_path.suffix.lower() == ".wav":
            input_duration, input_rate, input_channels = probe_wav_metadata(demucs_input_path)
        else:
            input_duration, input_rate, input_channels = None, None, None

        demucs_output_dir.mkdir(parents=True, exist_ok=True)
        command = build_demucs_command(demucs_command, demucs_input_path, demucs_output_dir)
        demucs_result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
        if demucs_result.returncode != 0:
            return StemPreviewFailure(
                ok=False,
                status="processing_failed",
                message="Demucs stem preview separation failed.",
                setup_guidance=(
                    demucs_result.stderr.strip()
                    or demucs_result.stdout.strip()
                    or "Check Demucs installation and model cache."
                ),
            )

        input_stem = demucs_input_path.stem
        vocals_src, no_vocals_src = locate_two_stem_outputs(demucs_output_dir, input_stem)
        if vocals_src is None or no_vocals_src is None:
            return StemPreviewFailure(
                ok=False,
                status="processing_failed",
                message="Demucs completed but expected vocals/no_vocals stems were not found.",
                setup_guidance="Verify Demucs two-stems vocals mode output layout.",
            )

        vocals_dest = artifact_dir / "vocals.wav"
        no_vocals_dest = artifact_dir / "no_vocals.wav"
        shutil.copy2(vocals_src, vocals_dest)
        shutil.copy2(no_vocals_src, no_vocals_dest)

        vocals_duration, vocals_rate, vocals_channels = probe_wav_metadata(vocals_dest)
        no_vocals_duration, no_vocals_rate, no_vocals_channels = probe_wav_metadata(no_vocals_dest)

        return StemPreviewSuccess(
            ok=True,
            status="preview_complete",
            message="Vocal/instrumental stem preview processed locally. Preview only — not final export.",
            method="demucs-two-stems-vocals",
            audio_processed=True,
            artifact_id=artifact_id,
            input_summary=StemPreviewInputSummary(
                file_name=file_name,
                duration_seconds=input_duration,
                sample_rate=input_rate,
                channel_count=input_channels,
                split_mode=split_mode,
                max_preview_seconds=max_preview_seconds,
            ),
            vocals=StemArtifactSummary(
                file_name=vocals_dest.name,
                duration_seconds=vocals_duration,
                sample_rate=vocals_rate,
                channel_count=vocals_channels,
                artifact_url=f"/v1/artifacts/stems/{artifact_id}/vocals",
            ),
            no_vocals=StemArtifactSummary(
                file_name=no_vocals_dest.name,
                duration_seconds=no_vocals_duration,
                sample_rate=no_vocals_rate,
                channel_count=no_vocals_channels,
                artifact_url=f"/v1/artifacts/stems/{artifact_id}/no_vocals",
            ),
            warnings=warnings,
            limitations=list(PREVIEW_LIMITATIONS),
        )
    finally:
        trim_path.unlink(missing_ok=True)
        if demucs_output_dir.exists():
            shutil.rmtree(demucs_output_dir, ignore_errors=True)
        if input_path.exists() and input_path.parent == config.TEMP_DIR:
            input_path.unlink(missing_ok=True)

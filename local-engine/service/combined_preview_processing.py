"""Combined vocal-over-instrumental preview — Rubber Band + FFmpeg mix."""

from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from capabilities import get_capability
from rubber_band_processing import (
    build_ffmpeg_trim_command,
    build_rubberband_command,
    find_rubberband_binary,
    probe_wav_metadata,
    resolve_tempo_ratio,
    rubberband_time_stretch_ratio,
)

import config

DEFAULT_MAX_PREVIEW_SECONDS = 30
MAX_PREVIEW_SECONDS_LIMIT = 60
ALLOWED_MASH_INTENTS = {"vocal_a_over_beat_b", "vocal_b_over_beat_a"}

PREVIEW_LIMITATIONS = [
    "Preview only — not a final export, mastered mashup, or distribution-ready mix.",
    "No mastering, no final arrangement, no distribution rights granted.",
    "DJ review required before any publish or distribute decision.",
]


@dataclass
class CombinedPreviewInputSummary:
    mash_intent: str
    source_vocal_artifact_id: str
    target_instrumental_artifact_id: str
    tempo_ratio: float | None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    max_preview_seconds: int
    neutral_processing: bool


@dataclass
class CombinedPreviewProcessingSummary:
    method: str
    vocal_rubberband_ratio: float | None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    max_preview_seconds: int


@dataclass
class CombinedPreviewSuccess:
    ok: True
    status: str
    message: str
    method: str
    audio_processed: bool
    final_export: bool
    artifact_id: str
    artifact_path: str
    artifact_url: str
    input_summary: CombinedPreviewInputSummary
    processing_summary: CombinedPreviewProcessingSummary
    output_duration_seconds: float | None
    warnings: list[str]
    limitations: list[str]


@dataclass
class CombinedPreviewFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


CombinedPreviewResult = CombinedPreviewSuccess | CombinedPreviewFailure


def stem_vocals_path(artifact_id: str) -> Path:
    return config.WORK_DIR / "artifacts" / "stems" / artifact_id / "vocals.wav"


def stem_no_vocals_path(artifact_id: str) -> Path:
    return config.WORK_DIR / "artifacts" / "stems" / artifact_id / "no_vocals.wav"


def is_valid_artifact_id(artifact_id: str) -> bool:
    return bool(artifact_id) and artifact_id.isalnum()


def validate_combined_preview_request(
    *,
    mash_intent: str,
    source_vocal_artifact_id: str,
    target_instrumental_artifact_id: str,
    tempo_ratio: float | None,
    source_bpm: float | None,
    target_bpm: float | None,
    pitch_shift_semitones: float,
    alignment_offset_ms: float,
    max_preview_seconds: int,
    neutral_processing: bool,
) -> tuple[float | None, list[str]]:
    errors: list[str] = []

    if mash_intent not in ALLOWED_MASH_INTENTS:
        errors.append(
            f"mash_intent must be one of: {', '.join(sorted(ALLOWED_MASH_INTENTS))}."
        )

    if not is_valid_artifact_id(source_vocal_artifact_id):
        errors.append("source_vocal_artifact_id must be a valid artifact id.")

    if not is_valid_artifact_id(target_instrumental_artifact_id):
        errors.append("target_instrumental_artifact_id must be a valid artifact id.")

    if max_preview_seconds < 1 or max_preview_seconds > MAX_PREVIEW_SECONDS_LIMIT:
        errors.append(
            f"max_preview_seconds must be between 1 and {MAX_PREVIEW_SECONDS_LIMIT}."
        )

    if pitch_shift_semitones < -12 or pitch_shift_semitones > 12:
        errors.append("pitch_shift_semitones must be between -12 and 12.")

    resolved_ratio: float | None
    if neutral_processing:
        resolved_ratio = 1.0
    else:
        resolved_ratio, ratio_errors = resolve_tempo_ratio(tempo_ratio, source_bpm, target_bpm)
        errors.extend(ratio_errors)

        if resolved_ratio is not None:
            tempo_action = abs(resolved_ratio - 1.0) >= 0.005
            pitch_action = abs(pitch_shift_semitones) >= 0.001
            if not tempo_action and not pitch_action:
                if source_bpm is None or target_bpm is None:
                    errors.append(
                        "Pitch/time values are unknown. Set neutral_processing=true or supply BPM overrides."
                    )

    return resolved_ratio, errors


def build_ffmpeg_mix_command(
    ffmpeg_binary: str,
    bed_path: Path,
    vocal_path: Path,
    output_path: Path,
    *,
    alignment_offset_ms: float,
    max_seconds: int,
) -> list[str]:
    vocal_delay = max(0, int(round(alignment_offset_ms)))
    bed_delay = max(0, int(round(-alignment_offset_ms)))

    bed_chain = f"[0:a]atrim=0:{max_seconds},asetpts=PTS-STARTPTS"
    if bed_delay > 0:
        bed_chain += f",adelay={bed_delay}|{bed_delay}"
    bed_chain += "[bed]"

    vocal_chain = f"[1:a]atrim=0:{max_seconds},asetpts=PTS-STARTPTS"
    if vocal_delay > 0:
        vocal_chain += f",adelay={vocal_delay}|{vocal_delay}"
    vocal_chain += "[voc]"

    filter_complex = f"{bed_chain};{vocal_chain};[bed][voc]amix=inputs=2:duration=shortest:normalize=0[out]"

    return [
        ffmpeg_binary,
        "-y",
        "-i",
        str(bed_path),
        "-i",
        str(vocal_path),
        "-filter_complex",
        filter_complex,
        "-map",
        "[out]",
        "-acodec",
        "pcm_s16le",
        str(output_path),
    ]


def process_combined_preview(
    *,
    mash_intent: str,
    source_vocal_artifact_id: str,
    target_instrumental_artifact_id: str,
    tempo_ratio: float | None = None,
    source_bpm: float | None = None,
    target_bpm: float | None = None,
    pitch_shift_semitones: float = 0.0,
    alignment_offset_ms: float = 0.0,
    max_preview_seconds: int = DEFAULT_MAX_PREVIEW_SECONDS,
    formant_preservation: bool = True,
    neutral_processing: bool = False,
) -> CombinedPreviewResult:
    resolved_ratio, validation_errors = validate_combined_preview_request(
        mash_intent=mash_intent,
        source_vocal_artifact_id=source_vocal_artifact_id,
        target_instrumental_artifact_id=target_instrumental_artifact_id,
        tempo_ratio=tempo_ratio,
        source_bpm=source_bpm,
        target_bpm=target_bpm,
        pitch_shift_semitones=pitch_shift_semitones,
        alignment_offset_ms=alignment_offset_ms,
        max_preview_seconds=max_preview_seconds,
        neutral_processing=neutral_processing,
    )

    if validation_errors:
        return CombinedPreviewFailure(
            ok=False,
            status="validation_error",
            message="Combined preview request failed validation.",
            validation_errors=validation_errors,
        )

    vocal_path = stem_vocals_path(source_vocal_artifact_id)
    bed_path = stem_no_vocals_path(target_instrumental_artifact_id)

    missing: list[str] = []
    if not vocal_path.exists():
        missing.append(f"vocals stem for artifact {source_vocal_artifact_id}")
    if not bed_path.exists():
        missing.append(f"no_vocals stem for artifact {target_instrumental_artifact_id}")

    if missing:
        return CombinedPreviewFailure(
            ok=False,
            status="missing_artifact",
            message="Create stem previews for both tracks first.",
            setup_guidance=f"Missing: {', '.join(missing)}.",
        )

    rubberband = find_rubberband_binary()
    if rubberband is None:
        capability = get_capability("rubberband")
        return CombinedPreviewFailure(
            ok=False,
            status="missing_dependency",
            message=capability.message if capability else "Rubber Band CLI is not available.",
            setup_guidance=(
                "Install Rubber Band CLI for vocal pitch/time adjustment in combined preview."
            ),
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return CombinedPreviewFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to trim and mix combined preview stems.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    effective_pitch = 0.0 if neutral_processing else pitch_shift_semitones
    effective_ratio = 1.0 if neutral_processing else resolved_ratio

    artifact_id = uuid4().hex
    artifact_dir = config.WORK_DIR / "artifacts" / "combined-preview" / artifact_id
    artifact_dir.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    vocal_trim = config.TEMP_DIR / f"combined-vocal-trim-{artifact_id}.wav"
    vocal_processed = config.TEMP_DIR / f"combined-vocal-rb-{artifact_id}.wav"
    bed_trim = config.TEMP_DIR / f"combined-bed-trim-{artifact_id}.wav"
    output_path = artifact_dir / "preview.wav"

    warnings: list[str] = []
    if abs(effective_pitch) > 4:
        warnings.append(
            f"Pitch shift of {effective_pitch} semitones may cause audible artifacts in the vocal preview."
        )

    try:
        vocal_trim_result = subprocess.run(
            build_ffmpeg_trim_command(ffmpeg, vocal_path, vocal_trim, max_preview_seconds),
            capture_output=True,
            text=True,
            check=False,
        )
        if vocal_trim_result.returncode != 0:
            return CombinedPreviewFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not trim the source vocal stem.",
                setup_guidance=vocal_trim_result.stderr.strip() or None,
            )

        rb_command = build_rubberband_command(
            rubberband,
            vocal_trim,
            vocal_processed,
            tempo_ratio=effective_ratio,
            pitch_shift_semitones=effective_pitch,
            formant_preservation=formant_preservation,
        )
        rb_result = subprocess.run(
            rb_command,
            capture_output=True,
            text=True,
            check=False,
        )
        if rb_result.returncode != 0:
            return CombinedPreviewFailure(
                ok=False,
                status="processing_failed",
                message="Rubber Band vocal adjustment failed for combined preview.",
                setup_guidance=rb_result.stderr.strip() or None,
            )

        bed_trim_result = subprocess.run(
            build_ffmpeg_trim_command(ffmpeg, bed_path, bed_trim, max_preview_seconds),
            capture_output=True,
            text=True,
            check=False,
        )
        if bed_trim_result.returncode != 0:
            return CombinedPreviewFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not trim the target instrumental stem.",
                setup_guidance=bed_trim_result.stderr.strip() or None,
            )

        mix_result = subprocess.run(
            build_ffmpeg_mix_command(
                ffmpeg,
                bed_trim,
                vocal_processed,
                output_path,
                alignment_offset_ms=alignment_offset_ms,
                max_seconds=max_preview_seconds,
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        if mix_result.returncode != 0:
            return CombinedPreviewFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not mix the combined preview.",
                setup_guidance=mix_result.stderr.strip() or None,
            )

        output_duration, _, _ = probe_wav_metadata(output_path)

        return CombinedPreviewSuccess(
            ok=True,
            status="preview_complete",
            message="Combined vocal-over-instrumental preview processed locally. Preview only — not a final export.",
            method="rubberband-vocal + ffmpeg-mix",
            audio_processed=True,
            final_export=False,
            artifact_id=artifact_id,
            artifact_path=str(output_path),
            artifact_url=f"/v1/artifacts/combined-preview/{artifact_id}/preview",
            input_summary=CombinedPreviewInputSummary(
                mash_intent=mash_intent,
                source_vocal_artifact_id=source_vocal_artifact_id,
                target_instrumental_artifact_id=target_instrumental_artifact_id,
                tempo_ratio=effective_ratio,
                pitch_shift_semitones=effective_pitch,
                alignment_offset_ms=alignment_offset_ms,
                max_preview_seconds=max_preview_seconds,
                neutral_processing=neutral_processing,
            ),
            processing_summary=CombinedPreviewProcessingSummary(
                method="rubberband-vocal + ffmpeg-mix",
                vocal_rubberband_ratio=effective_ratio,
                pitch_shift_semitones=effective_pitch,
                alignment_offset_ms=alignment_offset_ms,
                max_preview_seconds=max_preview_seconds,
            ),
            output_duration_seconds=output_duration,
            warnings=warnings,
            limitations=list(PREVIEW_LIMITATIONS),
        )
    finally:
        for temp_path in (vocal_trim, vocal_processed, bed_trim):
            temp_path.unlink(missing_ok=True)

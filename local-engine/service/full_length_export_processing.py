"""Full-length WAV export — re-render from stem artifacts without preview trim."""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from capabilities import get_capability
from combined_preview_processing import (
    build_ffmpeg_full_mix_command,
    stem_no_vocals_path,
    stem_vocals_path,
    validate_combined_preview_request,
)
from mix_settings import (
    MixSettings,
    build_loudness_clipping_warnings,
    build_mix_processing_notes,
    build_peak_ceiling_ffmpeg_command,
    default_mix_settings,
    mix_settings_to_dict,
    validate_mix_settings,
)
from export_processing import EXPORTS_DIR, EXPORT_FILE_NAME, META_FILE_NAME, RIGHTS_NOTICE, read_export_meta
from arrangement_context import (
    FULL_LENGTH_CONTEXT_NOTICE,
    merge_arrangement_context_into_meta,
    validate_arrangement_context,
)
from loudness_gate import evaluate_loudness_gate
from rubber_band_processing import (
    build_rubberband_command,
    find_rubberband_binary,
    probe_wav_metadata,
)
from artifact_management import analyze_technical_readout, _resolve_under

import config

FULL_EXPORT_SUBTYPE = "full-wav"
MAX_TEST_SECONDS_LIMIT = 120

LOUDNESS_MODES = frozenset(
    {"measurement_only", "normalize_preview", "normalize_preview_copy", "normalize_export"}
)
NORMALIZE_MODES = frozenset({"normalize_preview", "normalize_preview_copy", "normalize_export"})


@dataclass
class FullExportProcessingSummary:
    method: str
    vocal_rubberband_ratio: float | None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    full_length: bool
    max_test_seconds: int | None
    mix_settings: MixSettings
    limiter_safety_applied: bool
    clipping_guard_applied: bool
    instrumental_duck_applied: bool


@dataclass
class FullExportInputSummary:
    mash_intent: str
    source_vocal_stem_artifact_id: str
    target_instrumental_stem_artifact_id: str
    tempo_ratio: float | None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    neutral_processing: bool
    mix_settings: MixSettings


@dataclass
class LoudnessGateResult:
    status: str
    message: str
    integrated_lufs: float | None
    true_peak_dbtp: float | None
    target_integrated_lufs: float
    target_true_peak_dbtp: float


@dataclass
class FullWavExportSuccess:
    ok: True
    status: str
    message: str
    export_artifact_id: str
    artifact_url: str
    download_url: str
    input_summary: FullExportInputSummary
    processing_summary: FullExportProcessingSummary
    file_size_bytes: int | None
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    codec: str | None
    loudness: object
    loudness_gate: LoudnessGateResult
    final_export: bool
    public_share: bool
    rights_notice: str
    warnings: list[str]
    limitations: list[str]
    export_label: str | None


@dataclass
class FullWavExportFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


FullWavExportResult = FullWavExportSuccess | FullWavExportFailure


def create_full_wav_export(
    *,
    source_vocal_stem_artifact_id: str,
    target_instrumental_stem_artifact_id: str,
    mash_intent: str,
    tempo_ratio: float | None = None,
    source_bpm: float | None = None,
    target_bpm: float | None = None,
    pitch_shift_semitones: float = 0.0,
    alignment_offset_ms: float = 0.0,
    export_label: str | None = None,
    loudness_target_mode: str = "measurement_only",
    neutral_processing: bool = False,
    confirm_neutral_settings: bool = False,
    max_test_seconds: int | None = None,
    vocal_gain_db: float = 0.0,
    instrumental_gain_db: float = 0.0,
    master_gain_db: float = 0.0,
    vocal_fade_in_ms: float = 0.0,
    vocal_fade_out_ms: float = 0.0,
    instrumental_fade_in_ms: float = 0.0,
    instrumental_fade_out_ms: float = 0.0,
    limiter_safety: bool = False,
    clipping_guard: bool = False,
    instrumental_duck_under_vocal: bool = False,
    arrangement_context: dict | None = None,
) -> FullWavExportResult:
    errors: list[str] = []

    mix_settings, mix_errors = validate_mix_settings(
        vocal_gain_db=vocal_gain_db,
        instrumental_gain_db=instrumental_gain_db,
        master_gain_db=master_gain_db,
        vocal_fade_in_ms=vocal_fade_in_ms,
        vocal_fade_out_ms=vocal_fade_out_ms,
        instrumental_fade_in_ms=instrumental_fade_in_ms,
        instrumental_fade_out_ms=instrumental_fade_out_ms,
        limiter_safety=limiter_safety,
        clipping_guard=clipping_guard,
        instrumental_duck_under_vocal=instrumental_duck_under_vocal,
    )
    if mix_errors:
        errors.extend(mix_errors)

    if loudness_target_mode not in LOUDNESS_MODES:
        errors.append(
            "loudness_target_mode must be measurement_only, normalize_preview_copy, or normalize_export."
        )

    if export_label is not None and len(export_label.strip()) > 120:
        errors.append("export_label must be 120 characters or fewer.")

    if max_test_seconds is not None:
        if max_test_seconds < 1 or max_test_seconds > MAX_TEST_SECONDS_LIMIT:
            errors.append(
                f"max_test_seconds must be between 1 and {MAX_TEST_SECONDS_LIMIT} when provided."
            )

    if not neutral_processing and not confirm_neutral_settings:
        has_plan = _has_actionable_plan(
            tempo_ratio=tempo_ratio,
            source_bpm=source_bpm,
            target_bpm=target_bpm,
            pitch_shift_semitones=pitch_shift_semitones,
        )
        if not has_plan:
            errors.append(
                "Pitch/time plan data is missing. Enable neutral_processing or set confirm_neutral_settings=true."
            )

    if errors:
        return FullWavExportFailure(
            ok=False,
            status="validation_error",
            message="Full-length export request failed validation.",
            validation_errors=errors,
        )

    if mix_settings is None:
        mix_settings = default_mix_settings()

    resolved_ratio, validation_errors = validate_combined_preview_request(
        mash_intent=mash_intent,
        source_vocal_artifact_id=source_vocal_stem_artifact_id,
        target_instrumental_artifact_id=target_instrumental_stem_artifact_id,
        tempo_ratio=tempo_ratio,
        source_bpm=source_bpm,
        target_bpm=target_bpm,
        pitch_shift_semitones=pitch_shift_semitones,
        alignment_offset_ms=alignment_offset_ms,
        max_preview_seconds=60,
        neutral_processing=neutral_processing,
    )

    if validation_errors:
        return FullWavExportFailure(
            ok=False,
            status="validation_error",
            message="Full-length export request failed validation.",
            validation_errors=validation_errors,
        )

    vocal_path = stem_vocals_path(source_vocal_stem_artifact_id)
    bed_path = stem_no_vocals_path(target_instrumental_stem_artifact_id)

    missing: list[str] = []
    if not vocal_path.exists():
        missing.append(f"vocals stem for artifact {source_vocal_stem_artifact_id}")
    if not bed_path.exists():
        missing.append(f"no_vocals stem for artifact {target_instrumental_stem_artifact_id}")

    if missing:
        return FullWavExportFailure(
            ok=False,
            status="missing_artifact",
            message="Stem preview artifacts not found for full-length export.",
            setup_guidance=f"Missing: {', '.join(missing)}.",
        )

    rubberband = find_rubberband_binary()
    if rubberband is None:
        capability = get_capability("rubberband")
        return FullWavExportFailure(
            ok=False,
            status="missing_dependency",
            message=capability.message if capability else "Rubber Band CLI is not available.",
            setup_guidance="Install Rubber Band CLI for vocal pitch/time adjustment.",
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return FullWavExportFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to align and mix full-length export stems.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    effective_pitch = 0.0 if neutral_processing else pitch_shift_semitones
    effective_ratio = 1.0 if neutral_processing else resolved_ratio

    export_id = uuid.uuid4().hex
    export_dir = _resolve_under(EXPORTS_DIR, export_id)
    if export_dir is None:
        return FullWavExportFailure(
            ok=False,
            status="processing_failed",
            message="Could not resolve export artifact directory.",
        )

    export_dir.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    vocal_processed = config.TEMP_DIR / f"full-export-vocal-rb-{export_id}.wav"
    mixed_path = config.TEMP_DIR / f"full-export-mix-{export_id}.wav"
    export_path = export_dir / EXPORT_FILE_NAME

    warnings: list[str] = [
        "Full-length local WAV export — user-generated, not a published release.",
        "Processing may take longer than preview lanes; no auto-export occurred.",
        "Not a club-ready mastered release unless a future mastering lane is implemented.",
    ]
    limitations: list[str] = [
        "No MP3, stem package export, public sharing, or distribution rights granted.",
        "Loudness gate is informational only — not a mastering pass.",
    ]

    if max_test_seconds is not None:
        warnings.append(
            f"max_test_seconds={max_test_seconds} applied — testing override, not default production behavior."
        )

    if abs(effective_pitch) > 4:
        warnings.append(
            f"Pitch shift of {effective_pitch} semitones may cause audible artifacts in the vocal export."
        )

    bed_duration, _, _ = probe_wav_metadata(bed_path)

    try:
        rb_command = build_rubberband_command(
            rubberband,
            vocal_path,
            vocal_processed,
            tempo_ratio=effective_ratio,
            pitch_shift_semitones=effective_pitch,
            formant_preservation=True,
        )
        rb_result = subprocess.run(
            rb_command,
            capture_output=True,
            text=True,
            check=False,
        )
        if rb_result.returncode != 0:
            return FullWavExportFailure(
                ok=False,
                status="processing_failed",
                message="Rubber Band vocal adjustment failed for full-length export.",
                setup_guidance=rb_result.stderr.strip() or None,
            )

        mix_command = build_ffmpeg_full_mix_command(
            ffmpeg,
            bed_path,
            vocal_processed,
            mixed_path,
            alignment_offset_ms=alignment_offset_ms,
            max_seconds=max_test_seconds,
            mix_settings=mix_settings,
            duration_sec=bed_duration,
        )
        mix_result = subprocess.run(
            mix_command,
            capture_output=True,
            text=True,
            check=False,
        )
        if mix_result.returncode != 0:
            return FullWavExportFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not mix the full-length export.",
                setup_guidance=mix_result.stderr.strip() or None,
            )

        if loudness_target_mode in NORMALIZE_MODES:
            warnings.append(
                "Normalize export applies FFmpeg loudnorm — prototype normalization, not full mastering."
            )
            normalize_ok, normalize_message = _normalize_export_wav(ffmpeg, mixed_path, export_path)
            if not normalize_ok:
                return FullWavExportFailure(
                    ok=False,
                    status="processing_failed",
                    message=normalize_message,
                )
        else:
            shutil.copy2(mixed_path, export_path)
            limitations.append(
                "Loudness measured only; no normalization unless a normalize mode is selected."
            )

        if mix_settings.clipping_guard:
            peak_safe_path = config.TEMP_DIR / f"full-export-peak-safe-{export_id}.wav"
            ceiling_command = build_peak_ceiling_ffmpeg_command(
                ffmpeg, export_path, peak_safe_path
            )
            ceiling_result = subprocess.run(
                ceiling_command,
                capture_output=True,
                text=True,
                check=False,
            )
            if ceiling_result.returncode != 0:
                return FullWavExportFailure(
                    ok=False,
                    status="processing_failed",
                    message="Export peak-ceiling safety pass failed.",
                    setup_guidance=ceiling_result.stderr.strip() or None,
                )
            shutil.copy2(peak_safe_path, export_path)
            peak_safe_path.unlink(missing_ok=True)

        warnings.extend(build_mix_processing_notes(mix_settings))

        meta = {
            "export_subtype": FULL_EXPORT_SUBTYPE,
            "source_vocal_stem_artifact_id": source_vocal_stem_artifact_id,
            "target_instrumental_stem_artifact_id": target_instrumental_stem_artifact_id,
            "mash_intent": mash_intent,
            "tempo_ratio": effective_ratio,
            "pitch_shift_semitones": effective_pitch,
            "alignment_offset_ms": alignment_offset_ms,
            "neutral_processing": neutral_processing,
            "export_label": export_label.strip() if export_label else None,
            "loudness_target_mode": loudness_target_mode,
            "max_test_seconds": max_test_seconds,
            "export_format": "wav",
            "mix_settings": mix_settings_to_dict(mix_settings),
            "limiter_safety_applied": mix_settings.limiter_safety,
            "clipping_guard_applied": mix_settings.clipping_guard,
            "created_at": datetime.now(tz=UTC).isoformat(),
            "public_share": False,
            "final_export": True,
        }
        validated_context, context_errors = validate_arrangement_context(arrangement_context)
        if context_errors:
            return FullWavExportFailure(
                ok=False,
                status="validation_error",
                message="Full-length export arrangement context failed validation.",
                validation_errors=context_errors,
            )
        if validated_context is not None:
            full_context = dict(validated_context)
            full_context["export_context_mode"] = "full_length_context_only"
            merge_arrangement_context_into_meta(meta, full_context)
            limitations.append(FULL_LENGTH_CONTEXT_NOTICE)
        (export_dir / META_FILE_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")

        technical = analyze_technical_readout(export_path)
        warnings.extend(build_loudness_clipping_warnings(technical.loudness))
        gate = evaluate_loudness_gate(technical.loudness)
        duration, _, _ = probe_wav_metadata(export_path)
        artifact_url = f"/v1/artifacts/exports/{export_id}/export"

        return FullWavExportSuccess(
            ok=True,
            status="ready",
            message="Full-length local WAV export rendered from stem artifacts.",
            export_artifact_id=export_id,
            artifact_url=artifact_url,
            download_url=artifact_url,
            input_summary=FullExportInputSummary(
                mash_intent=mash_intent,
                source_vocal_stem_artifact_id=source_vocal_stem_artifact_id,
                target_instrumental_stem_artifact_id=target_instrumental_stem_artifact_id,
                tempo_ratio=effective_ratio,
                pitch_shift_semitones=effective_pitch,
                alignment_offset_ms=alignment_offset_ms,
                neutral_processing=neutral_processing,
                mix_settings=mix_settings,
            ),
            processing_summary=FullExportProcessingSummary(
                method="rubberband-vocal + ffmpeg-full-mix",
                vocal_rubberband_ratio=effective_ratio,
                pitch_shift_semitones=effective_pitch,
                alignment_offset_ms=alignment_offset_ms,
                full_length=max_test_seconds is None,
                max_test_seconds=max_test_seconds,
                mix_settings=mix_settings,
                limiter_safety_applied=mix_settings.limiter_safety,
                clipping_guard_applied=mix_settings.clipping_guard,
                instrumental_duck_applied=mix_settings.instrumental_duck_under_vocal,
            ),
            file_size_bytes=technical.file_size_bytes,
            duration_seconds=duration or technical.duration_seconds,
            sample_rate=technical.sample_rate,
            channel_count=technical.channel_count,
            codec=technical.codec,
            loudness=technical.loudness,
            loudness_gate=gate,
            final_export=True,
            public_share=False,
            rights_notice=RIGHTS_NOTICE,
            warnings=warnings,
            limitations=limitations,
            export_label=export_label.strip() if export_label else None,
        )
    finally:
        for temp_path in (vocal_processed, mixed_path):
            temp_path.unlink(missing_ok=True)


def _has_actionable_plan(
    *,
    tempo_ratio: float | None,
    source_bpm: float | None,
    target_bpm: float | None,
    pitch_shift_semitones: float,
) -> bool:
    tempo_action = tempo_ratio is not None and abs(tempo_ratio - 1.0) >= 0.005
    pitch_action = abs(pitch_shift_semitones) >= 0.001
    bpm_available = source_bpm is not None and target_bpm is not None
    return tempo_action or pitch_action or bpm_available


def _normalize_export_wav(ffmpeg: str, source: Path, destination: Path) -> tuple[bool, str]:
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
            timeout=600,
        )
    except (subprocess.SubprocessError, OSError) as error:
        return False, f"FFmpeg normalize export failed: {error}"

    if result.returncode != 0 or not destination.is_file():
        return False, "FFmpeg loudnorm normalize export did not produce output."

    return True, "Normalized export written with FFmpeg loudnorm (prototype only)."

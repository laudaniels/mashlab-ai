"""Section-window WAV export — advisory planning window from stem artifacts."""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from capabilities import get_capability
from combined_preview_processing import (
    build_ffmpeg_mix_command,
    stem_no_vocals_path,
    stem_vocals_path,
    validate_combined_preview_request,
)
from mix_settings import (
    MixSettings,
    build_loudness_clipping_warnings,
    build_mix_processing_notes,
    default_mix_settings,
    mix_settings_to_dict,
    validate_mix_settings,
)
from export_processing import EXPORTS_DIR, META_FILE_NAME, RIGHTS_NOTICE
from full_length_export_processing import _normalize_export_wav
from arrangement_context import (
    SECTION_EXPORT_NOTICE,
    merge_arrangement_context_into_meta,
    validate_arrangement_context,
)
from artifact_management import analyze_technical_readout, is_valid_artifact_id, _resolve_under
from rubber_band_processing import (
    build_ffmpeg_trim_command,
    build_rubberband_command,
    find_rubberband_binary,
    probe_wav_metadata,
)

import config

SECTION_EXPORT_SUBTYPE = "section-wav"
SECTION_EXPORT_FILE_NAME = "section-export.wav"

LOUDNESS_MODES = frozenset({"measurement_only", "normalize_section"})
NORMALIZE_MODES = frozenset({"normalize_section"})

ALLOWED_BINDING_FRESHNESS = frozenset(
    {"current", "partially_stale", "stale", "unavailable"}
)
ALLOWED_SETTINGS_MODES = frozenset({"bound", "current"})


@dataclass
class SectionExportProcessingSummary:
    method: str
    section_trimmed: bool
    start_seconds_used: float
    duration_seconds_used: float
    pitch_shift_semitones: float
    alignment_offset_ms: float
    mix_settings: MixSettings
    limiter_safety_applied: bool
    clipping_guard_applied: bool
    instrumental_duck_applied: bool


@dataclass
class SectionExportInputSummary:
    mash_intent: str
    source_vocal_stem_artifact_id: str
    target_instrumental_stem_artifact_id: str
    start_seconds: float
    duration_seconds: float
    start_seconds_unavailable: bool
    tempo_ratio: float | None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    mix_settings: MixSettings
    binding_freshness_status: str
    settings_mode: str


@dataclass
class SectionWavExportSuccess:
    ok: True
    status: str
    message: str
    export_artifact_id: str
    artifact_url: str
    download_url: str
    input_summary: SectionExportInputSummary
    processing_summary: SectionExportProcessingSummary
    file_size_bytes: int | None
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    codec: str | None
    loudness: object
    final_export: bool
    public_share: bool
    section_trimmed_export: bool
    rights_notice: str
    warnings: list[str]
    limitations: list[str]
    export_label: str | None


@dataclass
class SectionWavExportFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


SectionWavExportResult = SectionWavExportSuccess | SectionWavExportFailure


def validate_section_export_request(
    *,
    source_vocal_stem_artifact_id: str,
    target_instrumental_stem_artifact_id: str,
    mash_intent: str,
    tempo_ratio: float | None = None,
    source_bpm: float | None = None,
    target_bpm: float | None = None,
    pitch_shift_semitones: float = 0.0,
    alignment_offset_ms: float = 0.0,
    start_seconds: float | None = None,
    duration_seconds: float | None = None,
    start_seconds_unavailable: bool = False,
    confirm_advisory_section_export: bool = False,
    confirm_start_from_artifact_beginning: bool = False,
    confirm_stale_context: bool = False,
    binding_freshness_status: str = "unavailable",
    settings_mode: str = "bound",
    loudness_target_mode: str = "measurement_only",
    export_label: str | None = None,
    neutral_processing: bool = False,
    confirm_neutral_settings: bool = False,
    arrangement_context: dict | None = None,
) -> list[str]:
    errors: list[str] = []

    if not is_valid_artifact_id(source_vocal_stem_artifact_id):
        errors.append("Invalid source vocal stem artifact id.")
    if not is_valid_artifact_id(target_instrumental_stem_artifact_id):
        errors.append("Invalid target instrumental stem artifact id.")

    if duration_seconds is None or duration_seconds <= 0:
        errors.append("duration_seconds must be greater than zero.")

    if start_seconds is not None and start_seconds < 0:
        errors.append("start_seconds must be zero or greater.")

    if start_seconds_unavailable and not confirm_start_from_artifact_beginning:
        errors.append(
            "confirm_start_from_artifact_beginning must be true when section start is unavailable."
        )

    if not confirm_advisory_section_export:
        errors.append("confirm_advisory_section_export must be true.")

    if binding_freshness_status in {"stale", "partially_stale"} and not confirm_stale_context:
        errors.append("confirm_stale_context must be true when binding context is stale.")

    if binding_freshness_status not in ALLOWED_BINDING_FRESHNESS:
        errors.append("binding_freshness_status is invalid.")

    if settings_mode not in ALLOWED_SETTINGS_MODES:
        errors.append("settings_mode must be bound or current.")

    if loudness_target_mode not in LOUDNESS_MODES:
        errors.append("loudness_target_mode must be measurement_only or normalize_section.")

    if export_label is not None and len(export_label.strip()) > 120:
        errors.append("export_label must be 120 characters or fewer.")

    if arrangement_context is None:
        errors.append("arrangement_context is required for section export.")
    else:
        _, context_errors = validate_arrangement_context(arrangement_context)
        errors.extend(context_errors)

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

    _, preview_errors = validate_combined_preview_request(
        mash_intent=mash_intent,
        source_vocal_artifact_id=source_vocal_stem_artifact_id,
        target_instrumental_artifact_id=target_instrumental_stem_artifact_id,
        tempo_ratio=tempo_ratio,
        source_bpm=source_bpm,
        target_bpm=target_bpm,
        pitch_shift_semitones=pitch_shift_semitones,
        alignment_offset_ms=alignment_offset_ms,
        max_preview_seconds=int(math.ceil(duration_seconds)) if duration_seconds else 1,
        neutral_processing=neutral_processing,
        preview_start_seconds=start_seconds if start_seconds is not None else 0.0,
    )
    errors.extend(preview_errors)

    return errors


def create_section_wav_export(
    *,
    source_vocal_stem_artifact_id: str,
    target_instrumental_stem_artifact_id: str,
    mash_intent: str,
    tempo_ratio: float | None = None,
    source_bpm: float | None = None,
    target_bpm: float | None = None,
    pitch_shift_semitones: float = 0.0,
    alignment_offset_ms: float = 0.0,
    start_seconds: float | None = None,
    duration_seconds: float | None = None,
    start_seconds_unavailable: bool = False,
    confirm_advisory_section_export: bool = False,
    confirm_start_from_artifact_beginning: bool = False,
    confirm_stale_context: bool = False,
    binding_freshness_status: str = "unavailable",
    settings_mode: str = "bound",
    export_label: str | None = None,
    loudness_target_mode: str = "measurement_only",
    neutral_processing: bool = False,
    confirm_neutral_settings: bool = False,
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
) -> SectionWavExportResult:
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

    validation_errors = list(mix_errors)
    validation_errors.extend(
        validate_section_export_request(
            source_vocal_stem_artifact_id=source_vocal_stem_artifact_id,
            target_instrumental_stem_artifact_id=target_instrumental_stem_artifact_id,
            mash_intent=mash_intent,
            tempo_ratio=tempo_ratio,
            source_bpm=source_bpm,
            target_bpm=target_bpm,
            pitch_shift_semitones=pitch_shift_semitones,
            alignment_offset_ms=alignment_offset_ms,
            start_seconds=start_seconds,
            duration_seconds=duration_seconds,
            start_seconds_unavailable=start_seconds_unavailable,
            confirm_advisory_section_export=confirm_advisory_section_export,
            confirm_start_from_artifact_beginning=confirm_start_from_artifact_beginning,
            confirm_stale_context=confirm_stale_context,
            binding_freshness_status=binding_freshness_status,
            settings_mode=settings_mode,
            loudness_target_mode=loudness_target_mode,
            export_label=export_label,
            neutral_processing=neutral_processing,
            confirm_neutral_settings=confirm_neutral_settings,
            arrangement_context=arrangement_context,
        )
    )

    if validation_errors:
        return SectionWavExportFailure(
            ok=False,
            status="validation_error",
            message="Section export request failed validation.",
            validation_errors=validation_errors,
        )

    if mix_settings is None:
        mix_settings = default_mix_settings()

    assert duration_seconds is not None and duration_seconds > 0
    effective_start = 0.0 if start_seconds is None else float(start_seconds)
    duration_int = int(math.ceil(duration_seconds))

    resolved_ratio, _ = validate_combined_preview_request(
        mash_intent=mash_intent,
        source_vocal_artifact_id=source_vocal_stem_artifact_id,
        target_instrumental_artifact_id=target_instrumental_stem_artifact_id,
        tempo_ratio=tempo_ratio,
        source_bpm=source_bpm,
        target_bpm=target_bpm,
        pitch_shift_semitones=pitch_shift_semitones,
        alignment_offset_ms=alignment_offset_ms,
        max_preview_seconds=duration_int,
        neutral_processing=neutral_processing,
        preview_start_seconds=effective_start,
    )

    vocal_path = stem_vocals_path(source_vocal_stem_artifact_id)
    bed_path = stem_no_vocals_path(target_instrumental_stem_artifact_id)

    missing: list[str] = []
    if not vocal_path.exists():
        missing.append(f"vocals stem for artifact {source_vocal_stem_artifact_id}")
    if not bed_path.exists():
        missing.append(f"no_vocals stem for artifact {target_instrumental_stem_artifact_id}")

    if missing:
        return SectionWavExportFailure(
            ok=False,
            status="missing_artifact",
            message="Stem preview artifacts not found for section export.",
            setup_guidance=f"Missing: {', '.join(missing)}.",
        )

    rubberband = find_rubberband_binary()
    if rubberband is None:
        capability = get_capability("rubberband")
        return SectionWavExportFailure(
            ok=False,
            status="missing_dependency",
            message=capability.message if capability else "Rubber Band CLI is not available.",
            setup_guidance="Install Rubber Band CLI for vocal pitch/time adjustment.",
        )

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return SectionWavExportFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required to trim and mix section export stems.",
            setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
        )

    effective_pitch = 0.0 if neutral_processing else pitch_shift_semitones
    effective_ratio = 1.0 if neutral_processing else resolved_ratio

    export_id = uuid.uuid4().hex
    export_dir = _resolve_under(EXPORTS_DIR, export_id)
    if export_dir is None:
        return SectionWavExportFailure(
            ok=False,
            status="processing_failed",
            message="Could not resolve export artifact directory.",
        )

    export_dir.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    vocal_trim = config.TEMP_DIR / f"section-vocal-trim-{export_id}.wav"
    vocal_processed = config.TEMP_DIR / f"section-vocal-rb-{export_id}.wav"
    bed_trim = config.TEMP_DIR / f"section-bed-trim-{export_id}.wav"
    mixed_path = config.TEMP_DIR / f"section-mix-{export_id}.wav"
    export_path = export_dir / SECTION_EXPORT_FILE_NAME

    warnings: list[str] = [
        SECTION_EXPORT_NOTICE,
        "Section window export — user-generated, not a published release.",
        "Advisory planning window only — not detected song structure.",
    ]
    limitations: list[str] = [
        "No public sharing, streaming integration, or distribution rights granted.",
        "Section export is not proof of song-section detection.",
    ]

    if start_seconds_unavailable:
        warnings.append(
            "Section start unavailable — exported from artifact start using section duration."
        )

    if abs(effective_pitch) > 4:
        warnings.append(
            f"Pitch shift of {effective_pitch} semitones may cause audible artifacts in the section export."
        )

    try:
        vocal_trim_result = subprocess.run(
            build_ffmpeg_trim_command(
                ffmpeg,
                vocal_path,
                vocal_trim,
                duration_int,
                effective_start,
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        if vocal_trim_result.returncode != 0:
            return SectionWavExportFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not trim the source vocal stem for section export.",
                setup_guidance=vocal_trim_result.stderr.strip() or None,
            )

        rb_command = build_rubberband_command(
            rubberband,
            vocal_trim,
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
            return SectionWavExportFailure(
                ok=False,
                status="processing_failed",
                message="Rubber Band vocal adjustment failed for section export.",
                setup_guidance=rb_result.stderr.strip() or None,
            )

        bed_trim_result = subprocess.run(
            build_ffmpeg_trim_command(
                ffmpeg,
                bed_path,
                bed_trim,
                duration_int,
                effective_start,
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        if bed_trim_result.returncode != 0:
            return SectionWavExportFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not trim the target instrumental stem for section export.",
                setup_guidance=bed_trim_result.stderr.strip() or None,
            )

        mix_result = subprocess.run(
            build_ffmpeg_mix_command(
                ffmpeg,
                bed_trim,
                vocal_processed,
                mixed_path,
                alignment_offset_ms=alignment_offset_ms,
                max_seconds=duration_int,
                mix_settings=mix_settings,
            ),
            capture_output=True,
            text=True,
            check=False,
        )
        if mix_result.returncode != 0:
            return SectionWavExportFailure(
                ok=False,
                status="processing_failed",
                message="FFmpeg could not mix the section export.",
                setup_guidance=mix_result.stderr.strip() or None,
            )

        if loudness_target_mode in NORMALIZE_MODES:
            warnings.append(
                "Normalize section applies FFmpeg loudnorm — prototype normalization for this planning window only."
            )
            normalize_ok, normalize_message = _normalize_export_wav(ffmpeg, mixed_path, export_path)
            if not normalize_ok:
                return SectionWavExportFailure(
                    ok=False,
                    status="processing_failed",
                    message=normalize_message,
                )
        else:
            shutil.copy2(mixed_path, export_path)
            limitations.append(
                "Loudness measured only; no normalization unless normalize_section is selected."
            )

        output_duration, _, _ = probe_wav_metadata(export_path)
        technical = analyze_technical_readout(export_path)
        warnings.extend(build_mix_processing_notes(mix_settings))
        warnings.extend(build_loudness_clipping_warnings(technical.loudness))

        validated_context, _ = validate_arrangement_context(arrangement_context)
        meta = {
            "export_subtype": SECTION_EXPORT_SUBTYPE,
            "export_format": "wav",
            "section_trimmed_export": True,
            "source_vocal_stem_artifact_id": source_vocal_stem_artifact_id,
            "target_instrumental_stem_artifact_id": target_instrumental_stem_artifact_id,
            "mash_intent": mash_intent,
            "tempo_ratio": effective_ratio,
            "pitch_shift_semitones": effective_pitch,
            "alignment_offset_ms": alignment_offset_ms,
            "start_seconds_used": effective_start,
            "duration_seconds_used": duration_seconds,
            "start_seconds_unavailable": start_seconds_unavailable,
            "binding_freshness_status": binding_freshness_status,
            "settings_mode": settings_mode,
            "export_label": export_label.strip() if export_label else None,
            "loudness_target_mode": loudness_target_mode,
            "mix_settings": mix_settings_to_dict(mix_settings),
            "limiter_safety_applied": mix_settings.limiter_safety,
            "clipping_guard_applied": mix_settings.clipping_guard,
            "instrumental_duck_applied": mix_settings.instrumental_duck_under_vocal,
            "created_at": datetime.now(tz=UTC).isoformat(),
            "public_share": False,
            "final_export": True,
        }
        if validated_context is not None:
            section_context = dict(validated_context)
            section_context["export_context_mode"] = "section_export"
            merge_arrangement_context_into_meta(meta, section_context)

        (export_dir / META_FILE_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")

        input_summary = SectionExportInputSummary(
            mash_intent=mash_intent,
            source_vocal_stem_artifact_id=source_vocal_stem_artifact_id,
            target_instrumental_stem_artifact_id=target_instrumental_stem_artifact_id,
            start_seconds=effective_start,
            duration_seconds=duration_seconds,
            start_seconds_unavailable=start_seconds_unavailable,
            tempo_ratio=effective_ratio,
            pitch_shift_semitones=effective_pitch,
            alignment_offset_ms=alignment_offset_ms,
            mix_settings=mix_settings,
            binding_freshness_status=binding_freshness_status,
            settings_mode=settings_mode,
        )
        processing_summary = SectionExportProcessingSummary(
            method="ffmpeg-trim + rubberband-vocal + ffmpeg-section-mix",
            section_trimmed=True,
            start_seconds_used=effective_start,
            duration_seconds_used=duration_seconds,
            pitch_shift_semitones=effective_pitch,
            alignment_offset_ms=alignment_offset_ms,
            mix_settings=mix_settings,
            limiter_safety_applied=mix_settings.limiter_safety,
            clipping_guard_applied=mix_settings.clipping_guard,
            instrumental_duck_applied=mix_settings.instrumental_duck_under_vocal,
        )

        artifact_url = f"/v1/artifacts/exports/{export_id}/section-export"

        return SectionWavExportSuccess(
            ok=True,
            status="ready",
            message="Section window WAV export created from advisory planning window.",
            export_artifact_id=export_id,
            artifact_url=artifact_url,
            download_url=artifact_url,
            input_summary=input_summary,
            processing_summary=processing_summary,
            file_size_bytes=technical.file_size_bytes,
            duration_seconds=output_duration,
            sample_rate=technical.sample_rate,
            channel_count=technical.channel_count,
            codec=technical.codec,
            loudness=technical.loudness,
            final_export=True,
            public_share=False,
            section_trimmed_export=True,
            rights_notice=RIGHTS_NOTICE,
            warnings=warnings,
            limitations=limitations,
            export_label=export_label.strip() if export_label else None,
        )
    finally:
        for temp in (vocal_trim, vocal_processed, bed_trim, mixed_path):
            temp.unlink(missing_ok=True)


def _has_actionable_plan(
    *,
    tempo_ratio: float | None,
    source_bpm: float | None,
    target_bpm: float | None,
    pitch_shift_semitones: float,
) -> bool:
    if tempo_ratio is not None and abs(tempo_ratio - 1.0) > 0.001:
        return True
    if source_bpm is not None and target_bpm is not None and abs(source_bpm - target_bpm) > 0.1:
        return True
    if abs(pitch_shift_semitones) > 0.01:
        return True
    return False

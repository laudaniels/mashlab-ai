"""Render Arrangement Brain plans to local WAV exports."""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path

from arrangement_brain.models import ArrangementPlan, ArrangementSection
from combined_preview_processing import stem_no_vocals_path, stem_vocals_path
from export_processing import EXPORTS_DIR, EXPORT_FILE_NAME, META_FILE_NAME, RIGHTS_NOTICE, read_export_meta
from full_length_export_processing import FullWavExportFailure, FullWavExportSuccess, create_full_wav_export
from mix_settings import MixSettings, default_mix_settings, validate_mix_settings
from rubber_band_processing import build_rubberband_command, find_rubberband_binary, probe_wav_metadata

import config


@dataclass
class ArrangementExportFailure:
    ok: False
    status: str
    message: str
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


ArrangementExportResult = FullWavExportSuccess | ArrangementExportFailure | FullWavExportFailure


def _parse_plan(raw: dict) -> ArrangementPlan:
    sections = [
        ArrangementSection(**section) for section in raw.get("sections") or []
    ]
    return ArrangementPlan(
        mode=raw.get("mode") or "clean_blend",
        mode_label=raw.get("mode_label") or "Clean Blend",
        target_bpm=float(raw.get("target_bpm") or 120.0),
        sections=sections,
        warnings=list(raw.get("warnings") or []),
        score=float(raw.get("score") or 0.0),
        confidence_tier=raw.get("confidence_tier") or "medium",
        score_breakdown=dict(raw.get("score_breakdown") or {}),
        remix_plan=raw.get("remix_plan"),
        summary_line=str(raw.get("summary_line") or ""),
        total_duration_seconds=float(raw.get("total_duration_seconds") or 0.0),
        tempo_label=str(raw.get("tempo_label") or ""),
        key_label=str(raw.get("key_label") or ""),
        sync_label=str(raw.get("sync_label") or ""),
    )


def _ffmpeg_segment(
    ffmpeg: str,
    bed_path: Path,
    vocal_path: Path | None,
    section: ArrangementSection,
    out_path: Path,
    alignment_offset_ms: float,
) -> None:
    start = section.start_seconds
    dur = section.duration_seconds
    fade_in = max(0.0, section.fade_in_ms / 1000.0)
    fade_out = max(0.0, section.fade_out_ms / 1000.0)
    bed_gain = section.instrumental_gain_db
    vocal_gain = section.vocal_gain_db

    if section.source == "instrumental":
        filt = (
            f"[0:a]atrim=start={start}:duration={dur},asetpts=PTS-STARTPTS,"
            f"volume={10 ** (bed_gain / 20):.6f},"
            f"afade=t=in:st=0:d={fade_in},afade=t=out:st={max(0, dur - fade_out)}:d={fade_out}[a]"
        )
        cmd = [ffmpeg, "-y", "-i", str(bed_path), "-filter_complex", filt, "-map", "[a]", str(out_path)]
    elif section.source == "vocal" and vocal_path:
        filt = (
            f"[0:a]atrim=start={start}:duration={dur},asetpts=PTS-STARTPTS,"
            f"volume={10 ** (vocal_gain / 20):.6f},"
            f"afade=t=in:st=0:d={fade_in},afade=t=out:st={max(0, dur - fade_out)}:d={fade_out}[a]"
        )
        cmd = [ffmpeg, "-y", "-i", str(vocal_path), "-filter_complex", filt, "-map", "[a]", str(out_path)]
    else:
        v_delay = max(0, int(round(alignment_offset_ms)))
        b_delay = max(0, int(round(-alignment_offset_ms)))
        bed_chain = f"[0:a]atrim=start={start}:duration={dur},asetpts=PTS-STARTPTS"
        if b_delay:
            bed_chain += f",adelay={b_delay}|{b_delay}"
        bed_chain += f",volume={10 ** (bed_gain / 20):.6f}[bed]"
        vocal_chain = f"[1:a]atrim=start={start}:duration={dur},asetpts=PTS-STARTPTS"
        if v_delay:
            vocal_chain += f",adelay={v_delay}|{v_delay}"
        vocal_chain += f",volume={10 ** (vocal_gain / 20):.6f}[voc]"
        filt = (
            f"{bed_chain};{vocal_chain};"
            f"[bed][voc]amix=inputs=2:duration=longest:dropout_transition=0,"
            f"afade=t=in:st=0:d={fade_in},afade=t=out:st={max(0, dur - fade_out)}:d={fade_out}[a]"
        )
        cmd = [
            ffmpeg,
            "-y",
            "-i",
            str(bed_path),
            "-i",
            str(vocal_path),
            "-filter_complex",
            filt,
            "-map",
            "[a]",
            str(out_path),
        ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-500:])


def create_arrangement_wav_export(
    *,
    source_vocal_stem_artifact_id: str,
    target_instrumental_stem_artifact_id: str,
    arrangement_plan: dict,
    tempo_ratio: float | None,
    pitch_shift_semitones: float = 0.0,
    alignment_offset_ms: float = 0.0,
    export_label: str | None = None,
    loudness_target_mode: str = "measurement_only",
    neutral_processing: bool = False,
    confirm_neutral_settings: bool = False,
    vocal_gain_db: float = 0.0,
    instrumental_gain_db: float = 0.0,
    master_gain_db: float = 0.0,
    limiter_safety: bool = False,
    clipping_guard: bool = False,
    instrumental_duck_under_vocal: bool = False,
) -> ArrangementExportResult:
    plan = _parse_plan(arrangement_plan)
    if plan.mode == "clean_blend" or (
        len(plan.sections) == 1 and plan.sections[0].source == "mix"
    ):
        return create_full_wav_export(
            source_vocal_stem_artifact_id=source_vocal_stem_artifact_id,
            target_instrumental_stem_artifact_id=target_instrumental_stem_artifact_id,
            mash_intent="vocal_a_over_beat_b",
            tempo_ratio=tempo_ratio,
            pitch_shift_semitones=pitch_shift_semitones,
            alignment_offset_ms=alignment_offset_ms,
            export_label=export_label or "quick-mix-arrangement",
            loudness_target_mode=loudness_target_mode,
            neutral_processing=neutral_processing,
            confirm_neutral_settings=confirm_neutral_settings,
            vocal_gain_db=vocal_gain_db,
            instrumental_gain_db=instrumental_gain_db,
            master_gain_db=master_gain_db,
            limiter_safety=limiter_safety,
            clipping_guard=clipping_guard,
            instrumental_duck_under_vocal=instrumental_duck_under_vocal,
        )

    vocal_path = stem_vocals_path(source_vocal_stem_artifact_id)
    bed_path = stem_no_vocals_path(target_instrumental_stem_artifact_id)
    if not vocal_path.is_file() or not bed_path.is_file():
        return ArrangementExportFailure(
            ok=False,
            status="missing_artifact",
            message="Stem artifacts not found for arrangement export.",
        )

    rubberband = find_rubberband_binary()
    ffmpeg = shutil.which("ffmpeg")
    if rubberband is None:
        return ArrangementExportFailure(
            ok=False,
            status="missing_dependency",
            message="Rubber Band CLI is required for arrangement export.",
        )
    if ffmpeg is None:
        return ArrangementExportFailure(
            ok=False,
            status="missing_dependency",
            message="FFmpeg is required for arrangement export.",
        )

    export_id = uuid.uuid4().hex
    export_dir = EXPORTS_DIR / export_id
    export_dir.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    vocal_rb = config.TEMP_DIR / f"arr-vocal-rb-{export_id}.wav"
    effective_ratio = 1.0 if neutral_processing else (tempo_ratio or 1.0)
    effective_pitch = 0.0 if neutral_processing else pitch_shift_semitones

    rb_cmd = build_rubberband_command(
        rubberband,
        vocal_path,
        vocal_rb,
        tempo_ratio=effective_ratio,
        pitch_shift_semitones=effective_pitch,
        formant_preservation=True,
    )
    rb_result = subprocess.run(rb_cmd, capture_output=True, text=True, check=False)
    if rb_result.returncode != 0:
        return ArrangementExportFailure(
            ok=False,
            status="processing_failed",
            message="Rubber Band processing failed for arrangement vocal stem.",
            setup_guidance=rb_result.stderr[-300:],
        )

    segment_paths: list[Path] = []
    try:
        for index, section in enumerate(plan.sections):
            seg = config.TEMP_DIR / f"arr-seg-{export_id}-{index}.wav"
            vocal_src = vocal_rb if section.source in ("mix", "vocal") else None
            _ffmpeg_segment(
                ffmpeg,
                bed_path,
                vocal_src,
                section,
                seg,
                alignment_offset_ms,
            )
            segment_paths.append(seg)

        list_file = config.TEMP_DIR / f"arr-concat-{export_id}.txt"
        list_file.write_text(
            "\n".join(f"file '{p.as_posix()}'" for p in segment_paths),
            encoding="utf-8",
        )
        export_path = export_dir / EXPORT_FILE_NAME
        concat_cmd = [
            ffmpeg,
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_file),
            "-c",
            "copy",
            str(export_path),
        ]
        concat_result = subprocess.run(concat_cmd, capture_output=True, text=True, check=False)
        if concat_result.returncode != 0:
            return ArrangementExportFailure(
                ok=False,
                status="processing_failed",
                message="Failed to concatenate arrangement sections.",
                setup_guidance=concat_result.stderr[-300:],
            )
    except Exception as error:
        return ArrangementExportFailure(
            ok=False,
            status="processing_failed",
            message=f"Arrangement section render failed: {error}",
        )

    duration, sample_rate, channels = probe_wav_metadata(export_path)
    meta = {
        "export_artifact_id": export_id,
        "subtype": "full-wav",
        "arrangement_mode": plan.mode,
        "arrangement_summary": plan.summary_line,
        "arrangement_score": plan.score,
        "arrangement_confidence": plan.confidence_tier,
        "rights_notice": RIGHTS_NOTICE,
    }
    (export_dir / META_FILE_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    warnings = list(plan.warnings)
    warnings.append("Arrangement export — local prototype, not professional mastering.")

    return FullWavExportSuccess(
        ok=True,
        status="exported",
        message="Arrangement mix exported to local WAV.",
        export_artifact_id=export_id,
        artifact_url=f"/v1/artifacts/{export_id}/playback",
        download_url=f"/v1/artifacts/{export_id}/download",
        input_summary=None,  # type: ignore[arg-type]
        processing_summary=None,  # type: ignore[arg-type]
        file_size_bytes=export_path.stat().st_size if export_path.exists() else None,
        duration_seconds=duration,
        sample_rate=sample_rate,
        channel_count=channels,
        codec="pcm_s16le",
        loudness=None,
        loudness_gate=None,  # type: ignore[arg-type]
        final_export=True,
        public_share=False,
        rights_notice=RIGHTS_NOTICE,
        warnings=warnings,
        limitations=["No distribution rights implied."],
        export_label=export_label,
    )

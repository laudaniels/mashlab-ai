"""Arrangement Brain planning API bridge."""

from __future__ import annotations

from arrangement_brain.planner import build_arrangement_plan
from arrangement_brain.models import MODE_LABELS
from remix_brain.planner import UserOverrides, build_remix_analysis, pick_best_plan, plan_summary_for_ui
from remix_brain_processing import RemixBrainPlanFailure, _stem_paths
from remix_brain.analysis import analyze_file
from remix_brain.io_utils import SAMPLE_RATE, load_audio, to_mono
from remix_brain.align import align_tracks


class ArrangementBrainPlanFailure(Exception):
    def __init__(self, status: str, message: str, setup_guidance: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.setup_guidance = setup_guidance


ALLOWED_MODES = frozenset({"clean_blend", "hook_remix", "dj_edit"})


def build_arrangement_brain_plan(
    *,
    vocal_stem_artifact_id: str,
    instrumental_stem_artifact_id: str,
    arrangement_mode: str = "clean_blend",
    section_start_sec: float | None = None,
    section_duration_sec: float | None = None,
) -> dict:
    mode = arrangement_mode if arrangement_mode in ALLOWED_MODES else "clean_blend"
    vocal_path, bed_path = _stem_paths(vocal_stem_artifact_id, instrumental_stem_artifact_id)

    try:
        vocal_track = analyze_file(str(vocal_path)).to_dict()
        instr_track = analyze_file(str(bed_path)).to_dict()
    except Exception as error:
        raise ArrangementBrainPlanFailure("analysis_failed", f"Analysis failed: {error}") from error

    vocal_y, sr = load_audio(vocal_path, sr=SAMPLE_RATE)
    bed_y, _ = load_audio(bed_path, sr=SAMPLE_RATE)
    vocal_mono = to_mono(vocal_y)
    bed_mono = to_mono(bed_y)

    align_offset_ms: float | None = None
    try:
        align_result = align_tracks(str(vocal_path), str(bed_path), vocal_track, instr_track)
        align_offset_ms = float(align_result.recommended_offset_ms)
    except Exception:
        align_offset_ms = None

    overrides = UserOverrides(
        section_start_sec=section_start_sec,
        section_duration_sec=section_duration_sec,
    )
    remix_plan, _, vocal_ra, instr_ra = pick_best_plan(
        vocal_track,
        instr_track,
        overrides,
        vocal_mono=vocal_mono,
        instr_mono=bed_mono,
        sr=sr,
        align_offset_ms=align_offset_ms,
    )
    arrangement = build_arrangement_plan(
        mode,
        remix_plan,
        vocal_ra,
        instr_ra,
        section_start_sec=section_start_sec,
        section_duration_sec=section_duration_sec,
    )
    remix_summary = plan_summary_for_ui(remix_plan)
    alignment_offset_ms = round(remix_plan.shift_seconds * 1000.0, 2)

    return {
        "arrangement_plan": arrangement.to_dict(),
        "arrangement_summary": {
            "mode": arrangement.mode,
            "mode_label": MODE_LABELS.get(arrangement.mode, arrangement.mode_label),
            "summary_line": arrangement.summary_line,
            "score": arrangement.score,
            "confidence_tier": arrangement.confidence_tier,
            "warnings": arrangement.warnings,
            "score_breakdown": arrangement.score_breakdown,
            "total_duration_seconds": arrangement.total_duration_seconds,
            "tempo_label": arrangement.tempo_label,
            "key_label": arrangement.key_label,
            "sync_label": arrangement.sync_label,
        },
        "remix_plan": remix_plan.to_dict(),
        "remix_plan_summary": remix_summary,
        "alignment_offset_ms": alignment_offset_ms,
        "tempo_ratio": remix_plan.tempo_ratio,
        "pitch_shift_semitones": remix_plan.vocal_pitch_shift_semitones,
        "vocal_stem_artifact_id": vocal_stem_artifact_id,
        "instrumental_stem_artifact_id": instrumental_stem_artifact_id,
    }

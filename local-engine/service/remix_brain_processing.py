"""Remix Brain planning for Quick Mix stem artifacts."""

from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from combined_preview_processing import stem_no_vocals_path, stem_vocals_path
from remix_brain.align import align_tracks
from remix_brain.analysis import analyze_file
from remix_brain.io_utils import SAMPLE_RATE, load_audio, to_mono
from remix_brain.planner import UserOverrides, pick_best_plan, plan_summary_for_ui


class RemixBrainPlanFailure(Exception):
    def __init__(self, status: str, message: str, setup_guidance: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.setup_guidance = setup_guidance


def _stem_paths(vocal_stem_artifact_id: str, instrumental_stem_artifact_id: str) -> tuple[Path, Path]:
    vocal_path = stem_vocals_path(vocal_stem_artifact_id)
    bed_path = stem_no_vocals_path(instrumental_stem_artifact_id)
    if not vocal_path.is_file():
        raise RemixBrainPlanFailure(
            "missing_artifact",
            f"Vocal stem artifact not found: {vocal_stem_artifact_id}",
        )
    if not bed_path.is_file():
        raise RemixBrainPlanFailure(
            "missing_artifact",
            f"Instrumental stem artifact not found: {instrumental_stem_artifact_id}",
        )
    return vocal_path, bed_path


def build_remix_brain_plan(
    *,
    vocal_stem_artifact_id: str,
    instrumental_stem_artifact_id: str,
    section_start_sec: float | None = None,
    section_duration_sec: float | None = None,
    offset_ms: float = 0.0,
    semitones: float | None = None,
    downbeat_shift: int = 0,
    manual_only: bool = False,
) -> dict:
    vocal_path, bed_path = _stem_paths(vocal_stem_artifact_id, instrumental_stem_artifact_id)

    try:
        vocal_track = analyze_file(str(vocal_path)).to_dict()
        instr_track = analyze_file(str(bed_path)).to_dict()
    except Exception as error:
        raise RemixBrainPlanFailure("analysis_failed", f"Remix Brain analysis failed: {error}") from error

    vocal_y, sr = load_audio(vocal_path, sr=SAMPLE_RATE)
    bed_y, _ = load_audio(bed_path, sr=SAMPLE_RATE)
    vocal_mono = to_mono(vocal_y)
    bed_mono = to_mono(bed_y)

    align_offset_ms: float | None = None
    try:
        align_result = align_tracks(
            str(vocal_path),
            str(bed_path),
            vocal_track,
            instr_track,
        )
        align_offset_ms = float(align_result.recommended_offset_ms)
    except Exception:
        align_offset_ms = None

    overrides = UserOverrides(
        semitones=semitones,
        offset_ms=offset_ms,
        downbeat_shift=downbeat_shift,
        section_start_sec=section_start_sec,
        section_duration_sec=section_duration_sec,
        manual_only=manual_only,
    )

    best, candidates, vocal_analysis, instr_analysis = pick_best_plan(
        vocal_track,
        instr_track,
        overrides,
        vocal_mono=vocal_mono,
        instr_mono=bed_mono,
        sr=sr,
        align_offset_ms=align_offset_ms,
    )

    summary = plan_summary_for_ui(best)
    alignment_offset_ms = round(best.shift_seconds * 1000.0, 2)

    return {
        "plan": best.to_dict(),
        "plan_summary": summary,
        "candidates": [plan.to_dict() for plan in candidates[:3]],
        "confidence_tier": summary["confidence_tier"],
        "alignment_offset_ms": alignment_offset_ms,
        "tempo_ratio": best.tempo_ratio,
        "pitch_shift_semitones": best.vocal_pitch_shift_semitones,
        "vocal_analysis": vocal_analysis.to_dict(),
        "instrumental_analysis": instr_analysis.to_dict(),
        "vocal_stem_artifact_id": vocal_stem_artifact_id,
        "instrumental_stem_artifact_id": instrumental_stem_artifact_id,
    }

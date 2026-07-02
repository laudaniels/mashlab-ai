"""Arrangement Brain unit tests (Phase 43)."""

from __future__ import annotations

from arrangement_brain.models import confidence_tier_from_score
from arrangement_brain.planner import (
    bar_duration_sec,
    build_arrangement_plan,
    build_dj_edit_arrangement,
    build_hook_remix_arrangement,
)
from arrangement_brain.scoring import score_arrangement_plan
from remix_brain.models import RemixAnalysis, RemixPlan


def _sample_remix_plan() -> RemixPlan:
    return RemixPlan(
        mode="clean_blend",
        target_bpm=120.0,
        vocal_start_seconds=0.0,
        instrumental_start_seconds=0.0,
        vocal_anchor_sec=8.0,
        instrumental_anchor_sec=4.0,
        vocal_anchor_type="phrase",
        instrumental_anchor_type="downbeat",
        tempo_ratio=0.98,
        vocal_pitch_shift_semitones=0.0,
        phrase_alignment="near",
        harmonic_compatibility="compatible",
        score=76.0,
        shift_seconds=-0.1,
    )


def _sample_vocal() -> RemixAnalysis:
  phrase_starts = [float(i * 2.0) for i in range(60)]
  density = [0.2 + (0.6 if 16 <= i <= 32 else 0.1) for i in range(100)]
  return RemixAnalysis(
      source_role="vocal",
      duration_seconds=120.0,
      bpm=120.0,
      bpm_confidence=0.8,
      beats=phrase_starts,
      downbeats=[p for i, p in enumerate(phrase_starts) if i % 4 == 0],
      downbeat_confidence=0.7,
      phrase_starts=phrase_starts,
      phrase_length_bars=16,
      key="A minor",
      camelot="8A",
      key_confidence=0.7,
      energy_curve=density,
      vocal_density_curve=density,
      transient_strength_curve=density,
      analysis_basis="librosa",
  )


def _sample_instr() -> RemixAnalysis:
    phrase_starts = [float(i * 2.0) for i in range(60)]
    energy = [0.3 + (0.2 if i % 8 == 0 else 0.5) for i in range(100)]
    return RemixAnalysis(
        source_role="instrumental",
        duration_seconds=120.0,
        bpm=120.0,
        bpm_confidence=0.85,
        beats=phrase_starts,
        downbeats=[p for i, p in enumerate(phrase_starts) if i % 4 == 0],
        downbeat_confidence=0.75,
        phrase_starts=phrase_starts,
        phrase_length_bars=16,
        key="A minor",
        camelot="8A",
        key_confidence=0.7,
        energy_curve=energy,
        vocal_density_curve=None,
        transient_strength_curve=energy,
        analysis_basis="librosa",
    )


def test_confidence_tiers() -> None:
    assert confidence_tier_from_score(85) == "high"
    assert confidence_tier_from_score(70) == "medium"
    assert confidence_tier_from_score(50) == "low"


def test_bar_duration_sec() -> None:
    assert abs(bar_duration_sec(120.0, 4) - 2.0) < 0.01


def test_clean_blend_single_section() -> None:
    plan = build_arrangement_plan(
        "clean_blend",
        _sample_remix_plan(),
        _sample_vocal(),
        _sample_instr(),
    )
    assert plan.mode == "clean_blend"
    assert len(plan.sections) == 1
    assert plan.sections[0].source == "mix"


def test_hook_remix_has_hook_section() -> None:
    plan = build_hook_remix_arrangement(
        _sample_remix_plan(), _sample_vocal(), _sample_instr()
    )
    labels = [s.label for s in plan.sections]
    assert "hook" in labels
    hook = next(s for s in plan.sections if s.label == "hook")
    assert hook.bar_length in (16, 32)
    assert hook.source == "mix"


def test_dj_edit_structure() -> None:
    plan = build_dj_edit_arrangement(
        _sample_remix_plan(), _sample_vocal(), _sample_instr()
    )
    labels = [s.label for s in plan.sections]
    assert labels[0] == "intro"
    assert "hook" in labels
    assert "break" in labels
    assert labels[-1] == "outro"
    total_bars = sum(s.bar_length for s in plan.sections)
    assert total_bars >= 48


def test_sections_bar_aligned_lengths() -> None:
    plan = build_dj_edit_arrangement(
        _sample_remix_plan(), _sample_vocal(), _sample_instr()
    )
    bar_sec = bar_duration_sec(120.0, 4)
    for section in plan.sections:
        assert section.bar_length in (4, 8, 16, 32)
        assert abs(section.duration_seconds - section.bar_length * bar_sec) < 0.05


def test_low_confidence_warning() -> None:
    plan = build_arrangement_plan(
        "dj_edit",
        RemixPlan(
            mode="clean_blend",
            target_bpm=120.0,
            vocal_start_seconds=0.0,
            instrumental_start_seconds=0.0,
            vocal_anchor_sec=0.0,
            instrumental_anchor_sec=0.0,
            vocal_anchor_type="beat",
            instrumental_anchor_type="beat",
            tempo_ratio=1.25,
            vocal_pitch_shift_semitones=5.0,
            phrase_alignment="weak",
            harmonic_compatibility="clash",
            score=40.0,
        ),
        _sample_vocal(),
        _sample_instr(),
    )
    scored = score_arrangement_plan(
        plan,
        tempo_ratio=1.25,
        harmonic_compat="clash",
        max_seconds=180.0,
    )
    if scored.score < 65:
        assert scored.confidence_tier == "low"
        assert any("confidence" in w.lower() for w in scored.warnings)

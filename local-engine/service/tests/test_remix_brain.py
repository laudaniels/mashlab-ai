"""Remix Brain scoring and candidate generation tests."""

from __future__ import annotations

from remix_brain import harmonic, planner
from remix_brain.models import confidence_tier_from_score
from remix_brain.planner import UserOverrides, _score_tempo, _tempo_mult_candidates


def test_tempo_scoring() -> None:
    score, _ = _score_tempo(2.0, False)
    assert score == 20.0
    score, warnings = _score_tempo(10.0, True)
    assert score <= 8.0
    assert any("stretch" in line for line in warnings) or score == 0.0


def test_half_double_detection() -> None:
    candidates = _tempo_mult_candidates(60.0, 120.0)
    assert 2.0 in candidates or 0.5 in candidates
    same_tempo = _tempo_mult_candidates(120.0, 120.0)
    assert 1.0 in same_tempo


def test_camelot_harmony() -> None:
    compat, score, _, _ = harmonic.evaluate_harmony(0, "major", 0.8, 0, "major", 0.0)
    assert compat == "exact"
    assert score >= 14.0


def test_confidence_tiers() -> None:
    assert confidence_tier_from_score(85) == "high"
    assert confidence_tier_from_score(70) == "medium"
    assert confidence_tier_from_score(50) == "low"


def test_generate_candidates_count() -> None:
    vocal_track = {
        "duration": 60.0,
        "bpm": 120.0,
        "grid_bpm_clean": 120.0,
        "beat_times": [i * 0.5 for i in range(240)],
        "downbeat_times": [i * 2.0 for i in range(60)],
        "beats_per_bar": 4,
        "key_index": 9,
        "mode": "minor",
        "bpm_confidence": 0.9,
        "grid_fit_ms": 20.0,
        "tempo_constant": True,
        "bar_phase_sec": 0.0,
        "beat_phase_sec": 0.0,
        "grid_source": "librosa",
    }
    instr_track = dict(vocal_track)
    vocal = planner.build_remix_analysis(vocal_track, "vocal")
    instr = planner.build_remix_analysis(instr_track, "instrumental")
    plans = planner.generate_candidates(vocal, instr)
    assert 10 <= len(plans) <= 30
    assert plans[0].score >= plans[-1].score


def test_pick_best_plan_always_returns() -> None:
    vocal_track = {
        "duration": 30.0,
        "bpm": 100.0,
        "grid_bpm_clean": 100.0,
        "beat_times": [i * 0.6 for i in range(50)],
        "downbeat_times": [i * 2.4 for i in range(12)],
        "beats_per_bar": 4,
        "key_index": 0,
        "mode": "major",
        "bpm_confidence": 0.2,
        "grid_fit_ms": 400.0,
        "tempo_constant": True,
        "bar_phase_sec": 0.0,
        "beat_phase_sec": 0.0,
    }
    instr_track = dict(vocal_track)
    instr_track["bpm"] = 120.0
    instr_track["grid_bpm_clean"] = 120.0
    best, candidates, _, _ = planner.pick_best_plan(vocal_track, instr_track)
    assert best is not None
    assert best.score >= 0
    assert len(candidates) >= 1

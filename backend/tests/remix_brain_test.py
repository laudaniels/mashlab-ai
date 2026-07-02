"""Remix Brain scoring and candidate generation tests."""

from __future__ import annotations

from app.audio import harmonic, remix_brain
from app.audio.models import confidence_tier_from_score
from app.audio.remix_brain import UserOverrides, _score_tempo, _tempo_mult_candidates


def test_tempo_scoring() -> None:
    s, _ = _score_tempo(2.0, False)
    assert s == 20.0
    s, w = _score_tempo(10.0, True)
    assert s <= 8.0
    assert any("stretch" in x for x in w) or s == 0.0


def test_half_double_detection() -> None:
    cands = _tempo_mult_candidates(60.0, 120.0)
    assert 2.0 in cands or 0.5 in cands
    cands2 = _tempo_mult_candidates(120.0, 120.0)
    assert 1.0 in cands2


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
    instr_track["key_index"] = 9
    vocal = remix_brain.build_remix_analysis(vocal_track, "vocal")
    instr = remix_brain.build_remix_analysis(instr_track, "instrumental")
    plans = remix_brain.generate_candidates(vocal, instr)
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
    best, cands, _, _ = remix_brain.pick_best_plan(vocal_track, instr_track)
    assert best is not None
    assert best.score >= 0
    assert len(cands) >= 1


def test_manual_override_shift() -> None:
    from app.audio.models import RemixPlan
    from app.audio.remix_brain import apply_user_override

    plan = RemixPlan(
        mode="clean_blend",
        target_bpm=120.0,
        vocal_start_seconds=0.0,
        instrumental_start_seconds=0.0,
        vocal_anchor_sec=8.0,
        instrumental_anchor_sec=4.0,
        vocal_anchor_type="downbeat",
        instrumental_anchor_type="downbeat",
        tempo_ratio=1.0,
        vocal_pitch_shift_semitones=0.0,
        phrase_alignment="exact",
        harmonic_compatibility="exact",
        score=80.0,
        shift_seconds=4.0,
        vocal_bpm_effective=120.0,
    )
    instr = remix_brain.build_remix_analysis(
        {"bpm": 120, "grid_bpm_clean": 120, "duration": 60, "beats_per_bar": 4},
        "instrumental",
    )
    out = apply_user_override(plan, UserOverrides(offset_ms=100.0), instr)
    assert out.shift_seconds > plan.shift_seconds - 1e-6


def test_pitch_shift_limits() -> None:
    _, score_small, w_small, _ = harmonic.evaluate_harmony(0, "major", 0.9, 3, "major", 2.0)
    _, score_large, w_large, _ = harmonic.evaluate_harmony(0, "major", 0.9, 3, "major", 5.0)
    assert score_small >= score_large
    assert any("large" in w for w in w_large)


def test_low_key_confidence() -> None:
    compat, score, warnings, rec = harmonic.evaluate_harmony(0, "major", 0.2, 5, "major", 0.0)
    assert compat == "weak"
    assert rec == 0.0
    assert warnings


def test_anchor_placement_math() -> None:
    vocal = remix_brain.build_remix_analysis(
        {
            "duration": 60,
            "bpm": 120,
            "grid_bpm_clean": 120,
            "beat_times": [i * 0.5 for i in range(120)],
            "downbeat_times": [i * 2.0 for i in range(30)],
            "beats_per_bar": 4,
            "key_index": 0,
            "mode": "major",
            "bar_phase_sec": 0.0,
            "beat_phase_sec": 0.0,
        },
        "vocal",
    )
    instr = remix_brain.build_remix_analysis(
        {
            "duration": 60,
            "bpm": 120,
            "grid_bpm_clean": 120,
            "beat_times": [i * 0.5 for i in range(120)],
            "downbeat_times": [i * 2.0 for i in range(30)],
            "beats_per_bar": 4,
            "key_index": 0,
            "mode": "major",
            "bar_phase_sec": 0.0,
            "beat_phase_sec": 0.0,
        },
        "instrumental",
    )
    plans = remix_brain.generate_candidates(vocal, instr)
    top = plans[0]
    assert 0 <= top.score <= 100
    expected_shift = top.instrumental_anchor_sec - top.vocal_anchor_sec / top.tempo_ratio
    assert abs(top.shift_seconds - expected_shift) < 0.01


def test_section_window() -> None:
    starts = [0.0, 8.0, 16.0, 32.0, 48.0]
    win = remix_brain._phrase_window(starts, 12.0, 24.0)
    assert 16.0 in win
    assert 0.0 not in win


def main() -> None:
    test_tempo_scoring()
    test_half_double_detection()
    test_camelot_harmony()
    test_confidence_tiers()
    test_generate_candidates_count()
    test_pick_best_plan_always_returns()
    test_manual_override_shift()
    test_pitch_shift_limits()
    test_low_key_confidence()
    test_anchor_placement_math()
    test_section_window()
    print("remix_brain_test OK")


if __name__ == "__main__":
    main()

"""Post-render validation tests."""

from __future__ import annotations

import numpy as np

from app.audio import validate
from app.audio.models import RemixPlan
from app.audio.io_utils import SAMPLE_RATE


def _dummy_plan(anchor: float = 2.0) -> RemixPlan:
    return RemixPlan(
        mode="clean_blend",
        target_bpm=120.0,
        vocal_start_seconds=0.0,
        instrumental_start_seconds=0.0,
        vocal_anchor_sec=anchor,
        instrumental_anchor_sec=anchor,
        vocal_anchor_type="downbeat",
        instrumental_anchor_type="downbeat",
        tempo_ratio=1.0,
        vocal_pitch_shift_semitones=0.0,
        phrase_alignment="exact",
        harmonic_compatibility="exact",
        score=85.0,
    )


def test_measure_anchor_offset_synthetic() -> None:
    sr = SAMPLE_RATE
    duration = 4.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    y = np.zeros(int(sr * duration), dtype=np.float32)
    click_at = 2.0
    idx = int(click_at * sr)
    y[idx : idx + 500] = 0.8 * np.hanning(500)
    stereo = np.stack([y, y])
    plan = _dummy_plan(click_at)
    offset = validate.measure_anchor_offset(y, sr, plan, click_at, search_ms=200.0)
    assert abs(offset) < 50.0


def test_validate_render_tiers() -> None:
    sr = SAMPLE_RATE
    y = np.random.randn(2, sr * 3).astype(np.float32) * 0.01
    plan = _dummy_plan()
    plan.score = 50.0
    result = validate.validate_render(y, sr, plan, {"out_lufs": -14.0, "true_peak_db": -1.5})
    assert result.confidence_tier in ("high", "medium", "low")
    assert isinstance(result.passed, bool)


def main() -> None:
    test_measure_anchor_offset_synthetic()
    test_validate_render_tiers()
    print("validate_test OK")


if __name__ == "__main__":
    main()

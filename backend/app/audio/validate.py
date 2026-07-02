"""Post-render validation: anchor sync, loudness, confidence tier."""

from __future__ import annotations

import librosa
import numpy as np

from .io_utils import SAMPLE_RATE, to_mono
from .models import ConfidenceTier, RemixPlan, RemixValidation


def _tier_from_offset_ms(ms: float) -> tuple[ConfidenceTier, bool, bool]:
    a = abs(ms)
    if a < 40:
        return "high", True, True
    if a < 70:
        return "high", True, False
    if a < 120:
        return "medium", False, False
    return "low", False, False


def measure_anchor_offset(
    mix_mono: np.ndarray,
    sr: int,
    plan: RemixPlan,
    expected_anchor_sec: float,
    search_ms: float = 150.0,
) -> float:
    """Estimate ms error between expected vocal anchor onset and nearest strong onset."""
    if mix_mono.size == 0 or expected_anchor_sec <= 0:
        return 999.0
    hop = 512
    onset_env = librosa.onset.onset_strength(y=mix_mono, sr=sr, hop_length=hop)
    times = librosa.frames_to_time(np.arange(len(onset_env)), sr=sr, hop_length=hop)
    win = search_ms / 1000.0
    mask = (times >= expected_anchor_sec - win) & (times <= expected_anchor_sec + win)
    if not np.any(mask):
        return 999.0
    local_t = times[mask]
    local_e = onset_env[mask]
    if local_e.size == 0:
        return 999.0
    peak_t = float(local_t[int(np.argmax(local_e))])
    return (peak_t - expected_anchor_sec) * 1000.0


def validate_render(
    mix: np.ndarray,
    sr: int,
    plan: RemixPlan,
    mix_report: dict | None = None,
) -> RemixValidation:
    mono = to_mono(mix)
    expected = plan.instrumental_anchor_sec
    offset_ms = measure_anchor_offset(mono, sr, plan, expected)
    tier, passed, ideal = _tier_from_offset_ms(offset_ms)

    warnings: list[str] = []
    if not ideal:
        warnings.append(f"anchor offset {offset_ms:+.0f} ms")
    if not passed:
        warnings.append("sync below acceptable threshold")
    if plan.score < 65:
        warnings.append(f"plan score {plan.score:.0f}/100 below medium confidence")

    out_lufs = mix_report.get("out_lufs") if mix_report else None
    tp = mix_report.get("true_peak_db") if mix_report else None
    if tp is not None and tp > -0.5:
        warnings.append(f"true peak hot ({tp:.1f} dBTP)")

    # Combine plan score tier with offset tier
    if plan.score < 65:
        tier = "low"
    elif plan.score < 80 and tier == "high":
        tier = "medium"

    return RemixValidation(
        anchor_offset_ms=round(offset_ms, 1),
        confidence_tier=tier,
        passed=passed,
        ideal=ideal,
        warnings=warnings,
        out_lufs=out_lufs,
        true_peak_db=tp,
    )

"""Non-blocking loudness quality gate for export readout — display targets only."""

from __future__ import annotations

from dataclasses import dataclass

from artifact_management import LoudnessReadout

GENERAL_TARGET_INTEGRATED_LUFS = -14.0
GENERAL_TARGET_TRUE_PEAK_DBTP = -1.0
LUFS_WARN_TOLERANCE = 2.0
TRUE_PEAK_WARN_TOLERANCE = 0.5


@dataclass
class LoudnessGateEvaluation:
    status: str
    message: str
    integrated_lufs: float | None
    true_peak_dbtp: float | None
    target_integrated_lufs: float
    target_true_peak_dbtp: float


def evaluate_loudness_gate(loudness: LoudnessReadout) -> LoudnessGateEvaluation:
    target_i = GENERAL_TARGET_INTEGRATED_LUFS
    target_tp = GENERAL_TARGET_TRUE_PEAK_DBTP

    if loudness.status == "not_available":
        return LoudnessGateEvaluation(
            status="not_available",
            message=(
                "Loudness gate unavailable — integrated LUFS/true peak could not be measured. "
                "This is not a club-ready master claim."
            ),
            integrated_lufs=loudness.integrated_lufs,
            true_peak_dbtp=loudness.true_peak_dbtp,
            target_integrated_lufs=target_i,
            target_true_peak_dbtp=target_tp,
        )

    integrated = loudness.integrated_lufs
    true_peak = loudness.true_peak_dbtp

    if integrated is None and true_peak is None:
        return LoudnessGateEvaluation(
            status="not_available",
            message="Loudness gate unavailable — no LUFS or true peak values returned.",
            integrated_lufs=None,
            true_peak_dbtp=None,
            target_integrated_lufs=target_i,
            target_true_peak_dbtp=target_tp,
        )

    warn_reasons: list[str] = []

    if integrated is not None and abs(integrated - target_i) > LUFS_WARN_TOLERANCE:
        warn_reasons.append(
            f"integrated loudness {integrated:.1f} LUFS differs from general target {target_i:.0f} LUFS"
        )

    if true_peak is not None and true_peak > target_tp + TRUE_PEAK_WARN_TOLERANCE:
        warn_reasons.append(
            f"true peak {true_peak:.1f} dBTP exceeds general safe target {target_tp:.0f} dBTP"
        )

    if loudness.status == "partial":
        return LoudnessGateEvaluation(
            status="warn",
            message=(
                "Partial loudness data — gate is informational only. "
                + ("; ".join(warn_reasons) if warn_reasons else loudness.message)
            ),
            integrated_lufs=integrated,
            true_peak_dbtp=true_peak,
            target_integrated_lufs=target_i,
            target_true_peak_dbtp=target_tp,
        )

    if warn_reasons:
        return LoudnessGateEvaluation(
            status="warn",
            message="; ".join(warn_reasons) + " — not a mastering pass or club-ready claim.",
            integrated_lufs=integrated,
            true_peak_dbtp=true_peak,
            target_integrated_lufs=target_i,
            target_true_peak_dbtp=target_tp,
        )

    return LoudnessGateEvaluation(
        status="pass",
        message=(
            f"Within general display targets (~{target_i:.0f} LUFS / {target_tp:.0f} dBTP). "
            "Informational gate only — not a club-ready master claim."
        ),
        integrated_lufs=integrated,
        true_peak_dbtp=true_peak,
        target_integrated_lufs=target_i,
        target_true_peak_dbtp=target_tp,
    )

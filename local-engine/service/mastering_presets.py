"""Mastering preset definitions and loudness gate evaluation for prototype mastering."""

from __future__ import annotations

from dataclasses import dataclass

from artifact_management import LoudnessReadout
from loudness_gate import LoudnessGateEvaluation

MEASUREMENT_ONLY_PRESET = "measurement_only"
GENERAL_SAFE_NORMALIZE_PRESET = "general_safe_normalize"
DJ_LOUDNESS_PROTOTYPE_PRESET = "dj_loudness_prototype"

ALLOWED_MASTERING_PRESETS = frozenset(
    {
        MEASUREMENT_ONLY_PRESET,
        GENERAL_SAFE_NORMALIZE_PRESET,
        DJ_LOUDNESS_PROTOTYPE_PRESET,
    }
)

GENERAL_TARGET_INTEGRATED_LUFS = -14.0
GENERAL_TARGET_TRUE_PEAK_DBTP = -1.0
DJ_PROTOTYPE_TARGET_INTEGRATED_LUFS = -9.5
DJ_PROTOTYPE_TARGET_TRUE_PEAK_DBTP = -1.0

LUFS_WARN_TOLERANCE = 2.0
TRUE_PEAK_WARN_TOLERANCE = 0.5


@dataclass(frozen=True)
class MasteringPresetDefinition:
    preset_id: str
    label: str
    description: str
    target_integrated_lufs: float | None
    target_true_peak_dbtp: float
    loudnorm_filter: str | None
    creates_audio: bool
    preset_warnings: tuple[str, ...]


MASTERING_PRESET_DEFINITIONS: dict[str, MasteringPresetDefinition] = {
    MEASUREMENT_ONLY_PRESET: MasteringPresetDefinition(
        preset_id=MEASUREMENT_ONLY_PRESET,
        label="Measurement only",
        description=(
            "Analyze loudness and technical readout from the WAV export without changing audio."
        ),
        target_integrated_lufs=GENERAL_TARGET_INTEGRATED_LUFS,
        target_true_peak_dbtp=GENERAL_TARGET_TRUE_PEAK_DBTP,
        loudnorm_filter=None,
        creates_audio=False,
        preset_warnings=(
            "No audio processing applied — readout only.",
            "Not professional mastering or a club-ready master claim.",
        ),
    ),
    GENERAL_SAFE_NORMALIZE_PRESET: MasteringPresetDefinition(
        preset_id=GENERAL_SAFE_NORMALIZE_PRESET,
        label="General safe normalize",
        description=(
            "FFmpeg loudnorm prototype targeting general playback reference levels "
            "(approximately -14 LUFS integrated / -1 dBTP true peak)."
        ),
        target_integrated_lufs=GENERAL_TARGET_INTEGRATED_LUFS,
        target_true_peak_dbtp=GENERAL_TARGET_TRUE_PEAK_DBTP,
        loudnorm_filter="loudnorm=I=-14:TP=-1:LRA=11",
        creates_audio=True,
        preset_warnings=(
            "General playback reference prototype — not professional mastering.",
            "Gate pass/warn is informational only.",
        ),
    ),
    DJ_LOUDNESS_PROTOTYPE_PRESET: MasteringPresetDefinition(
        preset_id=DJ_LOUDNESS_PROTOTYPE_PRESET,
        label="DJ loudness prototype",
        description=(
            "Conservative louder prototype (~-9.5 LUFS integrated / -1 dBTP ceiling). "
            "For DJ review only — not professional mastering."
        ),
        target_integrated_lufs=DJ_PROTOTYPE_TARGET_INTEGRATED_LUFS,
        target_true_peak_dbtp=DJ_PROTOTYPE_TARGET_TRUE_PEAK_DBTP,
        loudnorm_filter="loudnorm=I=-9.5:TP=-1:LRA=7",
        creates_audio=True,
        preset_warnings=(
            "DJ loudness prototype — may affect dynamics and increase distortion risk.",
            "DJ review required before any live use.",
            "Not a club-mastered or professionally mastered final.",
        ),
    ),
}


def get_mastering_preset(preset_id: str) -> MasteringPresetDefinition | None:
    return MASTERING_PRESET_DEFINITIONS.get(preset_id)


def build_loudnorm_encode_command(
    ffmpeg_binary: str,
    source_wav: str | object,
    output_wav: str | object,
    *,
    loudnorm_filter: str,
) -> list[str]:
    from pathlib import Path

    source = Path(source_wav)
    output = Path(output_wav)
    return [
        ffmpeg_binary,
        "-hide_banner",
        "-y",
        "-i",
        str(source),
        "-af",
        loudnorm_filter,
        str(output),
    ]


def evaluate_mastering_gate(
    preset_id: str,
    loudness: LoudnessReadout,
) -> LoudnessGateEvaluation:
    preset = get_mastering_preset(preset_id)
    if preset is None:
        return LoudnessGateEvaluation(
            status="not_available",
            message="Unknown mastering preset for gate evaluation.",
            integrated_lufs=loudness.integrated_lufs,
            true_peak_dbtp=loudness.true_peak_dbtp,
            target_integrated_lufs=GENERAL_TARGET_INTEGRATED_LUFS,
            target_true_peak_dbtp=GENERAL_TARGET_TRUE_PEAK_DBTP,
        )

    target_i = preset.target_integrated_lufs
    target_tp = preset.target_true_peak_dbtp

    if loudness.status == "not_available":
        return LoudnessGateEvaluation(
            status="not_available",
            message=(
                "Loudness gate unavailable — integrated LUFS/true peak could not be measured. "
                "This is not a professional mastering or club-ready master claim."
            ),
            integrated_lufs=loudness.integrated_lufs,
            true_peak_dbtp=loudness.true_peak_dbtp,
            target_integrated_lufs=target_i if target_i is not None else GENERAL_TARGET_INTEGRATED_LUFS,
            target_true_peak_dbtp=target_tp,
        )

    integrated = loudness.integrated_lufs
    true_peak = loudness.true_peak_dbtp

    if preset_id == MEASUREMENT_ONLY_PRESET:
        return LoudnessGateEvaluation(
            status="not_available" if integrated is None and true_peak is None else "warn",
            message=(
                "Measurement-only preset — no processing applied. "
                "Readout is informational; not a mastering pass claim."
            ),
            integrated_lufs=integrated,
            true_peak_dbtp=true_peak,
            target_integrated_lufs=target_i if target_i is not None else GENERAL_TARGET_INTEGRATED_LUFS,
            target_true_peak_dbtp=target_tp,
        )

    if integrated is None and true_peak is None:
        return LoudnessGateEvaluation(
            status="not_available",
            message="Post-processing loudness gate unavailable — no LUFS or true peak values.",
            integrated_lufs=None,
            true_peak_dbtp=None,
            target_integrated_lufs=target_i if target_i is not None else GENERAL_TARGET_INTEGRATED_LUFS,
            target_true_peak_dbtp=target_tp,
        )

    warn_reasons: list[str] = []

    if target_i is not None and integrated is not None:
        if abs(integrated - target_i) > LUFS_WARN_TOLERANCE:
            warn_reasons.append(
                f"integrated loudness {integrated:.1f} LUFS differs from preset target {target_i:.1f} LUFS"
            )

    if true_peak is not None and true_peak > target_tp + TRUE_PEAK_WARN_TOLERANCE:
        warn_reasons.append(
            f"true peak {true_peak:.1f} dBTP exceeds preset ceiling {target_tp:.1f} dBTP"
        )

    prototype_note = (
        "Prototype mastering gate only — not professional mastering or club-ready quality."
    )

    if preset_id == DJ_LOUDNESS_PROTOTYPE_PRESET:
        prototype_note = (
            "DJ loudness prototype gate — DJ review required. "
            "Not professional mastering or a club-ready master claim."
        )

    if loudness.status == "partial" or warn_reasons:
        return LoudnessGateEvaluation(
            status="warn",
            message=(
                "; ".join(warn_reasons) + " — " + prototype_note
                if warn_reasons
                else loudness.message + " — " + prototype_note
            ),
            integrated_lufs=integrated,
            true_peak_dbtp=true_peak,
            target_integrated_lufs=target_i if target_i is not None else GENERAL_TARGET_INTEGRATED_LUFS,
            target_true_peak_dbtp=target_tp,
        )

    return LoudnessGateEvaluation(
        status="pass",
        message=(
            f"Within preset display targets (~{target_i:.1f} LUFS / {target_tp:.1f} dBTP). "
            + prototype_note
        ),
        integrated_lufs=integrated,
        true_peak_dbtp=true_peak,
        target_integrated_lufs=target_i if target_i is not None else GENERAL_TARGET_INTEGRATED_LUFS,
        target_true_peak_dbtp=target_tp,
    )

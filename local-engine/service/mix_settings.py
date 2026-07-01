"""Mix quality settings validation and FFmpeg filter construction."""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Protocol

GAIN_MIN_DB = -24.0
GAIN_MAX_DB = 12.0
FADE_MAX_MS = 30_000.0
CLIP_THRESHOLD_DBTP = -0.5
NEAR_CEILING_DBTP = -1.0

STEREO_MONO_SAFETY_NOTE = (
    "Stereo/mono safety check is display-only in this phase — verify phase/mono compatibility manually."
)


class LoudnessLike(Protocol):
    integrated_lufs: float | None
    true_peak_dbtp: float | None
    peak_level_db: float | None
    status: str


@dataclass
class MixSettings:
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    master_gain_db: float = 0.0
    vocal_fade_in_ms: float = 0.0
    vocal_fade_out_ms: float = 0.0
    instrumental_fade_in_ms: float = 0.0
    instrumental_fade_out_ms: float = 0.0
    limiter_safety: bool = False
    clipping_guard: bool = False
    instrumental_duck_under_vocal: bool = False


def default_mix_settings() -> MixSettings:
    return MixSettings()


def mix_settings_to_dict(settings: MixSettings) -> dict:
    return asdict(settings)


def mix_settings_from_dict(data: dict | None) -> MixSettings:
    if not data or not isinstance(data, dict):
        return default_mix_settings()

    return MixSettings(
        vocal_gain_db=_safe_float(data.get("vocal_gain_db"), 0.0),
        instrumental_gain_db=_safe_float(data.get("instrumental_gain_db"), 0.0),
        master_gain_db=_safe_float(data.get("master_gain_db"), 0.0),
        vocal_fade_in_ms=_safe_float(data.get("vocal_fade_in_ms"), 0.0),
        vocal_fade_out_ms=_safe_float(data.get("vocal_fade_out_ms"), 0.0),
        instrumental_fade_in_ms=_safe_float(data.get("instrumental_fade_in_ms"), 0.0),
        instrumental_fade_out_ms=_safe_float(data.get("instrumental_fade_out_ms"), 0.0),
        limiter_safety=bool(data.get("limiter_safety")),
        clipping_guard=bool(data.get("clipping_guard")),
        instrumental_duck_under_vocal=bool(data.get("instrumental_duck_under_vocal")),
    )


def validate_mix_settings(
    *,
    vocal_gain_db: float = 0.0,
    instrumental_gain_db: float = 0.0,
    master_gain_db: float = 0.0,
    vocal_fade_in_ms: float = 0.0,
    vocal_fade_out_ms: float = 0.0,
    instrumental_fade_in_ms: float = 0.0,
    instrumental_fade_out_ms: float = 0.0,
    limiter_safety: bool = False,
    clipping_guard: bool = False,
    instrumental_duck_under_vocal: bool = False,
) -> tuple[MixSettings | None, list[str]]:
    errors: list[str] = []

    for label, value in (
        ("vocal_gain_db", vocal_gain_db),
        ("instrumental_gain_db", instrumental_gain_db),
        ("master_gain_db", master_gain_db),
    ):
        if value < GAIN_MIN_DB or value > GAIN_MAX_DB:
            errors.append(f"{label} must be between {GAIN_MIN_DB} and {GAIN_MAX_DB} dB.")

    for label, value in (
        ("vocal_fade_in_ms", vocal_fade_in_ms),
        ("vocal_fade_out_ms", vocal_fade_out_ms),
        ("instrumental_fade_in_ms", instrumental_fade_in_ms),
        ("instrumental_fade_out_ms", instrumental_fade_out_ms),
    ):
        if value < 0 or value > FADE_MAX_MS:
            errors.append(f"{label} must be between 0 and {int(FADE_MAX_MS)} ms.")

    if errors:
        return None, errors

    return (
        MixSettings(
            vocal_gain_db=vocal_gain_db,
            instrumental_gain_db=instrumental_gain_db,
            master_gain_db=master_gain_db,
            vocal_fade_in_ms=vocal_fade_in_ms,
            vocal_fade_out_ms=vocal_fade_out_ms,
            instrumental_fade_in_ms=instrumental_fade_in_ms,
            instrumental_fade_out_ms=instrumental_fade_out_ms,
            limiter_safety=limiter_safety,
            clipping_guard=clipping_guard,
            instrumental_duck_under_vocal=instrumental_duck_under_vocal,
        ),
        [],
    )


def validate_mix_settings_payload(data: dict | None) -> tuple[MixSettings, list[str]]:
    if not data:
        return default_mix_settings(), []

    settings, errors = validate_mix_settings(
        vocal_gain_db=_safe_float(data.get("vocal_gain_db"), 0.0),
        instrumental_gain_db=_safe_float(data.get("instrumental_gain_db"), 0.0),
        master_gain_db=_safe_float(data.get("master_gain_db"), 0.0),
        vocal_fade_in_ms=_safe_float(data.get("vocal_fade_in_ms"), 0.0),
        vocal_fade_out_ms=_safe_float(data.get("vocal_fade_out_ms"), 0.0),
        instrumental_fade_in_ms=_safe_float(data.get("instrumental_fade_in_ms"), 0.0),
        instrumental_fade_out_ms=_safe_float(data.get("instrumental_fade_out_ms"), 0.0),
        limiter_safety=bool(data.get("limiter_safety")),
        clipping_guard=bool(data.get("clipping_guard")),
        instrumental_duck_under_vocal=bool(data.get("instrumental_duck_under_vocal")),
    )
    if settings is None:
        return default_mix_settings(), errors
    return settings, errors


def _append_gain(chain: str, gain_db: float) -> str:
    if abs(gain_db) >= 0.01:
        return f"{chain},volume={gain_db:.2f}dB"
    return chain


def _append_fades(chain: str, fade_in_ms: float, fade_out_ms: float, duration_sec: float | None) -> str:
    if fade_in_ms > 0:
        chain = f"{chain},afade=t=in:st=0:d={fade_in_ms / 1000:.3f}"
    if fade_out_ms > 0 and duration_sec is not None:
        fade_out_sec = fade_out_ms / 1000
        if duration_sec > fade_out_sec:
            start = max(0.0, duration_sec - fade_out_sec)
            chain = f"{chain},afade=t=out:st={start:.3f}:d={fade_out_sec:.3f}"
    return chain


def build_mix_filter_complex(
    *,
    alignment_offset_ms: float,
    mix_settings: MixSettings,
    max_seconds: int | None = None,
    duration_sec: float | None = None,
) -> str:
    vocal_delay = max(0, int(round(alignment_offset_ms)))
    bed_delay = max(0, int(round(-alignment_offset_ms)))
    segment_duration = float(max_seconds) if max_seconds is not None else duration_sec

    bed_chain = "[0:a]asetpts=PTS-STARTPTS"
    if max_seconds is not None:
        bed_chain = f"[0:a]atrim=0:{max_seconds},asetpts=PTS-STARTPTS"
    if bed_delay > 0:
        bed_chain += f",adelay={bed_delay}|{bed_delay}"
    bed_chain = _append_gain(bed_chain, mix_settings.instrumental_gain_db)
    bed_chain = _append_fades(
        bed_chain,
        mix_settings.instrumental_fade_in_ms,
        mix_settings.instrumental_fade_out_ms,
        segment_duration,
    )
    bed_chain += "[bed]"

    vocal_chain = "[1:a]asetpts=PTS-STARTPTS"
    if max_seconds is not None:
        vocal_chain = f"[1:a]atrim=0:{max_seconds},asetpts=PTS-STARTPTS"
    if vocal_delay > 0:
        vocal_chain += f",adelay={vocal_delay}|{vocal_delay}"
    vocal_chain = _append_gain(vocal_chain, mix_settings.vocal_gain_db)
    vocal_chain = _append_fades(
        vocal_chain,
        mix_settings.vocal_fade_in_ms,
        mix_settings.vocal_fade_out_ms,
        segment_duration,
    )
    vocal_chain += "[voc]"

    parts = [bed_chain, vocal_chain]
    if mix_settings.instrumental_duck_under_vocal:
        parts.append(
            "[bed][voc]sidechaincompress=threshold=0.02:ratio=2.5:attack=20:release=300[ducked_bed]"
        )
        parts.append("[ducked_bed][voc]amix=inputs=2:duration=shortest:normalize=0[mix]")
    else:
        parts.append("[bed][voc]amix=inputs=2:duration=shortest:normalize=0[mix]")
    current_label = "[mix]"

    if abs(mix_settings.master_gain_db) >= 0.01:
        parts.append(f"{current_label}volume={mix_settings.master_gain_db:.2f}dB[mixgain]")
        current_label = "[mixgain]"

    if mix_settings.clipping_guard:
        parts.append(f"{current_label}alimiter=limit=-1dB:attack=1:release=50[out]")
    elif mix_settings.limiter_safety:
        parts.append(f"{current_label}alimiter=limit=0.95:attack=5:release=50[out]")
    elif current_label != "[out]":
        parts.append(f"{current_label}anull[out]")
    else:
        parts[-1] = parts[-1].replace("[mix]", "[out]")

    return ";".join(parts)


def build_mix_processing_notes(settings: MixSettings) -> list[str]:
    notes: list[str] = []
    if settings.limiter_safety:
        notes.append("Conservative FFmpeg alimiter prototype applied on master bus — not professional mastering.")
    if settings.clipping_guard:
        notes.append("Clipping guard prototype applied (~-1 dBTP ceiling) — DJ review required.")
    if settings.instrumental_duck_under_vocal:
        notes.append(
            "Light instrumental duck under vocal (sidechaincompress prototype) — DJ review required."
        )
    if not settings.limiter_safety and not settings.clipping_guard:
        notes.append("No mix-stage limiter or clipping guard applied.")
    return notes


def format_mix_summary(settings: MixSettings) -> str:
    parts = [
        f"vocal {settings.vocal_gain_db:+.1f} dB",
        f"bed {settings.instrumental_gain_db:+.1f} dB",
        f"master {settings.master_gain_db:+.1f} dB",
    ]
    if settings.limiter_safety:
        parts.append("limiter on")
    if settings.clipping_guard:
        parts.append("clip guard on")
    if settings.instrumental_duck_under_vocal:
        parts.append("bed duck on")
    return " · ".join(parts)


def build_loudness_clipping_warnings(loudness: LoudnessLike) -> list[str]:
    warnings: list[str] = []
    true_peak = loudness.true_peak_dbtp
    peak = loudness.peak_level_db

    if loudness.status == "not_available":
        warnings.append("Loudness/peaks not_available — clipping risk could not be measured.")
        return warnings

    display_peak = true_peak if true_peak is not None else peak
    if display_peak is not None:
        if display_peak > CLIP_THRESHOLD_DBTP:
            warnings.append(
                f"True peak {display_peak:.1f} dBTP exceeds safe threshold — possible clipping. DJ review required."
            )
        elif display_peak > NEAR_CEILING_DBTP:
            warnings.append(
                f"True peak {display_peak:.1f} dBTP near ceiling — DJ review recommended."
            )
    else:
        warnings.append("True peak not_available — could not evaluate clipping risk.")

    if loudness.integrated_lufs is not None:
        warnings.append(
            f"Integrated loudness {loudness.integrated_lufs:.1f} LUFS ({loudness.status})."
        )
    elif loudness.status == "partial":
        warnings.append("Integrated LUFS not_available — peak-only readout.")

    return warnings


def _safe_float(value: object, default: float) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default

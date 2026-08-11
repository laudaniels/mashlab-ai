"""Pitch/time planning helpers — planning only, no audio processing."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TempoDirection = Literal["speed_up", "slow_down", "none", "unknown"]
MashIntent = Literal["vocal_a_over_beat_b", "vocal_b_over_beat_a", "compare_both"]

PLANNING_ONLY_NOTICE = (
    "Planning only — no audio has been processed yet. Rubber Band processing is a future lane."
)

SAFE_PITCH_SHIFT_SEMITONES = 4
WARN_PITCH_SHIFT_SEMITONES = 6

KEY_SEMITONE = {
    "C": 0,
    "C#": 1,
    "Db": 1,
    "D": 2,
    "D#": 3,
    "Eb": 3,
    "E": 4,
    "F": 5,
    "F#": 6,
    "Gb": 6,
    "G": 7,
    "G#": 8,
    "Ab": 8,
    "A": 9,
    "A#": 10,
    "Bb": 10,
    "B": 11,
}


class TrackPlanInput(BaseModel):
    label: str
    bpm: float | None = None
    key: str | None = None
    mode: Literal["major", "minor", "unknown"] = "unknown"
    camelot: str | None = None


class PitchTimePlanRequest(BaseModel):
    intent: MashIntent = "compare_both"
    track_a: TrackPlanInput
    track_b: TrackPlanInput
    custom_target_bpm: float | None = None


class PitchTimeDirectionPlan(BaseModel):
    intent_label: str
    vocal_track_label: str
    instrumental_track_label: str
    source_bpm: float | None = None
    target_bpm: float | None = None
    custom_target_bpm: float | None = None
    bpm_difference: float | None = None
    tempo_stretch_ratio: float | None = None
    tempo_stretch_percent: float | None = None
    tempo_direction: TempoDirection = "unknown"
    instrumental_tempo_stretch_ratio: float | None = None
    instrumental_tempo_stretch_percent: float | None = None
    instrumental_tempo_direction: TempoDirection = "unknown"
    tempo_plan_summary: str
    suggested_pitch_shift_semitones: float | None = None
    safe_range_warning: str | None = None
    formant_preservation_note: str
    vocal_adjustment_note: str
    instrumental_adjustment_note: str
    limitations: list[str] = Field(default_factory=list)


class PitchTimePlanResult(BaseModel):
    intent: MashIntent
    directions: list[PitchTimeDirectionPlan]
    limitations: list[str] = Field(default_factory=list)
    dj_review_required: bool = True
    audio_processed: bool = False
    planning_only_notice: str = PLANNING_ONLY_NOTICE


class PitchTimePlanResponse(BaseModel):
    ok: bool
    status: str
    message: str
    plan: PitchTimePlanResult | None = None


def compute_tempo_stretch_ratio(source_bpm: float | None, target_bpm: float | None) -> float | None:
    if source_bpm is None or target_bpm is None or source_bpm <= 0 or target_bpm <= 0:
        return None
    return round(target_bpm / source_bpm, 3)


def compute_tempo_stretch_percent(ratio: float | None) -> float | None:
    if ratio is None:
        return None
    return round((ratio - 1) * 100, 1)


def resolve_tempo_direction(ratio: float | None) -> TempoDirection:
    if ratio is None:
        return "unknown"
    if abs(ratio - 1) < 0.005:
        return "none"
    return "speed_up" if ratio > 1 else "slow_down"


def build_safe_range_warning(semitones: float | None) -> str | None:
    if semitones is None:
        return None
    abs_value = abs(semitones)
    if abs_value > WARN_PITCH_SHIFT_SEMITONES:
        return (
            f"Suggested pitch shift ({semitones} semitones) exceeds the "
            f"{WARN_PITCH_SHIFT_SEMITONES}-semitone vocal-safe range."
        )
    if abs_value > SAFE_PITCH_SHIFT_SEMITONES:
        return (
            f"Suggested pitch shift ({semitones} semitones) is outside the "
            f"{SAFE_PITCH_SHIFT_SEMITONES}-semitone comfort zone."
        )
    return None


def _key_to_semitone(key: str | None) -> int | None:
    if not key:
        return None
    return KEY_SEMITONE.get(key.strip())


def _shortest_signed_semitone_delta(source: int, target: int) -> int:
    delta = (target - source + 12) % 12
    if delta > 6:
        delta -= 12
    return delta


def _parse_camelot(code: str | None) -> tuple[int, str] | None:
    if not code or len(code) < 2:
        return None
    mode = code[-1].upper()
    number = int(code[:-1])
    if mode not in {"A", "B"} or number < 1 or number > 12:
        return None
    return number, mode


def _classify_camelot(a: str | None, b: str | None) -> str:
    if not a or not b:
        return "unknown"
    if a.upper() == b.upper():
        return "strong"
    parsed_a = _parse_camelot(a)
    parsed_b = _parse_camelot(b)
    if not parsed_a or not parsed_b:
        return "unknown"
    if parsed_a[0] == parsed_b[0] and parsed_a[1] != parsed_b[1]:
        return "compatible"
    raw = abs(parsed_a[0] - parsed_b[0])
    delta = min(raw, 12 - raw)
    if delta == 1 and parsed_a[1] == parsed_b[1]:
        return "compatible"
    return "risky"


def _suggest_vocal_shift(instrumental: TrackPlanInput, vocal: TrackPlanInput) -> float | None:
    semitone_a = _key_to_semitone(instrumental.key)
    semitone_b = _key_to_semitone(vocal.key)
    if semitone_a is None or semitone_b is None:
        return None
    instrumental_shift = _shortest_signed_semitone_delta(semitone_b, semitone_a)
    if _classify_camelot(instrumental.camelot, vocal.camelot) == "strong":
        return 0
    shift = -instrumental_shift
    if shift > 6:
        shift -= 12
    if shift < -6:
        shift += 12
    return float(shift)


def _format_tempo_summary(vocal_label: str, target_label: str, percent: float | None, direction: TempoDirection) -> str:
    if percent is None or direction == "unknown":
        return (
            f"{vocal_label} tempo adjustment toward {target_label} is unavailable "
            "until BPM exists for both tracks."
        )
    if direction == "none":
        return f"{vocal_label} tempo is already close to {target_label}."
    sign = "+" if percent > 0 else ""
    verb = "speed up" if direction == "speed_up" else "slow down"
    return (
        f"{vocal_label} would need {sign}{percent:.1f}% tempo adjustment ({verb}) "
        f"to sit over {target_label}. Planning only."
    )


def _format_track_stretch_note(label: str, ratio: float | None, target_label: str) -> str:
    if ratio is None:
        return f"{label}: tempo adjustment unavailable."
    return f"{label}: apply tempo stretch ratio {ratio:.3f} toward {target_label} when processing exists."


def _build_direction(
    vocal: TrackPlanInput,
    instrumental: TrackPlanInput,
    intent_label: str,
    custom_target_bpm: float | None = None,
) -> PitchTimeDirectionPlan:
    effective_custom_target = custom_target_bpm if custom_target_bpm and custom_target_bpm > 0 else None
    target_bpm = effective_custom_target if effective_custom_target is not None else instrumental.bpm

    ratio = compute_tempo_stretch_ratio(vocal.bpm, target_bpm)
    percent = compute_tempo_stretch_percent(ratio)
    direction = resolve_tempo_direction(ratio)

    instrumental_ratio = compute_tempo_stretch_ratio(instrumental.bpm, target_bpm)
    instrumental_percent = compute_tempo_stretch_percent(instrumental_ratio)
    instrumental_direction = resolve_tempo_direction(instrumental_ratio)

    vocal_shift = _suggest_vocal_shift(instrumental, vocal)
    bpm_difference = None
    if vocal.bpm is not None and instrumental.bpm is not None:
        bpm_difference = round(abs(vocal.bpm - instrumental.bpm), 1)

    formant_note = (
        "Recommend Rubber Band formant preservation for vocal pitch shifts. Not applied in this phase."
        if vocal_shift not in (None, 0)
        else "Formant preservation matters when vocal pitch shift is non-zero."
    )

    target_label = f"{effective_custom_target} BPM target" if effective_custom_target is not None else instrumental.label

    return PitchTimeDirectionPlan(
        intent_label=intent_label,
        vocal_track_label=vocal.label,
        instrumental_track_label=instrumental.label,
        source_bpm=vocal.bpm,
        target_bpm=target_bpm,
        custom_target_bpm=effective_custom_target,
        bpm_difference=bpm_difference,
        tempo_stretch_ratio=ratio,
        tempo_stretch_percent=percent,
        tempo_direction=direction,
        instrumental_tempo_stretch_ratio=instrumental_ratio,
        instrumental_tempo_stretch_percent=instrumental_percent,
        instrumental_tempo_direction=instrumental_direction,
        tempo_plan_summary=_format_tempo_summary(vocal.label, target_label, percent, direction),
        suggested_pitch_shift_semitones=vocal_shift,
        safe_range_warning=build_safe_range_warning(vocal_shift),
        formant_preservation_note=formant_note,
        vocal_adjustment_note=_format_track_stretch_note(vocal.label, ratio, target_label),
        instrumental_adjustment_note=(
            f"{instrumental.label}: keep as tempo/key anchor unless DJ chooses otherwise."
            if instrumental_direction == "none"
            else _format_track_stretch_note(instrumental.label, instrumental_ratio, target_label)
        ),
        limitations=[
            "Planning assumption: full track treated as vocal/instrumental role.",
            PLANNING_ONLY_NOTICE,
        ],
    )


def build_pitch_time_plan(request: PitchTimePlanRequest) -> PitchTimePlanResult:
    pairs: list[tuple[str, TrackPlanInput, TrackPlanInput]] = []
    if request.intent == "vocal_a_over_beat_b":
        pairs = [("Vocal A over Beat B", request.track_a, request.track_b)]
    elif request.intent == "vocal_b_over_beat_a":
        pairs = [("Vocal B over Beat A", request.track_b, request.track_a)]
    else:
        pairs = [
            ("Vocal A over Beat B", request.track_a, request.track_b),
            ("Vocal B over Beat A", request.track_b, request.track_a),
        ]

    directions = [
        _build_direction(vocal, instrumental, label, request.custom_target_bpm)
        for label, vocal, instrumental in pairs
    ]

    return PitchTimePlanResult(
        intent=request.intent,
        directions=directions,
        limitations=[
            PLANNING_ONLY_NOTICE,
            "Stem separation is not implemented. Vocal/instrumental roles are planning assumptions only.",
        ],
        dj_review_required=True,
        audio_processed=False,
        planning_only_notice=PLANNING_ONLY_NOTICE,
    )

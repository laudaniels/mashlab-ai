"""Harmonic compatibility via Camelot wheel (Mixed In Key model)."""

from __future__ import annotations

from .models import HarmonicCompat

# Camelot: major = B side (1B-12B), minor = A side (1A-12A)
# Pitch class 0=C ... 11=B
_CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]
_CAMELOT_MAJOR = ["3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B", "8B"]

# Relative major/minor pairs (same key signature center)
_RELATIVE = {
    "1A": "1B", "1B": "1A", "2A": "2B", "2B": "2A",
    "3A": "3B", "3B": "3A", "4A": "4B", "4B": "4A",
    "5A": "5B", "5B": "5A", "6A": "6B", "6B": "6A",
    "7A": "7B", "7B": "7A", "8A": "8B", "8B": "8A",
    "9A": "9B", "9B": "9A", "10A": "10B", "10B": "10A",
    "11A": "11B", "11B": "11A", "12A": "12B", "12B": "12A",
}


def to_camelot(key_index: int, mode: str) -> str:
    idx = int(key_index) % 12
    if mode == "minor":
        return _CAMELOT_MINOR[idx]
    return _CAMELOT_MAJOR[idx]


def _parse_camelot(code: str) -> tuple[int, str]:
    n = int(code[:-1])
    letter = code[-1].upper()
    return n, letter


def camelot_distance(a: str, b: str) -> tuple[int, bool]:
    """Return (number distance mod 12, same_letter)."""
    na, la = _parse_camelot(a)
    nb, lb = _parse_camelot(b)
    dist = min((nb - na) % 12, (na - nb) % 12)
    return dist, la == lb


def evaluate_harmony(
    vocal_key_index: int,
    vocal_mode: str,
    vocal_key_confidence: float,
    instr_key_index: int,
    instr_mode: str,
    pitch_shift_semitones: float = 0.0,
) -> tuple[HarmonicCompat, float, list[str], float]:
    """Return (compatibility, score_0_15, warnings, recommended_semitones)."""
    warnings: list[str] = []
    if vocal_key_confidence < 0.35:
        warnings.append("key confidence low; no pitch correction applied")
        return "weak", 5.0, warnings, 0.0

    v_cam = to_camelot(vocal_key_index, vocal_mode)
    i_cam = to_camelot(instr_key_index, instr_mode)

    # After pitch shift, vocal effective key moves
    eff_index = (vocal_key_index + int(round(pitch_shift_semitones))) % 12
    eff_cam = to_camelot(eff_index, vocal_mode)

    if eff_cam == i_cam:
        compat: HarmonicCompat = "exact"
        score = 15.0
    elif _RELATIVE.get(eff_cam) == i_cam or _RELATIVE.get(i_cam) == eff_cam:
        compat = "compatible"
        score = 12.0
    else:
        dist, same_letter = camelot_distance(eff_cam, i_cam)
        if same_letter and dist == 1:
            compat = "compatible"
            score = 12.0
        elif same_letter and dist == 0:
            compat = "exact"
            score = 15.0
        elif dist <= 1:
            compat = "energy_boost"
            score = 10.0
        else:
            compat = "clash"
            score = 0.0
            warnings.append(f"keys may clash ({eff_cam} vs {i_cam})")

    abs_shift = abs(pitch_shift_semitones)
    if abs_shift > 3:
        score = min(score, 2.0)
        warnings.append(f"pitch shift {pitch_shift_semitones:+.0f} st is large")
    elif abs_shift == 3:
        score = min(score, 8.0)
        warnings.append("pitch shift ±3 st — use with caution")
    elif abs_shift in (1, 2):
        score = min(score + 0.5, 15.0)

    recommended = float(
        _shortest_semitone(vocal_key_index, instr_key_index)
    )
    return compat, score, warnings, recommended


def _shortest_semitone(from_index: int, to_index: int) -> int:
    diff = (to_index - from_index) % 12
    if diff > 6:
        diff -= 12
    return int(diff)

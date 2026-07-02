"""Remix Brain domain models (Phase 42)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

SourceRole = Literal["vocal", "instrumental"]
AnchorType = Literal["beat", "downbeat", "phrase"]
PhraseAlignment = Literal["exact", "near", "weak"]
HarmonicCompat = Literal["exact", "compatible", "energy_boost", "weak", "clash"]
RemixMode = Literal["clean_blend"]
ConfidenceTier = Literal["high", "medium", "low"]


@dataclass
class RemixAnalysis:
    source_role: SourceRole
    duration_seconds: float
    bpm: float | None
    bpm_confidence: float
    beats: list[float]
    downbeats: list[float]
    downbeat_confidence: float
    phrase_starts: list[float]
    phrase_length_bars: int | None
    key: str | None
    camelot: str | None
    key_confidence: float
    energy_curve: list[float]
    vocal_density_curve: list[float] | None
    transient_strength_curve: list[float]
    analysis_basis: str
    beats_per_bar: int = 4
    grid_bpm_clean: float = 0.0
    beat_phase_sec: float = 0.0
    bar_phase_sec: float = 0.0
    tempo_constant: bool = True
    tempo_cv: float = 0.0
    grid_fit_ms: float = 0.0
    key_index: int = 0
    mode: str = "major"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RemixPlan:
    mode: RemixMode
    target_bpm: float
    vocal_start_seconds: float
    instrumental_start_seconds: float
    vocal_anchor_sec: float
    instrumental_anchor_sec: float
    vocal_anchor_type: AnchorType
    instrumental_anchor_type: AnchorType
    tempo_ratio: float
    vocal_pitch_shift_semitones: float
    phrase_alignment: PhraseAlignment
    harmonic_compatibility: HarmonicCompat
    score: float
    warnings: list[str] = field(default_factory=list)
    reason_summary: str = ""
    score_breakdown: dict = field(default_factory=dict)
    vocal_bpm_effective: float = 0.0
    vocal_tempo_mult: float = 1.0
    shift_seconds: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class RemixValidation:
    anchor_offset_ms: float
    confidence_tier: ConfidenceTier
    passed: bool
    ideal: bool
    warnings: list[str] = field(default_factory=list)
    out_lufs: float | None = None
    true_peak_db: float | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def confidence_tier_from_score(score: float) -> ConfidenceTier:
    if score >= 80:
        return "high"
    if score >= 65:
        return "medium"
    return "low"

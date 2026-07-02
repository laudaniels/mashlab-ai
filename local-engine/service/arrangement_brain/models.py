"""Arrangement Brain domain models (Phase 43)."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal

ArrangementMode = Literal["clean_blend", "hook_remix", "dj_edit"]
SectionLabel = Literal["intro", "hook", "break", "outro", "mix", "vocal", "instrumental"]
SectionSource = Literal["vocal", "instrumental", "mix"]
AnchorType = Literal["beat", "downbeat", "phrase"]
ConfidenceTier = Literal["high", "medium", "low"]

MODE_LABELS: dict[str, str] = {
    "clean_blend": "Clean Blend",
    "hook_remix": "Hook Remix",
    "dj_edit": "DJ Edit",
}


@dataclass
class ArrangementSection:
    label: SectionLabel
    source: SectionSource
    start_seconds: float
    duration_seconds: float
    start_bar: int
    bar_length: int
    fade_in_ms: float = 0.0
    fade_out_ms: float = 0.0
    ducking: bool = False
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    anchor_type: AnchorType = "phrase"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ArrangementPlan:
    mode: ArrangementMode
    mode_label: str
    target_bpm: float
    sections: list[ArrangementSection]
    warnings: list[str] = field(default_factory=list)
    score: float = 0.0
    confidence_tier: ConfidenceTier = "medium"
    score_breakdown: dict = field(default_factory=dict)
    remix_plan: dict | None = None
    summary_line: str = ""
    total_duration_seconds: float = 0.0
    tempo_label: str = ""
    key_label: str = ""
    sync_label: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def confidence_tier_from_score(score: float) -> ConfidenceTier:
    if score >= 80:
        return "high"
    if score >= 65:
        return "medium"
    return "low"


def arrangement_summary_line(sections: list[ArrangementSection]) -> str:
    labels: list[str] = []
    for section in sections:
        label = section.label.replace("_", " ").title()
        if not labels or labels[-1] != label:
            labels.append(label)
    return " → ".join(labels) if labels else "Mix"

"""Optional beat-detection engine adapters (BeatNet/madmom/Essentia stubs)."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BeatDetectionResult:
    bpm: float
    beats: list[float]
    downbeats: list[float]
    confidence: float
    source: str


def beat_this_available() -> bool:
    try:
        from . import beatgrid
        return beatgrid.beat_this_available()
    except Exception:
        return False


def beatnet_available() -> bool:
    return False


def madmom_available() -> bool:
    return False


def essentia_available() -> bool:
    return False

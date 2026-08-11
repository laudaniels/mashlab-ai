"""Shared types and mapping for advanced rhythm engine adapters."""

from __future__ import annotations

import importlib.util
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

EngineId = Literal["essentia", "beatnet", "madmom"]

PhraseBasis = Literal[
    "verified_downbeat",
    "verified_phrase",
    "heuristic_from_beats",
    "unavailable",
]

BASIS_PRIORITY: dict[str, int] = {
    "verified_phrase": 0,
    "verified_downbeat": 1,
    "heuristic_from_beats": 2,
    "unavailable": 3,
}

ESSENTIA_SETUP = (
    "Essentia (optional): Linux/macOS recommended. "
    "Try: pip install essentia (pre-built wheels on some platforms). "
    "Windows Python 3.12 often requires WSL or conda-forge — source build needs Unix tooling."
)
MADMOM_SETUP = (
    "madmom (optional): pip install cython numpy scipy madmom. "
    "Best on Linux/macOS with Cython build tools. "
    "Provides DBNDownBeatTracker for verified downbeat analysis."
)
BEATNET_SETUP = (
    "BeatNet+ (optional): planned adapter — install when BeatNet+ package is configured for your platform."
)


@dataclass(frozen=True)
class EngineStatus:
    engine_id: EngineId
    importable: bool
    status: str
    message: str
    setup_guidance: str
    version: str | None = None


@dataclass
class RhythmEngineOutput:
    engine_id: EngineId
    method_used: str
    phrase_basis: PhraseBasis
    beat_times: list[float] = field(default_factory=list)
    downbeat_times: list[float] = field(default_factory=list)
    phrase_start_times: list[float] = field(default_factory=list)
    phrase_length_bars: int = 8
    bpm: float | None = None
    confidence: float | None = None
    limitations: list[str] = field(default_factory=list)


def module_importable(module_name: str) -> tuple[bool, str | None]:
    if module_name in sys.modules:
        module = sys.modules[module_name]
        version = getattr(module, "__version__", None)
        return True, str(version) if version is not None else None
    spec = importlib.util.find_spec(module_name)
    if spec is None:
        return False, None
    try:
        module = importlib.util.module_from_spec(spec)
        if spec.loader is None:
            return False, None
        # Register before exec so self-referencing imports inside the module
        # (e.g. essentia's __init__.py) resolve the same way a normal
        # `import module_name` would.
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        version = getattr(module, "__version__", None)
        return True, str(version) if version is not None else None
    except Exception:
        sys.modules.pop(module_name, None)
        return False, None


def phrase_starts_from_downbeats(
    downbeat_times: list[float],
    phrase_length_bars: int,
) -> list[float]:
    if not downbeat_times:
        return []
    starts: list[float] = []
    for index in range(0, len(downbeat_times), phrase_length_bars):
        starts.append(downbeat_times[index])
    return starts


def phrase_starts_from_beats(beat_times: list[float], phrase_length_bars: int) -> list[float]:
    phrase_length_beats = phrase_length_bars * 4
    if len(beat_times) < phrase_length_beats:
        return []
    starts: list[float] = []
    for index in range(0, len(beat_times), phrase_length_beats):
        starts.append(beat_times[index])
    return starts


def pick_stronger_basis(current: PhraseBasis, candidate: PhraseBasis) -> PhraseBasis:
    return candidate if BASIS_PRIORITY[candidate] < BASIS_PRIORITY[current] else current


def pick_best_output(outputs: list[RhythmEngineOutput]) -> RhythmEngineOutput | None:
    if not outputs:
        return None
    return min(outputs, key=lambda item: BASIS_PRIORITY.get(item.phrase_basis, 99))


def setup_guidance_for(engine_id: EngineId) -> str:
    return {
        "essentia": ESSENTIA_SETUP,
        "madmom": MADMOM_SETUP,
        "beatnet": BEATNET_SETUP,
    }[engine_id]

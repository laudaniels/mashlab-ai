"""madmom downbeat engine adapter — DBNDownBeatTracker when importable."""

from __future__ import annotations

from pathlib import Path

from rhythm_engines.base import (
    MADMOM_SETUP,
    EngineStatus,
    PhraseBasis,
    RhythmEngineOutput,
    module_importable,
    phrase_starts_from_downbeats,
    pick_stronger_basis,
)

ENGINE_ID = "madmom"


def check_status() -> EngineStatus:
    importable, version = module_importable("madmom")
    if importable:
        return EngineStatus(
            engine_id=ENGINE_ID,
            importable=True,
            status="available",
            message="madmom is importable — DBNDownBeatTracker verified downbeat analysis may run.",
            setup_guidance=MADMOM_SETUP,
            version=version,
        )
    return EngineStatus(
        engine_id=ENGINE_ID,
        importable=False,
        status="not_configured",
        message="madmom is not installed in this service environment.",
        setup_guidance=MADMOM_SETUP,
    )


def analyze(file_path: Path, phrase_length_bars: int) -> RhythmEngineOutput | None:
    importable, _version = module_importable("madmom")
    if not importable:
        return None

    try:
        from madmom.features.downbeats import DBNDownBeatProcessor, DBNDownBeatTracker
    except Exception:
        return None

    try:
        processor = DBNDownBeatProcessor(fps=100)
        activations = processor(str(file_path))
        tracker = DBNDownBeatTracker(beat_per_bar=[4, 4], fps=100)
        beat_positions = tracker(activations)

        if beat_positions is None or len(beat_positions) == 0:
            return None

        all_beat_times: list[float] = []
        downbeat_times: list[float] = []
        for row in beat_positions:
            time_seconds = round(float(row[0]), 4)
            beat_in_bar = int(row[1])
            all_beat_times.append(time_seconds)
            if beat_in_bar == 1:
                downbeat_times.append(time_seconds)

        if not downbeat_times:
            return None

        phrase_starts = phrase_starts_from_downbeats(downbeat_times, phrase_length_bars)
        basis: PhraseBasis = "unavailable"
        if phrase_starts:
            basis = "verified_phrase"
        elif downbeat_times:
            basis = "verified_downbeat"
        basis = pick_stronger_basis("unavailable", basis)

        limitations = [
            "madmom DBNDownBeatTracker — assumes 4/4 meter.",
            "Downbeats are model-detected, not song-structure labels.",
            "DJ review required before live use.",
        ]

        return RhythmEngineOutput(
            engine_id=ENGINE_ID,
            method_used="madmom_dbn_downbeat_tracker",
            phrase_basis=basis,
            beat_times=all_beat_times,
            downbeat_times=downbeat_times,
            phrase_start_times=phrase_starts,
            phrase_length_bars=phrase_length_bars,
            bpm=None,
            confidence=None,
            limitations=limitations,
        )
    except Exception:
        return None

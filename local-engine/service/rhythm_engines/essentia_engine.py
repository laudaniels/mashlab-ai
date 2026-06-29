"""Essentia rhythm engine adapter — lazy import, real beat extraction when available."""

from __future__ import annotations

from pathlib import Path

from rhythm_engines.base import (
    ESSENTIA_SETUP,
    EngineStatus,
    PhraseBasis,
    RhythmEngineOutput,
    module_importable,
    phrase_starts_from_beats,
)

ENGINE_ID = "essentia"


def check_status() -> EngineStatus:
    importable, version = module_importable("essentia")
    if importable:
        return EngineStatus(
            engine_id=ENGINE_ID,
            importable=True,
            status="available",
            message="Essentia is importable — RhythmExtractor2013 beat extraction may run.",
            setup_guidance=ESSENTIA_SETUP,
            version=version,
        )
    return EngineStatus(
        engine_id=ENGINE_ID,
        importable=False,
        status="not_configured",
        message="Essentia is not installed in this service environment.",
        setup_guidance=ESSENTIA_SETUP,
    )


def analyze(file_path: Path, phrase_length_bars: int) -> RhythmEngineOutput | None:
    importable, _version = module_importable("essentia")
    if not importable:
        return None

    try:
        import essentia.standard as es  # type: ignore[import-untyped]
        import numpy as np
    except Exception:
        return None

    try:
        loader = es.MonoLoader(filename=str(file_path), sampleRate=44100)
        audio = loader()
        if len(audio) == 0:
            return None

        rhythm = es.RhythmExtractor2013(method="multifeature")
        bpm, beats, beat_confidences, _, _ = rhythm(audio)

        beat_times = [round(float(value), 4) for value in beats]
        if not beat_times:
            return None

        confidence: float | None = None
        if len(beat_confidences) > 0:
            confidence = round(float(np.mean(beat_confidences)), 4)

        phrase_starts = phrase_starts_from_beats(beat_times, phrase_length_bars)
        basis: PhraseBasis = "heuristic_from_beats" if phrase_starts else "unavailable"

        limitations = [
            "Essentia RhythmExtractor2013 beat extraction — not verified downbeats.",
            "Phrase windows derived from Essentia beats are heuristic, not verified phrase markers.",
            "Assumes 4/4 when grouping beats into phrase windows.",
            "DJ review required before live use.",
        ]

        return RhythmEngineOutput(
            engine_id=ENGINE_ID,
            method_used="essentia_rhythm_extractor2013",
            phrase_basis=basis,
            beat_times=beat_times,
            downbeat_times=[],
            phrase_start_times=phrase_starts,
            phrase_length_bars=phrase_length_bars,
            bpm=round(float(bpm), 2) if bpm is not None else None,
            confidence=confidence,
            limitations=limitations,
        )
    except Exception:
        return None

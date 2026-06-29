"""Registry and orchestration for advanced rhythm engine adapters."""

from __future__ import annotations

from pathlib import Path

from models import PhraseAnalysisResult
from rhythm_engines import beatnet_engine, essentia_engine, madmom_engine
from rhythm_engines.base import (
    EngineId,
    EngineStatus,
    RhythmEngineOutput,
    pick_best_output,
    setup_guidance_for,
)

ENGINE_IDS: tuple[EngineId, ...] = ("essentia", "madmom", "beatnet")

_AUTO_TRY_ORDER: tuple[EngineId, ...] = ("essentia", "madmom", "beatnet")

_ENGINE_MODULES = {
    "essentia": essentia_engine,
    "madmom": madmom_engine,
    "beatnet": beatnet_engine,
}


def engine_status(engine_id: EngineId) -> EngineStatus:
    return _ENGINE_MODULES[engine_id].check_status()


def engine_setup_guidance(engine_id: EngineId) -> str:
    return setup_guidance_for(engine_id)


def analyze_with_engine(
    engine_id: EngineId,
    file_path: Path,
    phrase_length_bars: int,
) -> RhythmEngineOutput | None:
    return _ENGINE_MODULES[engine_id].analyze(file_path, phrase_length_bars)


def run_auto_advanced(
    file_path: Path,
    phrase_length_bars: int,
) -> RhythmEngineOutput | None:
    results: list[RhythmEngineOutput] = []
    for engine_id in _AUTO_TRY_ORDER:
        status = engine_status(engine_id)
        if not status.importable:
            continue
        output = analyze_with_engine(engine_id, file_path, phrase_length_bars)
        if output is not None:
            results.append(output)
    return pick_best_output(results)


def pick_best_advanced_result(outputs: list[RhythmEngineOutput]) -> RhythmEngineOutput | None:
    return pick_best_output(outputs)


def map_engine_output_to_phrase_result(
    output: RhythmEngineOutput,
    file_name: str,
) -> PhraseAnalysisResult:
    return PhraseAnalysisResult(
        file_name=file_name,
        method_used=output.method_used,
        phrase_basis=output.phrase_basis,
        beat_times=output.beat_times,
        downbeat_times=output.downbeat_times,
        phrase_start_times=output.phrase_start_times,
        phrase_length_bars=output.phrase_length_bars,
        confidence=output.confidence,
        bpm=output.bpm,
        limitations=output.limitations,
        dj_review_required=True,
    )


def any_advanced_importable() -> bool:
    return any(engine_status(engine_id).importable for engine_id in ENGINE_IDS)


def verified_capable() -> bool:
    for engine_id in ("madmom", "essentia", "beatnet"):
        status = engine_status(engine_id)
        if status.importable and engine_id == "madmom":
            return True
    return False

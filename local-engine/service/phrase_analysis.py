"""Phrase and downbeat analysis — heuristic fallback with optional advanced rhythm engines."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

from librosa_support import LIBROSA_SETUP_GUIDANCE, librosa_available, missing_librosa_response
from models import PhraseAnalysisResponse, PhraseAnalysisResult
from rhythm_engines.base import setup_guidance_for
from rhythm_engines.registry import (
    analyze_with_engine,
    engine_status,
    map_engine_output_to_phrase_result,
    run_auto_advanced,
)

PhraseBasis = Literal[
    "verified_downbeat",
    "verified_phrase",
    "heuristic_from_beats",
    "unavailable",
]

ALLOWED_METHODS = frozenset({"auto", "heuristic", "essentia", "beatnet", "madmom"})
ALLOWED_PHRASE_LENGTHS = frozenset({4, 8, 16})

HEURISTIC_LIMITATIONS = [
    "Heuristic phrase windows from detected beats — not verified downbeats.",
    "Assumes the first beat in the window equals bar 1 downbeat unless advanced engine provides verified data.",
    "DJ review required before live use.",
]

ADVANCED_ENGINE_IDS = frozenset({"essentia", "beatnet", "madmom"})


def _parse_beat_times(raw: str | None) -> list[float]:
    if raw is None or not raw.strip():
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    values: list[float] = []
    for item in parsed:
        if isinstance(item, (int, float)) and math.isfinite(float(item)):
            values.append(round(float(item), 4))
    return values


def _validate_phrase_length(value: int | None) -> tuple[int, list[str]]:
    errors: list[str] = []
    if value is None:
        return 8, errors
    if value not in ALLOWED_PHRASE_LENGTHS:
        errors.append("phrase_length_bars must be 4, 8, or 16.")
        return 8, errors
    return value, errors


def _detect_beats_from_file(file_path: Path) -> tuple[list[float], float | None, list[str]]:
    if not librosa_available():
        return [], None, ["librosa unavailable — cannot detect beats from upload."]

    try:
        import librosa
        import numpy as np
    except Exception as error:
        return [], None, [f"librosa import failed: {error}"]

    try:
        audio, sample_rate = librosa.load(str(file_path), sr=None, mono=True)
    except Exception as error:
        return [], None, [f"Could not decode audio: {error}"]

    if audio.size == 0:
        return [], None, ["Uploaded audio decoded to an empty buffer."]

    tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=sample_rate)
    tempo_value = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate).astype(float).tolist()
    return [round(value, 4) for value in beat_times], round(tempo_value, 2), []


def heuristic_phrase_start_times(beat_times: list[float], phrase_length_bars: int) -> list[float]:
    phrase_length_beats = phrase_length_bars * 4
    if len(beat_times) < phrase_length_beats:
        return []

    starts: list[float] = []
    for index in range(0, len(beat_times), phrase_length_beats):
        start = beat_times[index]
        if isinstance(start, (int, float)) and math.isfinite(float(start)):
            starts.append(round(float(start), 4))
    return starts


def _build_heuristic_result(
    *,
    file_name: str,
    beat_times: list[float],
    bpm: float | None,
    phrase_length_bars: int,
    method: str,
    extra_limitations: list[str] | None = None,
) -> PhraseAnalysisResult:
    phrase_starts = heuristic_phrase_start_times(beat_times, phrase_length_bars)
    limitations = list(HEURISTIC_LIMITATIONS)
    if extra_limitations:
        limitations.extend(extra_limitations)

    if not phrase_starts:
        return PhraseAnalysisResult(
            file_name=file_name,
            method_used=method,
            phrase_basis="unavailable",
            beat_times=beat_times,
            downbeat_times=[],
            phrase_start_times=[],
            phrase_length_bars=phrase_length_bars,
            confidence=None,
            bpm=bpm,
            limitations=limitations + ["Not enough beats for phrase windows at requested length."],
            dj_review_required=True,
        )

    return PhraseAnalysisResult(
        file_name=file_name,
        method_used=method,
        phrase_basis="heuristic_from_beats",
        beat_times=beat_times,
        downbeat_times=[],
        phrase_start_times=phrase_starts,
        phrase_length_bars=phrase_length_bars,
        confidence=None,
        bpm=bpm,
        limitations=limitations,
        dj_review_required=True,
    )


def _advanced_method_response(
    *,
    engine_id: str,
    file_path: Path,
    original_name: str,
    phrase_length_bars: int,
) -> PhraseAnalysisResponse:
    status = engine_status(engine_id)  # type: ignore[arg-type]

    if not status.importable:
        return PhraseAnalysisResponse(
            ok=False,
            status="missing_dependency",
            message=f"{engine_id} is not installed in this service environment.",
            setup_guidance=status.setup_guidance,
        )

    output = analyze_with_engine(engine_id, file_path, phrase_length_bars)  # type: ignore[arg-type]
    if output is None:
        if engine_id == "beatnet":
            return PhraseAnalysisResponse(
                ok=False,
                status="not_implemented",
                message=(
                    "BeatNet+ is installed but verified phrase/downbeat integration is not active yet. "
                    "Use heuristic method or auto fallback."
                ),
                setup_guidance=status.setup_guidance,
            )
        return PhraseAnalysisResponse(
            ok=False,
            status="failed",
            message=(
                f"{engine_id} is installed but could not produce rhythm analysis for this upload. "
                "Try heuristic method or auto fallback."
            ),
            setup_guidance=status.setup_guidance,
        )

    result = map_engine_output_to_phrase_result(output, original_name)
    return PhraseAnalysisResponse(
        ok=True,
        status="implemented",
        message=f"Phrase analysis completed with {engine_id}.",
        result=result,
    )


def analyze_phrase_file(
    file_path: Path | None,
    original_name: str,
    *,
    bpm: float | None = None,
    beat_times_raw: str | None = None,
    phrase_length_bars: int | None = 8,
    method: str = "auto",
) -> PhraseAnalysisResponse:
    validation_errors: list[str] = []

    if method not in ALLOWED_METHODS:
        validation_errors.append("method must be auto, heuristic, essentia, beatnet, or madmom.")

    resolved_length, length_errors = _validate_phrase_length(phrase_length_bars)
    validation_errors.extend(length_errors)

    if bpm is not None and (not math.isfinite(bpm) or bpm <= 0):
        validation_errors.append("bpm must be a positive number when provided.")

    beat_times = _parse_beat_times(beat_times_raw)

    if validation_errors:
        return PhraseAnalysisResponse(
            ok=False,
            status="validation_error",
            message="Phrase analysis request failed validation.",
            validation_errors=validation_errors,
        )

    if method in ADVANCED_ENGINE_IDS:
        if file_path is None:
            return PhraseAnalysisResponse(
                ok=False,
                status="validation_error",
                message="Audio upload required for advanced phrase analysis methods.",
            )
        return _advanced_method_response(
            engine_id=method,
            file_path=file_path,
            original_name=original_name,
            phrase_length_bars=resolved_length,
        )

    if method == "auto" and file_path is not None:
        advanced_output = run_auto_advanced(file_path, resolved_length)
        if advanced_output is not None:
            result = map_engine_output_to_phrase_result(advanced_output, original_name)
            return PhraseAnalysisResponse(
                ok=True,
                status="implemented",
                message=f"Phrase analysis completed with {advanced_output.engine_id}.",
                result=result,
            )

    if not beat_times:
        if file_path is None:
            return PhraseAnalysisResponse(
                ok=False,
                status="validation_error",
                message="Provide beat_times or upload audio for heuristic phrase analysis.",
            )
        detected, detected_bpm, detect_errors = _detect_beats_from_file(file_path)
        if detect_errors and not detected:
            if not librosa_available():
                return missing_librosa_response(PhraseAnalysisResponse)
            return PhraseAnalysisResponse(
                ok=False,
                status="failed",
                message="Could not derive beat times for phrase analysis.",
                setup_guidance=LIBROSA_SETUP_GUIDANCE,
            )
        beat_times = detected
        if bpm is None:
            bpm = detected_bpm

    if not beat_times:
        return PhraseAnalysisResponse(
            ok=False,
            status="failed",
            message="No beat times available for phrase analysis.",
        )

    result = _build_heuristic_result(
        file_name=original_name,
        beat_times=beat_times,
        bpm=bpm,
        phrase_length_bars=resolved_length,
        method="heuristic_from_detected_beats",
    )

    return PhraseAnalysisResponse(
        ok=True,
        status="implemented",
        message="Heuristic phrase windows computed from beat times. Not verified downbeats.",
        result=result,
    )


def advanced_setup_guidance(engine_id: str) -> str:
    if engine_id in ADVANCED_ENGINE_IDS:
        return setup_guidance_for(engine_id)  # type: ignore[arg-type]
    return "Optional advanced rhythm engine not configured."

"""Phrase and downbeat analysis — heuristic fallback with optional advanced engine upgrade path."""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Literal

from librosa_support import LIBROSA_SETUP_GUIDANCE, librosa_available, missing_librosa_response
from models import PhraseAnalysisResponse, PhraseAnalysisResult

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

ESSENTIA_SETUP = (
    "Install Essentia (pip install essentia) for verified downbeat/phrase analysis upgrade path."
)
BEATNET_SETUP = "Install BeatNet+ dependencies for verified rhythm analysis upgrade path."
MADMOM_SETUP = "Install madmom (pip install madmom) for verified downbeat analysis upgrade path."


def _import_available(module_name: str) -> bool:
    import importlib.util

    return importlib.util.find_spec(module_name) is not None


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


def _heuristic_phrase_start_times(beat_times: list[float], phrase_length_bars: int) -> list[float]:
    phrase_length_beats = phrase_length_bars * 4
    if len(beat_times) < phrase_length_beats:
        return []

    starts: list[float] = []
    for index in range(0, len(beat_times), phrase_length_beats):
        start = beat_times[index]
        if isinstance(start, (int, float)) and math.isfinite(float(start)):
            starts.append(round(float(start), 4))
    return starts


def _try_essentia_phrase_analysis(
    file_path: Path,
    phrase_length_bars: int,
) -> PhraseAnalysisResult | None:
    if not _import_available("essentia"):
        return None

    # Essentia is optional — integration hook only; no fabricated verified output yet.
    return None


def _try_beatnet_phrase_analysis(
    file_path: Path,
    phrase_length_bars: int,
) -> PhraseAnalysisResult | None:
    if not _import_available("beatnet"):
        return None
    return None


def _try_madmom_phrase_analysis(
    file_path: Path,
    phrase_length_bars: int,
) -> PhraseAnalysisResult | None:
    if not _import_available("madmom"):
        return None
    return None


def _build_heuristic_result(
    *,
    file_name: str,
    beat_times: list[float],
    bpm: float | None,
    phrase_length_bars: int,
    method: str,
    extra_limitations: list[str] | None = None,
) -> PhraseAnalysisResult:
    phrase_starts = _heuristic_phrase_start_times(beat_times, phrase_length_bars)
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

    if method in {"essentia", "beatnet", "madmom"}:
        if file_path is None:
            return PhraseAnalysisResponse(
                ok=False,
                status="validation_error",
                message="Audio upload required for advanced phrase analysis methods.",
            )

        advanced = {
            "essentia": (_try_essentia_phrase_analysis, ESSENTIA_SETUP),
            "beatnet": (_try_beatnet_phrase_analysis, BEATNET_SETUP),
            "madmom": (_try_madmom_phrase_analysis, MADMOM_SETUP),
        }[method]

        if not _import_available({"essentia": "essentia", "beatnet": "beatnet", "madmom": "madmom"}[method]):
            return PhraseAnalysisResponse(
                ok=False,
                status="missing_dependency",
                message=f"{method} is not installed in this service environment.",
                setup_guidance=advanced[1],
            )

        result = advanced[0](file_path, resolved_length)
        if result is None:
            return PhraseAnalysisResponse(
                ok=False,
                status="not_implemented",
                message=(
                    f"{method} is installed but verified phrase/downbeat integration is not active yet. "
                    "Use heuristic method or auto fallback."
                ),
                setup_guidance=advanced[1],
            )

        return PhraseAnalysisResponse(
            ok=True,
            status="implemented",
            message=f"Phrase analysis completed with {method}.",
            result=result,
        )

    if method == "auto" and file_path is not None:
        for engine, setup in (
            ("essentia", ESSENTIA_SETUP),
            ("beatnet", BEATNET_SETUP),
            ("madmom", MADMOM_SETUP),
        ):
            if not _import_available(engine):
                continue
            runner = {
                "essentia": _try_essentia_phrase_analysis,
                "beatnet": _try_beatnet_phrase_analysis,
                "madmom": _try_madmom_phrase_analysis,
            }[engine]
            advanced_result = runner(file_path, resolved_length)
            if advanced_result is not None:
                return PhraseAnalysisResponse(
                    ok=True,
                    status="implemented",
                    message=f"Phrase analysis completed with {engine}.",
                    result=advanced_result,
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

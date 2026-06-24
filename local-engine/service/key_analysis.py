"""Experimental key estimation using librosa chroma/CQT."""

from __future__ import annotations

from pathlib import Path

from librosa_support import LIBROSA_SETUP_GUIDANCE, librosa_available, missing_librosa_response
from models import KeyAnalysisResponse, KeyAnalysisResult

KEY_LIMITATIONS = [
    "Experimental prototype using chroma/CQT correlation; not pro-grade key detection.",
    "Short clips, atonal material, and heavy FX can reduce reliability.",
    "Camelot codes are heuristic mappings for DJ reference only.",
]

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

CAMELOT_MAJOR = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
CAMELOT_MINOR = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]


def analyze_key_file(file_path: Path, original_name: str) -> KeyAnalysisResponse:
    if not librosa_available():
        return missing_librosa_response(KeyAnalysisResponse)

    try:
        import librosa
        import numpy as np
    except Exception as error:
        return KeyAnalysisResponse(
            ok=False,
            status="missing_dependency",
            message=f"librosa could not be imported: {error}",
            setup_guidance=LIBROSA_SETUP_GUIDANCE,
        )

    try:
        audio, sample_rate = librosa.load(str(file_path), sr=None, mono=True)
    except Exception as error:
        return KeyAnalysisResponse(
            ok=False,
            status="failed",
            message=f"librosa could not decode this file: {error}",
            setup_guidance=LIBROSA_SETUP_GUIDANCE,
        )

    if audio.size == 0:
        return KeyAnalysisResponse(
            ok=False,
            status="failed",
            message="The uploaded audio file decoded to an empty buffer.",
        )

    chroma = librosa.feature.chroma_cqt(y=audio, sr=sample_rate)
    chroma_mean = chroma.mean(axis=1)
    if float(np.linalg.norm(chroma_mean)) <= 0:
        return KeyAnalysisResponse(
            ok=False,
            status="failed",
            message="Chroma analysis did not produce usable tonal content.",
        )

    key_index, mode, confidence = _estimate_key(chroma_mean)
    pitch = PITCH_CLASSES[key_index]
    camelot = CAMELOT_MAJOR[key_index] if mode == "major" else CAMELOT_MINOR[key_index]

    result = KeyAnalysisResult(
        file_name=original_name,
        key=pitch,
        mode=mode,
        camelot=camelot,
        method="librosa chroma_cqt + Krumhansl-style correlation (experimental prototype)",
        limitations=KEY_LIMITATIONS,
        confidence=round(confidence, 3) if confidence is not None else None,
    )

    return KeyAnalysisResponse(
        ok=True,
        status="implemented",
        message="Experimental key estimate computed with librosa chroma/CQT.",
        result=result,
    )


def _estimate_key(chroma_mean) -> tuple[int, str, float]:
    import numpy as np

    best_score = -1.0
    best_index = 0
    best_mode = "major"

    for index in range(12):
        major_rot = np.roll(MAJOR_PROFILE, index)
        minor_rot = np.roll(MINOR_PROFILE, index)
        major_score = float(np.corrcoef(chroma_mean, major_rot)[0, 1])
        minor_score = float(np.corrcoef(chroma_mean, minor_rot)[0, 1])

        if major_score > best_score:
            best_score = major_score
            best_index = index
            best_mode = "major"

        if minor_score > best_score:
            best_score = minor_score
            best_index = index
            best_mode = "minor"

    confidence = float(np.clip((best_score + 1) / 2, 0.0, 1.0))
    return best_index, best_mode, confidence

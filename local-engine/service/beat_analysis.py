"""Experimental BPM and beat-time analysis using librosa."""

from __future__ import annotations

from pathlib import Path

from librosa_support import LIBROSA_SETUP_GUIDANCE, librosa_available, missing_librosa_response
from models import BeatAnalysisResponse, BeatAnalysisResult

BEAT_LIMITATIONS = [
    "Experimental prototype using librosa beat_track; not a pro-grade DJ grid.",
    "Downbeat detection and phrase markers are not implemented in this phase.",
    "Tempo doubles/halves and sparse percussion can reduce accuracy.",
]


def analyze_beat_file(file_path: Path, original_name: str) -> BeatAnalysisResponse:
    if not librosa_available():
        return missing_librosa_response(BeatAnalysisResponse)

    try:
        import librosa
        import numpy as np
    except Exception as error:
        return BeatAnalysisResponse(
            ok=False,
            status="missing_dependency",
            message=f"librosa could not be imported: {error}",
            setup_guidance=LIBROSA_SETUP_GUIDANCE,
        )

    try:
        audio, sample_rate = librosa.load(str(file_path), sr=None, mono=True)
    except Exception as error:
        return BeatAnalysisResponse(
            ok=False,
            status="failed",
            message=f"librosa could not decode this file: {error}",
            setup_guidance=LIBROSA_SETUP_GUIDANCE,
        )

    if audio.size == 0:
        return BeatAnalysisResponse(
            ok=False,
            status="failed",
            message="The uploaded audio file decoded to an empty buffer.",
        )

    tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=sample_rate)
    tempo_value = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate).astype(float).tolist()
    confidence = _estimate_tempo_confidence(audio, sample_rate, tempo_value)

    result = BeatAnalysisResult(
        file_name=original_name,
        bpm=round(tempo_value, 2),
        beat_times=[round(value, 4) for value in beat_times],
        beat_count=len(beat_times),
        method="librosa.beat.beat_track (experimental prototype)",
        limitations=BEAT_LIMITATIONS,
        confidence=confidence,
        downbeat_status="not_implemented",
        phrase_marker_status="not_implemented",
    )

    return BeatAnalysisResponse(
        ok=True,
        status="implemented",
        message="Experimental BPM and beat times computed with librosa.",
        result=result,
    )


def _estimate_tempo_confidence(audio, sample_rate: int | float, tempo: float) -> float | None:
    try:
        import librosa
        import numpy as np

        onset_env = librosa.onset.onset_strength(y=audio, sr=sample_rate)
        pulse = librosa.beat.plp(onset_env, sr=sample_rate, win_length=384)
        if pulse.size == 0:
            return None

        ac = librosa.autocorrelate(onset_env)
        if ac.size == 0:
            return None

        peak = float(np.max(ac))
        if peak <= 0:
            return None

        confidence = float(np.clip(np.max(pulse), 0.0, 1.0))
        return round(confidence, 3)
    except Exception:
        return None

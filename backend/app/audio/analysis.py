"""Musical analysis: tempo (BPM), key, first downbeat, and waveform peaks."""

from __future__ import annotations

from dataclasses import dataclass, asdict, field

import librosa
import numpy as np

from . import beatgrid, gridsync, harmonic, phrase
from .io_utils import SAMPLE_RATE, load_audio, to_mono

PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Krumhansl-Schmuckler key profiles.
_KS_MAJOR = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
_KS_MINOR = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)


@dataclass
class TrackAnalysis:
    bpm: float
    key: str          # e.g. "A minor"
    key_index: int    # tonic pitch class 0-11
    mode: str         # "major" | "minor"
    duration: float   # seconds
    downbeat_sec: float  # == first_downbeat_sec (kept for backward compat)
    peaks: list[float]
    # Beat grid fields.
    beats_per_bar: int = 4
    bpm_confidence: float = 0.0
    tempo_stability: float = 0.0
    grid_type: str = "static"
    first_downbeat_sec: float = 0.0
    beat_times: list[float] = field(default_factory=list)
    downbeat_times: list[float] = field(default_factory=list)
    grid_source: str = "librosa"
    # Clean DJ-style grid (gap-free BPM + phases), fit from detected beats.
    grid_bpm_clean: float = 0.0
    beat_phase_sec: float = 0.0
    bar_phase_sec: float = 0.0
    tempo_constant: bool = True
    tempo_cv: float = 0.0
    grid_fit_ms: float = 0.0
    # Remix Brain fields (Phase 42)
    phrase_starts: list[float] = field(default_factory=list)
    phrase_length_bars: int | None = None
    camelot: str | None = None
    energy_curve: list[float] = field(default_factory=list)
    vocal_density_curve: list[float] | None = None
    transient_strength_curve: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def estimate_tempo_and_beats(y_mono: np.ndarray, sr: int) -> tuple[float, np.ndarray]:
    tempo, beat_frames = librosa.beat.beat_track(y=y_mono, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])
    return bpm, beat_times


def estimate_key(y_mono: np.ndarray, sr: int) -> tuple[int, str, str]:
    """Return (tonic_index, mode, key_name) via KS profile correlation."""
    chroma = librosa.feature.chroma_cqt(y=y_mono, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)
    if chroma_mean.sum() > 0:
        chroma_mean = chroma_mean / chroma_mean.sum()

    best_score = -np.inf
    best_tonic = 0
    best_mode = "major"
    for tonic in range(12):
        maj = np.corrcoef(np.roll(_KS_MAJOR, tonic), chroma_mean)[0, 1]
        minr = np.corrcoef(np.roll(_KS_MINOR, tonic), chroma_mean)[0, 1]
        if maj > best_score:
            best_score, best_tonic, best_mode = maj, tonic, "major"
        if minr > best_score:
            best_score, best_tonic, best_mode = minr, tonic, "minor"

    key_name = f"{PITCH_CLASSES[best_tonic]} {best_mode}"
    return best_tonic, best_mode, key_name


def estimate_first_downbeat(y_mono: np.ndarray, sr: int, beat_times: np.ndarray) -> float:
    """Approximate the first downbeat as the strongest onset among the first
    four detected beats (a lightweight stand-in for a full downbeat model)."""
    if beat_times.size == 0:
        return 0.0
    onset_env = librosa.onset.onset_strength(y=y_mono, sr=sr)
    candidates = beat_times[:4] if beat_times.size >= 4 else beat_times
    best_time = float(candidates[0])
    best_strength = -np.inf
    for t in candidates:
        frame = librosa.time_to_frames(t, sr=sr)
        frame = int(np.clip(frame, 0, len(onset_env) - 1))
        if onset_env[frame] > best_strength:
            best_strength = onset_env[frame]
            best_time = float(t)
    return best_time


def waveform_peaks(y_mono: np.ndarray, n: int = 1000) -> list[float]:
    """Downsample the absolute waveform envelope to ``n`` peak values in 0..1."""
    if y_mono.size == 0:
        return [0.0] * n
    abs_y = np.abs(y_mono)
    bucket = max(1, len(abs_y) // n)
    trimmed = abs_y[: bucket * n]
    if trimmed.size == 0:
        trimmed = abs_y
    peaks = trimmed.reshape(-1, bucket).max(axis=1) if trimmed.size >= bucket else abs_y
    peak_max = peaks.max() if peaks.size else 1.0
    if peak_max > 0:
        peaks = peaks / peak_max
    return [round(float(p), 4) for p in peaks[:n]]


def analyze_file(path: str) -> TrackAnalysis:
    """Analyze a track. Beat/key/grid detection runs on whatever audio is passed
    in; the caller supplies the separated stem (or the original when separation
    is skipped)."""
    y, sr = load_audio(path, sr=SAMPLE_RATE)
    y_mono = to_mono(y)
    duration = y_mono.shape[-1] / sr

    grid = beatgrid.detect_grid(y_mono, sr)
    tonic, mode, key_name = estimate_key(y_mono, sr)
    peaks = waveform_peaks(y_mono, n=1000)

    raw = {
        "bpm": grid.bpm,
        "beat_times": grid.beat_times,
        "downbeat_times": grid.downbeat_times,
        "beats_per_bar": grid.beats_per_bar,
        "first_downbeat_sec": grid.first_downbeat_sec,
    }
    clean = gridsync.grid_fields(raw)
    downs = grid.downbeat_times or []
    phrase_starts = phrase.phrase_starts_from_grid(
        downs, grid.beats_per_bar, duration
    )
    camelot = harmonic.to_camelot(tonic, mode)
    energy, vocal_density, trans = phrase.build_curves(
        y_mono, sr, is_vocal=False
    )
    phrase_len = phrase.estimate_phrase_length_bars(
        np.asarray(energy, dtype=float),
        50.0,
        grid.bpm,
        grid.beats_per_bar,
    )

    return TrackAnalysis(
        bpm=grid.bpm,
        key=key_name,
        key_index=tonic,
        mode=mode,
        duration=round(duration, 3),
        downbeat_sec=grid.first_downbeat_sec,
        peaks=peaks,
        beats_per_bar=grid.beats_per_bar,
        bpm_confidence=grid.bpm_confidence,
        tempo_stability=grid.tempo_stability,
        grid_type=grid.grid_type,
        first_downbeat_sec=grid.first_downbeat_sec,
        beat_times=grid.beat_times,
        downbeat_times=grid.downbeat_times,
        grid_source=grid.source,
        grid_bpm_clean=clean["grid_bpm_clean"],
        beat_phase_sec=clean["beat_phase_sec"],
        bar_phase_sec=clean["bar_phase_sec"],
        tempo_constant=clean["tempo_constant"],
        tempo_cv=clean["tempo_cv"],
        grid_fit_ms=clean["grid_fit_ms"],
        phrase_starts=phrase_starts,
        phrase_length_bars=phrase_len,
        camelot=camelot,
        energy_curve=energy,
        vocal_density_curve=vocal_density,
        transient_strength_curve=trans,
    )


def suggested_semitone_shift(from_index: int, to_index: int) -> int:
    """Shortest signed semitone shift (-6..6) to move ``from`` tonic to ``to``."""
    diff = (to_index - from_index) % 12
    if diff > 6:
        diff -= 12
    return int(diff)

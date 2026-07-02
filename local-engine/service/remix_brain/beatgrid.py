"""Beat grid detection: beats, downbeats, and derived grid fields.

A beat grid = anchor (first downbeat) + BPM + beats_per_bar, which generates
beat lines and bar lines. Pros treat the instrumental as MASTER and conform the
acapella (FOLLOWER) to it.

Primary detector: "Beat This!" (``beat_this``) neural model, which gives real
downbeats. It is OPTIONAL and reuses the torch install from Demucs. If it can't
install / import / run, we fall back to librosa beat tracking plus an
onset-energy downbeat heuristic. The app must keep working either way.
"""

from __future__ import annotations

import os
from dataclasses import asdict, dataclass
from functools import lru_cache

import librosa
import numpy as np

# Allow disabling the neural detector via env (USE_BEAT_THIS=0).
_USE_BEAT_THIS = os.environ.get("USE_BEAT_THIS", "1") != "0"


@dataclass
class BeatGrid:
    bpm: float
    bpm_confidence: float
    beats_per_bar: int
    beat_times: list[float]
    downbeat_times: list[float]
    first_downbeat_sec: float
    tempo_stability: float  # 1.0 = perfectly constant tempo
    grid_type: str          # "static" | "dynamic"
    source: str             # "beat_this" | "librosa"

    def to_dict(self) -> dict:
        return asdict(self)


def beat_this_available() -> bool:
    if not _USE_BEAT_THIS:
        return False
    try:
        import beat_this  # noqa: F401
        import torch  # noqa: F401

        return True
    except Exception:
        return False


@lru_cache(maxsize=1)
def _get_audio2beats():
    from beat_this.inference import Audio2Beats

    return Audio2Beats(checkpoint_path="final0", device="cpu", dbn=False)


def _grid_from_beats(
    beat_times: np.ndarray,
    downbeat_times: np.ndarray,
    source: str,
    bpm_hint: float | None = None,
) -> BeatGrid:
    beat_times = np.asarray(beat_times, dtype=float)
    beat_times = beat_times[np.isfinite(beat_times)]
    beat_times.sort()
    downbeat_times = np.asarray(downbeat_times, dtype=float)
    downbeat_times = downbeat_times[np.isfinite(downbeat_times)]
    downbeat_times.sort()

    bpm = 0.0
    tempo_stability = 0.0
    bpm_confidence = 0.0

    if beat_times.size >= 2:
        ibi = np.diff(beat_times)
        ibi = ibi[ibi > 1e-3]
        if ibi.size:
            median_ibi = float(np.median(ibi))
            bpm = 60.0 / median_ibi if median_ibi > 0 else 0.0
            spread = float(np.std(ibi) / median_ibi) if median_ibi > 0 else 1.0
            tempo_stability = float(np.clip(1.0 - spread, 0.0, 1.0))
            # Confidence: fraction of inter-beat intervals within 10% of median.
            within = np.mean(np.abs(ibi - median_ibi) <= 0.10 * median_ibi)
            bpm_confidence = float(within)

    if bpm <= 0 and bpm_hint:
        bpm = float(bpm_hint)

    # beats_per_bar = median number of beats between consecutive downbeats.
    beats_per_bar = 4
    if downbeat_times.size >= 2 and beat_times.size:
        counts = []
        for i in range(len(downbeat_times) - 1):
            lo, hi = downbeat_times[i], downbeat_times[i + 1]
            c = int(np.sum((beat_times >= lo - 1e-3) & (beat_times < hi - 1e-3)))
            if c > 0:
                counts.append(c)
        if counts:
            beats_per_bar = int(round(float(np.median(counts))))
    beats_per_bar = int(np.clip(beats_per_bar, 2, 12))

    if downbeat_times.size:
        first_downbeat = float(downbeat_times[0])
    elif beat_times.size:
        first_downbeat = float(beat_times[0])
    else:
        first_downbeat = 0.0

    grid_type = "static" if tempo_stability >= 0.9 else "dynamic"

    return BeatGrid(
        bpm=round(bpm, 2),
        bpm_confidence=round(bpm_confidence, 3),
        beats_per_bar=beats_per_bar,
        beat_times=[round(float(t), 4) for t in beat_times],
        downbeat_times=[round(float(t), 4) for t in downbeat_times],
        first_downbeat_sec=round(first_downbeat, 4),
        tempo_stability=round(tempo_stability, 3),
        grid_type=grid_type,
        source=source,
    )


def _detect_beat_this(y_mono: np.ndarray, sr: int) -> BeatGrid:
    a2b = _get_audio2beats()
    signal = np.ascontiguousarray(y_mono, dtype=np.float32)
    beats, downbeats = a2b(signal, sr)
    return _grid_from_beats(np.asarray(beats), np.asarray(downbeats), source="beat_this")


def _detect_librosa(y_mono: np.ndarray, sr: int) -> BeatGrid:
    onset_env = librosa.onset.onset_strength(y=y_mono, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(y=y_mono, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    bpm_hint = float(np.atleast_1d(tempo)[0])

    beats_per_bar = 4
    downbeat_times = np.array([])
    if beat_frames.size:
        strengths = onset_env[np.clip(beat_frames, 0, len(onset_env) - 1)]
        # Pick the phase (0..bpb-1) whose beats carry the most onset energy.
        best_phase, best_sum = 0, -np.inf
        for p in range(beats_per_bar):
            s = float(strengths[p::beats_per_bar].sum())
            if s > best_sum:
                best_sum, best_phase = s, p
        downbeat_times = beat_times[best_phase::beats_per_bar]

    return _grid_from_beats(
        beat_times, downbeat_times, source="librosa", bpm_hint=bpm_hint
    )


def detect_grid(y_mono: np.ndarray, sr: int) -> BeatGrid:
    """Detect the beat grid, preferring Beat This! with a librosa fallback."""
    if beat_this_available():
        try:
            grid = _detect_beat_this(y_mono, sr)
            # Guard against a degenerate result (e.g. no beats found).
            if grid.beat_times:
                return grid
        except Exception:
            pass
    return _detect_librosa(y_mono, sr)

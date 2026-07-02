"""Phrase grid inference from downbeats + energy curves."""

from __future__ import annotations

import librosa
import numpy as np

from .gridsync import energy_env


def phrase_starts_from_grid(
    downbeats: list[float],
    beats_per_bar: int,
    duration: float,
    bar_multiples: tuple[int, ...] = (4, 8, 16, 32),
) -> list[float]:
    """Candidate phrase boundaries at N-bar multiples from first downbeat."""
    if not downbeats:
        return []
    db = sorted(float(x) for x in downbeats)
    first = db[0]
    bar_period = (db[1] - db[0]) if len(db) > 1 else (60.0 / 120.0) * beats_per_bar
    if bar_period <= 0:
        bar_period = 2.0
    out: set[float] = set()
    for mult in bar_multiples:
        period = bar_period * (mult / beats_per_bar) if beats_per_bar else bar_period * mult
        if period <= 0:
            continue
        k = 0
        while True:
            t = first + k * period
            if t > duration + 1e-3:
                break
            if t >= 0:
                out.add(round(t, 4))
            k += 1
    for t in db:
        out.add(round(t, 4))
    return sorted(out)


def estimate_phrase_length_bars(
    vocal_density: np.ndarray,
    env_sr: float,
    bpm: float,
    beats_per_bar: int,
) -> int | None:
    """Guess 8 or 16 bar phrases from vocal density autocorrelation."""
    if vocal_density.size < 32 or bpm <= 0:
        return None
    bar_sec = beats_per_bar * 60.0 / bpm
    bar_samples = max(4, int(round(bar_sec * env_sr)))
    if vocal_density.size < bar_samples * 8:
        return 8
    # Autocorrelation at 8 and 16 bar lags
    v = vocal_density - vocal_density.mean()
    best_bars = 8
    best_score = -np.inf
    for bars in (4, 8, 16, 32):
        lag = bar_samples * bars
        if lag >= v.size:
            continue
        corr = float(np.dot(v[:-lag], v[lag:]))
        if corr > best_score:
            best_score = corr
            best_bars = bars
    return best_bars


def transient_curve(y_mono: np.ndarray, sr: int, env_sr: float = 50.0) -> list[float]:
    hop = max(1, int(round(sr / env_sr)))
    onset = librosa.onset.onset_strength(y=y_mono, sr=sr, hop_length=hop)
    if onset.size == 0:
        return [0.0]
    mx = float(onset.max()) or 1.0
    return [round(float(x / mx), 4) for x in onset]


def downsample_curve(values: list[float], n: int = 500) -> list[float]:
    if not values:
        return [0.0] * n
    arr = np.asarray(values, dtype=float)
    if arr.size <= n:
        return [round(float(x), 4) for x in arr]
    idx = np.linspace(0, arr.size - 1, n).astype(int)
    return [round(float(arr[i]), 4) for i in idx]


def build_curves(
    y_mono: np.ndarray,
    sr: int,
    is_vocal: bool,
    n_points: int = 500,
) -> tuple[list[float], list[float] | None, list[float]]:
    env, esr = energy_env(y_mono, sr)
    energy = downsample_curve(env.tolist(), n_points)
    vocal_density = None
    if is_vocal:
        vocal_density = downsample_curve(env.tolist(), n_points)
    trans = downsample_curve(transient_curve(y_mono, sr, esr), n_points)
    return energy, vocal_density, trans


def nearest_phrase_start(t: float, phrase_starts: list[float]) -> tuple[float, str]:
    """Return nearest phrase/downbeat time and anchor type."""
    if not phrase_starts:
        return t, "beat"
    arr = np.asarray(phrase_starts, dtype=float)
    idx = int(np.argmin(np.abs(arr - t)))
    return float(arr[idx]), "phrase"


def pickup_before_anchor(
    y_mono: np.ndarray,
    sr: int,
    anchor_sec: float,
    max_pickup_sec: float = 0.8,
) -> float:
    """Estimate vocal audio start before anchor (pickup syllables)."""
    if anchor_sec <= 0:
        return 0.0
    env, esr = energy_env(y_mono, sr)
    anchor_idx = int(round(anchor_sec * esr))
    look = int(round(max_pickup_sec * esr))
    start_idx = max(0, anchor_idx - look)
    if anchor_idx <= start_idx:
        return 0.0
    seg = env[start_idx:anchor_idx]
    if seg.size == 0:
        return 0.0
    thresh = float(np.percentile(seg, 60))
    for i in range(seg.size - 1, -1, -1):
        if seg[i] >= thresh:
            return max(0.0, (start_idx + i) / esr)
    return max(0.0, anchor_sec - max_pickup_sec)

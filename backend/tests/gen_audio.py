"""Synthetic audio generators used by the smoke test and for sample material."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

SR = 44100


def _adsr(n: int, sr: int) -> np.ndarray:
    env = np.ones(n)
    a = min(int(0.005 * sr), n // 2)
    r = min(int(0.02 * sr), n // 2)
    if a > 0:
        env[:a] = np.linspace(0, 1, a)
    if r > 0:
        env[-r:] = np.linspace(1, 0, r)
    return env


def make_instrumental(path: Path, bpm: float = 120.0, seconds: float = 8.0) -> None:
    """Kick on every beat + a sustained A-minor drone (root A = 220 Hz)."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    beat_period = 60.0 / bpm
    audio = np.zeros(n)

    beat = 0.0
    while beat < seconds:
        start = int(beat * SR)
        dur = int(0.12 * SR)
        end = min(start + dur, n)
        seg = np.arange(end - start) / SR
        freq = 110 * np.exp(-30 * seg)
        kick = np.sin(2 * np.pi * freq * seg) * np.exp(-25 * seg)
        audio[start:end] += kick
        beat += beat_period

    for f in (220.0, 261.63, 329.63):  # A minor triad
        audio += 0.12 * np.sin(2 * np.pi * f * t)

    audio /= np.max(np.abs(audio)) + 1e-9
    audio *= 0.8
    stereo = np.column_stack([audio, audio]).astype(np.float32)
    sf.write(str(path), stereo, SR, subtype="PCM_16")


def make_acapella(path: Path, bpm: float = 100.0, seconds: float = 8.0) -> None:
    """A simple sung-like melody in C major at a different tempo."""
    n = int(seconds * SR)
    audio = np.zeros(n)
    beat_period = 60.0 / bpm
    notes = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25]
    note_len = beat_period
    idx = 0
    t0 = 0.0
    while t0 < seconds:
        start = int(t0 * SR)
        dur = int(note_len * SR)
        end = min(start + dur, n)
        seg = np.arange(end - start) / SR
        f = notes[idx % len(notes)]
        vib = 1 + 0.01 * np.sin(2 * np.pi * 5 * seg)
        tone = (
            np.sin(2 * np.pi * f * seg * vib)
            + 0.3 * np.sin(2 * np.pi * 2 * f * seg)
            + 0.15 * np.sin(2 * np.pi * 3 * f * seg)
        )
        tone *= _adsr(len(seg), SR)
        audio[start:end] += tone
        idx += 1
        t0 += note_len

    audio /= np.max(np.abs(audio)) + 1e-9
    audio *= 0.7
    stereo = np.column_stack([audio, audio]).astype(np.float32)
    sf.write(str(path), stereo, SR, subtype="PCM_16")

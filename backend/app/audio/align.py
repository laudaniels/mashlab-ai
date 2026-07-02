"""Auto-alignment of the acapella (follower) over the instrumental (master).

Strategy (per the research recommendations):
- Cross-correlate onset-strength envelopes at a downsampled rate. The
  instrumental envelope is sharpened with HPSS percussive to emphasize the beat.
- The acapella envelope is time-scaled by the tempo ratio so it is compared at
  the instrumental's tempo.
- The normalized correlation peak is the confidence. The recommended offset is
  snapped to the nearest beat, and phrase candidates (0, +/-4, +/-8, +/-16 bars)
  are scored. When confidence is low, fall back to grid-to-grid alignment
  (acapella first downbeat -> instrumental first downbeat, i.e. offset 0).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import librosa
import numpy as np
from scipy import signal as spsig

from . import analysis
from .io_utils import load_audio, to_mono

ALIGN_SR = 22050
HOP = 512
CONFIDENCE_FLOOR = 0.15
PHRASE_BARS = [0, 4, -4, 8, -8, 16, -16]


@dataclass
class AlignResult:
    recommended_offset_ms: float
    offset_confidence: float
    snapped_to: str            # "beat" | "bar" | "grid"
    tempo_ratio: float
    semitone_shift: int
    phrase_candidates: list[dict]

    def to_dict(self) -> dict:
        return asdict(self)


def _onset_env(y_mono: np.ndarray, sr: int, percussive: bool) -> np.ndarray:
    if percussive:
        y_mono = librosa.effects.percussive(y_mono)
    env = librosa.onset.onset_strength(y=y_mono, sr=sr, hop_length=HOP)
    env = env - env.mean()
    std = env.std()
    if std > 0:
        env = env / std
    return env


def _resample_env(env: np.ndarray, ratio: float) -> np.ndarray:
    """Time-scale an envelope by ``ratio`` (rate > 1 => shorter, faster)."""
    if abs(ratio - 1.0) < 1e-4 or env.size == 0:
        return env
    new_len = max(1, int(round(env.size / ratio)))
    x_old = np.linspace(0.0, 1.0, env.size)
    x_new = np.linspace(0.0, 1.0, new_len)
    return np.interp(x_new, x_old, env)


def _snap(t: float, beat_times: list[float], downbeat_times: list[float], mode: str) -> float:
    arr = downbeat_times if mode == "bar" else beat_times
    if not arr:
        return t
    a = np.asarray(arr, dtype=float)
    idx = int(np.argmin(np.abs(a - t)))
    return float(a[idx])


def align_tracks(
    acap_path: str,
    instr_path: str,
    acap_analysis: dict,
    instr_analysis: dict,
) -> AlignResult:
    acap_y, _ = load_audio(acap_path, sr=ALIGN_SR)
    instr_y, _ = load_audio(instr_path, sr=ALIGN_SR)
    acap_mono = to_mono(acap_y)
    instr_mono = to_mono(instr_y)

    acap_bpm = float(acap_analysis.get("bpm") or 0.0)
    instr_bpm = float(instr_analysis.get("bpm") or 0.0)
    acap_downbeat = float(acap_analysis.get("first_downbeat_sec") or 0.0)
    instr_downbeat = float(instr_analysis.get("first_downbeat_sec") or 0.0)
    beats_per_bar = int(instr_analysis.get("beats_per_bar") or 4)
    instr_beats = instr_analysis.get("beat_times") or []
    instr_downbeats = instr_analysis.get("downbeat_times") or []

    tempo_ratio = instr_bpm / acap_bpm if acap_bpm > 0 and instr_bpm > 0 else 1.0
    tempo_ratio = float(np.clip(tempo_ratio, 0.5, 2.0))

    semitone_shift = analysis.suggested_semitone_shift(
        int(acap_analysis.get("key_index") or 0),
        int(instr_analysis.get("key_index") or 0),
    )

    acap_env = _resample_env(_onset_env(acap_mono, ALIGN_SR, percussive=False), tempo_ratio)
    instr_env = _onset_env(instr_mono, ALIGN_SR, percussive=True)

    # Grid-to-grid fallback offset: acapella downbeat -> instrumental downbeat.
    fallback = AlignResult(
        recommended_offset_ms=0.0,
        offset_confidence=0.0,
        snapped_to="grid",
        tempo_ratio=round(tempo_ratio, 4),
        semitone_shift=int(semitone_shift),
        phrase_candidates=[{"bars": 0, "score": 0.0}],
    )

    if acap_env.size < 4 or instr_env.size < 4:
        return fallback

    corr = spsig.correlate(instr_env, acap_env, mode="full")
    lags = spsig.correlation_lags(instr_env.size, acap_env.size, mode="full")
    lag_times = lags * HOP / ALIGN_SR

    instr_dur = instr_mono.size / ALIGN_SR
    window = float(min(instr_dur, 90.0))
    mask = np.abs(lag_times) <= window
    if not np.any(mask):
        return fallback

    corr_w = corr[mask]
    lag_times_w = lag_times[mask]
    denom = np.linalg.norm(acap_env) * np.linalg.norm(instr_env)

    best_i = int(np.argmax(corr_w))
    best_lag = float(lag_times_w[best_i])
    confidence = float(corr_w[best_i] / denom) if denom > 0 else 0.0
    confidence = float(np.clip(confidence, 0.0, 1.0))

    # best_lag is where the (stretched) acapella start lands in the instrumental
    # timeline. Convert to the pipeline's offset (relative to downbeat alignment).
    acap_downbeat_stretched = acap_downbeat / tempo_ratio
    acap_downbeat_out = best_lag + acap_downbeat_stretched
    offset_s = acap_downbeat_out - instr_downbeat

    # Score phrase candidates by the correlation value at +/- N bars.
    bar_dur = beats_per_bar * (60.0 / instr_bpm) if instr_bpm > 0 else 0.0
    candidates: list[dict] = []
    if bar_dur > 0 and denom > 0:
        for bars in PHRASE_BARS:
            target_lag = best_lag + bars * bar_dur
            j = int(np.argmin(np.abs(lag_times_w - target_lag)))
            score = float(np.clip(corr_w[j] / denom, 0.0, 1.0))
            candidates.append({"bars": bars, "score": round(score, 4)})
    else:
        candidates.append({"bars": 0, "score": round(confidence, 4)})

    if confidence < CONFIDENCE_FLOOR:
        fallback.offset_confidence = round(confidence, 4)
        fallback.phrase_candidates = candidates
        return fallback

    # Snap the acapella's output downbeat to the nearest instrumental beat.
    snapped_downbeat = _snap(acap_downbeat_out, instr_beats, instr_downbeats, "beat")
    snapped_to = "beat"
    if instr_beats:
        offset_s = snapped_downbeat - instr_downbeat

    return AlignResult(
        recommended_offset_ms=round(offset_s * 1000.0, 1),
        offset_confidence=round(confidence, 4),
        snapped_to=snapped_to,
        tempo_ratio=round(tempo_ratio, 4),
        semitone_shift=int(semitone_shift),
        phrase_candidates=candidates,
    )

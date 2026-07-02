"""Pro-style beat-grid sync (Serato / rekordbox model).

A DJ beatgrid is *not* the raw list of detected beats (which has holes in
breakdowns and jitter from the detector). It is an idealized, gap-free grid
defined by three numbers:

    beat line k   = beat_phase + k * beat_period          (period = 60 / BPM)
    bar  line m   = bar_phase  + m * bar_period            (bar_period = period * beats_per_bar)

Two constant-tempo songs whose grids are matched in BPM and phase-aligned on a
*downbeat* stay locked for the entire track with **no time-warping** — exactly
how Serato and rekordbox sync. Elastic warp (Ableton-style) is only needed when
a track's tempo actually drifts.

This module fits that clean grid from the (noisy, possibly hole-y) detected
beats/downbeats, and picks a placement that (a) locks the vocal's downbeats onto
the instrumental's downbeats and (b) drops the vocal's loudest section over the
instrumental's strongest section (energy cross-correlation at bar resolution).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class CleanGrid:
    bpm: float
    period: float          # seconds per beat
    beat_phase: float      # first beat line, in [0, period)
    beats_per_bar: int
    bar_period: float      # seconds per bar
    bar_phase: float       # first bar line (downbeat), in [0, bar_period)
    is_constant: bool      # tempo steady enough to sync without warping
    tempo_cv: float        # coefficient of variation of inter-beat intervals
    fit_ms: float          # median deviation of detected beats from the grid

    def beat_line(self, k: int) -> float:
        return self.beat_phase + k * self.period

    def bar_line(self, m: int) -> float:
        return self.bar_phase + m * self.bar_period


def _circular_phase(times: np.ndarray, period: float) -> float:
    """Robust phase = circular mean of (times mod period), in [0, period)."""
    if times.size == 0 or period <= 0:
        return 0.0
    ang = 2.0 * np.pi * (np.mod(times, period) / period)
    m = np.angle(np.mean(np.exp(1j * ang)))
    return float((m % (2 * np.pi)) / (2 * np.pi) * period)


def clean_grid(analysis: dict) -> CleanGrid:
    beats = np.asarray(sorted(float(x) for x in (analysis.get("beat_times") or [])), dtype=float)
    downs = np.asarray(sorted(float(x) for x in (analysis.get("downbeat_times") or [])), dtype=float)
    bpb = int(analysis.get("beats_per_bar") or 4) or 4
    bpm = float(analysis.get("bpm") or 0.0)

    # Derive period from the modal inter-beat interval (robust to dropped beats),
    # falling back to the reported BPM.
    period = 60.0 / bpm if bpm > 0 else 0.5
    tempo_cv = 1.0
    if beats.size >= 3:
        ibi = np.diff(beats)
        ibi = ibi[ibi > 1e-3]
        if ibi.size:
            modal = float(np.median(ibi))
            # Keep only intervals near one beat (exclude gaps = dropped beats).
            near = ibi[np.abs(ibi - modal) <= 0.25 * modal]
            if near.size >= 3:
                period = float(np.mean(near))
                tempo_cv = float(np.std(near) / period) if period > 0 else 1.0
            else:
                period = modal
                tempo_cv = float(np.std(ibi) / modal) if modal > 0 else 1.0
    bpm = 60.0 / period if period > 0 else bpm

    beat_phase = _circular_phase(beats, period) if beats.size else 0.0

    bar_period = period * bpb
    if downs.size:
        bar_phase = _circular_phase(downs, bar_period)
    else:
        bar_phase = beat_phase
    # Force the bar line to coincide with a beat line (downbeat is a beat).
    if period > 0:
        k = round((bar_phase - beat_phase) / period)
        bar_phase = beat_phase + k * period
    bar_phase = float(bar_phase % bar_period)

    # Fit quality: deviation of detected beats from the clean grid, ignoring the
    # phase jumps caused by dropped beats (compare each beat to its nearest line).
    fit_ms = 0.0
    if beats.size and period > 0:
        k = np.round((beats - beat_phase) / period)
        model = beat_phase + k * period
        dev = beats - model
        # Remove slow phase wander (detector drift) before scoring local tightness.
        dev = dev - np.median(dev)
        fit_ms = float(np.median(np.abs(dev)) * 1000.0)

    # Constant enough to sync without warping? Tempo CV is the reliable signal
    # (dropped beats don't affect it since we filtered to near-modal intervals).
    is_constant = tempo_cv < 0.06

    return CleanGrid(
        bpm=round(bpm, 3),
        period=period,
        beat_phase=beat_phase,
        beats_per_bar=bpb,
        bar_period=bar_period,
        bar_phase=bar_phase,
        is_constant=bool(is_constant),
        tempo_cv=round(tempo_cv, 4),
        fit_ms=round(fit_ms, 1),
    )


def energy_env(y_mono: np.ndarray, sr: int, env_sr: float = 50.0) -> tuple[np.ndarray, float]:
    """Short-time RMS energy envelope (dB-ish, zero-mean) at ``env_sr`` Hz."""
    hop = max(1, int(round(sr / env_sr)))
    n = y_mono.size // hop
    if n < 1:
        return np.zeros(1, dtype=np.float32), env_sr
    frames = y_mono[: n * hop].reshape(n, hop)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1) + 1e-9)
    env = np.log(rms + 1e-6)
    env = env - env.mean()
    return env.astype(np.float32), sr / hop


def manual_grid_shift(
    vgrid: CleanGrid,
    igrid: CleanGrid,
    rate: float,
    offset_s: float = 0.0,
    downbeat_shift: int = 0,
    beat_period: float = 0.5,
) -> tuple[float, dict]:
    """Serato/rekordbox-style placement: match BPM once, lock vocal downbeats
    onto instrumental downbeats via a single shift. No elastic warp, no energy
    guessing — the DJ nudges from here.

    ``downbeat_shift`` is in beats; ``offset_s`` is a fine ms/ms nudge on top.
    """
    nominal = 1.0 / rate if rate > 0 else 1.0
    v_bar_out = vgrid.bar_phase * nominal
    base = igrid.bar_phase - v_bar_out
    shift_s = base + float(offset_s) + int(downbeat_shift) * beat_period
    return shift_s, {
        "mode": "manual",
        "base_shift_sec": round(base, 4),
        "bar_offset": 0,
        "placement_score": 0.0,
    }


def grid_fields(analysis: dict) -> dict:
    """Clean-grid fields to store on a track after analysis."""
    g = clean_grid(analysis)
    return {
        "grid_bpm_clean": g.bpm,
        "beat_phase_sec": round(g.beat_phase, 4),
        "bar_phase_sec": round(g.bar_phase, 4),
        "tempo_constant": g.is_constant,
        "tempo_cv": g.tempo_cv,
        "grid_fit_ms": g.fit_ms,
    }


def place_vocal(
    vocal_mono: np.ndarray,
    instr_mono: np.ndarray,
    sr: int,
    vgrid: CleanGrid,
    igrid: CleanGrid,
    rate: float,
) -> tuple[float, dict]:
    """Choose the output-time shift (seconds) for the (already tempo-matched)
    vocal so that:
      * every vocal downbeat lands on an instrumental downbeat (bar lock), and
      * the vocal's energy best overlaps the instrumental's energy (its hook
        lands over a strong section).

    Returns ``(shift_s, info)``. ``vocal_mono`` must already be tempo-stretched
    to the output tempo (constant ``rate``).
    """
    nominal = 1.0 / rate if rate > 0 else 1.0
    # Vocal's first bar line, mapped into the (stretched) output timeline.
    v_bar_phase_out = vgrid.bar_phase * nominal
    bar_out = igrid.bar_period  # output bar length (== vocal's when BPM matched)
    if bar_out <= 0:
        return float(igrid.bar_phase - v_bar_phase_out), {"bar_offset": 0, "placement_score": 0.0}

    env_v, esr = energy_env(vocal_mono, sr)
    env_i, _ = energy_env(instr_mono, sr)
    instr_dur = instr_mono.size / sr
    vocal_dur = vocal_mono.size / sr
    L = env_v.size

    # Base anchor: the instrumental downbeat nearest to overlaying the two from
    # the top. We then slide by whole bars (which preserves the downbeat lock).
    m0 = round((v_bar_phase_out - igrid.bar_phase) / bar_out)

    # Only consider offsets where the vocal still substantially overlaps the
    # instrumental (>= COVER of the vocal inside the track) — otherwise a tiny
    # highly-correlated sliver near an edge wins and the vocal falls off the end.
    COVER = 0.80
    lo_shift = -(1.0 - COVER) * vocal_dur
    hi_shift = instr_dur - COVER * vocal_dur
    if hi_shift < lo_shift:  # vocal longer than track: just overlay from the top
        lo_shift = hi_shift = 0.0

    # Search a limited window (a few phrases) around full overlay, not the whole
    # track — a vocal/beat energy correlation is weak, so a distant sliver must
    # never win and trim the song.
    WINDOW_BARS = 16
    m_lo = max(int(np.floor((lo_shift + v_bar_phase_out - igrid.bar_phase) / bar_out)), m0 - WINDOW_BARS)
    m_hi = min(int(np.ceil((hi_shift + v_bar_phase_out - igrid.bar_phase) / bar_out)), m0 + WINDOW_BARS)

    def score_for(m: int):
        anchor = igrid.bar_phase + m * bar_out
        shift = anchor - v_bar_phase_out
        start = int(round(shift * esr))
        if start < 0:
            seg_v = env_v[-start:]
            seg_i = env_i
        else:
            seg_i = env_i[start : start + L]
            seg_v = env_v
        n = min(seg_v.size, seg_i.size)
        if n < 8 or n < COVER * L * 0.5:
            return None, shift
        seg_v = seg_v[:n]
        seg_i = seg_i[:n]
        denom = (np.linalg.norm(seg_v) + 1e-9) * (np.linalg.norm(seg_i) + 1e-9)
        return float(np.dot(seg_v, seg_i) / denom), shift

    # Full-overlay (from the top) is the default; only move off it if another
    # placement beats it by a clear margin.
    base_score, base_shift = score_for(m0)
    base_score = base_score if base_score is not None else 0.0

    cand_score, cand_shift, cand_m = -np.inf, base_shift, 0
    for m in range(m_lo, m_hi + 1):
        if m == m0:
            continue
        s, shift = score_for(m)
        if s is not None and s > cand_score:
            cand_score, cand_shift, cand_m = s, shift, m - m0

    # Only abandon the full overlay for a decisively strong, clearly-better match
    # (energy correlation between a vocal and a beat is inherently weak, so a
    # marginal edge must NOT trim the song).
    MARGIN = 0.08
    STRONG = 0.35
    if cand_score >= STRONG and cand_score > base_score + MARGIN:
        best_score, best_shift, best_m = cand_score, cand_shift, cand_m
    else:
        best_score, best_shift, best_m = base_score, base_shift, 0

    info = {
        "bar_offset": int(best_m),
        "placement_score": round(float(best_score), 4),
        "anchor_sec": round(float(best_shift + v_bar_phase_out), 3),
    }
    return float(best_shift), info

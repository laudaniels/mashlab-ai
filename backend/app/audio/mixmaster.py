"""Auto mix + master chain for the mashup ("one-button producer").

Turns a raw vocal-over-instrumental sum into a balanced, clean, loudness-
normalized master using the techniques pros rely on:

- Vocal high-pass + gentle compression (consistency) + presence/air lift.
- Dynamic frequency carving: an STFT "spectral ducker" that pulls the
  instrumental down in the vocal's frequency range *only when the vocal is
  present* (Trackspacer-style), creating a natural pocket.
- Subtle shared reverb on the vocal to glue it into the same space.
- Gain staging so the lead vocal sits a few dB above the instrumental.
- LUFS normalization (-14 integrated) + a true-peak limiter (-1 dBTP).

Everything is numpy/scipy so it runs anywhere. Signals are float32 arrays
shaped ``(channels, n)``.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy import signal as spsig
from scipy import ndimage

try:
    import pyloudnorm as pyln

    _HAVE_PYLN = True
except Exception:  # pragma: no cover
    _HAVE_PYLN = False


# --------------------------------------------------------------------------- #
# Small DSP helpers
# --------------------------------------------------------------------------- #
def _as_2d(y: np.ndarray) -> np.ndarray:
    if y.ndim == 1:
        y = np.vstack([y, y])
    return y.astype(np.float32, copy=False)


def _rbj_biquad(kind: str, sr: int, f0: float, gain_db: float, q: float):
    """RBJ audio-EQ cookbook biquad coefficients (b, a)."""
    A = 10 ** (gain_db / 40.0)
    w0 = 2 * np.pi * f0 / sr
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2 * q)
    if kind == "peaking":
        b0 = 1 + alpha * A
        b1 = -2 * cw
        b2 = 1 - alpha * A
        a0 = 1 + alpha / A
        a1 = -2 * cw
        a2 = 1 - alpha / A
    elif kind == "lowshelf":
        s = 2 * np.sqrt(A) * alpha
        b0 = A * ((A + 1) - (A - 1) * cw + s)
        b1 = 2 * A * ((A - 1) - (A + 1) * cw)
        b2 = A * ((A + 1) - (A - 1) * cw - s)
        a0 = (A + 1) + (A - 1) * cw + s
        a1 = -2 * ((A - 1) + (A + 1) * cw)
        a2 = (A + 1) + (A - 1) * cw - s
    elif kind == "highshelf":
        s = 2 * np.sqrt(A) * alpha
        b0 = A * ((A + 1) + (A - 1) * cw + s)
        b1 = -2 * A * ((A - 1) + (A + 1) * cw)
        b2 = A * ((A + 1) + (A - 1) * cw - s)
        a0 = (A + 1) - (A - 1) * cw + s
        a1 = 2 * ((A - 1) - (A + 1) * cw)
        a2 = (A + 1) - (A - 1) * cw - s
    else:
        raise ValueError(kind)
    b = np.array([b0, b1, b2]) / a0
    a = np.array([1.0, a1 / a0, a2 / a0])
    return b, a


def _apply_biquad(y: np.ndarray, b, a) -> np.ndarray:
    return np.vstack([spsig.lfilter(b, a, ch) for ch in y]).astype(np.float32)


def highpass(y: np.ndarray, sr: int, fc: float = 90.0, order: int = 4) -> np.ndarray:
    """Zero-phase Butterworth high-pass to clear vocal rumble/DC."""
    y = _as_2d(y)
    sos = spsig.butter(order, fc / (sr / 2), btype="high", output="sos")
    return np.vstack([spsig.sosfiltfilt(sos, ch) for ch in y]).astype(np.float32)


def peaking_eq(y: np.ndarray, sr: int, f0: float, gain_db: float, q: float = 1.0) -> np.ndarray:
    if abs(gain_db) < 1e-3:
        return y
    return _apply_biquad(_as_2d(y), *_rbj_biquad("peaking", sr, f0, gain_db, q))


def shelf_eq(y: np.ndarray, sr: int, f0: float, gain_db: float, kind: str, q: float = 0.707) -> np.ndarray:
    if abs(gain_db) < 1e-3:
        return y
    return _apply_biquad(_as_2d(y), *_rbj_biquad(kind, sr, f0, gain_db, q))


def _linked_detector(y: np.ndarray) -> np.ndarray:
    """Stereo-linked detector signal (max abs across channels)."""
    return np.max(np.abs(y), axis=0)


def _smooth_gain(
    gain: np.ndarray, sr: int, atk_ms: float, rel_ms: float, ctrl_decim: int = 32
) -> np.ndarray:
    """Attack/release smoothing of a per-sample gain (<=1).

    The attack/release recursion is inherently sequential, so we run it at a
    decimated *control rate* (as hardware/plugin compressors do internally) and
    interpolate back to audio rate. Block-min decimation preserves fast attacks.
    """
    n = gain.size
    pad = (-n) % ctrl_decim
    g = np.pad(gain, (0, pad), constant_values=1.0)
    ctrl = g.reshape(-1, ctrl_decim).min(axis=1)  # worst-case gain per block
    csr = sr / ctrl_decim
    atk = np.exp(-1.0 / (max(atk_ms, 0.01) * 1e-3 * csr))
    rel = np.exp(-1.0 / (max(rel_ms, 0.01) * 1e-3 * csr))
    out = np.empty_like(ctrl)
    cur = 1.0
    for i in range(ctrl.size):
        target = ctrl[i]
        coef = atk if target < cur else rel  # attack when gain drops
        cur = coef * cur + (1 - coef) * target
        out[i] = cur
    centers = np.arange(ctrl.size) * ctrl_decim + ctrl_decim / 2.0
    return np.interp(np.arange(n), centers, out).astype(np.float32)


def compress(
    y: np.ndarray,
    sr: int,
    threshold_db: float = -22.0,
    ratio: float = 3.0,
    atk_ms: float = 8.0,
    rel_ms: float = 120.0,
    knee_db: float = 6.0,
    makeup_db: float | None = None,
) -> np.ndarray:
    """Feed-forward, stereo-linked compressor for vocal consistency."""
    y = _as_2d(y)
    det = _linked_detector(y)
    eps = 1e-9
    level_db = 20 * np.log10(det + eps)

    # Soft-knee static gain curve -> desired output level.
    over = level_db - threshold_db
    gr_db = np.zeros_like(level_db)
    half = knee_db / 2.0
    if knee_db > 0:
        knee = (over > -half) & (over < half)
        gr_db[knee] = (1.0 / ratio - 1.0) * (over[knee] + half) ** 2 / (2 * knee_db)
        above = over >= half
        gr_db[above] = (1.0 / ratio - 1.0) * over[above]
    else:
        above = over > 0
        gr_db[above] = (1.0 / ratio - 1.0) * over[above]

    lin_gain = 10 ** (gr_db / 20.0)
    lin_gain = _smooth_gain(lin_gain, sr, atk_ms, rel_ms)

    if makeup_db is None:
        # Auto makeup: roughly restore the level lost at the threshold.
        makeup_db = -threshold_db * (1 - 1 / ratio) * 0.5
    out = y * lin_gain[None, :] * (10 ** (makeup_db / 20.0))
    return out.astype(np.float32)


# --------------------------------------------------------------------------- #
# Spectral ducking (dynamic frequency carving)
# --------------------------------------------------------------------------- #
def spectral_duck(
    instr: np.ndarray,
    vocal: np.ndarray,
    sr: int,
    max_reduction_db: float = 4.0,
    f_lo: float = 300.0,
    f_hi: float = 8000.0,
    sensitivity_db: float = 18.0,
    n_fft: int = 2048,
    hop: int = 512,
) -> np.ndarray:
    """Duck the instrumental in the vocal's frequency range, only where the
    vocal has energy. A stereo-linked, time/frequency-smoothed spectral notch.
    """
    instr = _as_2d(instr)
    vocal = _as_2d(vocal)
    n = instr.shape[1]

    win = spsig.windows.hann(n_fft, sym=False)
    v_mono = np.mean(vocal, axis=0)

    f, t, Vz = spsig.stft(v_mono, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop, boundary="zeros")
    Vmag = np.abs(Vz)

    # Vocal "presence" per bin: how far above a per-bin noise floor it sits.
    floor = np.percentile(Vmag, 20, axis=1, keepdims=True) + 1e-6
    v_db = 20 * np.log10(Vmag / floor + 1e-9)
    activity = np.clip(v_db / sensitivity_db, 0.0, 1.0)  # 0..1

    # Frequency band mask (raised-cosine edges) limiting carving to f_lo..f_hi.
    band = np.zeros_like(f)
    edge = 0.25
    for i, freq in enumerate(f):
        if f_lo <= freq <= f_hi:
            band[i] = 1.0
        elif f_lo * (1 - edge) < freq < f_lo:
            band[i] = (freq - f_lo * (1 - edge)) / (f_lo * edge)
        elif f_hi < freq < f_hi * (1 + edge):
            band[i] = 1.0 - (freq - f_hi) / (f_hi * edge)
    band = np.clip(band, 0.0, 1.0)[:, None]

    reduction_db = max_reduction_db * activity * band  # (freq, time)
    # Smooth across frequency (blur) and time (attack/release) to avoid artifacts.
    reduction_db = spsig.savgol_filter(reduction_db, 5, 2, axis=0, mode="nearest")
    reduction_db = np.clip(reduction_db, 0.0, max_reduction_db)
    a_t = 0.5  # time smoothing
    for j in range(1, reduction_db.shape[1]):
        reduction_db[:, j] = a_t * reduction_db[:, j - 1] + (1 - a_t) * reduction_db[:, j]
    gain = 10 ** (-reduction_db / 20.0)  # (freq, time), linked across channels

    out_ch = []
    for ch in instr:
        _, _, Iz = spsig.stft(ch, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop, boundary="zeros")
        m = min(Iz.shape[1], gain.shape[1])
        Iz[:, :m] *= gain[:, :m]
        _, rec = spsig.istft(Iz, fs=sr, window=win, nperseg=n_fft, noverlap=n_fft - hop, boundary=True)
        if rec.size < n:
            rec = np.pad(rec, (0, n - rec.size))
        out_ch.append(rec[:n])
    return np.vstack(out_ch).astype(np.float32)


# --------------------------------------------------------------------------- #
# Reverb glue
# --------------------------------------------------------------------------- #
def _make_ir(sr: int, decay_s: float = 0.6, predelay_ms: float = 12.0) -> np.ndarray:
    """Synthetic decaying-noise stereo impulse response for a small room."""
    n = int(decay_s * sr)
    t = np.arange(n) / sr
    env = np.exp(-t / (decay_s / 4.0))
    rng = np.random.default_rng(7)
    ir = rng.standard_normal((2, n)) * env[None, :]
    # Gentle low-pass so the tail isn't fizzy.
    sos = spsig.butter(2, 6500 / (sr / 2), btype="low", output="sos")
    ir = np.vstack([spsig.sosfilt(sos, c) for c in ir])
    pre = int(predelay_ms * 1e-3 * sr)
    ir = np.pad(ir, ((0, 0), (pre, 0)))
    ir /= np.max(np.abs(ir)) + 1e-9
    return ir.astype(np.float32)


def reverb(y: np.ndarray, sr: int, wet: float = 0.12, decay_s: float = 0.6) -> np.ndarray:
    """Add a subtle stereo reverb (wet/dry mix) to glue the vocal into space."""
    if wet <= 1e-4:
        return y
    y = _as_2d(y)
    ir = _make_ir(sr, decay_s=decay_s)
    n = y.shape[1]
    wet_sig = np.vstack([
        spsig.fftconvolve(y[c % y.shape[0]], ir[c], mode="full")[:n] for c in range(2)
    ])
    peak = np.max(np.abs(wet_sig)) + 1e-9
    wet_sig = wet_sig / peak * (np.max(np.abs(y)) + 1e-9)
    return ((1 - wet) * y + wet * wet_sig).astype(np.float32)


# --------------------------------------------------------------------------- #
# Metering, loudness, limiting
# --------------------------------------------------------------------------- #
def measure_lufs(y: np.ndarray, sr: int) -> float:
    y = _as_2d(y)
    if _HAVE_PYLN:
        try:
            meter = pyln.Meter(sr)
            return float(meter.integrated_loudness(y.T))
        except Exception:
            pass
    rms = np.sqrt(np.mean(y ** 2) + 1e-12)
    return float(20 * np.log10(rms + 1e-9))


def _active_mask(y_mono: np.ndarray, sr: int, hop: int = 2048) -> np.ndarray:
    """Boolean per-hop mask of where the (vocal) signal is active."""
    frames = int(np.ceil(y_mono.size / hop))
    rms = np.array([
        np.sqrt(np.mean(y_mono[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(frames)
    ])
    db = 20 * np.log10(rms + 1e-9)
    thresh = db.max() - 25.0  # 25 dB below the vocal's own peak = "active"
    return db > thresh


def active_rms_db(y: np.ndarray, sr: int, ref_mono: np.ndarray | None = None) -> float:
    """RMS (dB) measured only over the active regions of ``ref_mono`` (or self)."""
    y = _as_2d(y)
    mono = np.mean(y, axis=0)
    ref = ref_mono if ref_mono is not None else mono
    hop = 2048
    mask = _active_mask(ref, sr, hop)
    vals = []
    for i, on in enumerate(mask):
        if on:
            seg = mono[i * hop:(i + 1) * hop]
            vals.append(np.mean(seg ** 2))
    if not vals:
        return 20 * np.log10(np.sqrt(np.mean(mono ** 2) + 1e-12) + 1e-9)
    return float(10 * np.log10(np.mean(vals) + 1e-12))


def loudness_normalize(y: np.ndarray, sr: int, target_lufs: float = -14.0) -> tuple[np.ndarray, float]:
    cur = measure_lufs(y, sr)
    gain_db = target_lufs - cur
    gain_db = float(np.clip(gain_db, -24, 24))
    return (_as_2d(y) * 10 ** (gain_db / 20.0)).astype(np.float32), cur


def true_peak_limit(
    y: np.ndarray, sr: int, ceiling_db: float = -1.0,
    atk_ms: float = 1.5, rel_ms: float = 80.0, oversample: int = 4,
) -> np.ndarray:
    """Look-ahead brick-wall limiter. Gain is computed/applied at base rate
    with a look-ahead window; a final oversampled check + trim tames residual
    inter-sample (true) peaks."""
    y = _as_2d(y)
    ceiling = 10 ** (ceiling_db / 20.0)
    det = _linked_detector(y)
    need = np.where(det > ceiling, ceiling / np.maximum(det, 1e-9), 1.0)
    # Look-ahead: pull the required reduction earlier so attacks never clip.
    look = max(1, int(atk_ms * 1e-3 * sr))
    need = ndimage.minimum_filter1d(need, size=2 * look + 1, mode="nearest")
    gain = _smooth_gain(need, sr, atk_ms, rel_ms)
    out = y * gain[None, :]

    # Catch inter-sample peaks: measure on an oversampled copy and trim if hot.
    up = spsig.resample_poly(out, oversample, 1, axis=1)
    tp = np.max(np.abs(up)) + 1e-12
    if tp > ceiling:
        out = out * (ceiling / tp)
    return np.clip(out, -ceiling, ceiling).astype(np.float32)


# --------------------------------------------------------------------------- #
# Orchestrator
# --------------------------------------------------------------------------- #
@dataclass
class MixReport:
    preset: str
    vocal_lead_db: float
    carve_db: float
    reverb_wet: float
    input_vocal_rms_db: float = 0.0
    input_instr_rms_db: float = 0.0
    pre_master_lufs: float = 0.0
    out_lufs: float = 0.0
    true_peak_db: float = 0.0
    extras: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        d = self.__dict__.copy()
        d.update(d.pop("extras"))
        return {k: (round(v, 2) if isinstance(v, float) else v) for k, v in d.items()}


_PRESETS = {
    # preset -> (hpf, comp, shelves, carve_db, reverb_wet)
    "full": dict(hpf=True, comp=True, shelves=True, carve_db=4.0, reverb_wet=0.12),
    "balanced": dict(hpf=True, comp=True, shelves=False, carve_db=3.0, reverb_wet=0.0),
    "light": dict(hpf=True, comp=False, shelves=False, carve_db=0.0, reverb_wet=0.0),
    "off": dict(hpf=False, comp=False, shelves=False, carve_db=0.0, reverb_wet=0.0),
}


def _measure_true_peak_db(y: np.ndarray, sr: int, oversample: int = 4) -> float:
    up = spsig.resample_poly(_as_2d(y), oversample, 1, axis=1)
    peak = np.max(np.abs(up)) + 1e-12
    return float(20 * np.log10(peak))


def auto_mix_master(
    acap: np.ndarray,
    instr: np.ndarray,
    sr: int,
    *,
    preset: str = "full",
    vocal_lead_db: float = 4.0,
    target_lufs: float = -14.0,
    make_stems: bool = False,
) -> tuple[np.ndarray, MixReport]:
    """Full auto mix + master. ``acap`` and ``instr`` must already be tempo/key
    matched and time-aligned (same length, ``(channels, n)``)."""
    cfg = _PRESETS.get(preset, _PRESETS["full"])
    acap = _as_2d(acap).copy()
    instr = _as_2d(instr).copy()
    n = max(acap.shape[1], instr.shape[1])
    acap = np.pad(acap, ((0, 0), (0, n - acap.shape[1])))
    instr = np.pad(instr, ((0, 0), (0, n - instr.shape[1])))

    report = MixReport(
        preset=preset, vocal_lead_db=vocal_lead_db,
        carve_db=float(cfg["carve_db"]), reverb_wet=float(cfg["reverb_wet"]),
    )

    # --- Vocal chain -------------------------------------------------------
    voc = acap
    if cfg["hpf"]:
        voc = highpass(voc, sr, fc=90.0)
    if cfg["comp"]:
        voc = compress(voc, sr, threshold_db=-22.0, ratio=3.0)
    if cfg["shelves"]:
        voc = peaking_eq(voc, sr, 3000.0, 1.5, q=0.9)   # presence
        voc = shelf_eq(voc, sr, 10000.0, 1.5, "highshelf")  # air
    voc_dry = voc
    if cfg["reverb_wet"] > 0:
        voc = reverb(voc, sr, wet=cfg["reverb_wet"])

    # --- Instrumental carving ---------------------------------------------
    beat = instr
    if cfg["carve_db"] > 0:
        beat = spectral_duck(beat, voc_dry, sr, max_reduction_db=cfg["carve_db"])

    # --- Gain staging: vocal sits vocal_lead_db above the beat ------------
    voc_mono = np.mean(voc_dry, axis=0)
    v_rms = active_rms_db(voc, sr, ref_mono=voc_mono)
    i_rms = active_rms_db(beat, sr, ref_mono=voc_mono)
    report.input_vocal_rms_db = v_rms
    report.input_instr_rms_db = i_rms
    # Bring the beat so vocal is vocal_lead_db above it (adjust beat only).
    desired_i = v_rms - vocal_lead_db
    beat_gain_db = float(np.clip(desired_i - i_rms, -12, 12))
    beat = beat * 10 ** (beat_gain_db / 20.0)
    report.extras["beat_gain_db"] = round(beat_gain_db, 2)

    mix = voc + beat

    # --- Mix-bus headroom before mastering --------------------------------
    peak = np.max(np.abs(mix)) + 1e-9
    if peak > 0.5:
        mix = mix * (0.5 / peak)  # ~ -6 dBFS headroom

    report.pre_master_lufs = measure_lufs(mix, sr)

    # --- Master: LUFS normalize + true-peak limit -------------------------
    if preset == "off":
        # Transparent: just normalize + limit.
        mix, _ = loudness_normalize(mix, sr, target_lufs)
    else:
        mix, _ = loudness_normalize(mix, sr, target_lufs)
    mix = true_peak_limit(mix, sr, ceiling_db=-1.0)
    # Re-check integrated loudness post-limit and nudge if needed.
    post = measure_lufs(mix, sr)
    if np.isfinite(post):
        trim = float(np.clip(target_lufs - post, -3, 3))
        if abs(trim) > 0.3:
            mix = true_peak_limit(mix * 10 ** (trim / 20.0), sr, ceiling_db=-1.0)

    report.out_lufs = measure_lufs(mix, sr)
    report.true_peak_db = _measure_true_peak_db(mix, sr)

    if make_stems:
        report.extras["stems"] = {"vocal": voc, "beat": beat}
    return mix.astype(np.float32), report

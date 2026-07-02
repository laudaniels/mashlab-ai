"""The mashup pipeline: match tempo + key of the acapella to the instrumental,
align downbeats, then mix into a single stereo track."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from . import analysis, gridsync, mixmaster, remix_brain, validate
from .io_utils import SAMPLE_RATE, load_audio, to_mono, write_mp3, write_wav
from .remix_brain import UserOverrides


def rubberband_available() -> bool:
    return shutil.which("rubberband") is not None


def _rubberband_process(
    y: np.ndarray,
    sr: int,
    rate: float,
    semitones: float,
    *,
    timemap: list[tuple[int, int]] | None = None,
    total_t: float | None = None,
    fine: bool = True,
) -> np.ndarray:
    """Run the Rubber Band CLI on a ``(channels, n)`` signal.

    ``rate`` > 1 speeds up (shortens). Formants are always preserved so vocals
    keep their natural timbre while only the key shifts.

    - ``fine=True`` uses the R3 ("finer") engine — the highest-fidelity,
      Pitch-'n-Time-style analysis/re-synthesis engine — for a *constant* stretch.
    - ``timemap`` supplies key-frame ``(source_frame, target_frame)`` pairs for a
      *variable* stretch that warps the audio onto a moving beat grid. Time maps
      are only supported by the R2 engine in this build, so passing a ``timemap``
      forces R2 (still high quality with formant preservation + max crispness).
    """
    exe = shutil.which("rubberband")
    # Overall duration factor (output/input). Defaults to a constant 1/rate.
    t_factor = total_t if total_t is not None else (1.0 / rate)
    with tempfile.TemporaryDirectory() as tmp:
        in_path = Path(tmp) / "in.wav"
        out_path = Path(tmp) / "out.wav"
        sf.write(str(in_path), y.T, sr, subtype="PCM_24")

        cmd = [exe, "-q"]
        if timemap is not None:
            cmd += ["-2", "-c", "6"]  # R2 supports time maps
            map_path = Path(tmp) / "map.txt"
            map_path.write_text(
                "\n".join(f"{int(s)} {int(t)}" for s, t in timemap),
                encoding="ascii",
            )
            cmd += ["-M", str(map_path)]
        elif fine:
            cmd += ["-3"]  # R3 finer engine
        else:
            cmd += ["-2", "-c", "6"]

        cmd += ["-t", f"{t_factor:.9f}", "-p", f"{semitones:.5f}", "-F", "--centre-focus"]
        cmd += [str(in_path), str(out_path)]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"rubberband failed: {proc.stderr[-300:]}")

        data, _ = sf.read(str(out_path), dtype="float32", always_2d=True)
    out = data.T.copy()
    if out.shape[0] == 1:
        out = np.vstack([out, out])
    return out


def stretch_and_pitch(y: np.ndarray, sr: int, rate: float, semitones: float) -> np.ndarray:
    """Match tempo (``rate``) and key (``semitones``) with a constant stretch.

    Prefers the Rubber Band R3 engine for professional quality; falls back to
    librosa's phase vocoder + resampling pitch shift when Rubber Band is missing.
    """
    no_stretch = abs(rate - 1.0) < 1e-4
    no_pitch = abs(semitones) < 1e-4
    if no_stretch and no_pitch:
        return y

    if rubberband_available():
        try:
            return _rubberband_process(y, sr, rate, semitones, fine=True)
        except Exception:
            pass

    out = y
    if not no_stretch:
        out = np.vstack([librosa.effects.time_stretch(ch, rate=rate) for ch in out])
    if not no_pitch:
        out = np.vstack(
            [librosa.effects.pitch_shift(ch, sr=sr, n_steps=semitones) for ch in out]
        )
    return out


# Local warp is clamped so a single mis-detected beat can never stretch a segment
# by more than +/-30% versus the global rate (prevents audible wobble/artifacts).
_WARP_SLOPE_TOL = 0.30


def _build_beat_timemap(
    acap_beats: list[float],
    acap_first_downbeat: float,
    instr_beats: list[float],
    target_pos: float,
    shift_s: float,
    rate: float,
    sr: int,
    total_src_frames: int,
) -> tuple[list[tuple[int, int]], float] | None:
    """Build a Rubber Band time map that snaps each acapella beat onto the
    nearest instrumental grid beat, so the vocal stays locked to the beat across
    the whole track (correcting drift) rather than only at the first downbeat.

    Correspondence is by *time proximity*, not beat index, so it is robust when
    the two grids report different beat counts. A beat is only nudged onto the
    grid if the nearest instrumental beat is within half a beat of its
    constant-rate position; otherwise it keeps the constant-rate timing.

    Returns ``(timemap, total_t)`` or ``None`` when warping isn't safe. The
    target timeline ``u`` is the *stretched acapella file* timeline, i.e.
    ``u = output_time - shift_s`` (placement is applied afterwards).
    """
    if len(acap_beats) < 4 or len(instr_beats) < 4 or rate <= 0:
        return None

    a = np.asarray(sorted(float(x) for x in acap_beats), dtype=float)
    ib = np.asarray(sorted(float(x) for x in instr_beats), dtype=float)

    nominal = 1.0 / rate  # seconds out per second in
    lo, hi = nominal * (1.0 - _WARP_SLOPE_TOL), nominal * (1.0 + _WARP_SLOPE_TOL)

    # Snap tolerance = half the (output) beat period, from the instrumental grid.
    beat_period_out = float(np.median(np.diff(ib))) if ib.size > 1 else 0.5
    tol = 0.5 * beat_period_out

    total_src_time = total_src_frames / sr

    # Raw (src_time, desired_u) anchors: snap each beat to the nearest grid beat
    # when close enough, otherwise keep the constant-rate position.
    raw: list[tuple[float, float]] = [(0.0, 0.0)]
    for src_t in a:
        if src_t <= 1e-4:
            continue
        lin_u = src_t * nominal                # constant-rate position (u-timeline)
        lin_out = lin_u + shift_s              # ... in the output timeline
        k = int(np.argmin(np.abs(ib - lin_out)))
        if abs(ib[k] - lin_out) <= tol:
            u = ib[k] - shift_s                # snap onto the grid beat
        else:
            u = lin_u                          # leave alone (no nearby grid beat)
        raw.append((src_t, u))
    raw.append((total_src_time, total_src_time * nominal))

    # Enforce strictly increasing source, then clamp each segment's slope so the
    # warp never deviates too far from the global rate.
    anchors: list[tuple[float, float]] = [raw[0]]
    for src_t, u in raw[1:]:
        ps, pu = anchors[-1]
        ds = src_t - ps
        if ds <= 1e-3:  # dedupe near-coincident beats
            continue
        slope = (u - pu) / ds
        slope = float(np.clip(slope, lo, hi))
        anchors.append((src_t, pu + slope * ds))

    if len(anchors) < 3:
        return None

    total_u = anchors[-1][1]
    total_t = total_u / total_src_time if total_src_time > 0 else nominal

    frames: list[tuple[int, int]] = []
    last_src = last_tgt = -1
    for src_t, u in anchors:
        sf_i = int(round(src_t * sr))
        tf_i = int(round(u * sr))
        if sf_i <= last_src or tf_i <= last_tgt:
            continue
        frames.append((sf_i, tf_i))
        last_src, last_tgt = sf_i, tf_i

    if len(frames) < 3:
        return None
    return frames, total_t


def stretch_warp_pitch(
    y: np.ndarray,
    sr: int,
    rate: float,
    semitones: float,
    timemap: list[tuple[int, int]],
    total_t: float,
) -> np.ndarray:
    """Variable (beat-locked) stretch + constant key shift, formants preserved.

    Falls back to a constant stretch if Rubber Band is unavailable or errors.
    """
    if rubberband_available():
        try:
            return _rubberband_process(
                y, sr, rate, semitones, timemap=timemap, total_t=total_t, fine=False
            )
        except Exception:
            pass
    return stretch_and_pitch(y, sr, rate, semitones)


def _pad_to(y: np.ndarray, length: int) -> np.ndarray:
    if y.shape[-1] >= length:
        return y[:, :length]
    pad = length - y.shape[-1]
    return np.pad(y, ((0, 0), (0, pad)))


def _place(y: np.ndarray, offset_samples: int) -> np.ndarray:
    """Shift a signal in time. Positive offset prepends silence; negative trims."""
    if offset_samples > 0:
        return np.pad(y, ((0, 0), (offset_samples, 0)))
    if offset_samples < 0:
        return y[:, -offset_samples:]
    return y


def _soft_limit(y: np.ndarray, ceiling: float = 0.97) -> np.ndarray:
    """Peak-normalize down if hot, then apply a gentle tanh limiter for safety."""
    peak = np.max(np.abs(y)) if y.size else 0.0
    if peak > ceiling:
        y = y * (ceiling / peak)
    return np.tanh(y * 1.05) / np.tanh(1.05) * ceiling


def _snap_time(t: float, beat_times, downbeat_times, mode: str) -> float:
    """Snap ``t`` to the nearest beat ("beat") or bar/downbeat ("bar")."""
    arr = downbeat_times if mode == "bar" else beat_times
    if not arr:
        return t
    a = np.asarray(arr, dtype=float)
    idx = int(np.argmin(np.abs(a - t)))
    return float(a[idx])


@dataclass
class RemixResult:
    wav_path: Path
    mp3_path: Path
    params: dict
    acapella_analysis: dict
    instrumental_analysis: dict


def build_mashup(
    acapella_path: str,
    instrumental_path: str,
    out_dir: str,
    *,
    target_bpm: float | None = None,
    semitones: float | None = None,
    offset_ms: float = 0.0,
    acapella_gain: float = 1.0,
    instrumental_gain: float = 1.0,
    downbeat_shift: int = 0,
    snap: str = "off",
    acapella_tempo_mult: float = 1.0,
    instrumental_tempo_mult: float = 1.0,
    beat_lock: bool = True,
    auto_placement: bool = True,
    remix_mode: str = "clean_blend",
    mix_preset: str = "full",
    target_lufs: float = -14.0,
    acap_analysis: dict | None = None,
    instr_analysis: dict | None = None,
    make_mp3: bool = True,
    align_offset_ms: float | None = None,
    section_start_sec: float | None = None,
    section_duration_sec: float | None = None,
) -> RemixResult:
    sr = SAMPLE_RATE
    out_dir_p = Path(out_dir)
    out_dir_p.mkdir(parents=True, exist_ok=True)

    acap, _ = load_audio(acapella_path, sr=sr)
    instr, _ = load_audio(instrumental_path, sr=sr)
    acap_mono = to_mono(acap)
    instr_mono = to_mono(instr)

    acap_an = acap_analysis or analysis.analyze_file(acapella_path).to_dict()
    instr_an = instr_analysis or analysis.analyze_file(instrumental_path).to_dict()

    vgrid = gridsync.clean_grid(acap_an)
    igrid = gridsync.clean_grid(instr_an)

    overrides = UserOverrides(
        target_bpm=target_bpm,
        semitones=semitones,
        offset_ms=offset_ms,
        downbeat_shift=downbeat_shift,
        snap=snap if snap in ("off", "beat", "bar") else "off",
        acapella_tempo_mult=acapella_tempo_mult,
        instrumental_tempo_mult=instrumental_tempo_mult,
        section_start_sec=section_start_sec,
        section_duration_sec=section_duration_sec,
        manual_only=False,
    )

    plan, candidates, _, _ = remix_brain.pick_best_plan(
        acap_an,
        instr_an,
        overrides,
        vocal_mono=acap_mono,
        instr_mono=instr_mono,
        sr=sr,
        align_offset_ms=align_offset_ms,
    )

    rate = plan.tempo_ratio
    semitones = plan.vocal_pitch_shift_semitones
    target_bpm = plan.target_bpm
    shift_s = plan.shift_seconds

    grid_instr_bpm = igrid.bpm * float(instrumental_tempo_mult)
    tempo_reinterpreted = (
        abs(acapella_tempo_mult - 1.0) > 1e-6 or abs(instrumental_tempo_mult - 1.0) > 1e-6
    )
    tempo_matched = abs(target_bpm - grid_instr_bpm) < 1e-3

    acap_proc = stretch_and_pitch(acap, sr, rate, semitones)

    drifting = (not vgrid.is_constant) or (not igrid.is_constant)
    do_warp = beat_lock and drifting and tempo_matched and not tempo_reinterpreted
    warp_applied = False
    warp_anchors = 0
    if do_warp:
        anchor_pos = shift_s + plan.vocal_anchor_sec / rate
        timemap_result = _build_beat_timemap(
            acap_an.get("beat_times") or [],
            float(acap_an.get("first_downbeat_sec") or 0.0),
            instr_an.get("beat_times") or [],
            anchor_pos,
            shift_s,
            rate,
            sr,
            acap.shape[-1],
        )
        if timemap_result is not None:
            timemap, total_t = timemap_result
            acap_proc = stretch_warp_pitch(acap, sr, rate, semitones, timemap, total_t)
            warp_applied = True
            warp_anchors = len(timemap)

    shift_samples = int(round(shift_s * sr))
    acap_placed = _place(acap_proc, shift_samples)

    out_len = max(instr.shape[-1], acap_placed.shape[-1])
    instr_p = _pad_to(instr, out_len)
    acap_p = _pad_to(acap_placed, out_len)

    mix_report: dict = {"preset": mix_preset}
    if mix_preset == "off":
        mix = instr_p * float(instrumental_gain) + acap_p * float(acapella_gain)
        mix = _soft_limit(mix)
    else:
        lead = 4.0 + 20.0 * np.log10(max(acapella_gain, 1e-3)) - 20.0 * np.log10(
            max(instrumental_gain, 1e-3)
        )
        mix, report = mixmaster.auto_mix_master(
            acap_p, instr_p, sr,
            preset=mix_preset,
            vocal_lead_db=float(np.clip(lead, -6, 14)),
            target_lufs=target_lufs,
        )
        mix_report = report.to_dict()

    validation = validate.validate_render(mix, sr, plan, mix_report)

    wav_path = write_wav(out_dir_p / "remix.wav", mix, sr)
    mp3_path = write_mp3(out_dir_p / "remix.mp3", mix, sr) if make_mp3 else wav_path

    plan_ui = remix_brain.plan_summary_for_ui(plan)
    confidence_tier = validation.confidence_tier

    params = {
        "target_bpm": round(float(target_bpm), 2),
        "semitones": round(float(semitones), 2),
        "offset_ms": round(float(offset_ms), 1),
        "acapella_gain": round(float(acapella_gain), 3),
        "instrumental_gain": round(float(instrumental_gain), 3),
        "stretch_rate": round(float(rate), 4),
        "downbeat_shift": int(downbeat_shift),
        "snap": snap,
        "acapella_tempo_mult": float(acapella_tempo_mult),
        "instrumental_tempo_mult": float(instrumental_tempo_mult),
        "placed_downbeat_sec": round(float(plan.instrumental_anchor_sec), 4),
        "rubberband": rubberband_available(),
        "beat_lock": bool(beat_lock),
        "warp_applied": bool(warp_applied),
        "warp_anchors": int(warp_anchors),
        "remix_mode": remix_mode,
        "section_start_sec": section_start_sec,
        "section_duration_sec": section_duration_sec,
        "engine": (
            "Remix Brain · R2 warp (drift)" if warp_applied
            else ("Remix Brain · R3" if rubberband_available() else "Remix Brain · librosa")
        ),
        "grid": {
            "vocal_bpm": vgrid.bpm,
            "beat_bpm": igrid.bpm,
            "vocal_constant": vgrid.is_constant,
            "beat_constant": igrid.is_constant,
            "tempo_matched": bool(tempo_matched),
            "placement_mode": "brain" if auto_placement else "manual",
            "bar_offset": downbeat_shift,
            "placement_score": plan.score,
            "base_shift_sec": shift_s,
        },
        "mix_preset": mix_preset,
        "mix": mix_report,
        "plan": plan.to_dict(),
        "plan_summary": plan_ui,
        "candidates": [c.to_dict() for c in candidates],
        "validation": validation.to_dict(),
        "confidence_tier": confidence_tier,
    }

    return RemixResult(
        wav_path=wav_path,
        mp3_path=mp3_path,
        params=params,
        acapella_analysis=acap_an,
        instrumental_analysis=instr_an,
    )

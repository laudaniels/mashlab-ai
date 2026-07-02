"""Remix Brain: analyze, plan, score, and pick anchor-based mashup alignment."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import harmonic, phrase
from .gridsync import clean_grid
from .models import (
    AnchorType,
    HarmonicCompat,
    PhraseAlignment,
    RemixAnalysis,
    RemixMode,
    RemixPlan,
    confidence_tier_from_score,
)


@dataclass
class UserOverrides:
    target_bpm: float | None = None
    semitones: float | None = None
    offset_ms: float = 0.0
    downbeat_shift: int = 0
    snap: str = "off"
    acapella_tempo_mult: float = 1.0
    instrumental_tempo_mult: float = 1.0
    section_start_sec: float | None = None
    section_duration_sec: float | None = None
    manual_only: bool = False  # skip brain, use manual grid only


def _phrase_window(
    starts: list[float],
    section_start: float | None,
    section_duration: float | None,
) -> list[float]:
    if section_start is None:
        return starts
    end = section_start + (section_duration if section_duration and section_duration > 0 else 1e9)
    window = [t for t in starts if section_start - 1e-3 <= t <= end + 1e-3]
    return window or [section_start]


def build_remix_analysis(
    track_dict: dict,
    role: str,
    y_mono=None,
    sr: int = 44100,
) -> RemixAnalysis:
    """Build RemixAnalysis from stored TrackAnalysis dict + optional audio."""
    duration = float(track_dict.get("duration") or 0.0)
    bpm = float(track_dict.get("grid_bpm_clean") or track_dict.get("bpm") or 0.0)
    beats = [float(x) for x in (track_dict.get("beat_times") or [])]
    downs = [float(x) for x in (track_dict.get("downbeat_times") or [])]
    bpb = int(track_dict.get("beats_per_bar") or 4)
    key = track_dict.get("key")
    key_index = int(track_dict.get("key_index") or 0)
    mode = str(track_dict.get("mode") or "major")
    bpm_conf = float(track_dict.get("bpm_confidence") or 0.0)
    grid_fit = float(track_dict.get("grid_fit_ms") or 0.0)
    tempo_const = bool(track_dict.get("tempo_constant", True))
    basis = str(track_dict.get("grid_source") or "librosa")

    # Downbeat confidence: neural detector + grid fit
    db_conf = 0.85 if basis == "beat_this" and downs else 0.45
    db_conf *= float(np.clip(1.0 - grid_fit / 500.0, 0.3, 1.0))

    phrase_starts = [float(x) for x in (track_dict.get("phrase_starts") or [])]
    if not phrase_starts:
        phrase_starts = phrase.phrase_starts_from_grid(downs, bpb, duration)
    camelot = track_dict.get("camelot") or harmonic.to_camelot(key_index, mode)
    key_conf = 0.7  # KS doesn't expose score in track_dict; conservative default

    energy = [float(x) for x in (track_dict.get("energy_curve") or [])]
    vocal_density_raw = track_dict.get("vocal_density_curve")
    vocal_density = (
        [float(x) for x in vocal_density_raw] if vocal_density_raw else None
    )
    trans = [float(x) for x in (track_dict.get("transient_strength_curve") or [])]
    phrase_len = track_dict.get("phrase_length_bars")

    if y_mono is not None and y_mono.size:
        if not energy:
            energy, vocal_density, trans = phrase.build_curves(
                y_mono, sr, is_vocal=(role == "vocal")
            )
        elif role == "vocal" and vocal_density is None:
            _, vocal_density, _ = phrase.build_curves(y_mono, sr, is_vocal=True)
        if phrase_len is None:
            phrase_len = phrase.estimate_phrase_length_bars(
                np.asarray(vocal_density or energy, dtype=float),
                50.0,
                bpm,
                bpb,
            )
    elif phrase_len is None:
        phrase_len = 8

    return RemixAnalysis(
        source_role="vocal" if role == "vocal" else "instrumental",
        duration_seconds=duration,
        bpm=bpm if bpm > 0 else None,
        bpm_confidence=bpm_conf,
        beats=beats,
        downbeats=downs,
        downbeat_confidence=round(db_conf, 3),
        phrase_starts=phrase_starts,
        phrase_length_bars=phrase_len,
        key=key,
        camelot=camelot,
        key_confidence=key_conf,
        energy_curve=energy,
        vocal_density_curve=vocal_density,
        transient_strength_curve=trans,
        analysis_basis=basis,
        beats_per_bar=bpb,
        grid_bpm_clean=float(track_dict.get("grid_bpm_clean") or bpm),
        beat_phase_sec=float(track_dict.get("beat_phase_sec") or 0.0),
        bar_phase_sec=float(track_dict.get("bar_phase_sec") or 0.0),
        tempo_constant=tempo_const,
        tempo_cv=float(track_dict.get("tempo_cv") or 0.0),
        grid_fit_ms=grid_fit,
        key_index=key_index,
        mode=mode,
    )


def _tempo_mult_candidates(v_bpm: float, i_bpm: float) -> list[float]:
    """Half/double-time reinterpretations."""
    if v_bpm <= 0 or i_bpm <= 0:
        return [1.0]
    ratio = i_bpm / v_bpm
    cands = [1.0]
    for m in (0.5, 2.0):
        if abs(ratio * m - round(ratio * m)) < 0.08 or abs(ratio * m - 1.0) < 0.15:
            cands.append(m)
        # Classic half/double
        if abs(v_bpm * m - i_bpm) / i_bpm < 0.06:
            cands.append(m)
        if abs(v_bpm - i_bpm * m) / v_bpm < 0.06:
            cands.append(1.0 / m)
    return sorted(set(cands))


def _score_tempo(stretch_pct: float, half_double_used: bool) -> tuple[float, list[str]]:
    warnings: list[str] = []
    a = abs(stretch_pct)
    if a <= 3.0:
        return 20.0, warnings
    if a <= 6.0:
        return 14.0, warnings
    if a <= 8.0:
        warnings.append(f"tempo stretch {stretch_pct:.1f}%")
        return 8.0, warnings
    if a <= 12.0 and half_double_used:
        warnings.append(f"large stretch {stretch_pct:.1f}% with half/double fix")
        return 6.0, warnings
    if a > 12.0:
        warnings.append(f"tempo stretch {stretch_pct:.1f}% exceeds safe limit")
        return 0.0, warnings
    return 4.0, warnings


def _score_beat_confidence(v: RemixAnalysis, i: RemixAnalysis) -> float:
    def one(a: RemixAnalysis) -> float:
        fit = float(np.clip(1.0 - a.grid_fit_ms / 300.0, 0.0, 1.0))
        return 15.0 * 0.5 * (a.bpm_confidence + fit) * (1.0 if a.tempo_constant else 0.6)

    return min(15.0, (one(v) + one(i)) / 2.0)


def _score_downbeat(v_type: AnchorType, i_type: AnchorType, v: RemixAnalysis, i: RemixAnalysis) -> float:
    base = 0.5 * (v.downbeat_confidence + i.downbeat_confidence) * 15.0
    if v_type in ("downbeat", "phrase") and i_type in ("downbeat", "phrase"):
        return min(15.0, base)
    if v_type == "beat" or i_type == "beat":
        return min(15.0, base * 0.6)
    return min(15.0, base * 0.4)


def _score_phrase(v_anchor: float, i_anchor: float, v: RemixAnalysis, i: RemixAnalysis) -> tuple[float, PhraseAlignment]:
    bar_v = 60.0 / (v.bpm or 120) * v.beats_per_bar
    bar_i = 60.0 / (i.bpm or 120) * i.beats_per_bar
    bar = (bar_v + bar_i) / 2.0
    if bar <= 0:
        return 5.0, "weak"
    # Check if anchors align at 8/16/32 bar boundaries relative to first phrase
    def bar_offset(t: float, starts: list[float], mult: int) -> float:
        if not starts:
            return t
        ref = starts[0]
        period = bar * mult
        if period <= 0:
            return t
        return abs((t - ref) % period)

    for mult, score, label in ((32, 20.0, "exact"), (16, 18.0, "exact"), (8, 16.0, "near"), (4, 10.0, "near")):
        ov = bar_offset(v_anchor, v.phrase_starts, mult)
        oi = bar_offset(i_anchor, i.phrase_starts, mult)
        if ov < bar * 0.25 and oi < bar * 0.25:
            return score, label
    return 5.0, "weak"


def _score_bed_space(i: RemixAnalysis, i_anchor: float) -> float:
    if not i.energy_curve or i.duration_seconds <= 0:
        return 5.0
    # Penalize placing vocal over peak instrumental energy (no room)
    idx = int(round(i_anchor / i.duration_seconds * (len(i.energy_curve) - 1)))
    idx = int(np.clip(idx, 0, len(i.energy_curve) - 1))
    e = i.energy_curve[idx]
    mx = max(i.energy_curve) or 1.0
    rel = e / mx
    if rel > 0.95:
        return 3.0
    if rel > 0.85:
        return 6.0
    return 10.0


def _make_plan(
    v: RemixAnalysis,
    i: RemixAnalysis,
    vocal_anchor: float,
    instr_anchor: float,
    v_type: AnchorType,
    i_type: AnchorType,
    target_bpm: float,
    tempo_mult: float,
    pitch_shift: float,
    vocal_pickup: float,
    mode: RemixMode = "clean_blend",
) -> RemixPlan:
    v_bpm_eff = (v.bpm or 120.0) * tempo_mult
    tempo_ratio = target_bpm / v_bpm_eff if v_bpm_eff > 0 else 1.0
    tempo_ratio = float(np.clip(tempo_ratio, 0.5, 2.0))
    stretch_pct = (tempo_ratio - 1.0) * 100.0

    compat, harm_score, harm_warn, _ = harmonic.evaluate_harmony(
        v.key_index, v.mode, v.key_confidence,
        i.key_index, i.mode, pitch_shift,
    )

    half_double = tempo_mult != 1.0
    t_score, t_warn = _score_tempo(stretch_pct, half_double)
    b_score = _score_beat_confidence(v, i)
    d_score = _score_downbeat(v_type, i_type, v, i)
    p_score, p_align = _score_phrase(vocal_anchor, instr_anchor, v, i)
    bed_score = _score_bed_space(i, instr_anchor)
    r_score = 5.0  # render safety assumed ok pre-render

    warnings = list(t_warn) + list(harm_warn)
    breakdown = {
        "tempo": round(t_score, 1),
        "beat": round(b_score, 1),
        "downbeat": round(d_score, 1),
        "phrase": round(p_score, 1),
        "harmonic": round(harm_score, 1),
        "bed_space": round(bed_score, 1),
        "render": round(r_score, 1),
    }
    total = sum(breakdown.values())

    # Anchor placement: vocal anchor lands on instr anchor after stretch
    vocal_anchor_out = vocal_anchor / tempo_ratio
    shift_s = instr_anchor - vocal_anchor_out
    vocal_start = max(0.0, vocal_anchor - vocal_pickup)

    reason = (
        f"Clean Blend: {v_type}ΓåÆ{i_type} anchors @ {instr_anchor:.2f}s, "
        f"stretch {stretch_pct:+.1f}%, key {compat}"
    )

    return RemixPlan(
        mode=mode,
        target_bpm=round(target_bpm, 2),
        vocal_start_seconds=round(vocal_start, 4),
        instrumental_start_seconds=0.0,
        vocal_anchor_sec=round(vocal_anchor, 4),
        instrumental_anchor_sec=round(instr_anchor, 4),
        vocal_anchor_type=v_type,
        instrumental_anchor_type=i_type,
        tempo_ratio=round(tempo_ratio, 5),
        vocal_pitch_shift_semitones=round(pitch_shift, 2),
        phrase_alignment=p_align,
        harmonic_compatibility=compat,
        score=round(total, 1),
        warnings=warnings,
        reason_summary=reason,
        score_breakdown=breakdown,
        vocal_bpm_effective=round(v_bpm_eff, 2),
        vocal_tempo_mult=tempo_mult,
        shift_seconds=round(shift_s, 4),
    )


def generate_candidates(
    vocal: RemixAnalysis,
    instr: RemixAnalysis,
    *,
    align_offset_ms: float | None = None,
    section_start_sec: float | None = None,
    section_duration_sec: float | None = None,
    max_candidates: int = 30,
) -> list[RemixPlan]:
    """Generate scored remix plan candidates."""
    target_bpm = instr.bpm or instr.grid_bpm_clean or 120.0
    tempo_mults = _tempo_mult_candidates(vocal.bpm or 120, target_bpm)

    v_phrases = vocal.phrase_starts[:20] if vocal.phrase_starts else [vocal.bar_phase_sec]
    i_phrases = instr.phrase_starts[:20] if instr.phrase_starts else [instr.bar_phase_sec]
    v_phrases = _phrase_window(v_phrases, section_start_sec, section_duration_sec)
    i_phrases = _phrase_window(i_phrases, section_start_sec, section_duration_sec)

    if not v_phrases:
        v_phrases = [0.0]
    if not i_phrases:
        i_phrases = [0.0]

    pitch = harmonic._shortest_semitone(vocal.key_index, instr.key_index)
    pitch = float(np.clip(pitch, -3, 3))

    plans: list[RemixPlan] = []
    for tm in tempo_mults:
        # Limit cross product ΓÇö sample evenly
        for vp in v_phrases[:: max(1, len(v_phrases) // 5)]:
            for ip in i_phrases[:: max(1, len(i_phrases) // 5)]:
                v_type: AnchorType = "phrase" if vp in vocal.phrase_starts else "downbeat"
                i_type: AnchorType = "phrase" if ip in instr.phrase_starts else "downbeat"
                pickup = 0.0  # filled when audio available in pick_best_plan
                plans.append(
                    _make_plan(vocal, instr, vp, ip, v_type, i_type, target_bpm, tm, pitch, pickup)
                )

    # Overlay anchor: first vocal phrase on first instr downbeat
    if vocal.bar_phase_sec is not None and instr.bar_phase_sec is not None:
        for tm in tempo_mults:
            plans.append(
                _make_plan(
                    vocal, instr,
                    vocal.bar_phase_sec, instr.bar_phase_sec,
                    "downbeat", "downbeat",
                    target_bpm, tm, pitch, 0.0,
                )
            )

    # Align API offset candidate
    if align_offset_ms is not None:
        beat_period = 60.0 / target_bpm if target_bpm > 0 else 0.5
        shift_s = align_offset_ms / 1000.0
        v_anchor = vocal.bar_phase_sec
        i_anchor = instr.bar_phase_sec + shift_s
        for tm in tempo_mults:
            plans.append(
                _make_plan(vocal, instr, v_anchor, i_anchor, "downbeat", "downbeat", target_bpm, tm, pitch, 0.0)
            )

    # Dedupe by anchor pair + tempo mult
    seen: set[tuple] = set()
    unique: list[RemixPlan] = []
    for p in plans:
        key = (round(p.vocal_anchor_sec, 2), round(p.instrumental_anchor_sec, 2), p.vocal_tempo_mult)
        if key in seen:
            continue
        seen.add(key)
        unique.append(p)

    unique.sort(key=lambda p: p.score, reverse=True)
    return unique[:max_candidates]


def apply_user_override(plan: RemixPlan, overrides: UserOverrides, instr: RemixAnalysis) -> RemixPlan:
    """Apply manual nudge on top of brain plan."""
    beat_period = 60.0 / plan.target_bpm if plan.target_bpm > 0 else 0.5
    extra = overrides.offset_ms / 1000.0 + int(overrides.downbeat_shift) * beat_period

    if overrides.semitones is not None:
        plan.vocal_pitch_shift_semitones = float(np.clip(overrides.semitones, -6, 6))
    if overrides.target_bpm is not None and overrides.target_bpm > 0:
        plan.target_bpm = overrides.target_bpm
        v_bpm = plan.vocal_bpm_effective or 120.0
        plan.tempo_ratio = float(np.clip(plan.target_bpm / v_bpm, 0.5, 2.0))

    plan.instrumental_anchor_sec += extra
    vocal_anchor_out = plan.vocal_anchor_sec / plan.tempo_ratio
    plan.shift_seconds = plan.instrumental_anchor_sec - vocal_anchor_out
    return plan


def snap_plan_anchors(
    plan: RemixPlan,
    vocal: RemixAnalysis,
    instr: RemixAnalysis,
    snap: str,
) -> RemixPlan:
    """Snap anchor times to beat or bar grid."""
    if snap not in ("beat", "bar"):
        return plan
    v_beats = vocal.beats or vocal.downbeats
    i_beats = instr.beats or instr.downbeats
    v_downs = vocal.downbeats or v_beats
    i_downs = instr.downbeats or i_beats

    def snap_t(t: float, beats: list[float], downs: list[float]) -> float:
        arr = downs if snap == "bar" else beats
        if not arr:
            return t
        a = np.asarray(arr, dtype=float)
        return float(a[int(np.argmin(np.abs(a - t)))])

    plan.vocal_anchor_sec = snap_t(plan.vocal_anchor_sec, v_beats, v_downs)
    plan.instrumental_anchor_sec = snap_t(plan.instrumental_anchor_sec, i_beats, i_downs)
    vocal_anchor_out = plan.vocal_anchor_sec / plan.tempo_ratio
    plan.shift_seconds = plan.instrumental_anchor_sec - vocal_anchor_out
    return plan


def pick_best_plan(
    vocal_track: dict,
    instr_track: dict,
    overrides: UserOverrides | None = None,
    *,
    vocal_mono=None,
    instr_mono=None,
    sr: int = 44100,
    align_offset_ms: float | None = None,
) -> tuple[RemixPlan, list[RemixPlan], RemixAnalysis, RemixAnalysis]:
    """Return (best_plan, top_candidates, vocal_analysis, instr_analysis)."""
    overrides = overrides or UserOverrides()
    vocal = build_remix_analysis(vocal_track, "vocal", vocal_mono, sr)
    instr = build_remix_analysis(instr_track, "instrumental", instr_mono, sr)

    if overrides.manual_only:
        vgrid = clean_grid(vocal_track)
        igrid = clean_grid(instr_track)
        target = overrides.target_bpm or instr.bpm or 120.0
        tm = overrides.acapella_tempo_mult
        v_bpm = (vocal.bpm or 120) * tm
        ratio = target / v_bpm if v_bpm > 0 else 1.0
        beat_period = 60.0 / target
        shift = (
            igrid.bar_phase - vgrid.bar_phase / ratio
            + overrides.offset_ms / 1000.0
            + overrides.downbeat_shift * beat_period
        )
        plan = _make_plan(
            vocal, instr, vgrid.bar_phase, igrid.bar_phase,
            "downbeat", "downbeat", target, tm,
            overrides.semitones or 0.0, 0.0,
        )
        plan.shift_seconds = shift
        return plan, [plan], vocal, instr

    candidates = generate_candidates(
        vocal,
        instr,
        align_offset_ms=align_offset_ms,
        section_start_sec=overrides.section_start_sec,
        section_duration_sec=overrides.section_duration_sec,
    )
    if not candidates:
        # Fallback downbeat lock
        candidates = [
            _make_plan(
                vocal, instr,
                vocal.bar_phase_sec, instr.bar_phase_sec,
                "downbeat", "downbeat",
                instr.bpm or 120.0, 1.0, 0.0, 0.0,
            )
        ]

    # Refine pickup on best few
    if vocal_mono is not None:
        for p in candidates[:5]:
            pickup = phrase.pickup_before_anchor(vocal_mono, sr, p.vocal_anchor_sec)
            p.vocal_start_seconds = max(0.0, p.vocal_anchor_sec - pickup)

    best = candidates[0]
    if overrides.snap in ("beat", "bar"):
        best = snap_plan_anchors(best, vocal, instr, overrides.snap)
    if overrides.offset_ms or overrides.downbeat_shift or overrides.semitones is not None or overrides.target_bpm:
        best = apply_user_override(best, overrides, instr)

    return best, candidates[:3], vocal, instr


def plan_summary_for_ui(plan: RemixPlan) -> dict:
    tier = confidence_tier_from_score(plan.score)
    stretch_pct = (plan.tempo_ratio - 1.0) * 100.0
    return {
        "mode": plan.mode,
        "mode_label": "Clean Blend",
        "score": plan.score,
        "confidence_tier": tier,
        "sync_label": (
            "phrase/downbeat aligned"
            if plan.phrase_alignment in ("exact", "near")
            else "weak phrase alignment"
        ),
        "tempo_label": (
            f"vocal {plan.vocal_bpm_effective:.1f} ΓåÆ beat {plan.target_bpm:.1f} BPM "
            f"({stretch_pct:+.1f}% stretch)"
        ),
        "key_label": _key_label(plan),
        "warnings": plan.warnings,
        "reason_summary": plan.reason_summary,
        "score_breakdown": plan.score_breakdown,
        "vocal_anchor_sec": plan.vocal_anchor_sec,
        "instrumental_anchor_sec": plan.instrumental_anchor_sec,
        "vocal_anchor_type": plan.vocal_anchor_type,
        "instrumental_anchor_type": plan.instrumental_anchor_type,
        "shift_seconds": plan.shift_seconds,
    }


def _key_label(plan: RemixPlan) -> str:
    shift = plan.vocal_pitch_shift_semitones
    if plan.harmonic_compatibility == "exact" and abs(shift) < 0.5:
        return "same key"
    if plan.harmonic_compatibility in ("exact", "compatible"):
        if abs(shift) >= 0.5:
            return f"compatible ┬╖ shifted {shift:+.0f} st"
        return "compatible"
    if plan.harmonic_compatibility == "weak":
        return "low key confidence ΓÇö no shift"
    if abs(shift) >= 0.5:
        return f"shifted {shift:+.0f} st"
    return str(plan.harmonic_compatibility)

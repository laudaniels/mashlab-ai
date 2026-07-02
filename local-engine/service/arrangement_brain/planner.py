"""Arrangement Brain planners — Clean Blend, Hook Remix, DJ Edit."""

from __future__ import annotations

from remix_brain.models import RemixAnalysis, RemixPlan

from .models import (
    MODE_LABELS,
    ArrangementPlan,
    ArrangementSection,
    arrangement_summary_line,
)
from .scoring import score_arrangement_plan


MAX_ARRANGEMENT_SECONDS = 180.0
DEFAULT_BEATS_PER_BAR = 4


def bar_duration_sec(bpm: float, beats_per_bar: int = DEFAULT_BEATS_PER_BAR) -> float:
    if bpm <= 0:
        return 2.0
    return beats_per_bar * 60.0 / bpm


def snap_to_phrase(time_sec: float, phrase_starts: list[float], tolerance: float = 0.15) -> float:
    if not phrase_starts:
        return max(0.0, time_sec)
    best = min(phrase_starts, key=lambda t: abs(t - time_sec))
    if abs(best - time_sec) <= tolerance:
        return best
    return max(0.0, time_sec)


def _curve_density_at(curve: list[float] | None, time_sec: float, duration: float) -> float:
    if not curve or duration <= 0:
        return 0.0
    idx = int(round((time_sec / duration) * (len(curve) - 1)))
    idx = max(0, min(len(curve) - 1, idx))
    return float(curve[idx])


def _best_hook_phrase(
    vocal: RemixAnalysis,
    window_start: float,
    window_end: float,
    bpm: float,
    beats_per_bar: int,
) -> tuple[float, int]:
    """Return (phrase_start_sec, bar_length) for highest vocal-density phrase."""
    bar_sec = bar_duration_sec(bpm, beats_per_bar)
    phrases = [p for p in vocal.phrase_starts if window_start <= p <= window_end - bar_sec * 8]
    if not phrases:
        phrases = [window_start]
    best_t = phrases[0]
    best_density = -1.0
    duration = max(vocal.duration_seconds, window_end)
    for start in phrases:
        for bars in (32, 16):
            if start + bars * bar_sec > window_end + 0.5:
                continue
            mid = start + 0.5 * bars * bar_sec
            density = _curve_density_at(vocal.vocal_density_curve, mid, duration)
            if density > best_density:
                best_density = density
                best_t = start
    bar_len = 32 if best_t + 32 * bar_sec <= window_end + 0.5 else 16
    return snap_to_phrase(best_t, vocal.phrase_starts), bar_len


def _best_instrumental_phrase(
    instr: RemixAnalysis,
    window_start: float,
    window_end: float,
    bpm: float,
    beats_per_bar: int,
    prefer_high_energy: bool = True,
) -> float:
    bar_sec = bar_duration_sec(bpm, beats_per_bar)
    phrases = [p for p in instr.phrase_starts if window_start <= p <= window_end - bar_sec * 4]
    if not phrases:
        return snap_to_phrase(window_start, instr.downbeats or instr.phrase_starts)
    duration = max(instr.duration_seconds, window_end)

    def energy_at(t: float) -> float:
        return _curve_density_at(instr.energy_curve, t, duration)

    if prefer_high_energy:
        return max(phrases, key=energy_at)
    return min(phrases, key=energy_at)


def _section(
    label: str,
    source: str,
    start: float,
    bars: int,
    bpm: float,
    bpb: int,
    *,
    ducking: bool = False,
    fade_in_ms: float = 80.0,
    fade_out_ms: float = 120.0,
    start_bar: int = 0,
) -> ArrangementSection:
    bar_sec = bar_duration_sec(bpm, bpb)
    dur = bars * bar_sec
    vocal_gain = 1.5 if source == "mix" else 0.0
    bed_gain = -5.0 if source == "instrumental" and label == "break" else -3.0
    if source == "mix":
        bed_gain = -4.5 if ducking else -3.0
    return ArrangementSection(
        label=label,  # type: ignore[arg-type]
        source=source,  # type: ignore[arg-type]
        start_seconds=round(start, 4),
        duration_seconds=round(dur, 4),
        start_bar=start_bar,
        bar_length=bars,
        fade_in_ms=fade_in_ms,
        fade_out_ms=fade_out_ms,
        ducking=ducking,
        vocal_gain_db=vocal_gain,
        instrumental_gain_db=bed_gain,
        anchor_type="phrase",
    )


def _trim_sections_to_cap(sections: list[ArrangementSection], cap: float) -> list[ArrangementSection]:
    total = sum(s.duration_seconds for s in sections)
    if total <= cap:
        return sections
    out: list[ArrangementSection] = []
    used = 0.0
    for section in sections:
        if used >= cap:
            break
        remaining = cap - used
        if section.duration_seconds <= remaining:
            out.append(section)
            used += section.duration_seconds
        else:
            trimmed = ArrangementSection(
                **{**section.to_dict(), "duration_seconds": round(remaining, 4)}
            )
            out.append(trimmed)
            used = cap
    return out


def build_clean_blend_arrangement(
    remix_plan: RemixPlan,
    vocal: RemixAnalysis,
    instr: RemixAnalysis,
    *,
    window_start: float = 0.0,
    window_duration: float = MAX_ARRANGEMENT_SECONDS,
) -> ArrangementPlan:
    duration = min(window_duration, MAX_ARRANGEMENT_SECONDS, vocal.duration_seconds, instr.duration_seconds)
    sections = [
        _section(
            "mix",
            "mix",
            window_start,
            max(4, int(round(duration / bar_duration_sec(remix_plan.target_bpm, vocal.beats_per_bar)))),
            remix_plan.target_bpm,
            vocal.beats_per_bar,
            ducking=True,
            fade_in_ms=0.0,
            fade_out_ms=0.0,
        )
    ]
    sections[0].duration_seconds = round(duration, 4)
    plan = ArrangementPlan(
        mode="clean_blend",
        mode_label=MODE_LABELS["clean_blend"],
        target_bpm=remix_plan.target_bpm,
        sections=sections,
        remix_plan=remix_plan.to_dict(),
        summary_line="Mix",
        total_duration_seconds=duration,
        tempo_label=f"vocal → beat @ {remix_plan.target_bpm:.1f} BPM",
        key_label=str(remix_plan.harmonic_compatibility),
        sync_label="phrase/downbeat aligned (Remix Brain)",
    )
    return plan


def build_hook_remix_arrangement(
    remix_plan: RemixPlan,
    vocal: RemixAnalysis,
    instr: RemixAnalysis,
    *,
    window_start: float = 0.0,
    window_duration: float = MAX_ARRANGEMENT_SECONDS,
) -> ArrangementPlan:
    bpm = remix_plan.target_bpm
    bpb = instr.beats_per_bar or DEFAULT_BEATS_PER_BAR
    window_end = window_start + min(window_duration, MAX_ARRANGEMENT_SECONDS)
    hook_start, hook_bars = _best_hook_phrase(vocal, window_start, window_end, bpm, bpb)
    instr_anchor = _best_instrumental_phrase(
        instr, window_start, window_end, bpm, bpb, prefer_high_energy=True
    )
    bar_sec = bar_duration_sec(bpm, bpb)
    intro_bars = 4 if hook_start - window_start >= 4 * bar_sec else 0
    sections: list[ArrangementSection] = []
    cursor_bar = 0
    if intro_bars:
        sections.append(
            _section(
                "intro",
                "instrumental",
                max(window_start, instr_anchor - intro_bars * bar_sec),
                intro_bars,
                bpm,
                bpb,
                start_bar=cursor_bar,
            )
        )
        cursor_bar += intro_bars
    sections.append(
        _section(
            "hook",
            "mix",
            hook_start,
            hook_bars,
            bpm,
            bpb,
            ducking=True,
            start_bar=cursor_bar,
        )
    )
    cursor_bar += hook_bars
    tail_start = hook_start + hook_bars * bar_sec
    tail_bars = 4
    if tail_start + tail_bars * bar_sec <= window_end:
        sections.append(
            _section(
                "outro",
                "instrumental",
                tail_start,
                tail_bars,
                bpm,
                bpb,
                start_bar=cursor_bar,
            )
        )
    sections = _trim_sections_to_cap(sections, MAX_ARRANGEMENT_SECONDS)
    total = sum(s.duration_seconds for s in sections)
    warnings: list[str] = []
    if hook_bars < 16:
        warnings.append("Hook window shorter than 16 bars — using best available phrase.")
    plan = ArrangementPlan(
        mode="hook_remix",
        mode_label=MODE_LABELS["hook_remix"],
        target_bpm=bpm,
        sections=sections,
        warnings=warnings,
        remix_plan=remix_plan.to_dict(),
        summary_line=arrangement_summary_line(sections),
        total_duration_seconds=round(total, 3),
        tempo_label=f"hook @ {bpm:.1f} BPM · {hook_bars} bars",
        key_label=str(remix_plan.harmonic_compatibility),
        sync_label=f"vocal hook phrase → instrumental @ {instr_anchor:.1f}s",
    )
    return plan


def build_dj_edit_arrangement(
    remix_plan: RemixPlan,
    vocal: RemixAnalysis,
    instr: RemixAnalysis,
    *,
    window_start: float = 0.0,
) -> ArrangementPlan:
    bpm = remix_plan.target_bpm
    bpb = instr.beats_per_bar or DEFAULT_BEATS_PER_BAR
    bar_sec = bar_duration_sec(bpm, bpb)
    phrases = [p for p in instr.phrase_starts if p >= window_start] or instr.downbeats or [window_start]
    anchor = snap_to_phrase(window_start, phrases)
    hook_start = snap_to_phrase(anchor + 8 * bar_sec, vocal.phrase_starts)
    layout = [
        ("intro", "instrumental", anchor, 8),
        ("hook", "mix", hook_start, 16),
        ("break", "instrumental", hook_start + 16 * bar_sec, 8),
        ("hook", "mix", hook_start + 24 * bar_sec, 16),
        ("outro", "instrumental", hook_start + 40 * bar_sec, 8),
    ]
    sections: list[ArrangementSection] = []
    cursor_bar = 0
    for label, source, start, bars in layout:
        duck = source == "mix"
        sections.append(
            _section(
                label,
                source,
                start,
                bars,
                bpm,
                bpb,
                ducking=duck,
                start_bar=cursor_bar,
                fade_in_ms=120.0 if label in ("hook", "intro") else 80.0,
                fade_out_ms=150.0 if label in ("outro", "break") else 100.0,
            )
        )
        cursor_bar += bars
    sections = _trim_sections_to_cap(sections, MAX_ARRANGEMENT_SECONDS)
    total = sum(s.duration_seconds for s in sections)
    plan = ArrangementPlan(
        mode="dj_edit",
        mode_label=MODE_LABELS["dj_edit"],
        target_bpm=bpm,
        sections=sections,
        remix_plan=remix_plan.to_dict(),
        summary_line=arrangement_summary_line(sections),
        total_duration_seconds=round(total, 3),
        tempo_label=f"DJ edit @ {bpm:.1f} BPM · bar-aligned cuts",
        key_label=str(remix_plan.harmonic_compatibility),
        sync_label="intro → hook → break → hook → outro on phrase grid",
    )
    return plan


def build_arrangement_plan(
    mode: str,
    remix_plan: RemixPlan,
    vocal: RemixAnalysis,
    instr: RemixAnalysis,
    *,
    section_start_sec: float | None = None,
    section_duration_sec: float | None = None,
) -> ArrangementPlan:
    window_start = float(section_start_sec or 0.0)
    window_duration = float(section_duration_sec or MAX_ARRANGEMENT_SECONDS)
    window_duration = min(window_duration, MAX_ARRANGEMENT_SECONDS)

    if mode == "hook_remix":
        plan = build_hook_remix_arrangement(
            remix_plan, vocal, instr, window_start=window_start, window_duration=window_duration
        )
    elif mode == "dj_edit":
        plan = build_dj_edit_arrangement(
            remix_plan, vocal, instr, window_start=window_start
        )
    else:
        plan = build_clean_blend_arrangement(
            remix_plan, vocal, instr, window_start=window_start, window_duration=window_duration
        )

    return score_arrangement_plan(
        plan,
        tempo_ratio=remix_plan.tempo_ratio,
        harmonic_compat=remix_plan.harmonic_compatibility,
        max_seconds=MAX_ARRANGEMENT_SECONDS,
    )

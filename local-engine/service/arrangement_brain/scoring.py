"""Arrangement candidate scoring (0–100)."""

from __future__ import annotations

from .models import ArrangementPlan, ArrangementSection, confidence_tier_from_score


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return float(max(lo, min(hi, value)))


def score_phrase_alignment(sections: list[ArrangementSection]) -> tuple[float, list[str]]:
    warnings: list[str] = []
    if not sections:
        return 0.0, ["No arrangement sections planned."]
    on_phrase = sum(1 for s in sections if s.anchor_type in ("phrase", "downbeat"))
    ratio = on_phrase / len(sections)
    score = _clamp(ratio * 20.0)
    if ratio < 0.5:
        warnings.append("Several sections may not land on phrase boundaries — DJ review required.")
    return score, warnings


def score_section_lengths(sections: list[ArrangementSection], max_seconds: float) -> tuple[float, list[str]]:
    warnings: list[str] = []
    total = sum(s.duration_seconds for s in sections)
    if total <= 0:
        return 0.0, ["Arrangement duration is zero."]
    if total > max_seconds + 0.5:
        warnings.append(f"Arrangement exceeds {max_seconds:.0f}s cap — sections were trimmed.")
    fit = 1.0 - max(0.0, (total - max_seconds) / max_seconds)
    bar_ok = sum(1 for s in sections if s.bar_length in (4, 8, 16, 32))
    bar_ratio = bar_ok / len(sections) if sections else 0.0
    score = _clamp(fit * 10.0 + bar_ratio * 10.0)
    if any(s.bar_length < 4 for s in sections):
        warnings.append("A section is shorter than 4 bars — may feel abrupt.")
    return score, warnings


def score_tempo_safety(tempo_ratio: float) -> tuple[float, list[str]]:
    warnings: list[str] = []
    pct = abs(tempo_ratio - 1.0) * 100.0
    if pct <= 3:
        return 15.0, warnings
    if pct <= 6:
        return 12.0, warnings
    if pct <= 8:
        warnings.append(f"Tempo stretch {pct:.1f}% — audible artifacts possible.")
        return 8.0, warnings
    warnings.append(f"Large tempo stretch {pct:.1f}% — low confidence arrangement.")
    return 3.0, warnings


def score_harmonic(harmonic: str) -> tuple[float, list[str]]:
    warnings: list[str] = []
    mapping = {
        "exact": 15.0,
        "compatible": 12.0,
        "energy_boost": 10.0,
        "weak": 6.0,
        "clash": 2.0,
    }
    score = mapping.get(harmonic, 6.0)
    if harmonic in ("weak", "clash"):
        warnings.append("Key compatibility is weak — pitch shift or different section may sound better.")
    return score, warnings


def score_vocal_density_hook(sections: list[ArrangementSection], mode: str) -> tuple[float, list[str]]:
    warnings: list[str] = []
    if mode != "hook_remix":
        return 10.0, warnings
    hooks = [s for s in sections if s.label == "hook" and s.source == "mix"]
    if not hooks:
        warnings.append("Hook Remix has no vocal hook section.")
        return 4.0, warnings
    main = hooks[0]
    if main.bar_length >= 16:
        return 15.0, warnings
    warnings.append("Hook section is shorter than 16 bars — may feel rushed.")
    return 10.0, warnings


def score_instrumental_energy(mode: str) -> tuple[float, list[str]]:
    if mode == "dj_edit":
        return 12.0, []
    if mode == "hook_remix":
        return 10.0, []
    return 8.0, []


def score_render_safety(sections: list[ArrangementSection]) -> tuple[float, list[str]]:
    warnings: list[str] = []
    if len(sections) > 6:
        warnings.append("Many sections — render may take longer on CPU.")
    if any(s.duration_seconds < 1.0 for s in sections):
        warnings.append("Very short section detected — boundary click risk.")
        return 3.0, warnings
    return 5.0, warnings


def score_arrangement_plan(
    plan: ArrangementPlan,
    *,
    tempo_ratio: float,
    harmonic_compat: str,
    max_seconds: float,
) -> ArrangementPlan:
    warnings: list[str] = list(plan.warnings)
    breakdown: dict[str, float] = {}

    s, w = score_phrase_alignment(plan.sections)
    breakdown["phrase_alignment"] = round(s, 1)
    warnings.extend(w)

    s, w = score_vocal_density_hook(plan.sections, plan.mode)
    breakdown["vocal_density"] = round(s, 1)
    warnings.extend(w)

    s, w = score_instrumental_energy(plan.mode)
    breakdown["instrumental_energy"] = round(s, 1)
    warnings.extend(w)

    s, w = score_harmonic(harmonic_compat)
    breakdown["harmonic"] = round(s, 1)
    warnings.extend(w)

    s, w = score_tempo_safety(tempo_ratio)
    breakdown["tempo_safety"] = round(s, 1)
    warnings.extend(w)

    s, w = score_section_lengths(plan.sections, max_seconds)
    breakdown["section_length"] = round(s, 1)
    warnings.extend(w)

    s, w = score_render_safety(plan.sections)
    breakdown["render_safety"] = round(s, 1)
    warnings.extend(w)

    total = sum(breakdown.values())
    plan.score = round(_clamp(total), 1)
    plan.score_breakdown = breakdown
    plan.confidence_tier = confidence_tier_from_score(plan.score)
    plan.warnings = list(dict.fromkeys(warnings))
    if plan.confidence_tier == "low":
        plan.warnings.insert(
            0,
            f"Low arrangement confidence ({plan.score:.0f}/100) — review before sharing.",
        )
    return plan

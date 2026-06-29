"""Arrangement section context traceability — planning-only metadata."""

from __future__ import annotations

from typing import Any

ALLOWED_DRAFT_TYPES = frozenset({"clean_blend", "club_edit", "creative_blend"})
ALLOWED_PHRASE_BASIS = frozenset(
    {"detected_beats", "heuristic_phrase_markers", "dj_override", "unavailable"}
)
ALLOWED_EXPORT_CONTEXT_MODES = frozenset({"preview_section", "full_length_context_only"})

TRACEABILITY_NOTICE = (
    "Advisory arrangement section — DJ review required. Sections do not grant rights."
)
FULL_LENGTH_CONTEXT_NOTICE = (
    "Arrangement context only — full-length render. Section-only export is not implemented."
)


def validate_arrangement_context(raw: dict[str, Any] | None) -> tuple[dict[str, Any] | None, list[str]]:
    if raw is None:
        return None, []

    errors: list[str] = []
    if not isinstance(raw, dict):
        return None, ["arrangement_context must be an object."]

    draft_type = raw.get("draft_type")
    if draft_type not in ALLOWED_DRAFT_TYPES:
        errors.append("arrangement_context.draft_type is invalid.")

    section_id = raw.get("section_id")
    section_label = raw.get("section_label")
    if not isinstance(section_id, str) or not section_id.strip():
        errors.append("arrangement_context.section_id is required.")
    if not isinstance(section_label, str) or not section_label.strip():
        errors.append("arrangement_context.section_label is required.")

    phrase_basis = raw.get("phrase_basis")
    if phrase_basis is not None and phrase_basis not in ALLOWED_PHRASE_BASIS:
        errors.append("arrangement_context.phrase_basis is invalid.")

    export_mode = raw.get("export_context_mode")
    if export_mode is not None and export_mode not in ALLOWED_EXPORT_CONTEXT_MODES:
        errors.append("arrangement_context.export_context_mode is invalid.")

    if raw.get("planning_only") is False:
        errors.append("arrangement_context.planning_only must remain true.")

    forbidden = ("verse detected", "chorus detected", "downbeat verified")
    label_lower = str(section_label or "").lower()
    if any(token in label_lower for token in forbidden):
        errors.append("arrangement_context.section_label must not claim detected song sections.")

    if errors:
        return None, errors

    normalized = dict(raw)
    normalized.setdefault("planning_only", True)
    normalized.setdefault("dj_review_required", True)
    normalized.setdefault("traceability_notice", TRACEABILITY_NOTICE)
    return normalized, []


def merge_arrangement_context_into_meta(
    meta: dict[str, Any],
    context: dict[str, Any] | None,
) -> dict[str, Any]:
    if context is None:
        return meta
    validated, _errors = validate_arrangement_context(context)
    if validated is not None:
        meta["arrangement_context"] = validated
    return meta


def inherit_arrangement_context(source_meta: dict[str, Any] | None) -> dict[str, Any] | None:
    if not source_meta or not isinstance(source_meta, dict):
        return None
    raw = source_meta.get("arrangement_context")
    if not isinstance(raw, dict):
        return None
    validated, _errors = validate_arrangement_context(raw)
    return validated


def arrangement_summary_from_context(context: dict[str, Any] | None) -> str | None:
    if not context:
        return None
    draft = str(context.get("draft_type", "")).replace("_", " ")
    label = context.get("section_label")
    duration = context.get("duration_seconds")
    start = context.get("preview_start_seconds")
    basis = str(context.get("phrase_basis", "")).replace("_", " ")
    if not draft or not label:
        return None
    parts = [f"{draft} · {label} · advisory · DJ review required"]
    if isinstance(duration, (int, float)):
        parts.append(f"{duration}s")
    if isinstance(start, (int, float)) and start > 0:
        parts.append(f"start {start}s")
    if basis:
        parts.append(basis)
    return " · ".join(parts)


def arrangement_traceability_lines(context: dict[str, Any] | None) -> list[str]:
    if not context:
        return []
    lines: list[str] = []
    summary = arrangement_summary_from_context(context)
    if summary:
        lines.append(summary)
    export_mode = context.get("export_context_mode")
    if export_mode == "full_length_context_only":
        lines.append(FULL_LENGTH_CONTEXT_NOTICE)
    lines.append("Arrangement sections are advisory and do not grant rights.")
    return lines

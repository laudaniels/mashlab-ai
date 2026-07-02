"""Arrangement Brain — DJ-style section planning on top of Remix Brain (Phase 43)."""

from .models import ArrangementPlan, ArrangementSection, confidence_tier_from_score
from .planner import build_arrangement_plan

__all__ = [
    "ArrangementPlan",
    "ArrangementSection",
    "build_arrangement_plan",
    "confidence_tier_from_score",
]

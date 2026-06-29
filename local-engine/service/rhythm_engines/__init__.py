"""Optional advanced rhythm/downbeat engine adapters — lazy imports only."""

from rhythm_engines.registry import (
    ENGINE_IDS,
    analyze_with_engine,
    engine_setup_guidance,
    engine_status,
    pick_best_advanced_result,
    run_auto_advanced,
)

__all__ = [
    "ENGINE_IDS",
    "analyze_with_engine",
    "engine_setup_guidance",
    "engine_status",
    "pick_best_advanced_result",
    "run_auto_advanced",
]

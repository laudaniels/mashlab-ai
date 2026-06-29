"""BeatNet+ adapter stub — optional future integration."""

from __future__ import annotations

from pathlib import Path

from rhythm_engines.base import BEATNET_SETUP, EngineStatus, RhythmEngineOutput, module_importable

ENGINE_ID = "beatnet"


def check_status() -> EngineStatus:
    importable, version = module_importable("beatnet")
    if importable:
        return EngineStatus(
            engine_id=ENGINE_ID,
            importable=True,
            status="experimental",
            message="BeatNet+ package detected — adapter hook present, integration not active yet.",
            setup_guidance=BEATNET_SETUP,
            version=version,
        )
    return EngineStatus(
        engine_id=ENGINE_ID,
        importable=False,
        status="planned",
        message="BeatNet+ is not installed — adapter reserved for a future phase.",
        setup_guidance=BEATNET_SETUP,
    )


def analyze(_file_path: Path, _phrase_length_bars: int) -> RhythmEngineOutput | None:
    importable, _version = module_importable("beatnet")
    if not importable:
        return None
    return None

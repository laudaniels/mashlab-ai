"""Consistent user-facing error messages for local processing responses."""

from __future__ import annotations

STATUS_GUIDANCE: dict[str, str] = {
    "missing_dependency": (
        "Install or configure the missing local dependency, restart the sidecar, and retry."
    ),
    "missing_artifact": (
        "Create the required preview or export artifact first, then retry this action."
    ),
    "wrong_artifact_type": (
        "Select a compatible artifact type for this action (for example, WAV export for mastering)."
    ),
    "validation_error": "Fix the settings shown below and retry.",
    "processing_failed": (
        "Processing failed locally. Check dependency health, disk space, and artifact inputs."
    ),
    "not_available": (
        "Measurement was not available for this file. Results may be peak-only or omitted."
    ),
}


def format_user_facing_error(
    *,
    status: str,
    message: str | None = None,
    validation_errors: list[str] | None = None,
    setup_guidance: str | None = None,
) -> str:
    parts: list[str] = []

    if validation_errors:
        parts.extend(validation_errors)
    elif message and message.strip():
        parts.append(message.strip())
    else:
        parts.append("Something went wrong. Review the message below and try again.")

    guidance = STATUS_GUIDANCE.get(status)
    if guidance and not any(guidance[:20] in part for part in parts):
        parts.append(guidance)

    if setup_guidance and setup_guidance.strip():
        parts.append(setup_guidance.strip())

    return " ".join(parts)


def dependency_setup_guidance(capability_id: str) -> str | None:
    mapping = {
        "ffmpeg": "Install FFmpeg and add ffmpeg + ffprobe to PATH. Run npm run check:local-engine.",
        "ffprobe": "Install FFmpeg and add ffmpeg + ffprobe to PATH. Run npm run check:local-engine.",
        "rubberband": "Install rubberband-cli and ensure rubberband is on PATH.",
        "demucs": "pip install torch and demucs inside local-engine/service virtualenv.",
        "librosa": "pip install -r requirements-analysis.txt inside local-engine/service.",
        "python": "Install Python 3.12+ and add it to PATH. Verify with python --version.",
    }
    return mapping.get(capability_id)

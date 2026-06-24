"""Optional librosa dependency helpers."""

from __future__ import annotations

LIBROSA_SETUP_GUIDANCE = (
    "Install optional analysis dependencies in the service virtual environment: "
    "pip install librosa soundfile"
)

SOUNDFILE_SETUP_GUIDANCE = (
    "Install soundfile for WAV/FLAC loading: pip install soundfile. "
    "MP3/M4A may also require FFmpeg on PATH for librosa decoding."
)


def librosa_available() -> bool:
    try:
        import librosa  # noqa: F401

        return True
    except Exception:
        return False


def missing_librosa_response(response_cls):
    return response_cls(
        ok=False,
        status="missing_dependency",
        message="librosa is not installed in the local service environment.",
        setup_guidance=LIBROSA_SETUP_GUIDANCE,
    )

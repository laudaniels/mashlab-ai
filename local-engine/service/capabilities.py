"""Detect local processing capabilities available to the sidecar."""

from __future__ import annotations

import importlib.util
import platform
import shutil
import sys

from models import ServiceCapability


def _import_available(module_name: str) -> tuple[bool, str | None]:
    spec = importlib.util.find_spec(module_name)
    if spec is None:
        return False, None

    try:
        module = importlib.import_module(module_name)
        version = getattr(module, "__version__", None)
        return True, str(version) if version is not None else None
    except Exception:
        return False, None


def _binary_capability(
    capability_id: str,
    label: str,
    binary_names: list[str],
    *,
    planned: bool = False,
) -> ServiceCapability:
    for name in binary_names:
        path = shutil.which(name)
        if path:
            return ServiceCapability(
                id=capability_id,
                label=label,
                status="available",
                message=f"{label} found at {path}.",
                version=path,
            )

    if planned:
        return ServiceCapability(
            id=capability_id,
            label=label,
            status="planned",
            message=f"{label} is planned for a later MashLab engine phase.",
        )

    return ServiceCapability(
        id=capability_id,
        label=label,
        status="missing",
        message=f"{label} was not found on PATH. Install it to enable this lane.",
    )


def _python_capability() -> ServiceCapability:
    version = platform.python_version()
    return ServiceCapability(
        id="python",
        label="Python runtime",
        status="available",
        message=f"Python {version} is running the local MashLab helper service.",
        version=version,
    )


def _optional_python_package(
    capability_id: str,
    label: str,
    module_name: str,
    *,
    planned: bool = False,
) -> ServiceCapability:
    available, version = _import_available(module_name)
    if available:
        return ServiceCapability(
            id=capability_id,
            label=label,
            status="available",
            message=f"{label} is installed.",
            version=version,
        )

    if planned:
        return ServiceCapability(
            id=capability_id,
            label=label,
            status="planned",
            message=f"{label} is not required yet. Integration is planned for a later phase.",
        )

    return ServiceCapability(
        id=capability_id,
        label=label,
        status="not_configured",
        message=f"{label} is optional and not installed in this service environment.",
    )


def detect_capabilities() -> list[ServiceCapability]:
    return [
        _python_capability(),
        _binary_capability("ffmpeg", "FFmpeg", ["ffmpeg"]),
        _binary_capability("ffprobe", "ffprobe", ["ffprobe"]),
        _optional_python_package("librosa", "librosa", "librosa"),
        _optional_python_package("essentia", "Essentia", "essentia", planned=True),
        _optional_python_package("torch", "PyTorch", "torch", planned=True),
        _optional_python_package("demucs", "Demucs", "demucs", planned=True),
        _rubberband_capability(),
    ]


def _rubberband_capability() -> ServiceCapability:
    binary_names = [
        "rubberband",
        "rubberband-cli",
        "rubberband.exe",
        "rubberband-cli.exe",
    ]

    for name in binary_names:
        path = shutil.which(name)
        if path:
            return ServiceCapability(
                id="rubberband",
                label="Rubber Band CLI",
                status="available",
                message=f"Rubber Band CLI found at {path}. Ready for future pitch/time processing.",
                version=path,
            )

    return ServiceCapability(
        id="rubberband",
        label="Rubber Band CLI",
        status="missing",
        message=(
            "Rubber Band CLI was not found on PATH. Install rubberband-cli to enable future "
            "pitch/time processing. MashLab remains usable in browser-only planning mode."
        ),
    )


def get_capability(capability_id: str) -> ServiceCapability | None:
    for capability in detect_capabilities():
        if capability.id == capability_id:
            return capability
    return None


def python_version_label() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"

"""Local mastering preset prototypes from existing WAV export artifacts."""

from __future__ import annotations

import json
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from artifact_management import (
    TechnicalReadout,
    analyze_technical_readout,
    is_valid_artifact_id,
    _resolve_under,
)
import config
from export_processing import EXPORTS_DIR, EXPORT_MP3_FILE_NAME, RIGHTS_NOTICE, find_wav_export_path
from mastering_presets import (
    ALLOWED_MASTERING_PRESETS,
    get_mastering_preset,
    build_loudnorm_encode_command,
    evaluate_mastering_gate,
)
from mix_settings import build_loudness_clipping_warnings

MASTERS_DIR = config.WORK_DIR / "artifacts" / "masters"
MASTER_FILE_NAME = "master.wav"
META_FILE_NAME = "master.meta.json"

MASTER_ARTIFACT_LABEL = (
    "Local mastering prototype — user responsible for rights. "
    "No public distribution rights granted."
)


@dataclass
class MasterWavSuccess:
    ok: True
    status: str
    message: str
    master_artifact_id: str
    source_wav_export_artifact_id: str
    preset: str
    artifact_url: str | None
    download_url: str | None
    before_readout: TechnicalReadout
    after_readout: TechnicalReadout
    target_integrated_lufs: float | None
    target_true_peak_dbtp: float
    loudness_gate: object
    final_export: bool
    public_share: bool
    mastering_prototype: bool
    rights_notice: str
    warnings: list[str]
    limitations: list[str]
    export_label: str | None
    audio_created: bool


@dataclass
class MasterWavFailure:
    ok: False
    status: str
    message: str
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None


MasterWavResult = MasterWavSuccess | MasterWavFailure


def technical_readout_to_dict(readout: TechnicalReadout) -> dict:
    return {
        "duration_seconds": readout.duration_seconds,
        "sample_rate": readout.sample_rate,
        "channel_count": readout.channel_count,
        "codec": readout.codec,
        "container": readout.container,
        "file_size_bytes": readout.file_size_bytes,
        "loudness": {
            "integrated_lufs": readout.loudness.integrated_lufs,
            "true_peak_dbtp": readout.loudness.true_peak_dbtp,
            "peak_level_db": readout.loudness.peak_level_db,
            "status": readout.loudness.status,
            "message": readout.loudness.message,
        },
    }


def create_master_wav(
    source_wav_export_artifact_id: str,
    preset: str,
    export_label: str | None = None,
) -> MasterWavResult:
    errors: list[str] = []

    if not is_valid_artifact_id(source_wav_export_artifact_id):
        errors.append("Invalid source WAV export artifact id.")

    if preset not in ALLOWED_MASTERING_PRESETS:
        errors.append(
            "preset must be measurement_only, general_safe_normalize, or dj_loudness_prototype."
        )

    if export_label is not None and len(export_label.strip()) > 120:
        errors.append("export_label must be 120 characters or fewer.")

    if errors:
        return MasterWavFailure(
            ok=False,
            status="validation_error",
            message="Mastering request validation failed.",
            validation_errors=errors,
        )

    preset_def = get_mastering_preset(preset)
    if preset_def is None:
        return MasterWavFailure(
            ok=False,
            status="validation_error",
            message="Unknown mastering preset.",
            validation_errors=["Invalid preset."],
        )

    source_path = find_wav_export_path(source_wav_export_artifact_id)
    if source_path is None:
        export_dir = _resolve_under(EXPORTS_DIR, source_wav_export_artifact_id)
        if export_dir and export_dir.is_dir() and (export_dir / EXPORT_MP3_FILE_NAME).is_file():
            return MasterWavFailure(
                ok=False,
                status="wrong_artifact_type",
                message="Source artifact is not a WAV export.",
                setup_guidance="Select a WAV export artifact, not MP3 or master output.",
            )
        return MasterWavFailure(
            ok=False,
            status="missing_artifact",
            message="WAV export artifact not found.",
            setup_guidance="Create a local WAV export before running mastering presets.",
        )

    before_readout = analyze_technical_readout(source_path)

    master_id = uuid.uuid4().hex
    master_dir = _resolve_under(MASTERS_DIR, master_id)
    if master_dir is None:
        return MasterWavFailure(
            ok=False,
            status="processing_failed",
            message="Could not resolve master artifact directory.",
        )

    master_dir.mkdir(parents=True, exist_ok=True)
    master_path = master_dir / MASTER_FILE_NAME
    artifact_url: str | None = None
    download_url: str | None = None
    audio_created = False

    warnings: list[str] = [
        "Local mastering preset prototype — user-generated, not a published release.",
        "Not professional mastering or a club-ready final unless measured targets pass.",
        *preset_def.preset_warnings,
    ]
    limitations: list[str] = [
        "No public sharing, streaming integration, or distribution rights granted.",
        "MP3, stem package, and public sharing remain separate features.",
        "Mastering prototype does not grant publishing or distribution rights.",
    ]

    if preset_def.creates_audio:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg is None:
            shutil.rmtree(master_dir, ignore_errors=True)
            return MasterWavFailure(
                ok=False,
                status="missing_dependency",
                message="FFmpeg is required for mastering preset processing.",
                setup_guidance="Install FFmpeg and ensure ffmpeg is on PATH.",
            )

        if preset_def.loudnorm_filter is None:
            shutil.rmtree(master_dir, ignore_errors=True)
            return MasterWavFailure(
                ok=False,
                status="processing_error",
                message="Preset loudnorm filter is not configured.",
            )

        encode_command = build_loudnorm_encode_command(
            ffmpeg,
            source_path,
            master_path,
            loudnorm_filter=preset_def.loudnorm_filter,
        )

        try:
            result = subprocess.run(
                encode_command,
                capture_output=True,
                text=True,
                check=False,
                timeout=600,
            )
        except (subprocess.SubprocessError, OSError) as error:
            shutil.rmtree(master_dir, ignore_errors=True)
            return MasterWavFailure(
                ok=False,
                status="processing_error",
                message=f"FFmpeg loudnorm processing failed: {error}",
            )

        if result.returncode != 0 or not master_path.is_file():
            shutil.rmtree(master_dir, ignore_errors=True)
            return MasterWavFailure(
                ok=False,
                status="processing_error",
                message="FFmpeg loudnorm did not produce master output.",
                setup_guidance=result.stderr.strip() or None,
            )

        audio_created = True
        artifact_url = f"/v1/artifacts/masters/{master_id}/master"
        download_url = artifact_url
        after_readout = analyze_technical_readout(master_path)
    else:
        after_readout = before_readout

    gate = evaluate_mastering_gate(preset, after_readout.loudness)
    warnings.extend(build_loudness_clipping_warnings(after_readout.loudness))

    meta = {
        "master_subtype": "wav",
        "master_preset": preset,
        "source_wav_export_artifact_id": source_wav_export_artifact_id,
        "export_label": export_label.strip() if export_label else None,
        "target_integrated_lufs": preset_def.target_integrated_lufs,
        "target_true_peak_dbtp": preset_def.target_true_peak_dbtp,
        "audio_created": audio_created,
        "before_readout": technical_readout_to_dict(before_readout),
        "after_readout": technical_readout_to_dict(after_readout),
        "gate_status": gate.status,
        "created_at": datetime.now(tz=UTC).isoformat(),
        "public_share": False,
        "final_export": True,
        "mastering_prototype": True,
    }
    (master_dir / META_FILE_NAME).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    return MasterWavSuccess(
        ok=True,
        status="ready",
        message=(
            "Mastering measurement complete — no audio written."
            if not audio_created
            else f"Mastering preset '{preset_def.label}' applied to local master artifact."
        ),
        master_artifact_id=master_id,
        source_wav_export_artifact_id=source_wav_export_artifact_id,
        preset=preset,
        artifact_url=artifact_url,
        download_url=download_url,
        before_readout=before_readout,
        after_readout=after_readout,
        target_integrated_lufs=preset_def.target_integrated_lufs,
        target_true_peak_dbtp=preset_def.target_true_peak_dbtp,
        loudness_gate=gate,
        final_export=True,
        public_share=False,
        mastering_prototype=True,
        rights_notice=RIGHTS_NOTICE,
        warnings=warnings,
        limitations=limitations,
        export_label=export_label.strip() if export_label else None,
        audio_created=audio_created,
    )


def read_master_meta(master_dir: Path) -> dict | None:
    meta_path = master_dir / META_FILE_NAME
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None

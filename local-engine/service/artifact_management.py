"""Local preview artifact listing, metadata, loudness readout, and safe cleanup."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import config
from mix_settings import format_mix_summary, mix_settings_from_dict
from arrangement_context import (
    arrangement_summary_from_context,
    inherit_arrangement_context,
    merge_arrangement_context_into_meta,
    validate_arrangement_context,
)

ARTIFACT_ID_PATTERN = re.compile(r"^[a-zA-Z0-9]+$")
ARTIFACTS_ROOT = config.WORK_DIR / "artifacts"
STEMS_DIR = ARTIFACTS_ROOT / "stems"
COMBINED_DIR = ARTIFACTS_ROOT / "combined-preview"
COMBINED_META_FILE = "preview.meta.json"
PITCH_TIME_DIR = ARTIFACTS_ROOT / "pitch-time-preview"
EXPORTS_DIR = ARTIFACTS_ROOT / "exports"
MASTERS_DIR = ARTIFACTS_ROOT / "masters"
PACKAGES_DIR = ARTIFACTS_ROOT / "packages"
PACKAGE_META_FILE = "package.meta.json"

PREVIEW_ONLY_LABEL = "Preview only — not a final export or master."
EXPORT_ARTIFACT_LABEL = (
    "Local export — user responsible for rights. No public distribution rights granted."
)
MP3_EXPORT_ARTIFACT_LABEL = (
    "Local MP3 reference export — user responsible for rights. "
    "No public distribution rights granted."
)
MASTER_ARTIFACT_LABEL = (
    "Local mastering prototype — user responsible for rights. "
    "No public distribution rights granted."
)
PACKAGE_ARTIFACT_LABEL = (
    "Local project package — user responsible for rights. "
    "No public distribution rights granted. Not public sharing."
)


@dataclass
class ArtifactPlaybackUrls:
    primary: str | None
    vocals: str | None = None
    no_vocals: str | None = None


@dataclass
class PreviewArtifactEntry:
    artifact_id: str
    artifact_type: str
    status: str
    created_at: str
    duration_seconds: float | None
    playback_urls: ArtifactPlaybackUrls
    preview_only: bool
    final_export: bool
    primary_file_name: str
    preview_label: str = PREVIEW_ONLY_LABEL
    source_combined_preview_artifact_id: str | None = None
    export_subtype: str | None = None
    export_format: str | None = None
    source_vocal_stem_artifact_id: str | None = None
    target_instrumental_stem_artifact_id: str | None = None
    source_wav_export_artifact_id: str | None = None
    master_preset: str | None = None
    mastering_prototype: bool = False
    package_only: bool = False
    package_subtype: str | None = None
    package_label: str | None = None
    included_file_count: int | None = None
    selected_artifact_ids: list[str] | None = None
    public_share: bool = False
    mix_summary: str | None = None
    arrangement_draft_type: str | None = None
    arrangement_section_label: str | None = None
    arrangement_preview_start_seconds: float | None = None
    arrangement_duration_seconds: float | None = None
    arrangement_phrase_basis: str | None = None
    arrangement_context_summary: str | None = None
    arrangement_export_context_mode: str | None = None


@dataclass
class LoudnessReadout:
    integrated_lufs: float | None
    true_peak_dbtp: float | None
    peak_level_db: float | None
    status: str
    message: str


@dataclass
class TechnicalReadout:
    duration_seconds: float | None
    sample_rate: int | None
    channel_count: int | None
    codec: str | None
    container: str | None
    file_size_bytes: int | None
    loudness: LoudnessReadout


@dataclass
class ArtifactMetadataSuccess:
    ok: True
    artifact_id: str
    artifact_type: str
    status: str
    preview_only: bool
    final_export: bool
    technical: TechnicalReadout
    playback_url: str | None


@dataclass
class ArtifactOperationFailure:
    ok: False
    status: str
    message: str


ArtifactMetadataResult = ArtifactMetadataSuccess | ArtifactOperationFailure
ArtifactDeleteResult = tuple[bool, str, str | None]


def is_valid_artifact_id(artifact_id: str) -> bool:
    return bool(artifact_id) and ARTIFACT_ID_PATTERN.fullmatch(artifact_id) is not None


def _iso_from_mtime(path: Path) -> str:
    timestamp = path.stat().st_mtime
    return datetime.fromtimestamp(timestamp, tz=UTC).isoformat()


def _resolve_under(base: Path, *parts: str) -> Path | None:
    try:
        resolved_base = base.resolve()
        candidate = resolved_base.joinpath(*parts).resolve()
    except OSError:
        return None

    if candidate == resolved_base or resolved_base in candidate.parents:
        return candidate

    return None


def _path_is_under_artifacts_root(path: Path) -> bool:
    try:
        resolved = path.resolve()
        root = ARTIFACTS_ROOT.resolve()
    except OSError:
        return False

    return resolved == root or root in resolved.parents


def find_artifact_primary_path(artifact_id: str) -> tuple[Path | None, str | None]:
    if not is_valid_artifact_id(artifact_id):
        return None, None

    stem_dir = _resolve_under(STEMS_DIR, artifact_id)
    if stem_dir and stem_dir.is_dir():
        vocals = stem_dir / "vocals.wav"
        if vocals.exists():
            return vocals, "stem"

    combined_dir = _resolve_under(COMBINED_DIR, artifact_id)
    if combined_dir and combined_dir.is_dir():
        preview = combined_dir / "preview.wav"
        if preview.exists():
            return preview, "combined-preview"

    pitch_file = _resolve_under(PITCH_TIME_DIR, f"{artifact_id}.wav")
    if pitch_file and pitch_file.is_file():
        return pitch_file, "pitch-time-preview"

    export_dir = _resolve_under(EXPORTS_DIR, artifact_id)
    if export_dir and export_dir.is_dir():
        mp3_file = export_dir / "export.mp3"
        if mp3_file.exists():
            return mp3_file, "export"
        export_file = export_dir / "export.wav"
        if export_file.exists():
            return export_file, "export"

    master_dir = _resolve_under(MASTERS_DIR, artifact_id)
    if master_dir and master_dir.is_dir():
        master_file = master_dir / "master.wav"
        if master_file.exists():
            return master_file, "master"

    return None, None


def find_artifact_root(artifact_id: str) -> Path | None:
    if not is_valid_artifact_id(artifact_id):
        return None

    stem_dir = _resolve_under(STEMS_DIR, artifact_id)
    if stem_dir and stem_dir.is_dir() and (stem_dir / "vocals.wav").exists():
        return stem_dir

    combined_dir = _resolve_under(COMBINED_DIR, artifact_id)
    if combined_dir and combined_dir.is_dir() and (combined_dir / "preview.wav").exists():
        return combined_dir

    pitch_file = _resolve_under(PITCH_TIME_DIR, f"{artifact_id}.wav")
    if pitch_file and pitch_file.is_file():
        return pitch_file

    export_dir = _resolve_under(EXPORTS_DIR, artifact_id)
    if export_dir and export_dir.is_dir():
        if (export_dir / "export.wav").exists() or (export_dir / "export.mp3").exists():
            return export_dir

    master_dir = _resolve_under(MASTERS_DIR, artifact_id)
    if master_dir and master_dir.is_dir() and (
        (master_dir / "master.wav").exists() or (master_dir / "master.meta.json").exists()
    ):
        return master_dir

    package_dir = _resolve_under(PACKAGES_DIR, artifact_id)
    if package_dir and package_dir.is_dir() and (package_dir / PACKAGE_META_FILE).exists():
        return package_dir

    return None


def list_preview_artifacts() -> list[PreviewArtifactEntry]:
    entries: list[PreviewArtifactEntry] = []

    if STEMS_DIR.exists():
        for child in sorted(STEMS_DIR.iterdir()):
            if not child.is_dir() or not is_valid_artifact_id(child.name):
                continue
            vocals = child / "vocals.wav"
            no_vocals = child / "no_vocals.wav"
            if not vocals.exists():
                continue
            entries.append(
                PreviewArtifactEntry(
                    artifact_id=child.name,
                    artifact_type="stem",
                    status="ready",
                    created_at=_iso_from_mtime(vocals),
                    duration_seconds=_probe_duration(vocals),
                    playback_urls=ArtifactPlaybackUrls(
                        primary=f"/v1/artifacts/stems/{child.name}/vocals",
                        vocals=f"/v1/artifacts/stems/{child.name}/vocals",
                        no_vocals=(
                            f"/v1/artifacts/stems/{child.name}/no_vocals"
                            if no_vocals.exists()
                            else None
                        ),
                    ),
                    preview_only=True,
                    final_export=False,
                    primary_file_name=vocals.name,
                )
            )

    if COMBINED_DIR.exists():
        for child in sorted(COMBINED_DIR.iterdir()):
            if not child.is_dir() or not is_valid_artifact_id(child.name):
                continue
            preview = child / "preview.wav"
            if not preview.exists():
                continue
            combined_meta = _read_combined_meta(child)
            mix_summary = _mix_summary_from_meta(combined_meta)
            arrangement_fields = _arrangement_list_fields_from_meta(combined_meta)
            entries.append(
                PreviewArtifactEntry(
                    artifact_id=child.name,
                    artifact_type="combined-preview",
                    status="ready",
                    created_at=_iso_from_mtime(preview),
                    duration_seconds=_probe_duration(preview),
                    playback_urls=ArtifactPlaybackUrls(
                        primary=f"/v1/artifacts/combined-preview/{child.name}/preview"
                    ),
                    preview_only=True,
                    final_export=False,
                    primary_file_name=preview.name,
                    mix_summary=mix_summary,
                    **arrangement_fields,
                )
            )

    if PITCH_TIME_DIR.exists():
        for wav in sorted(PITCH_TIME_DIR.glob("*.wav")):
            if not is_valid_artifact_id(wav.stem):
                continue
            entries.append(
                PreviewArtifactEntry(
                    artifact_id=wav.stem,
                    artifact_type="pitch-time-preview",
                    status="ready",
                    created_at=_iso_from_mtime(wav),
                    duration_seconds=_probe_duration(wav),
                    playback_urls=ArtifactPlaybackUrls(
                        primary=f"/v1/artifacts/pitch-time-preview/{wav.stem}"
                    ),
                    preview_only=True,
                    final_export=False,
                    primary_file_name=wav.name,
                )
            )

    if EXPORTS_DIR.exists():
        for child in sorted(EXPORTS_DIR.iterdir()):
            if not child.is_dir() or not is_valid_artifact_id(child.name):
                continue
            export_wav = child / "export.wav"
            export_mp3 = child / "export.mp3"
            primary_file = export_wav if export_wav.exists() else export_mp3 if export_mp3.exists() else None
            if primary_file is None:
                continue
            meta = _read_export_meta(child)
            source_id = None
            export_subtype = None
            export_format = None
            source_vocal_id = None
            target_instrumental_id = None
            source_wav_id = None
            if meta:
                if isinstance(meta.get("source_combined_preview_artifact_id"), str):
                    source_id = meta["source_combined_preview_artifact_id"]
                if isinstance(meta.get("export_subtype"), str):
                    export_subtype = meta["export_subtype"]
                if isinstance(meta.get("export_format"), str):
                    export_format = meta["export_format"]
                if isinstance(meta.get("source_vocal_stem_artifact_id"), str):
                    source_vocal_id = meta["source_vocal_stem_artifact_id"]
                if isinstance(meta.get("target_instrumental_stem_artifact_id"), str):
                    target_instrumental_id = meta["target_instrumental_stem_artifact_id"]
                if isinstance(meta.get("source_wav_export_artifact_id"), str):
                    source_wav_id = meta["source_wav_export_artifact_id"]
            if export_mp3.exists():
                label = MP3_EXPORT_ARTIFACT_LABEL
                playback = f"/v1/artifacts/exports/{child.name}/export.mp3"
                if export_subtype is None:
                    export_subtype = "mp3"
                if export_format is None:
                    export_format = "mp3"
            else:
                label = EXPORT_ARTIFACT_LABEL
                playback = f"/v1/artifacts/exports/{child.name}/export"
                if export_subtype == "full-wav":
                    label = (
                        "Full-length local export — user responsible for rights. "
                        "No public distribution rights granted."
                    )
                if export_format is None:
                    export_format = "wav"
            entries.append(
                PreviewArtifactEntry(
                    artifact_id=child.name,
                    artifact_type="export",
                    status="ready",
                    created_at=_iso_from_mtime(primary_file),
                    duration_seconds=_probe_duration(primary_file),
                    playback_urls=ArtifactPlaybackUrls(primary=playback),
                    preview_only=False,
                    final_export=True,
                    primary_file_name=primary_file.name,
                    preview_label=label,
                    source_combined_preview_artifact_id=source_id,
                    export_subtype=export_subtype,
                    export_format=export_format,
                    source_vocal_stem_artifact_id=source_vocal_id,
                    target_instrumental_stem_artifact_id=target_instrumental_id,
                    source_wav_export_artifact_id=source_wav_id,
                    mix_summary=_mix_summary_from_meta(meta),
                    **_arrangement_list_fields_from_meta(meta),
                )
            )

    if MASTERS_DIR.exists():
        for child in sorted(MASTERS_DIR.iterdir()):
            if not child.is_dir() or not is_valid_artifact_id(child.name):
                continue
            master_wav = child / "master.wav"
            master_meta = child / "master.meta.json"
            if not master_wav.exists() and not master_meta.exists():
                continue
            meta = _read_master_meta(child)
            source_wav_id = None
            master_preset = None
            audio_created = master_wav.exists()
            if meta:
                if isinstance(meta.get("source_wav_export_artifact_id"), str):
                    source_wav_id = meta["source_wav_export_artifact_id"]
                if isinstance(meta.get("master_preset"), str):
                    master_preset = meta["master_preset"]
                if isinstance(meta.get("audio_created"), bool):
                    audio_created = meta["audio_created"]
            primary_file = master_wav if master_wav.exists() else master_meta
            playback = (
                f"/v1/artifacts/masters/{child.name}/master" if master_wav.exists() else None
            )
            entries.append(
                PreviewArtifactEntry(
                    artifact_id=child.name,
                    artifact_type="master",
                    status="ready" if audio_created else "measurement-only",
                    created_at=_iso_from_mtime(primary_file),
                    duration_seconds=_probe_duration(master_wav) if master_wav.exists() else None,
                    playback_urls=ArtifactPlaybackUrls(primary=playback),
                    preview_only=False,
                    final_export=True,
                    primary_file_name=primary_file.name,
                    preview_label=MASTER_ARTIFACT_LABEL,
                    source_wav_export_artifact_id=source_wav_id,
                    master_preset=master_preset,
                    mastering_prototype=True,
                    mix_summary=f"preset {master_preset}" if master_preset else None,
                    **_arrangement_list_fields_from_meta(meta),
                )
            )

    if PACKAGES_DIR.exists():
        for child in sorted(PACKAGES_DIR.iterdir()):
            if not child.is_dir() or not is_valid_artifact_id(child.name):
                continue
            meta_path = child / PACKAGE_META_FILE
            if not meta_path.is_file():
                continue
            meta = _read_package_meta(child)
            package_subtype = "folder"
            package_label = None
            included_count = None
            selected_ids: list[str] | None = None
            if meta:
                if isinstance(meta.get("package_subtype"), str):
                    package_subtype = meta["package_subtype"]
                if isinstance(meta.get("package_label"), str):
                    package_label = meta["package_label"]
                if isinstance(meta.get("included_file_count"), int):
                    included_count = meta["included_file_count"]
                if isinstance(meta.get("selected_artifact_ids"), list):
                    selected_ids = [
                        item for item in meta["selected_artifact_ids"] if isinstance(item, str)
                    ]
            zip_path = child / "mashlab-package.zip"
            primary_name = "mashlab-package.zip" if zip_path.exists() else "manifest.json"
            primary_file = zip_path if zip_path.exists() else meta_path
            playback = (
                f"/v1/artifacts/packages/{child.name}/download"
                if package_subtype == "zip" and zip_path.exists()
                else None
            )
            entries.append(
                PreviewArtifactEntry(
                    artifact_id=child.name,
                    artifact_type="package",
                    status="ready",
                    created_at=_iso_from_mtime(primary_file),
                    duration_seconds=None,
                    playback_urls=ArtifactPlaybackUrls(primary=playback),
                    preview_only=False,
                    final_export=False,
                    primary_file_name=primary_name,
                    preview_label=PACKAGE_ARTIFACT_LABEL,
                    package_only=True,
                    package_subtype=package_subtype,
                    package_label=package_label,
                    included_file_count=included_count,
                    selected_artifact_ids=selected_ids,
                    public_share=False,
                )
            )

    return entries


def get_artifact_metadata(artifact_id: str) -> ArtifactMetadataResult:
    primary_path, artifact_type = find_artifact_primary_path(artifact_id)
    if primary_path is None or artifact_type is None:
        master_dir = _resolve_under(MASTERS_DIR, artifact_id)
        if master_dir and master_dir.is_dir():
            meta = _read_master_meta(master_dir)
            after_raw = meta.get("after_readout") if meta else None
            technical = _technical_from_meta_dict(after_raw if isinstance(after_raw, dict) else None)
            if technical is not None:
                return ArtifactMetadataSuccess(
                    ok=True,
                    artifact_id=artifact_id,
                    artifact_type="master",
                    status="measurement-only",
                    preview_only=False,
                    final_export=True,
                    technical=technical,
                    playback_url=None,
                )
        return ArtifactOperationFailure(
            ok=False,
            status="missing_artifact",
            message="Preview artifact not found.",
        )

    technical = analyze_technical_readout(primary_path)
    playback_url = _playback_url_for(artifact_id, artifact_type, primary_path)
    is_export = artifact_type == "export"
    is_master = artifact_type == "master"

    return ArtifactMetadataSuccess(
        ok=True,
        artifact_id=artifact_id,
        artifact_type=artifact_type,
        status="ready",
        preview_only=not (is_export or is_master),
        final_export=is_export or is_master,
        technical=technical,
        playback_url=playback_url,
    )


def delete_preview_artifact(artifact_id: str) -> ArtifactDeleteResult:
    if not is_valid_artifact_id(artifact_id):
        return False, "validation_error", "Invalid artifact id."

    root = find_artifact_root(artifact_id)
    if root is None:
        return False, "missing_artifact", "Preview artifact not found."

    if not _path_is_under_artifacts_root(root):
        return False, "validation_error", "Artifact path is outside the local artifacts workspace."

    try:
        if root.is_file():
            root.unlink(missing_ok=True)
        else:
            shutil.rmtree(root)
        return True, "deleted", None
    except OSError as error:
        return False, "processing_failed", str(error)


def clear_all_preview_artifacts() -> tuple[int, list[str]]:
    deleted = 0
    errors: list[str] = []

    for entry in list_preview_artifacts():
        ok, status, message = delete_preview_artifact(entry.artifact_id)
        if ok:
            deleted += 1
        else:
            errors.append(f"{entry.artifact_id}: {status} {message or ''}".strip())

    return deleted, errors


def analyze_technical_readout(file_path: Path) -> TechnicalReadout:
    ffprobe_data = _run_ffprobe_safe(file_path)
    duration = None
    sample_rate = None
    channel_count = None
    codec = None
    container = None
    file_size = file_path.stat().st_size if file_path.exists() else None

    if ffprobe_data:
        format_data = ffprobe_data.get("format", {})
        audio_stream = _first_audio_stream(ffprobe_data)
        duration = _safe_float(format_data.get("duration"))
        container = format_data.get("format_long_name") or format_data.get("format_name")
        if audio_stream:
            sample_rate = _safe_int(audio_stream.get("sample_rate"))
            channel_count = _safe_int(audio_stream.get("channels"))
            codec = audio_stream.get("codec_name")

    loudness = analyze_loudness_readout(file_path)

    return TechnicalReadout(
        duration_seconds=duration,
        sample_rate=sample_rate,
        channel_count=channel_count,
        codec=codec,
        container=container,
        file_size_bytes=file_size,
        loudness=loudness,
    )


def analyze_loudness_readout(file_path: Path) -> LoudnessReadout:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        return LoudnessReadout(
            integrated_lufs=None,
            true_peak_dbtp=None,
            peak_level_db=None,
            status="not_available",
            message="FFmpeg is not available for loudness analysis.",
        )

    peak_level_db = _analyze_peak_level(ffmpeg, file_path)
    loudnorm = _analyze_loudnorm(ffmpeg, file_path)

    if loudnorm is None:
        return LoudnessReadout(
            integrated_lufs=None,
            true_peak_dbtp=peak_level_db,
            peak_level_db=peak_level_db,
            status="partial" if peak_level_db is not None else "not_available",
            message=(
                "Integrated LUFS could not be measured. Peak level may still be available from volumedetect."
                if peak_level_db is not None
                else "Loudness analysis failed. FFmpeg loudnorm/volumedetect did not return usable data."
            ),
        )

    return LoudnessReadout(
        integrated_lufs=loudnorm.get("integrated_lufs"),
        true_peak_dbtp=loudnorm.get("true_peak_dbtp", peak_level_db),
        peak_level_db=peak_level_db,
        status="available",
        message="Loudness readout measured with FFmpeg loudnorm analysis pass.",
    )


def _analyze_peak_level(ffmpeg: str, file_path: Path) -> float | None:
    command = [
        ffmpeg,
        "-hide_banner",
        "-nostats",
        "-i",
        str(file_path),
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
    except (subprocess.SubprocessError, OSError):
        return None

    for line in result.stderr.splitlines():
        if "max_volume:" in line:
            parts = line.split("max_volume:")[-1].strip().split(" ")
            return _safe_float(parts[0])

    return None


def _analyze_loudnorm(ffmpeg: str, file_path: Path) -> dict[str, float | None] | None:
    command = [
        ffmpeg,
        "-hide_banner",
        "-nostats",
        "-i",
        str(file_path),
        "-af",
        "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=180,
        )
    except (subprocess.SubprocessError, OSError):
        return None

    payload = _extract_json_object(result.stderr)
    if payload is None:
        return None

    input_i = _safe_float(payload.get("input_i"))
    input_tp = _safe_float(payload.get("input_tp"))

    if input_i is None and input_tp is None:
        return None

    return {
        "integrated_lufs": input_i,
        "true_peak_dbtp": input_tp,
    }


def _run_ffprobe_safe(file_path: Path) -> dict | None:
    ffprobe = shutil.which("ffprobe")
    if ffprobe is None:
        return None

    command = [
        ffprobe,
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(file_path),
    ]
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        return json.loads(completed.stdout)
    except (subprocess.SubprocessError, OSError, json.JSONDecodeError):
        return None


def _probe_duration(path: Path) -> float | None:
    data = _run_ffprobe_safe(path)
    if not data:
        return None
    return _safe_float(data.get("format", {}).get("duration"))


def _read_combined_meta(combined_dir: Path) -> dict | None:
    meta_path = combined_dir / COMBINED_META_FILE
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _arrangement_list_fields_from_meta(meta: dict | None) -> dict[str, object]:
    if not meta or not isinstance(meta, dict):
        return {
            "arrangement_draft_type": None,
            "arrangement_section_label": None,
            "arrangement_preview_start_seconds": None,
            "arrangement_duration_seconds": None,
            "arrangement_phrase_basis": None,
            "arrangement_context_summary": None,
            "arrangement_export_context_mode": None,
        }
    ctx = meta.get("arrangement_context")
    if not isinstance(ctx, dict):
        return {
            "arrangement_draft_type": None,
            "arrangement_section_label": None,
            "arrangement_preview_start_seconds": None,
            "arrangement_duration_seconds": None,
            "arrangement_phrase_basis": None,
            "arrangement_context_summary": None,
            "arrangement_export_context_mode": None,
        }
    return {
        "arrangement_draft_type": ctx.get("draft_type"),
        "arrangement_section_label": ctx.get("section_label"),
        "arrangement_preview_start_seconds": ctx.get("preview_start_seconds"),
        "arrangement_duration_seconds": ctx.get("duration_seconds"),
        "arrangement_phrase_basis": ctx.get("phrase_basis"),
        "arrangement_context_summary": arrangement_summary_from_context(ctx),
        "arrangement_export_context_mode": ctx.get("export_context_mode"),
    }


def _mix_summary_from_meta(meta: dict | None) -> str | None:
    if not meta or not isinstance(meta, dict):
        return None
    mix_raw = meta.get("mix_settings")
    if isinstance(mix_raw, dict):
        return format_mix_summary(mix_settings_from_dict(mix_raw))
    return None


def _read_export_meta(export_dir: Path) -> dict | None:
    meta_path = export_dir / "export.meta.json"
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _read_package_meta(package_dir: Path) -> dict | None:
    meta_path = package_dir / PACKAGE_META_FILE
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _read_master_meta(master_dir: Path) -> dict | None:
    meta_path = master_dir / "master.meta.json"
    if not meta_path.is_file():
        return None
    try:
        payload = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _technical_from_meta_dict(value: dict | None) -> TechnicalReadout | None:
    if not value or not isinstance(value, dict):
        return None
    loudness_raw = value.get("loudness")
    loudness = LoudnessReadout(
        integrated_lufs=_safe_float(loudness_raw.get("integrated_lufs")) if isinstance(loudness_raw, dict) else None,
        true_peak_dbtp=_safe_float(loudness_raw.get("true_peak_dbtp")) if isinstance(loudness_raw, dict) else None,
        peak_level_db=_safe_float(loudness_raw.get("peak_level_db")) if isinstance(loudness_raw, dict) else None,
        status=loudness_raw.get("status", "not_available") if isinstance(loudness_raw, dict) else "not_available",
        message=loudness_raw.get("message", "Readout unavailable.") if isinstance(loudness_raw, dict) else "Readout unavailable.",
    )
    return TechnicalReadout(
        duration_seconds=_safe_float(value.get("duration_seconds")),
        sample_rate=_safe_int(value.get("sample_rate")),
        channel_count=_safe_int(value.get("channel_count")),
        codec=value.get("codec") if isinstance(value.get("codec"), str) else None,
        container=value.get("container") if isinstance(value.get("container"), str) else None,
        file_size_bytes=_safe_int(value.get("file_size_bytes")),
        loudness=loudness,
    )


def _playback_url_for(artifact_id: str, artifact_type: str, primary_path: Path | None = None) -> str | None:
    if artifact_type == "stem":
        return f"/v1/artifacts/stems/{artifact_id}/vocals"
    if artifact_type == "combined-preview":
        return f"/v1/artifacts/combined-preview/{artifact_id}/preview"
    if artifact_type == "pitch-time-preview":
        return f"/v1/artifacts/pitch-time-preview/{artifact_id}"
    if artifact_type == "export":
        if primary_path is not None and primary_path.name == "export.mp3":
            return f"/v1/artifacts/exports/{artifact_id}/export.mp3"
        return f"/v1/artifacts/exports/{artifact_id}/export"
    if artifact_type == "master":
        return f"/v1/artifacts/masters/{artifact_id}/master"
    return None


def _first_audio_stream(payload: dict) -> dict | None:
    for stream in payload.get("streams", []):
        if stream.get("codec_type") == "audio":
            return stream
    return None


def _safe_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: object) -> int | None:
    try:
        if value is None:
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _extract_json_object(text: str) -> dict | None:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None

    try:
        payload = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None

    return payload if isinstance(payload, dict) else None

"""Local project package export from selected MashLab artifacts."""

from __future__ import annotations

import json
import re
import shutil
import uuid
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import config
from artifact_management import (
    COMBINED_DIR,
    EXPORTS_DIR,
    MASTERS_DIR,
    STEMS_DIR,
    get_artifact_metadata,
    is_valid_artifact_id,
    _read_export_meta,
    _read_master_meta,
    _resolve_under,
)
from combined_preview_processing import PREVIEW_META_FILE
from arrangement_context import arrangement_traceability_lines
from export_processing import EXPORT_FILE_NAME, EXPORT_MP3_FILE_NAME, RIGHTS_NOTICE

PACKAGES_DIR = config.WORK_DIR / "artifacts" / "packages"
PACKAGE_META_FILE = "package.meta.json"

PACKAGE_TYPE_FOLDER = "folder"
PACKAGE_TYPE_ZIP = "zip"
ALLOWED_PACKAGE_TYPES = frozenset({PACKAGE_TYPE_FOLDER, PACKAGE_TYPE_ZIP})

PACKAGE_ARTIFACT_LABEL = (
    "Local project package — user responsible for rights. "
    "No public distribution rights granted. Not public sharing."
)

SAFE_LABEL_PATTERN = re.compile(r"[^a-zA-Z0-9._-]+")


@dataclass
class PackageIncludedFile:
    artifact_id: str
    artifact_type: str
    artifact_subtype: str | None
    source_path: str
    package_path: str


@dataclass
class PackageExportSuccess:
    ok: True
    status: str
    message: str
    package_artifact_id: str
    package_label: str
    package_type: str
    local_folder_path: str
    download_url: str | None
    manifest_path: str
    rights_notice_path: str
    technical_report_path: str | None
    included_files: list[PackageIncludedFile]
    included_artifact_ids: list[str]
    public_share: bool
    package_only: bool
    rights_notice: str
    warnings: list[str]
    limitations: list[str]


@dataclass
class PackageExportFailure:
    ok: False
    status: str
    message: str
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None


PackageExportResult = PackageExportSuccess | PackageExportFailure


def sanitize_package_label(label: str) -> str:
    cleaned = SAFE_LABEL_PATTERN.sub("_", label.strip())
    cleaned = cleaned.strip("._-")
    if not cleaned:
        return "project"
    return cleaned[:80]


def build_rights_notice_text() -> str:
    return """MashLab AI / CyphaBlend AI — Local Project Package Rights Notice

The user supplied all source audio processed in this package.
MashLab AI does not provide music, samples, or distribution rights.

This package is local and user-generated. It is not a published release,
public share link, or proof of distribution rights.

No public distribution or publishing rights are granted by this package.
The user is responsible for rights, clearances, and lawful use of all
included audio and derivatives.

Upload audio you own or are authorized to use. MashLab AI helps process
and arrange it. Rights to publish or distribute are separate and remain
the user's responsibility.
"""


def build_readme_text(package_label: str, included_count: int) -> str:
    return f"""MashLab AI Local Project Package
Label: {package_label}
Files included: {included_count}

This folder was generated locally by MashLab AI / CyphaBlend AI.
It is for private organization and DJ/project workflow — not public sharing.

See RIGHTS_NOTICE.txt and manifest.json for rights and artifact details.
Raw upload files are not included in this package.
"""


def resolve_packageable_files(artifact_id: str) -> tuple[list[tuple[Path, str]], str, str | None] | None:
    if not is_valid_artifact_id(artifact_id):
        return None

    stem_dir = _resolve_under(STEMS_DIR, artifact_id)
    if stem_dir and stem_dir.is_dir():
        files: list[tuple[Path, str]] = []
        vocals = stem_dir / "vocals.wav"
        no_vocals = stem_dir / "no_vocals.wav"
        if vocals.is_file():
            files.append((vocals, f"__stem_vocals__:{artifact_id}"))
        if no_vocals.is_file():
            files.append((no_vocals, f"__stem_no_vocals__:{artifact_id}"))
        if files:
            return files, "stem", None
        return None

    combined_dir = _resolve_under(COMBINED_DIR, artifact_id)
    if combined_dir and combined_dir.is_dir():
        preview = combined_dir / "preview.wav"
        if preview.is_file():
            return [(preview, "previews/combined-preview.wav")], "combined-preview", None
        return None

    export_dir = _resolve_under(EXPORTS_DIR, artifact_id)
    if export_dir and export_dir.is_dir():
        meta = _read_export_meta(export_dir)
        subtype = meta.get("export_subtype") if meta else None
        export_format = meta.get("export_format") if meta else None
        wav = export_dir / EXPORT_FILE_NAME
        mp3 = export_dir / EXPORT_MP3_FILE_NAME
        if mp3.is_file() or export_format == "mp3":
            if mp3.is_file():
                return [(mp3, "exports/export.mp3")], "export", "mp3"
            return None
        if wav.is_file():
            dest = "exports/export-full.wav" if subtype == "full-wav" else "exports/export.wav"
            return [(wav, dest)], "export", subtype or "wav"
        return None

    master_dir = _resolve_under(MASTERS_DIR, artifact_id)
    if master_dir and master_dir.is_dir():
        master_wav = master_dir / "master.wav"
        meta = _read_master_meta(master_dir)
        preset = meta.get("master_preset") if meta else None
        if master_wav.is_file():
            return [(master_wav, "exports/master.wav")], "master", preset
        return None

    return None


def _dest_stem_paths(stem_artifact_ids: list[str]) -> dict[str, tuple[str, str]]:
    mapping: dict[str, tuple[str, str]] = {}
    for index, stem_id in enumerate(sorted(stem_artifact_ids)):
        slot = chr(ord("a") + index)
        mapping[stem_id] = (
            f"stems/track-{slot}-vocals.wav",
            f"stems/track-{slot}-no-vocals.wav",
        )
    return mapping


def _collect_manifest_entry(artifact_id: str, artifact_type: str, subtype: str | None) -> dict:
    entry: dict = {
        "artifact_id": artifact_id,
        "artifact_type": artifact_type,
        "subtype": subtype,
    }
    metadata = get_artifact_metadata(artifact_id)
    if metadata.ok:
        technical = metadata.technical
        entry["loudness_summary"] = {
            "status": technical.loudness.status,
            "integrated_lufs": technical.loudness.integrated_lufs,
            "true_peak_dbtp": technical.loudness.true_peak_dbtp,
            "message": technical.loudness.message,
        }
        entry["duration_seconds"] = technical.duration_seconds
    else:
        entry["loudness_summary"] = {"status": "not_available", "message": "Readout unavailable."}

    if artifact_type == "combined-preview":
        combined_dir = _resolve_under(COMBINED_DIR, artifact_id)
        if combined_dir:
            meta_path = combined_dir / PREVIEW_META_FILE
            if meta_path.is_file():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    if isinstance(meta, dict):
                        _attach_mix_settings(entry, meta)
                        ctx = meta.get("arrangement_context")
                        if isinstance(ctx, dict):
                            entry["arrangement_context"] = ctx
                except (OSError, json.JSONDecodeError):
                    pass
    if artifact_type == "export":
        export_dir = _resolve_under(EXPORTS_DIR, artifact_id)
        if export_dir:
            meta = _read_export_meta(export_dir)
            if meta:
                if "export_format" not in entry:
                    entry["export_format"] = meta.get("export_format")
                if "export_subtype" not in entry or entry.get("export_subtype") is None:
                    entry["export_subtype"] = meta.get("export_subtype")
                _attach_mix_settings(entry, meta)
                ctx = meta.get("arrangement_context")
                if isinstance(ctx, dict):
                    entry["arrangement_context"] = ctx
    if artifact_type == "master":
        master_dir = _resolve_under(MASTERS_DIR, artifact_id)
        if master_dir:
            meta = _read_master_meta(master_dir)
            if meta:
                entry["master_preset"] = meta.get("master_preset")
                entry["audio_created"] = meta.get("audio_created")
    return entry


def _attach_mix_settings(entry: dict, meta: dict) -> None:
    mix_raw = meta.get("mix_settings")
    if isinstance(mix_raw, dict):
        entry["mix_settings"] = mix_raw
    if "limiter_safety_applied" in meta:
        entry["limiter_safety_applied"] = meta.get("limiter_safety_applied")
    if "clipping_guard_applied" in meta:
        entry["clipping_guard_applied"] = meta.get("clipping_guard_applied")
    if meta.get("master_preset"):
        entry["master_preset"] = meta.get("master_preset")


def build_technical_report(selected_ids: list[str]) -> dict:
    artifacts = []
    for artifact_id in selected_ids:
        resolved = resolve_packageable_files(artifact_id)
        if resolved is None:
            continue
        _files, artifact_type, subtype = resolved
        artifacts.append(_collect_manifest_entry(artifact_id, artifact_type, subtype))

    arrangement_contexts = [
        item["arrangement_context"]
        for item in artifacts
        if isinstance(item.get("arrangement_context"), dict)
    ]

    return {
        "generated_at": datetime.now(tz=UTC).isoformat(),
        "artifact_count": len(artifacts),
        "artifacts": artifacts,
        "arrangement_contexts": arrangement_contexts,
        "planning_summaries": {
            "bpm_key": "not_available",
            "pitch_time_plan": "not_available",
            "arrangement_sections": (
                "advisory_only — DJ review required; no verse/chorus/drop detection"
                if arrangement_contexts
                else "not_available"
            ),
            "message": "Session planning data is not bundled in this phase — artifact readouts only.",
        },
        "warnings": [
            "Technical report includes available artifact readouts only.",
            "Missing values are reported as not_available — not fabricated.",
            "Arrangement sections are advisory and do not grant distribution rights.",
        ],
        "dependency_notes": [
            "Package excludes raw uploads.",
            "Demucs/Rubber Band execution history is not re-run for packaging.",
        ],
    }


def build_technical_report_markdown(report: dict) -> str:
    lines = [
        "# MashLab Technical Report",
        "",
        f"Generated: {report.get('generated_at', 'unknown')}",
        f"Artifacts: {report.get('artifact_count', 0)}",
        "",
        "## Included artifact readouts",
        "",
    ]
    for item in report.get("artifacts", []):
        loudness = item.get("loudness_summary") or {}
        lines.append(f"### {item.get('artifact_id')} ({item.get('artifact_type')})")
        lines.append(f"- Subtype: {item.get('subtype') or '—'}")
        lines.append(f"- Duration: {item.get('duration_seconds') or 'not_available'}")
        lines.append(
            f"- Loudness: {loudness.get('integrated_lufs', 'not_available')} LUFS · "
            f"True peak: {loudness.get('true_peak_dbtp', 'not_available')} dBTP "
            f"({loudness.get('status', 'not_available')})"
        )
        ctx = item.get("arrangement_context")
        if isinstance(ctx, dict):
            for trace_line in arrangement_traceability_lines(ctx):
                lines.append(f"- Arrangement: {trace_line}")
        lines.append("")
    if report.get("arrangement_contexts"):
        lines.append("## Arrangement traceability")
        lines.append("- Advisory sections only — DJ review required.")
        lines.append("- No true verse/chorus/drop detection.")
        lines.append("- Arrangement sections do not grant rights.")
        lines.append("")
    lines.append("## Planning summaries")
    planning = report.get("planning_summaries") or {}
    lines.append(f"- BPM/key: {planning.get('bpm_key', 'not_available')}")
    lines.append(f"- Pitch/time plan: {planning.get('pitch_time_plan', 'not_available')}")
    lines.append("")
    lines.append("## Warnings")
    for warning in report.get("warnings", []):
        lines.append(f"- {warning}")
    return "\n".join(lines) + "\n"


def create_project_package(
    selected_artifact_ids: list[str],
    package_label: str,
    package_type: str = PACKAGE_TYPE_FOLDER,
    include_technical_report: bool = False,
) -> PackageExportResult:
    errors: list[str] = []

    if not selected_artifact_ids:
        errors.append("At least one artifact id is required.")

    if package_type not in ALLOWED_PACKAGE_TYPES:
        errors.append("package_type must be folder or zip.")

    if len(package_label.strip()) == 0:
        errors.append("package_label is required.")

    if len(package_label.strip()) > 120:
        errors.append("package_label must be 120 characters or fewer.")

    unique_ids: list[str] = []
    for artifact_id in selected_artifact_ids:
        if not is_valid_artifact_id(artifact_id):
            errors.append(f"Invalid artifact id: {artifact_id}")
            continue
        if artifact_id not in unique_ids:
            unique_ids.append(artifact_id)

    if errors:
        return PackageExportFailure(
            ok=False,
            status="validation_error",
            message="Package export request validation failed.",
            validation_errors=errors,
        )

    packageable: list[tuple[str, list[tuple[Path, str]], str, str | None]] = []
    missing: list[str] = []

    for artifact_id in unique_ids:
        resolved = resolve_packageable_files(artifact_id)
        if resolved is None:
            missing.append(artifact_id)
            continue
        files, artifact_type, subtype = resolved
        packageable.append((artifact_id, files, artifact_type, subtype))

    if missing:
        return PackageExportFailure(
            ok=False,
            status="missing_artifact",
            message="One or more selected artifacts could not be packaged.",
            validation_errors=[f"Missing or unsupported artifact: {item}" for item in missing],
            setup_guidance="Select stem, combined preview, export, or master artifacts only.",
        )

    if not packageable:
        return PackageExportFailure(
            ok=False,
            status="validation_error",
            message="No packageable artifacts found.",
            validation_errors=["No eligible artifacts selected."],
        )

    stem_ids = [aid for aid, _f, atype, _s in packageable if atype == "stem"]
    stem_dest = _dest_stem_paths(stem_ids)

    package_id = uuid.uuid4().hex
    package_root = _resolve_under(PACKAGES_DIR, package_id)
    if package_root is None:
        return PackageExportFailure(
            ok=False,
            status="processing_failed",
            message="Could not resolve package artifact directory.",
        )

    safe_label = sanitize_package_label(package_label)
    project_dir = package_root / f"MashLab_Project_{safe_label}"
    project_dir.mkdir(parents=True, exist_ok=True)

    included: list[PackageIncludedFile] = []
    dest_used: set[str] = set()

    for artifact_id, files, artifact_type, subtype in packageable:
        for source_path, dest_rel in files:
            if dest_rel.startswith("__stem_vocals__:"):
                stem_id = dest_rel.split(":", 1)[1]
                dest_rel = stem_dest[stem_id][0]
            elif dest_rel.startswith("__stem_no_vocals__:"):
                stem_id = dest_rel.split(":", 1)[1]
                dest_rel = stem_dest[stem_id][1]

            if dest_rel in dest_used:
                base = Path(dest_rel)
                dest_rel = str(base.with_name(f"{base.stem}-{artifact_id[:8]}{base.suffix}"))

            dest_path = project_dir / dest_rel
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            try:
                shutil.copy2(source_path, dest_path)
            except OSError as error:
                shutil.rmtree(package_root, ignore_errors=True)
                return PackageExportFailure(
                    ok=False,
                    status="processing_failed",
                    message=f"Could not copy artifact into package: {error}",
                )

            dest_used.add(dest_rel)
            included.append(
                PackageIncludedFile(
                    artifact_id=artifact_id,
                    artifact_type=artifact_type,
                    artifact_subtype=subtype,
                    source_path=str(source_path.name),
                    package_path=dest_rel.replace("\\", "/"),
                )
            )

    manifest_entries = [
        _collect_manifest_entry(aid, atype, sub) for aid, _f, atype, sub in packageable
    ]
    manifest = {
        "package_id": package_id,
        "package_label": package_label.strip(),
        "created_at": datetime.now(tz=UTC).isoformat(),
        "package_type": package_type,
        "selected_artifact_ids": unique_ids,
        "artifacts": manifest_entries,
        "arrangement_contexts": [
            entry["arrangement_context"]
            for entry in manifest_entries
            if isinstance(entry.get("arrangement_context"), dict)
        ],
        "included_files": [
            {
                "artifact_id": item.artifact_id,
                "artifact_type": item.artifact_type,
                "artifact_subtype": item.artifact_subtype,
                "package_path": item.package_path,
            }
            for item in included
        ],
        "public_share": False,
        "rights_granted": False,
        "user_responsible_for_rights": True,
        "raw_uploads_included": False,
    }
    manifest_path = project_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    rights_path = project_dir / "RIGHTS_NOTICE.txt"
    rights_path.write_text(build_rights_notice_text(), encoding="utf-8")

    readme_path = project_dir / "README.txt"
    readme_path.write_text(build_readme_text(package_label.strip(), len(included)), encoding="utf-8")

    technical_report_rel: str | None = None
    if include_technical_report:
        reports_dir = project_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        report = build_technical_report(unique_ids)
        json_path = reports_dir / "technical-report.json"
        md_path = reports_dir / "technical-report.md"
        json_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        md_path.write_text(build_technical_report_markdown(report), encoding="utf-8")
        technical_report_rel = "reports/technical-report.json"

    download_url: str | None = None
    if package_type == PACKAGE_TYPE_ZIP:
        zip_path = package_root / "mashlab-package.zip"
        try:
            with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for file_path in project_dir.rglob("*"):
                    if file_path.is_file():
                        archive.write(file_path, arcname=file_path.relative_to(project_dir.parent))
        except OSError as error:
            shutil.rmtree(package_root, ignore_errors=True)
            return PackageExportFailure(
                ok=False,
                status="processing_failed",
                message=f"Could not create ZIP package: {error}",
            )
        download_url = f"/v1/artifacts/packages/{package_id}/download"

    local_folder_rel = str(project_dir.relative_to(config.WORK_DIR)).replace("\\", "/")
    meta = {
        "package_subtype": package_type,
        "package_label": package_label.strip(),
        "package_only": True,
        "public_share": False,
        "selected_artifact_ids": unique_ids,
        "included_file_count": len(included),
        "local_folder": local_folder_rel,
        "created_at": datetime.now(tz=UTC).isoformat(),
        "include_technical_report": include_technical_report,
    }
    (package_root / PACKAGE_META_FILE).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    warnings = [
        "Local project package — user-generated, not public sharing.",
        "No distribution or publishing rights granted.",
        "Raw uploads are excluded from this package.",
    ]
    limitations = [
        "Package is for local organization only — not cloud upload or public distribution.",
        "MashLab does not provide music or clearances.",
    ]

    return PackageExportSuccess(
        ok=True,
        status="ready",
        message="Local project package created.",
        package_artifact_id=package_id,
        package_label=package_label.strip(),
        package_type=package_type,
        local_folder_path=local_folder_rel,
        download_url=download_url,
        manifest_path=f"{local_folder_rel}/manifest.json",
        rights_notice_path=f"{local_folder_rel}/RIGHTS_NOTICE.txt",
        technical_report_path=(
            f"{local_folder_rel}/{technical_report_rel}" if technical_report_rel else None
        ),
        included_files=included,
        included_artifact_ids=unique_ids,
        public_share=False,
        package_only=True,
        rights_notice=RIGHTS_NOTICE,
        warnings=warnings,
        limitations=limitations,
    )

import json
import shutil
import unittest
from pathlib import Path

import config
from artifact_management import clear_all_preview_artifacts, is_valid_artifact_id, list_preview_artifacts
from export_processing import RIGHTS_NOTICE
from package_export_processing import (
    ALLOWED_PACKAGE_TYPES,
    build_rights_notice_text,
    build_technical_report,
    create_project_package,
    sanitize_package_label,
)


class PackageExportTests(unittest.TestCase):
    def _create_stem_artifact(self, artifact_id: str) -> str:
        stem_dir = config.WORK_DIR / "artifacts" / "stems" / artifact_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "vocals.wav").write_bytes(b"RIFF")
        (stem_dir / "no_vocals.wav").write_bytes(b"RIFF")
        self.addCleanup(lambda: shutil.rmtree(stem_dir, ignore_errors=True))
        return artifact_id

    def _create_combined_preview(self, artifact_id: str) -> str:
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / artifact_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")
        self.addCleanup(lambda: shutil.rmtree(combined_dir, ignore_errors=True))
        return artifact_id

    def _create_wav_export(self, artifact_id: str, subtype: str = "preview-copy") -> str:
        export_dir = config.WORK_DIR / "artifacts" / "exports" / artifact_id
        export_dir.mkdir(parents=True, exist_ok=True)
        (export_dir / "export.wav").write_bytes(b"RIFF")
        (export_dir / "export.meta.json").write_text(
            json.dumps({"export_format": "wav", "export_subtype": subtype}),
            encoding="utf-8",
        )
        self.addCleanup(lambda: shutil.rmtree(export_dir, ignore_errors=True))
        return artifact_id

    def test_sanitize_package_label(self) -> None:
        self.assertEqual(sanitize_package_label("My Mashup!"), "My_Mashup")
        self.assertEqual(sanitize_package_label("   "), "project")
        self.assertNotIn("..", sanitize_package_label("../bad"))

    def test_path_traversal_prevention(self) -> None:
        result = create_project_package(["../escape"], package_label="test")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertFalse(is_valid_artifact_id("../escape"))

    def test_validation_empty_selection(self) -> None:
        result = create_project_package([], package_label="test")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_validation_invalid_package_type(self) -> None:
        stem_id = self._create_stem_artifact("stempack001")
        result = create_project_package([stem_id], package_label="test", package_type="cloud")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_missing_artifact_response(self) -> None:
        result = create_project_package(["missingpack01"], package_label="test")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_create_folder_package(self) -> None:
        stem_a = self._create_stem_artifact("stempacka01")
        stem_b = self._create_stem_artifact("stempackb01")
        combined = self._create_combined_preview("combopack001")
        wav = self._create_wav_export("wavpack00001", subtype="full-wav")

        result = create_project_package(
            [stem_a, stem_b, combined, wav],
            package_label="Test Project",
            include_technical_report=True,
        )
        self.assertTrue(result.ok)
        self.assertTrue(result.package_only)
        self.assertFalse(result.public_share)
        self.assertEqual(result.rights_notice, RIGHTS_NOTICE)
        self.assertIsNotNone(result.manifest_path)
        self.assertIsNotNone(result.rights_notice_path)
        self.assertIsNotNone(result.technical_report_path)

        package_root = config.WORK_DIR / "artifacts" / "packages" / result.package_artifact_id
        self.addCleanup(lambda: shutil.rmtree(package_root, ignore_errors=True))

        manifest_path = package_root / "MashLab_Project_Test_Project" / "manifest.json"
        self.assertTrue(manifest_path.is_file())
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertFalse(manifest["public_share"])
        self.assertFalse(manifest["rights_granted"])
        self.assertTrue(manifest["user_responsible_for_rights"])
        self.assertFalse(manifest["raw_uploads_included"])

        rights_path = package_root / "MashLab_Project_Test_Project" / "RIGHTS_NOTICE.txt"
        self.assertTrue(rights_path.is_file())
        rights_text = rights_path.read_text(encoding="utf-8")
        self.assertIn("No public distribution", rights_text)
        self.assertEqual(build_rights_notice_text(), rights_text)

        report_json = package_root / "MashLab_Project_Test_Project" / "reports" / "technical-report.json"
        self.assertTrue(report_json.is_file())
        report = json.loads(report_json.read_text(encoding="utf-8"))
        self.assertEqual(report["planning_summaries"]["bpm_key"], "not_available")

    def test_create_zip_package(self) -> None:
        stem_id = self._create_stem_artifact("stemzip0001")
        result = create_project_package(
            [stem_id],
            package_label="Zip Test",
            package_type="zip",
        )
        self.assertTrue(result.ok)
        self.assertIsNotNone(result.download_url)
        self.assertIn("/v1/artifacts/packages/", result.download_url or "")

        package_root = config.WORK_DIR / "artifacts" / "packages" / result.package_artifact_id
        self.addCleanup(lambda: shutil.rmtree(package_root, ignore_errors=True))
        self.assertTrue((package_root / "mashlab-package.zip").is_file())

    def test_package_listed_and_deleted_safely(self) -> None:
        stem_id = self._create_stem_artifact("stemlist0001")
        result = create_project_package([stem_id], package_label="List Test")
        self.assertTrue(result.ok)

        artifacts = list_preview_artifacts()
        package_entries = [item for item in artifacts if item.artifact_type == "package"]
        self.assertTrue(any(item.artifact_id == result.package_artifact_id for item in package_entries))
        package_entry = next(
            item for item in package_entries if item.artifact_id == result.package_artifact_id
        )
        self.assertTrue(package_entry.package_only)
        self.assertFalse(package_entry.public_share)
        self.assertIn(package_entry.package_subtype, ALLOWED_PACKAGE_TYPES)

        cleared, errors = clear_all_preview_artifacts()
        self.assertEqual(errors, [])
        self.assertGreaterEqual(cleared, 1)
        remaining = [
            item for item in list_preview_artifacts() if item.artifact_id == result.package_artifact_id
        ]
        self.assertEqual(remaining, [])

    def test_technical_report_missing_values_not_fabricated(self) -> None:
        report = build_technical_report(["missingonly01"])
        self.assertEqual(report["artifact_count"], 0)
        self.assertEqual(report["planning_summaries"]["pitch_time_plan"], "not_available")

    def test_no_public_sharing_fields_in_success(self) -> None:
        stem_id = self._create_stem_artifact("stemnoshare1")
        result = create_project_package([stem_id], package_label="Rights")
        self.assertTrue(result.ok)
        self.assertFalse(result.public_share)
        package_root = config.WORK_DIR / "artifacts" / "packages" / result.package_artifact_id
        self.addCleanup(lambda: shutil.rmtree(package_root, ignore_errors=True))
        meta = json.loads((package_root / "package.meta.json").read_text(encoding="utf-8"))
        self.assertFalse(meta.get("public_share"))
        self.assertTrue(meta.get("package_only"))

    def test_safe_stem_filenames(self) -> None:
        stem_a = self._create_stem_artifact("aaaastem001")
        stem_b = self._create_stem_artifact("bbbstem0002")
        result = create_project_package([stem_a, stem_b], package_label="Stems")
        self.assertTrue(result.ok)
        paths = [item.package_path for item in result.included_files]
        self.assertIn("stems/track-a-vocals.wav", paths)
        self.assertIn("stems/track-b-no-vocals.wav", paths)
        package_root = config.WORK_DIR / "artifacts" / "packages" / result.package_artifact_id
        self.addCleanup(lambda: shutil.rmtree(package_root, ignore_errors=True))

    def test_manifest_does_not_expose_raw_upload_paths(self) -> None:
        stem_id = self._create_stem_artifact("stemmanifest1")
        result = create_project_package([stem_id], package_label="Manifest")
        self.assertTrue(result.ok)
        package_root = config.WORK_DIR / "artifacts" / "packages" / result.package_artifact_id
        self.addCleanup(lambda: shutil.rmtree(package_root, ignore_errors=True))
        manifest = json.loads(
            (
                package_root / "MashLab_Project_Manifest" / "manifest.json"
            ).read_text(encoding="utf-8")
        )
        manifest_text = json.dumps(manifest)
        self.assertNotIn("/uploads/", manifest_text.lower())
        self.assertNotIn("\\uploads\\", manifest_text.lower())
        self.assertFalse(manifest["raw_uploads_included"])

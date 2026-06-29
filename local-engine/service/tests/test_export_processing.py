import shutil
import unittest
from pathlib import Path

import config
from artifact_management import (
    clear_all_preview_artifacts,
    delete_preview_artifact,
    get_artifact_metadata,
    is_valid_artifact_id,
    list_preview_artifacts,
)
from export_processing import (
    RIGHTS_NOTICE,
    create_wav_export,
)


class ExportProcessingTests(unittest.TestCase):
    def test_create_wav_export_rejects_invalid_source_id(self) -> None:
        result = create_wav_export("../bad")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_create_wav_export_missing_combined_preview(self) -> None:
        result = create_wav_export("missingcombined1")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_create_wav_export_creates_export_artifact(self) -> None:
        combined_id = "combinedexport1"
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / combined_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        export_id: str | None = None
        try:
            result = create_wav_export(
                combined_id,
                export_label="Test export",
                loudness_target_mode="measurement_only",
            )
            self.assertTrue(result.ok)
            export_id = result.export_artifact_id
            self.assertEqual(result.status, "ready")
            self.assertTrue(result.final_export)
            self.assertFalse(result.public_share)
            self.assertEqual(result.rights_notice, RIGHTS_NOTICE)
            self.assertIn("not a published release", " ".join(result.warnings).lower())

            export_dir = config.WORK_DIR / "artifacts" / "exports" / export_id
            self.assertTrue((export_dir / "export.wav").is_file())
            self.assertTrue((export_dir / "export.meta.json").is_file())

            artifacts = list_preview_artifacts()
            export_entry = next(item for item in artifacts if item.artifact_id == export_id)
            self.assertEqual(export_entry.artifact_type, "export")
            self.assertTrue(export_entry.final_export)
            self.assertFalse(export_entry.preview_only)
            self.assertEqual(export_entry.source_combined_preview_artifact_id, combined_id)
        finally:
            shutil.rmtree(combined_dir, ignore_errors=True)
            if export_id:
                shutil.rmtree(
                    config.WORK_DIR / "artifacts" / "exports" / export_id,
                    ignore_errors=True,
                )

    def test_create_wav_export_rejects_non_wav_format(self) -> None:
        result = create_wav_export("abc123", export_format="mp3")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_path_traversal_prevention_on_source_id(self) -> None:
        self.assertFalse(is_valid_artifact_id("../escape"))

    def test_export_metadata_readout_after_creation(self) -> None:
        combined_id = "combinedmeta001"
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / combined_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        export_id: str | None = None
        try:
            created = create_wav_export(combined_id)
            self.assertTrue(created.ok)
            export_id = created.export_artifact_id
            metadata = get_artifact_metadata(export_id)
            self.assertTrue(metadata.ok)
            self.assertEqual(metadata.artifact_type, "export")
            self.assertTrue(metadata.final_export)
            self.assertFalse(metadata.preview_only)
        finally:
            shutil.rmtree(combined_dir, ignore_errors=True)
            if export_id:
                export_dir = config.WORK_DIR / "artifacts" / "exports" / export_id
                shutil.rmtree(export_dir, ignore_errors=True)

    def test_clear_session_includes_export_artifacts(self) -> None:
        combined_id = "combinedclear01"
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / combined_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        try:
            created = create_wav_export(combined_id)
            self.assertTrue(created.ok)
            deleted_count, errors = clear_all_preview_artifacts()
            self.assertEqual(errors, [])
            self.assertGreaterEqual(deleted_count, 2)
            export_dir = config.WORK_DIR / "artifacts" / "exports" / created.export_artifact_id
            self.assertFalse(export_dir.exists())
        finally:
            shutil.rmtree(combined_dir, ignore_errors=True)

    def test_delete_export_artifact_safely(self) -> None:
        combined_id = "combineddel001"
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / combined_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        export_id: str | None = None
        try:
            created = create_wav_export(combined_id)
            self.assertTrue(created.ok)
            export_id = created.export_artifact_id
            ok, status, _message = delete_preview_artifact(export_id)
            self.assertTrue(ok)
            self.assertEqual(status, "deleted")
            export_dir = config.WORK_DIR / "artifacts" / "exports" / export_id
            self.assertFalse(export_dir.exists())
        finally:
            shutil.rmtree(combined_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()

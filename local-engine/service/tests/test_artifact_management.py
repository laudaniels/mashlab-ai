import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

import config
from artifact_management import (
    analyze_loudness_readout,
    clear_all_preview_artifacts,
    delete_preview_artifact,
    find_artifact_root,
    get_artifact_metadata,
    is_valid_artifact_id,
    list_preview_artifacts,
)


class ArtifactManagementTests(unittest.TestCase):
    def test_is_valid_artifact_id_rejects_traversal(self) -> None:
        self.assertTrue(is_valid_artifact_id("abc123"))
        self.assertFalse(is_valid_artifact_id("../escape"))
        self.assertFalse(is_valid_artifact_id("bad/id"))

    def test_list_preview_artifacts_includes_stem_and_combined(self) -> None:
        stem_id = "stemartifact1"
        combined_id = "combinedart1"
        stem_dir = config.WORK_DIR / "artifacts" / "stems" / stem_id
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / combined_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        combined_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "vocals.wav").write_bytes(b"RIFF")
        (stem_dir / "no_vocals.wav").write_bytes(b"RIFF")
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        try:
            artifacts = list_preview_artifacts()
            ids = {item.artifact_id for item in artifacts}
            self.assertIn(stem_id, ids)
            self.assertIn(combined_id, ids)
            stem = next(item for item in artifacts if item.artifact_id == stem_id)
            self.assertEqual(stem.artifact_type, "stem")
            self.assertFalse(stem.final_export)
            self.assertTrue(stem.preview_only)
        finally:
            shutil.rmtree(stem_dir, ignore_errors=True)
            shutil.rmtree(combined_dir, ignore_errors=True)

    def test_get_artifact_metadata_missing_artifact(self) -> None:
        result = get_artifact_metadata("doesnotexist1")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_delete_preview_artifact_removes_directory(self) -> None:
        artifact_id = "deletetest1"
        stem_dir = config.WORK_DIR / "artifacts" / "stems" / artifact_id
        stem_dir.mkdir(parents=True, exist_ok=True)
        (stem_dir / "vocals.wav").write_bytes(b"RIFF")

        ok, status, _ = delete_preview_artifact(artifact_id)
        self.assertTrue(ok)
        self.assertEqual(status, "deleted")
        self.assertIsNone(find_artifact_root(artifact_id))

    def test_delete_rejects_path_traversal_id(self) -> None:
        ok, status, _ = delete_preview_artifact("../escape")
        self.assertFalse(ok)
        self.assertEqual(status, "validation_error")

    def test_clear_all_preview_artifacts(self) -> None:
        artifact_id = "cleartest01"
        combined_dir = config.WORK_DIR / "artifacts" / "combined-preview" / artifact_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        deleted, errors = clear_all_preview_artifacts()
        self.assertGreaterEqual(deleted, 1)
        self.assertEqual(errors, [])
        self.assertIsNone(find_artifact_root(artifact_id))

    @patch("artifact_management.shutil.which", return_value=None)
    def test_loudness_readout_not_available_without_ffmpeg(self, _mock_which: object) -> None:
        dummy = config.TEMP_DIR / "loudness-test.wav"
        dummy.parent.mkdir(parents=True, exist_ok=True)
        dummy.write_bytes(b"RIFF")
        try:
            readout = analyze_loudness_readout(dummy)
            self.assertEqual(readout.status, "not_available")
            self.assertIsNone(readout.integrated_lufs)
        finally:
            dummy.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()

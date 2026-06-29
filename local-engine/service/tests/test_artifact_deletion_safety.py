import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

import config
from artifact_management import (
    ARTIFACTS_ROOT,
    delete_preview_artifact,
    find_artifact_root,
    is_valid_artifact_id,
)


class ArtifactDeletionSafetyTests(unittest.TestCase):
    def test_delete_rejects_path_outside_artifacts_root(self) -> None:
        artifact_id = "outsider0001"
        outside_dir = config.WORK_DIR / "outside-delete-test"
        outside_dir.mkdir(parents=True, exist_ok=True)
        (outside_dir / "preview.wav").write_bytes(b"RIFF")
        self.addCleanup(lambda: shutil.rmtree(outside_dir, ignore_errors=True))

        with patch(
            "artifact_management.find_artifact_root",
            return_value=outside_dir,
        ):
            ok, status, message = delete_preview_artifact(artifact_id)

        self.assertFalse(ok)
        self.assertEqual(status, "validation_error")
        self.assertIn("outside the local artifacts workspace", message or "")
        self.assertTrue(outside_dir.exists())

    def test_valid_delete_stays_under_artifacts_root(self) -> None:
        artifact_id = "safedelete01"
        combined_dir = ARTIFACTS_ROOT / "combined-preview" / artifact_id
        combined_dir.mkdir(parents=True, exist_ok=True)
        (combined_dir / "preview.wav").write_bytes(b"RIFF")

        root = find_artifact_root(artifact_id)
        self.assertIsNotNone(root)
        assert root is not None
        self.assertTrue(str(root.resolve()).startswith(str(ARTIFACTS_ROOT.resolve())))

        ok, status, _ = delete_preview_artifact(artifact_id)
        self.assertTrue(ok)
        self.assertEqual(status, "deleted")
        self.assertIsNone(find_artifact_root(artifact_id))

    def test_is_valid_artifact_id_blocks_traversal(self) -> None:
        self.assertFalse(is_valid_artifact_id("../escape"))
        self.assertFalse(is_valid_artifact_id("bad/id"))


if __name__ == "__main__":
    unittest.main()

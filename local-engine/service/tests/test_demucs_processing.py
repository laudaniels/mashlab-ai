import unittest
from pathlib import Path
from unittest.mock import patch

from capabilities import is_demucs_ready
from demucs_processing import (
    ALLOWED_SPLIT_MODES,
    build_demucs_command,
    find_demucs_command,
    locate_two_stem_outputs,
    process_stem_preview,
    validate_stem_preview_request,
)


class DemucsProcessingTests(unittest.TestCase):
    def test_validate_stem_preview_request_accepts_vocals_no_vocals(self) -> None:
        errors = validate_stem_preview_request(
            split_mode="vocals_no_vocals",
            max_preview_seconds=60,
        )
        self.assertEqual(errors, [])

    def test_validate_stem_preview_request_rejects_unknown_mode(self) -> None:
        errors = validate_stem_preview_request(
            split_mode="drums_bass",
            max_preview_seconds=60,
        )
        self.assertTrue(any("split_mode" in error for error in errors))

    def test_validate_stem_preview_request_rejects_offset_past_file_end(self) -> None:
        errors = validate_stem_preview_request(
            split_mode="vocals_no_vocals",
            max_preview_seconds=180,
            preview_start_seconds=200,
            source_duration_seconds=180,
        )
        self.assertIn("Start time is past the end of this file.", errors)

    def test_process_stem_preview_rejects_invalid_offset_before_demucs(self) -> None:
        result = process_stem_preview(
            Path("/tmp/missing.wav"),
            "missing.wav",
            split_mode="vocals_no_vocals",
            max_preview_seconds=180,
            preview_start_seconds=200,
            source_duration_seconds=180,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertIn("Start time is past the end of this file.", result.validation_errors or [])

    def test_build_demucs_command_uses_two_stems_vocals(self) -> None:
        command = build_demucs_command(
            ["demucs"],
            Path("/tmp/input.wav"),
            Path("/tmp/out"),
        )
        self.assertEqual(command[0], "demucs")
        self.assertIn("--two-stems", command)
        self.assertIn("vocals", command)

    def test_locate_two_stem_outputs_finds_vocals_and_no_vocals(self) -> None:
        root = Path(self._temp_dir()) / "demucs-out"
        track_dir = root / "htdemucs" / "input"
        track_dir.mkdir(parents=True)
        vocals = track_dir / "vocals.wav"
        no_vocals = track_dir / "no_vocals.wav"
        vocals.write_bytes(b"RIFF")
        no_vocals.write_bytes(b"RIFF")

        found_vocals, found_no_vocals = locate_two_stem_outputs(root, "input")
        self.assertEqual(found_vocals, vocals)
        self.assertEqual(found_no_vocals, no_vocals)

    @patch("demucs_processing.is_demucs_ready", return_value=False)
    def test_missing_demucs_returns_structured_failure(self, _mock_ready: object) -> None:
        result = process_stem_preview(
            Path("/tmp/missing.wav"),
            "missing.wav",
            split_mode="vocals_no_vocals",
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_dependency")
        self.assertIsNotNone(result.setup_guidance)

    @patch("demucs_processing.is_demucs_ready", return_value=True)
    @patch("demucs_processing.find_demucs_command", return_value=None)
    def test_missing_demucs_command_returns_structured_failure(
        self,
        _mock_command: object,
        _mock_ready: object,
    ) -> None:
        result = process_stem_preview(
            Path("/tmp/missing.wav"),
            "missing.wav",
            split_mode="vocals_no_vocals",
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_dependency")

    def test_allowed_split_modes_contains_vocals_no_vocals_only(self) -> None:
        self.assertEqual(ALLOWED_SPLIT_MODES, {"vocals_no_vocals"})

    def test_find_demucs_command_is_safe_without_install(self) -> None:
        command = find_demucs_command()
        self.assertTrue(command is None or isinstance(command, list))

    def test_is_demucs_ready_is_boolean(self) -> None:
        self.assertIsInstance(is_demucs_ready(), bool)

    def _temp_dir(self) -> str:
        import tempfile

        return tempfile.mkdtemp()


if __name__ == "__main__":
    unittest.main()

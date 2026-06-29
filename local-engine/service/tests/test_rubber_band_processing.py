import unittest
from pathlib import Path
from unittest.mock import patch

from rubber_band_processing import (
    build_ffmpeg_trim_command,
    build_rubberband_command,
    find_rubberband_binary,
    process_pitch_time_preview,
    rubberband_time_stretch_ratio,
    validate_preview_request,
)


class RubberBandProcessingTests(unittest.TestCase):
    def test_rubberband_time_stretch_ratio_inverts_planning_ratio(self) -> None:
        self.assertEqual(rubberband_time_stretch_ratio(1.067), 0.9372)
        self.assertEqual(rubberband_time_stretch_ratio(1.0), 1.0)

    def test_build_rubberband_command_includes_pitch_and_formant(self) -> None:
        command = build_rubberband_command(
            "/usr/bin/rubberband",
            Path("/tmp/input.wav"),
            Path("/tmp/output.wav"),
            tempo_ratio=1.067,
            pitch_shift_semitones=2,
            formant_preservation=True,
        )
        self.assertEqual(command[0], "/usr/bin/rubberband")
        self.assertIn("-t", command)
        self.assertIn("-p", command)
        self.assertIn("2", command)
        self.assertIn("-F", command)

    def test_build_ffmpeg_trim_command_limits_duration(self) -> None:
        input_path = Path("/tmp/input.mp3")
        output_path = Path("/tmp/trim.wav")
        command = build_ffmpeg_trim_command("ffmpeg", input_path, output_path, 30)
        self.assertEqual(command[0], "ffmpeg")
        self.assertEqual(command[1:3], ["-y", "-i"])
        self.assertEqual(command[3], str(input_path))
        self.assertIn("-t", command)
        self.assertIn("30", command)

    def test_validate_preview_request_requires_actionable_change(self) -> None:
        ratio, errors = validate_preview_request(
            tempo_ratio=1.0,
            source_bpm=None,
            target_bpm=None,
            pitch_shift_semitones=0,
            max_preview_seconds=30,
        )
        self.assertEqual(ratio, 1.0)
        self.assertTrue(any("actionable" in error for error in errors))

    def test_validate_preview_request_rejects_out_of_range_pitch(self) -> None:
        _, errors = validate_preview_request(
            tempo_ratio=1.067,
            source_bpm=None,
            target_bpm=None,
            pitch_shift_semitones=13,
            max_preview_seconds=30,
        )
        self.assertTrue(any("pitch_shift_semitones" in error for error in errors))

    @patch("rubber_band_processing.find_rubberband_binary", return_value=None)
    def test_missing_rubberband_returns_structured_failure(self, _mock_find: object) -> None:
        result = process_pitch_time_preview(
            Path("/tmp/missing.wav"),
            "missing.wav",
            tempo_ratio=1.067,
            pitch_shift_semitones=2,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_dependency")
        self.assertIsNotNone(result.setup_guidance)

    def test_find_rubberband_binary_is_safe_without_install(self) -> None:
        path = find_rubberband_binary()
        self.assertTrue(path is None or isinstance(path, str))


if __name__ == "__main__":
    unittest.main()

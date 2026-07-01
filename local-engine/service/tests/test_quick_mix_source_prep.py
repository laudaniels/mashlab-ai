import unittest
from pathlib import Path

from quick_mix_source_prep import (
    build_quick_mix_prep_ffmpeg_command,
    validate_quick_mix_prep_request,
)


class QuickMixSourcePrepTests(unittest.TestCase):
    def test_validate_quick_mix_prep_request_rejects_out_of_range(self) -> None:
        errors = validate_quick_mix_prep_request(max_seconds=0, start_offset_seconds=0)
        self.assertTrue(errors)
        errors = validate_quick_mix_prep_request(max_seconds=181, start_offset_seconds=0)
        self.assertTrue(errors)
        self.assertEqual(
            validate_quick_mix_prep_request(max_seconds=180, start_offset_seconds=0),
            [],
        )

    def test_validate_quick_mix_prep_request_rejects_invalid_offset(self) -> None:
        errors = validate_quick_mix_prep_request(
            max_seconds=180,
            start_offset_seconds=200,
            source_duration_seconds=180,
        )
        self.assertIn("Start time is past the end of this file.", errors)

    def test_validate_quick_mix_prep_request_rejects_short_available_window(self) -> None:
        errors = validate_quick_mix_prep_request(
            max_seconds=180,
            start_offset_seconds=179.9,
            source_duration_seconds=180,
        )
        self.assertTrue(errors)

    def test_build_quick_mix_prep_ffmpeg_command_trims_from_offset(self) -> None:
        command = build_quick_mix_prep_ffmpeg_command(
            "ffmpeg",
            Path("input.mp3"),
            Path("output.wav"),
            max_seconds=180,
            start_offset_seconds=65,
            apply_fade_out=False,
        )
        joined = " ".join(command)
        self.assertIn("-ss 65", joined)
        self.assertIn("-t 180", joined)
        self.assertIn("pcm_s16le", joined)

    def test_build_quick_mix_prep_ffmpeg_command_adds_fade_for_long_sources(self) -> None:
        command = build_quick_mix_prep_ffmpeg_command(
            "ffmpeg",
            Path("input.mp3"),
            Path("output.wav"),
            max_seconds=180,
            start_offset_seconds=0,
            apply_fade_out=True,
        )
        joined = " ".join(command)
        self.assertIn("-t 180", joined)
        self.assertIn("afade=t=out:st=179.0:d=1.0", joined)
        self.assertIn("pcm_s16le", joined)


if __name__ == "__main__":
    unittest.main()

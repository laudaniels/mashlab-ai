import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

from combined_preview_processing import (
    ALLOWED_MASH_INTENTS,
    build_ffmpeg_mix_command,
    is_valid_artifact_id,
    process_combined_preview,
    stem_no_vocals_path,
    stem_vocals_path,
    validate_combined_preview_request,
)


class CombinedPreviewProcessingTests(unittest.TestCase):
    def test_validate_combined_preview_request_accepts_valid_payload(self) -> None:
        _, errors = validate_combined_preview_request(
            mash_intent="vocal_a_over_beat_b",
            source_vocal_artifact_id="abc123",
            target_instrumental_artifact_id="def456",
            tempo_ratio=1.067,
            source_bpm=120,
            target_bpm=128,
            pitch_shift_semitones=1,
            alignment_offset_ms=0,
            max_preview_seconds=30,
            neutral_processing=False,
        )
        self.assertEqual(errors, [])

    def test_validate_rejects_unknown_mash_intent(self) -> None:
        _, errors = validate_combined_preview_request(
            mash_intent="compare_both",
            source_vocal_artifact_id="abc123",
            target_instrumental_artifact_id="def456",
            tempo_ratio=1.067,
            source_bpm=120,
            target_bpm=128,
            pitch_shift_semitones=1,
            alignment_offset_ms=0,
            max_preview_seconds=30,
            neutral_processing=False,
        )
        self.assertTrue(any("mash_intent" in error for error in errors))

    def test_build_ffmpeg_mix_command_includes_alignment_delay(self) -> None:
        command = build_ffmpeg_mix_command(
            "ffmpeg",
            Path("/tmp/bed.wav"),
            Path("/tmp/vocal.wav"),
            Path("/tmp/out.wav"),
            alignment_offset_ms=250,
            max_seconds=30,
        )
        self.assertIn("-filter_complex", command)
        filter_index = command.index("-filter_complex") + 1
        self.assertIn("adelay=250|250", command[filter_index])

    def test_missing_artifact_returns_structured_failure(self) -> None:
        result = process_combined_preview(
            mash_intent="vocal_a_over_beat_b",
            source_vocal_artifact_id="missingvocal1",
            target_instrumental_artifact_id="missingbed001",
            neutral_processing=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")
        self.assertIn("Create stem previews", result.message)

    @patch("combined_preview_processing.find_rubberband_binary", return_value=None)
    def test_missing_rubber_band_returns_structured_failure(self, _mock_rb: object) -> None:
        vocal_id = "vocal000000001"
        bed_id = "bed00000000001"
        vocal_path = stem_vocals_path(vocal_id)
        bed_path = stem_no_vocals_path(bed_id)
        vocal_path.parent.mkdir(parents=True, exist_ok=True)
        bed_path.parent.mkdir(parents=True, exist_ok=True)
        vocal_path.write_bytes(b"RIFF")
        bed_path.write_bytes(b"RIFF")

        try:
            result = process_combined_preview(
                mash_intent="vocal_a_over_beat_b",
                source_vocal_artifact_id=vocal_id,
                target_instrumental_artifact_id=bed_id,
                neutral_processing=True,
            )
            self.assertFalse(result.ok)
            self.assertEqual(result.status, "missing_dependency")
        finally:
            shutil.rmtree(vocal_path.parent, ignore_errors=True)
            shutil.rmtree(bed_path.parent, ignore_errors=True)

    def test_artifact_id_validation(self) -> None:
        self.assertTrue(is_valid_artifact_id("abc123"))
        self.assertFalse(is_valid_artifact_id("../escape"))

    def test_allowed_mash_intents(self) -> None:
        self.assertEqual(ALLOWED_MASH_INTENTS, {"vocal_a_over_beat_b", "vocal_b_over_beat_a"})


if __name__ == "__main__":
    unittest.main()

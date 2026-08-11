import shutil
import unittest
import wave
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
from rubber_band_processing import find_rubberband_binary


def _write_silence_wav(path: Path, duration_seconds: float = 1.0, sample_rate: int = 44100) -> None:
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * frame_count)


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

    def test_validate_rejects_negative_preview_start(self) -> None:
        _, errors = validate_combined_preview_request(
            mash_intent="vocal_a_over_beat_b",
            source_vocal_artifact_id="abc123",
            target_instrumental_artifact_id="def456",
            tempo_ratio=1.0,
            source_bpm=120,
            target_bpm=128,
            pitch_shift_semitones=0,
            alignment_offset_ms=0,
            max_preview_seconds=30,
            neutral_processing=True,
            preview_start_seconds=-1,
        )
        self.assertTrue(any("preview_start_seconds" in error for error in errors))

    def test_trim_command_includes_start_offset(self) -> None:
        from rubber_band_processing import build_ffmpeg_trim_command

        command = build_ffmpeg_trim_command(
            "ffmpeg",
            Path("/tmp/source.wav"),
            Path("/tmp/trim.wav"),
            30,
            12.5,
        )
        self.assertIn("-ss", command)
        self.assertIn("12.5", command)

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

    def test_out_of_range_instrumental_tempo_ratio_rejected(self) -> None:
        result = process_combined_preview(
            mash_intent="vocal_a_over_beat_b",
            source_vocal_artifact_id="vocalabcdef1",
            target_instrumental_artifact_id="bedabcdefg2",
            neutral_processing=False,
            tempo_ratio=1.0,
            instrumental_tempo_ratio=3.0,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertTrue(any("tempo_ratio must be between" in error for error in result.validation_errors))

    @unittest.skipUnless(find_rubberband_binary() and shutil.which("ffmpeg"), "requires rubberband + ffmpeg on PATH")
    def test_instrumental_tempo_ratio_stretches_the_bed(self) -> None:
        vocal_id = "vocalstretch01"
        bed_id = "bedstretch0001"
        vocal_path = stem_vocals_path(vocal_id)
        bed_path = stem_no_vocals_path(bed_id)
        vocal_path.parent.mkdir(parents=True, exist_ok=True)
        bed_path.parent.mkdir(parents=True, exist_ok=True)
        _write_silence_wav(vocal_path, duration_seconds=1.0)
        _write_silence_wav(bed_path, duration_seconds=1.0)

        try:
            result = process_combined_preview(
                mash_intent="vocal_a_over_beat_b",
                source_vocal_artifact_id=vocal_id,
                target_instrumental_artifact_id=bed_id,
                neutral_processing=False,
                tempo_ratio=1.05,
                instrumental_tempo_ratio=1.2,
                max_preview_seconds=1,
            )
            self.assertTrue(result.ok, getattr(result, "message", None))
            self.assertEqual(result.processing_summary.instrumental_rubberband_ratio, 1.2)
            if result.ok:
                import config

                shutil.rmtree(
                    config.WORK_DIR / "artifacts" / "combined-preview" / result.artifact_id,
                    ignore_errors=True,
                )
        finally:
            shutil.rmtree(vocal_path.parent, ignore_errors=True)
            shutil.rmtree(bed_path.parent, ignore_errors=True)

    def test_start_beyond_stem_duration_rejected_instead_of_empty_output(self) -> None:
        vocal_id = "shortvocal0001"
        bed_id = "shortbed000001"
        vocal_path = stem_vocals_path(vocal_id)
        bed_path = stem_no_vocals_path(bed_id)
        vocal_path.parent.mkdir(parents=True, exist_ok=True)
        bed_path.parent.mkdir(parents=True, exist_ok=True)
        _write_silence_wav(vocal_path, duration_seconds=2.0)
        _write_silence_wav(bed_path, duration_seconds=2.0)

        try:
            result = process_combined_preview(
                mash_intent="vocal_a_over_beat_b",
                source_vocal_artifact_id=vocal_id,
                target_instrumental_artifact_id=bed_id,
                neutral_processing=True,
                preview_start_seconds=30.0,
            )
            self.assertFalse(result.ok)
            self.assertEqual(result.status, "validation_error")
            self.assertIn("beyond the available", result.message)
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

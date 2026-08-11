import shutil
import unittest
import wave
from pathlib import Path

from combined_preview_processing import (
    build_ffmpeg_full_mix_command,
    stem_no_vocals_path,
    stem_vocals_path,
)
from full_length_export_processing import create_full_wav_export
from loudness_gate import evaluate_loudness_gate
from artifact_management import LoudnessReadout
from rubber_band_processing import find_rubberband_binary


def _write_silence_wav(path: Path, duration_seconds: float = 1.0, sample_rate: int = 44100) -> None:
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * frame_count)


class FullLengthExportTests(unittest.TestCase):
    def test_validation_rejects_invalid_stem_ids(self) -> None:
        result = create_full_wav_export(
            source_vocal_stem_artifact_id="../bad",
            target_instrumental_stem_artifact_id="validstem1",
            mash_intent="vocal_a_over_beat_b",
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_missing_stem_artifact_response(self) -> None:
        result = create_full_wav_export(
            source_vocal_stem_artifact_id="missingvocal1",
            target_instrumental_stem_artifact_id="missingbed001",
            mash_intent="vocal_a_over_beat_b",
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_requires_neutral_confirmation_when_plan_missing(self) -> None:
        result = create_full_wav_export(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            neutral_processing=False,
            confirm_neutral_settings=False,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertIn("confirm_neutral_settings", " ".join(result.validation_errors or []))

    def test_out_of_range_instrumental_tempo_ratio_rejected(self) -> None:
        result = create_full_wav_export(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            neutral_processing=False,
            confirm_neutral_settings=True,
            tempo_ratio=1.05,
            instrumental_tempo_ratio=3.0,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertTrue(any("tempo_ratio must be between" in error for error in result.validation_errors))

    @unittest.skipUnless(find_rubberband_binary() and shutil.which("ffmpeg"), "requires rubberband + ffmpeg on PATH")
    def test_instrumental_tempo_ratio_stretches_the_bed(self) -> None:
        vocal_id = "fullexpvocal01"
        bed_id = "fullexpbed0001"
        vocal_path = stem_vocals_path(vocal_id)
        bed_path = stem_no_vocals_path(bed_id)
        vocal_path.parent.mkdir(parents=True, exist_ok=True)
        bed_path.parent.mkdir(parents=True, exist_ok=True)
        _write_silence_wav(vocal_path, duration_seconds=1.0)
        _write_silence_wav(bed_path, duration_seconds=1.0)

        try:
            result = create_full_wav_export(
                source_vocal_stem_artifact_id=vocal_id,
                target_instrumental_stem_artifact_id=bed_id,
                mash_intent="vocal_a_over_beat_b",
                neutral_processing=False,
                confirm_neutral_settings=True,
                tempo_ratio=1.05,
                instrumental_tempo_ratio=1.2,
            )
            self.assertTrue(result.ok, getattr(result, "message", None))
            self.assertEqual(result.processing_summary.instrumental_rubberband_ratio, 1.2)
            if result.ok:
                from export_processing import EXPORTS_DIR

                shutil.rmtree(EXPORTS_DIR / result.export_artifact_id, ignore_errors=True)
        finally:
            shutil.rmtree(vocal_path.parent, ignore_errors=True)
            shutil.rmtree(bed_path.parent, ignore_errors=True)

    def test_build_ffmpeg_full_mix_command_without_trim(self) -> None:
        command = build_ffmpeg_full_mix_command(
            "ffmpeg",
            __import__("pathlib").Path("bed.wav"),
            __import__("pathlib").Path("vocal.wav"),
            __import__("pathlib").Path("out.wav"),
            alignment_offset_ms=250,
            max_seconds=None,
        )
        joined = " ".join(command)
        self.assertIn("amix", joined)
        self.assertNotIn("atrim=0:", joined)

    def test_build_ffmpeg_full_mix_command_test_trim(self) -> None:
        command = build_ffmpeg_full_mix_command(
            "ffmpeg",
            __import__("pathlib").Path("bed.wav"),
            __import__("pathlib").Path("vocal.wav"),
            __import__("pathlib").Path("out.wav"),
            alignment_offset_ms=0,
            max_seconds=30,
        )
        joined = " ".join(command)
        self.assertIn("atrim=0:30", joined)


class LoudnessGateTests(unittest.TestCase):
    def test_not_available_when_loudness_missing(self) -> None:
        gate = evaluate_loudness_gate(
            LoudnessReadout(
                integrated_lufs=None,
                true_peak_dbtp=None,
                peak_level_db=None,
                status="not_available",
                message="FFmpeg unavailable.",
            )
        )
        self.assertEqual(gate.status, "not_available")
        self.assertIn("club-ready", gate.message.lower())

    def test_warn_when_true_peak_exceeds_target(self) -> None:
        gate = evaluate_loudness_gate(
            LoudnessReadout(
                integrated_lufs=-10.0,
                true_peak_dbtp=0.5,
                peak_level_db=0.5,
                status="available",
                message="Measured.",
            )
        )
        self.assertEqual(gate.status, "warn")

    def test_pass_within_general_targets(self) -> None:
        gate = evaluate_loudness_gate(
            LoudnessReadout(
                integrated_lufs=-14.2,
                true_peak_dbtp=-1.5,
                peak_level_db=-1.5,
                status="available",
                message="Measured.",
            )
        )
        self.assertEqual(gate.status, "pass")
        self.assertIn("informational", gate.message.lower())


if __name__ == "__main__":
    unittest.main()

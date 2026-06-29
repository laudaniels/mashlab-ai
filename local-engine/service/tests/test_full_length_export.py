import unittest

from combined_preview_processing import build_ffmpeg_full_mix_command
from full_length_export_processing import create_full_wav_export
from loudness_gate import evaluate_loudness_gate
from artifact_management import LoudnessReadout


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

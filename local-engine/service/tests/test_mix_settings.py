import unittest

from artifact_management import LoudnessReadout
from mix_settings import (
    GAIN_MAX_DB,
    GAIN_MIN_DB,
    MixSettings,
    build_loudness_clipping_warnings,
    build_mix_filter_complex,
    build_mix_processing_notes,
    format_mix_summary,
    validate_mix_settings,
    validate_mix_settings_payload,
)


class MixSettingsTests(unittest.TestCase):
    def test_validate_accepts_neutral_defaults(self) -> None:
        settings, errors = validate_mix_settings()
        self.assertEqual(errors, [])
        self.assertIsNotNone(settings)
        self.assertEqual(settings.vocal_gain_db, 0.0)
        self.assertFalse(settings.limiter_safety)

    def test_validate_rejects_out_of_range_gain(self) -> None:
        settings, errors = validate_mix_settings(vocal_gain_db=GAIN_MAX_DB + 1)
        self.assertIsNone(settings)
        self.assertTrue(any("vocal_gain_db" in error for error in errors))

    def test_validate_rejects_negative_fade(self) -> None:
        settings, errors = validate_mix_settings(vocal_fade_in_ms=-1)
        self.assertIsNone(settings)
        self.assertTrue(any("vocal_fade_in_ms" in error for error in errors))

    def test_build_mix_filter_includes_gains_and_limiter(self) -> None:
        settings = MixSettings(
            vocal_gain_db=2.0,
            instrumental_gain_db=-1.0,
            master_gain_db=1.0,
            limiter_safety=True,
        )
        graph = build_mix_filter_complex(
            alignment_offset_ms=100,
            mix_settings=settings,
            max_seconds=30,
        )
        self.assertIn("volume=2.00dB", graph)
        self.assertIn("volume=-1.00dB", graph)
        self.assertIn("volume=1.00dB", graph)
        self.assertIn("alimiter=limit=0.95", graph)
        self.assertIn("adelay=100|100", graph)

    def test_clipping_guard_takes_priority_over_limiter_safety(self) -> None:
        settings = MixSettings(limiter_safety=True, clipping_guard=True)
        graph = build_mix_filter_complex(
            alignment_offset_ms=0,
            mix_settings=settings,
            max_seconds=10,
        )
        self.assertIn("alimiter=limit=-1dB", graph)
        self.assertNotIn("limit=0.95", graph)

    def test_format_mix_summary_includes_flags(self) -> None:
        summary = format_mix_summary(
            MixSettings(vocal_gain_db=1.5, limiter_safety=True, clipping_guard=True)
        )
        self.assertIn("+1.5 dB", summary)
        self.assertIn("limiter on", summary)
        self.assertIn("clip guard on", summary)

    def test_build_mix_processing_notes_neutral(self) -> None:
        notes = build_mix_processing_notes(MixSettings())
        self.assertTrue(any("No mix-stage limiter" in note for note in notes))

    def test_loudness_clipping_warnings_high_peak(self) -> None:
        warnings = build_loudness_clipping_warnings(
            LoudnessReadout(
                integrated_lufs=-8.0,
                true_peak_dbtp=0.2,
                peak_level_db=0.2,
                status="available",
                message="Measured.",
            )
        )
        self.assertTrue(any("clipping" in warning.lower() for warning in warnings))

    def test_validate_payload_defaults_on_empty(self) -> None:
        settings, errors = validate_mix_settings_payload(None)
        self.assertEqual(errors, [])
        self.assertEqual(settings.vocal_gain_db, 0.0)


if __name__ == "__main__":
    unittest.main()

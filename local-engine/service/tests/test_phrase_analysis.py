import json
import unittest

from phrase_analysis import (
    ALLOWED_METHODS,
    _heuristic_phrase_start_times,
    _parse_beat_times,
    _validate_phrase_length,
    analyze_phrase_file,
)


class PhraseAnalysisValidationTests(unittest.TestCase):
    def test_invalid_method_rejected(self) -> None:
        result = analyze_phrase_file(
            None,
            "test.wav",
            beat_times_raw=json.dumps([0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5]),
            phrase_length_bars=4,
            method="invalid",
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_invalid_phrase_length_rejected(self) -> None:
        result = analyze_phrase_file(
            None,
            "test.wav",
            beat_times_raw=json.dumps([0.0, 0.5, 1.0]),
            phrase_length_bars=12,
            method="heuristic",
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_missing_advanced_dependency_for_essentia(self) -> None:
        result = analyze_phrase_file(
            __import__("pathlib").Path("missing.wav"),
            "test.wav",
            phrase_length_bars=8,
            method="essentia",
        )
        self.assertFalse(result.ok)
        self.assertIn(result.status, {"missing_dependency", "not_implemented"})

    def test_heuristic_fallback_from_beat_times(self) -> None:
        beat_times = [round(i * 0.5, 4) for i in range(32)]
        result = analyze_phrase_file(
            None,
            "test.wav",
            beat_times_raw=json.dumps(beat_times),
            bpm=120.0,
            phrase_length_bars=8,
            method="heuristic",
        )
        self.assertTrue(result.ok)
        assert result.result is not None
        self.assertEqual(result.result.phrase_basis, "heuristic_from_beats")
        self.assertGreater(len(result.result.phrase_start_times), 0)
        self.assertEqual(result.result.downbeat_times, [])

    def test_no_downbeat_output_when_not_detected(self) -> None:
        beat_times = [round(i * 0.5, 4) for i in range(32)]
        result = analyze_phrase_file(
            None,
            "test.wav",
            beat_times_raw=json.dumps(beat_times),
            phrase_length_bars=8,
            method="heuristic",
        )
        assert result.result is not None
        self.assertEqual(result.result.downbeat_times, [])
        self.assertNotEqual(result.result.phrase_basis, "verified_downbeat")

    def test_requires_beat_times_or_upload(self) -> None:
        result = analyze_phrase_file(None, "test.wav", method="heuristic")
        self.assertFalse(result.ok)

    def test_negative_bpm_rejected(self) -> None:
        result = analyze_phrase_file(
            None,
            "test.wav",
            beat_times_raw=json.dumps([0.0, 0.5]),
            bpm=-1,
            method="heuristic",
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_response_has_no_public_share_field(self) -> None:
        beat_times = [round(i * 0.5, 4) for i in range(32)]
        result = analyze_phrase_file(
            None,
            "test.wav",
            beat_times_raw=json.dumps(beat_times),
            phrase_length_bars=8,
            method="heuristic",
        )
        dumped = result.model_dump()
        self.assertNotIn("public_share", dumped)


class PhraseAnalysisHelperTests(unittest.TestCase):
    def test_parse_beat_times_json(self) -> None:
        values = _parse_beat_times(json.dumps([0.0, 1.0, 2.0]))
        self.assertEqual(values, [0.0, 1.0, 2.0])

    def test_validate_phrase_length_allowed(self) -> None:
        length, errors = _validate_phrase_length(16)
        self.assertEqual(length, 16)
        self.assertEqual(errors, [])

    def test_heuristic_phrase_starts(self) -> None:
        beat_times = [float(i) for i in range(32)]
        starts = _heuristic_phrase_start_times(beat_times, 8)
        self.assertEqual(starts, [0.0])

    def test_allowed_methods(self) -> None:
        self.assertIn("auto", ALLOWED_METHODS)
        self.assertIn("heuristic", ALLOWED_METHODS)


if __name__ == "__main__":
    unittest.main()

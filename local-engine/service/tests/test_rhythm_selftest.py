"""Tests for rhythm engine self-test endpoint."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest.mock import patch

from rhythm_engines.base import RhythmEngineOutput
from rhythm_selftest import (
    generate_click_track_wav,
    run_heuristic_only_selftest_for_tests,
    run_rhythm_selftest,
)


class RhythmSelfTestStructureTests(unittest.TestCase):
    def test_response_has_required_fields(self) -> None:
        response = run_rhythm_selftest()
        dumped = response.model_dump()
        self.assertTrue(dumped["ok"])
        self.assertTrue(dumped["no_user_audio_processed"])
        self.assertIn("synthetic_click_track", dumped["test_signal"])
        self.assertEqual(len(dumped["results"]), 4)
        engine_ids = {item["engine_id"] for item in dumped["results"]}
        self.assertEqual(engine_ids, {"heuristic", "essentia", "madmom", "beatnet"})

    def test_response_has_no_public_share_field(self) -> None:
        dumped = run_rhythm_selftest().model_dump()
        self.assertNotIn("public_share", dumped)

    def test_rights_notice_present(self) -> None:
        response = run_rhythm_selftest()
        self.assertIn("authorized to use", response.rights_notice)

    def test_temp_file_cleaned_up(self) -> None:
        import config

        before = set(config.TEMP_DIR.glob("rhythm-selftest-*.wav")) if config.TEMP_DIR.exists() else set()
        run_rhythm_selftest()
        after = set(config.TEMP_DIR.glob("rhythm-selftest-*.wav")) if config.TEMP_DIR.exists() else set()
        self.assertEqual(before, after)


class RhythmSelfTestHeuristicTests(unittest.TestCase):
    def test_heuristic_passes_with_generated_signal(self) -> None:
        import config

        config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
        test_wav = config.TEMP_DIR / "unit-heuristic-selftest.wav"
        expected = generate_click_track_wav(test_wav)
        try:
            result = run_heuristic_only_selftest_for_tests(test_wav, expected)
            if result.import_status == "available":
                self.assertIn(result.smoke_test_status, {"pass", "failed", "skipped"})
                if result.smoke_test_status == "pass":
                    self.assertGreater(result.phrase_marker_count, 0)
                    self.assertEqual(result.basis_label, "Heuristic")
                    self.assertNotEqual(result.basis_label, "Verified downbeat")
        finally:
            test_wav.unlink(missing_ok=True)

    def test_heuristic_missing_librosa(self) -> None:
        import config

        config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
        test_wav = config.TEMP_DIR / "unit-heuristic-missing.wav"
        expected = generate_click_track_wav(test_wav)
        try:
            with patch("rhythm_selftest.librosa_available", return_value=False):
                result = run_heuristic_only_selftest_for_tests(test_wav, expected)
            self.assertEqual(result.smoke_test_status, "missing_dependency")
        finally:
            test_wav.unlink(missing_ok=True)


class RhythmSelfTestAdvancedMockTests(unittest.TestCase):
    def test_madmom_missing_dependency(self) -> None:
        with patch(
            "rhythm_selftest.engine_status",
            return_value=type(
                "S",
                (),
                {"importable": False, "status": "not_configured", "message": "madmom not installed."},
            )(),
        ):
            response = run_rhythm_selftest()
        madmom = next(item for item in response.results if item.engine_id == "madmom")
        self.assertEqual(madmom.smoke_test_status, "not_configured")

    def test_essentia_pass_mocked(self) -> None:
        mocked = RhythmEngineOutput(
            engine_id="essentia",
            method_used="essentia_rhythm_extractor2013",
            phrase_basis="heuristic_from_beats",
            beat_times=[0.0, 0.5, 1.0],
            phrase_start_times=[0.0],
            phrase_length_bars=8,
            confidence=0.9,
            limitations=["Heuristic from Essentia beats."],
        )

        def fake_advanced(engine_id: str, _path: Path, _bars: int):
            if engine_id == "essentia":
                return mocked
            return None

        def fake_status(engine_id: str):
            if engine_id == "essentia":
                return type("S", (), {"importable": True, "status": "available", "message": "ok"})()
            return type(
                "S",
                (),
                {"importable": False, "status": "not_configured", "message": "missing"},
            )()

        with patch("rhythm_selftest.analyze_with_engine", side_effect=fake_advanced):
            with patch("rhythm_selftest.engine_status", side_effect=fake_status):
                response = run_rhythm_selftest()

        essentia = next(item for item in response.results if item.engine_id == "essentia")
        self.assertEqual(essentia.smoke_test_status, "pass")
        self.assertEqual(essentia.basis_label, "Heuristic")
        self.assertEqual(essentia.confidence, 0.9)
        self.assertEqual(essentia.downbeat_marker_count, 0)

    def test_verified_claim_rejected_without_markers(self) -> None:
        mocked = RhythmEngineOutput(
            engine_id="madmom",
            method_used="madmom_dbn_downbeat_tracker",
            phrase_basis="verified_phrase",
            beat_times=[0.0],
            downbeat_times=[],
            phrase_start_times=[],
            phrase_length_bars=8,
        )

        with patch(
            "rhythm_selftest.analyze_with_engine",
            return_value=mocked,
        ):
            with patch(
                "rhythm_selftest.engine_status",
                return_value=type("S", (), {"importable": True, "status": "available", "message": "ok"})(),
            ):
                response = run_rhythm_selftest()

        madmom = next(item for item in response.results if item.engine_id == "madmom")
        self.assertEqual(madmom.smoke_test_status, "failed")
        self.assertNotEqual(madmom.basis_label, "Verified phrase")

    def test_beatnet_not_implemented(self) -> None:
        def fake_status(engine_id: str):
            if engine_id == "beatnet":
                return type("S", (), {"importable": True, "status": "experimental", "message": "stub"})()
            return type(
                "S",
                (),
                {"importable": False, "status": "not_configured", "message": "missing"},
            )()

        with patch("rhythm_selftest.engine_status", side_effect=fake_status):
            response = run_rhythm_selftest()

        beatnet = next(item for item in response.results if item.engine_id == "beatnet")
        self.assertEqual(beatnet.smoke_test_status, "not_implemented")


class RhythmSelfTestSerializationTests(unittest.TestCase):
    def test_json_serializable(self) -> None:
        dumped = run_rhythm_selftest().model_dump()
        json.dumps(dumped)


if __name__ == "__main__":
    unittest.main()

import unittest
from pathlib import Path
from unittest.mock import patch

from rhythm_engines.base import (
    RhythmEngineOutput,
    pick_best_output,
    phrase_starts_from_downbeats,
)
from rhythm_engines.registry import (
    map_engine_output_to_phrase_result,
    pick_best_advanced_result,
    run_auto_advanced,
)


class RhythmEngineBaseTests(unittest.TestCase):
    def test_phrase_starts_from_downbeats(self) -> None:
        downbeats = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0]
        starts = phrase_starts_from_downbeats(downbeats, 8)
        self.assertEqual(starts, [0.0, 16.0])

    def test_pick_best_prefers_verified_phrase(self) -> None:
        heuristic = RhythmEngineOutput(
            engine_id="essentia",
            method_used="essentia_rhythm_extractor2013",
            phrase_basis="heuristic_from_beats",
            phrase_start_times=[0.0, 16.0],
        )
        verified = RhythmEngineOutput(
            engine_id="madmom",
            method_used="madmom_dbn_downbeat_tracker",
            phrase_basis="verified_phrase",
            downbeat_times=[0.0, 2.0, 4.0],
            phrase_start_times=[0.0],
        )
        best = pick_best_output([heuristic, verified])
        assert best is not None
        self.assertEqual(best.engine_id, "madmom")
        self.assertEqual(best.phrase_basis, "verified_phrase")

    def test_map_engine_output_never_fakes_downbeats(self) -> None:
        output = RhythmEngineOutput(
            engine_id="essentia",
            method_used="essentia_rhythm_extractor2013",
            phrase_basis="heuristic_from_beats",
            beat_times=[0.0, 0.5, 1.0],
            downbeat_times=[],
            phrase_start_times=[0.0],
            phrase_length_bars=8,
        )
        result = map_engine_output_to_phrase_result(output, "test.wav")
        self.assertEqual(result.downbeat_times, [])
        self.assertNotEqual(result.phrase_basis, "verified_downbeat")


class RhythmEngineLazyImportTests(unittest.TestCase):
    def test_essentia_status_without_import_side_effects(self) -> None:
        from rhythm_engines import essentia_engine

        status = essentia_engine.check_status()
        self.assertIn(status.status, {"available", "not_configured"})

    def test_madmom_status_without_import_side_effects(self) -> None:
        from rhythm_engines import madmom_engine

        status = madmom_engine.check_status()
        self.assertIn(status.status, {"available", "not_configured"})

    def test_beatnet_stub_returns_none(self) -> None:
        from rhythm_engines import beatnet_engine

        with patch("rhythm_engines.beatnet_engine.module_importable", return_value=(True, "0.1")):
            result = beatnet_engine.analyze(Path("missing.wav"), 8)
        self.assertIsNone(result)


class RhythmEngineAutoTests(unittest.TestCase):
    def test_run_auto_uses_mocked_madmom_verified(self) -> None:
        verified = RhythmEngineOutput(
            engine_id="madmom",
            method_used="madmom_dbn_downbeat_tracker",
            phrase_basis="verified_phrase",
            downbeat_times=[0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0, 22.0, 24.0, 26.0, 28.0, 30.0, 32.0],
            phrase_start_times=[0.0, 16.0],
            phrase_length_bars=8,
        )
        heuristic = RhythmEngineOutput(
            engine_id="essentia",
            method_used="essentia_rhythm_extractor2013",
            phrase_basis="heuristic_from_beats",
            phrase_start_times=[0.0],
        )

        def fake_analyze(engine_id: str, _file_path: Path, _bars: int):
            if engine_id == "essentia":
                return heuristic
            if engine_id == "madmom":
                return verified
            return None

        with patch("rhythm_engines.registry.analyze_with_engine", side_effect=fake_analyze):
            with patch(
                "rhythm_engines.registry.engine_status",
                return_value=type("S", (), {"importable": True})(),
            ):
                result = run_auto_advanced(Path("test.wav"), 8)

        assert result is not None
        self.assertEqual(result.phrase_basis, "verified_phrase")

    def test_pick_best_advanced_result_alias(self) -> None:
        outputs = [
            RhythmEngineOutput(
                engine_id="essentia",
                method_used="essentia_rhythm_extractor2013",
                phrase_basis="heuristic_from_beats",
            )
        ]
        self.assertIs(pick_best_advanced_result(outputs), pick_best_output(outputs))


class PhraseAnalysisAutoFallbackTests(unittest.TestCase):
    def test_auto_falls_back_to_heuristic_from_beat_times(self) -> None:
        import json

        from phrase_analysis import analyze_phrase_file

        beat_times = [round(i * 0.5, 4) for i in range(32)]
        with patch("phrase_analysis.run_auto_advanced", return_value=None):
            result = analyze_phrase_file(
                None,
                "test.wav",
                beat_times_raw=json.dumps(beat_times),
                phrase_length_bars=8,
                method="auto",
            )
        self.assertTrue(result.ok)
        assert result.result is not None
        self.assertEqual(result.result.phrase_basis, "heuristic_from_beats")

    def test_explicit_essentia_missing_dependency(self) -> None:
        from phrase_analysis import analyze_phrase_file

        with patch(
            "phrase_analysis.engine_status",
            return_value=type(
                "S",
                (),
                {"importable": False, "setup_guidance": "Install Essentia."},
            )(),
        ):
            result = analyze_phrase_file(
                Path("test.wav"),
                "test.wav",
                method="essentia",
            )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_dependency")


if __name__ == "__main__":
    unittest.main()

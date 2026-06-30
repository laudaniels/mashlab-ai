"""Tests for synthetic rhythm validation fixtures."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from rhythm_fixtures import (
    cleanup_validation_fixture,
    expected_beat_times,
    expected_downbeat_times,
    generate_validation_fixture,
    write_click_track_wav,
)
from rhythm_selftest import run_rhythm_selftest


class RhythmFixtureTests(unittest.TestCase):
    def test_expected_beat_times_120bpm(self) -> None:
        beats = expected_beat_times(bpm=120.0, duration_seconds=4.0)
        self.assertGreater(len(beats), 0)
        self.assertAlmostEqual(beats[1] - beats[0], 0.5, places=2)

    def test_expected_downbeat_times(self) -> None:
        beats = expected_beat_times(bpm=120.0, duration_seconds=4.0)
        downbeats = expected_downbeat_times(beats)
        self.assertEqual(downbeats, [beats[0], beats[4]])

    def test_write_click_track_wav(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "click.wav"
            beat_times = write_click_track_wav(path, accent_downbeats=True)
            self.assertTrue(path.exists())
            self.assertGreater(path.stat().st_size, 44)
            self.assertGreater(len(beat_times), 8)

    def test_generate_and_cleanup_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            path, beats = generate_validation_fixture(work, accented=True, keep_file=True)
            self.assertTrue(path.exists())
            self.assertGreater(len(beats), 0)
            cleanup_validation_fixture(path)
            self.assertFalse(path.exists())

    def test_selftest_stable_without_advanced_engines(self) -> None:
        response = run_rhythm_selftest()
        self.assertTrue(response.ok)
        self.assertTrue(response.no_user_audio_processed)
        engine_ids = {item.engine_id for item in response.results}
        self.assertEqual(engine_ids, {"heuristic", "essentia", "madmom", "beatnet"})


if __name__ == "__main__":
    unittest.main()

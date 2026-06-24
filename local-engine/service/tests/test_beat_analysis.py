import unittest
from pathlib import Path

from beat_analysis import analyze_beat_file
from librosa_support import LIBROSA_SETUP_GUIDANCE, librosa_available


class BeatAnalysisTests(unittest.TestCase):
    def test_missing_librosa_returns_structured_error(self) -> None:
        if librosa_available():
            self.skipTest("librosa is installed on this machine")

        response = analyze_beat_file(Path("missing.wav"), "missing.wav")
        self.assertFalse(response.ok)
        self.assertEqual(response.status, "missing_dependency")
        self.assertEqual(response.setup_guidance, LIBROSA_SETUP_GUIDANCE)


if __name__ == "__main__":
    unittest.main()

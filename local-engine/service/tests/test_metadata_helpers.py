import unittest

from metadata import FFPROBE_SETUP_GUIDANCE, analyze_metadata_file, ffprobe_available


class MetadataHelperTests(unittest.TestCase):
    def test_ffprobe_missing_returns_structured_guidance(self) -> None:
        if ffprobe_available():
            self.skipTest("ffprobe is available on this machine")

        response = analyze_metadata_file(__import__("pathlib").Path("missing.wav"), "missing.wav")
        self.assertFalse(response.ok)
        self.assertEqual(response.status, "missing")
        self.assertIn("ffprobe", response.message)
        self.assertEqual(response.setup_guidance, FFPROBE_SETUP_GUIDANCE)


if __name__ == "__main__":
    unittest.main()

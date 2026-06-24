import unittest

from capabilities import detect_capabilities, get_capability


class CapabilityDetectionTests(unittest.TestCase):
    def test_detect_capabilities_includes_core_ids(self) -> None:
        capabilities = detect_capabilities()
        capability_ids = {item.id for item in capabilities}
        self.assertIn("python", capability_ids)
        self.assertIn("ffmpeg", capability_ids)
        self.assertIn("ffprobe", capability_ids)
        self.assertIn("librosa", capability_ids)
        self.assertIn("demucs", capability_ids)

    def test_get_capability_returns_python(self) -> None:
        capability = get_capability("python")
        self.assertIsNotNone(capability)
        assert capability is not None
        self.assertEqual(capability.status, "available")


if __name__ == "__main__":
    unittest.main()

import unittest

from capabilities import detect_capabilities, get_capability, is_demucs_ready


class DependencyStatusTests(unittest.TestCase):
    def test_detect_capabilities_includes_core_ids(self) -> None:
        capabilities = detect_capabilities()
        ids = {item.id for item in capabilities}
        self.assertTrue({"python", "ffmpeg", "ffprobe", "rubberband", "demucs", "librosa"}.issubset(ids))

    def test_get_capability_returns_service_capability(self) -> None:
        capability = get_capability("python")
        self.assertIsNotNone(capability)
        assert capability is not None
        self.assertEqual(capability.status, "available")
        self.assertIn("Python", capability.message)

    def test_is_demucs_ready_is_boolean(self) -> None:
        self.assertIsInstance(is_demucs_ready(), bool)


if __name__ == "__main__":
    unittest.main()

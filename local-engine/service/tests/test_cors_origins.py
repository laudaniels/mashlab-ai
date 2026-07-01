import unittest

import config


class CorsOriginTests(unittest.TestCase):
    def test_allows_default_vite_and_preview_ports(self) -> None:
        self.assertIn("http://127.0.0.1:5173", config.ALLOWED_ORIGINS)
        self.assertIn("http://localhost:5173", config.ALLOWED_ORIGINS)
        self.assertIn("http://127.0.0.1:4173", config.ALLOWED_ORIGINS)

    def test_allows_vite_fallback_ports_when_default_is_busy(self) -> None:
        # Vite increments the port when 5173 is occupied; the sidecar must still
        # accept the browser origin or Quick Mix cannot reach the local engine.
        for port in (5174, 5175, 5176):
            self.assertIn(f"http://127.0.0.1:{port}", config.ALLOWED_ORIGINS)
            self.assertIn(f"http://localhost:{port}", config.ALLOWED_ORIGINS)

    def test_only_loopback_origins_are_allowed(self) -> None:
        for origin in config.ALLOWED_ORIGINS:
            self.assertTrue(
                origin.startswith("http://127.0.0.1:")
                or origin.startswith("http://localhost:"),
                msg=f"Non-loopback origin present: {origin}",
            )


if __name__ == "__main__":
    unittest.main()

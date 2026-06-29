import unittest

from error_responses import dependency_setup_guidance, format_user_facing_error


class ErrorResponsesTests(unittest.TestCase):
    def test_format_user_facing_error_includes_status_guidance(self) -> None:
        message = format_user_facing_error(
            status="missing_dependency",
            message="FFmpeg was not found on PATH.",
        )
        self.assertIn("FFmpeg", message)
        self.assertIn("missing local dependency", message.lower())

    def test_format_user_facing_error_prefers_validation_errors(self) -> None:
        message = format_user_facing_error(
            status="validation_error",
            message="Ignored when validation errors present.",
            validation_errors=["confirm_neutral_settings is required."],
        )
        self.assertIn("confirm_neutral_settings", message)
        self.assertNotIn("Ignored", message)

    def test_dependency_setup_guidance_for_ffmpeg(self) -> None:
        guidance = dependency_setup_guidance("ffmpeg")
        self.assertIsNotNone(guidance)
        assert guidance is not None
        self.assertIn("check:local-engine", guidance)


if __name__ == "__main__":
    unittest.main()

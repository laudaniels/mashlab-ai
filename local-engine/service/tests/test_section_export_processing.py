import unittest

from rubber_band_processing import build_ffmpeg_trim_command
from section_export_processing import (
    SECTION_EXPORT_SUBTYPE,
    create_section_wav_export,
    validate_section_export_request,
)

VALID_ARRANGEMENT_CONTEXT = {
    "draft_type": "club_edit",
    "section_id": "intro-planned",
    "section_label": "Intro (heuristic 16 bars)",
    "phrase_basis": "heuristic_phrase_markers",
    "export_context_mode": "section_export",
    "planning_only": True,
    "dj_review_required": True,
}


class SectionExportValidationTests(unittest.TestCase):
    def test_validation_rejects_invalid_stem_ids(self) -> None:
        errors = validate_section_export_request(
            source_vocal_stem_artifact_id="../bad",
            target_instrumental_stem_artifact_id="validstem1",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertTrue(any("Invalid" in error for error in errors))

    def test_missing_duration_response(self) -> None:
        result = create_section_wav_export(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=None,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertIn("duration_seconds", " ".join(result.validation_errors or []))

    def test_missing_stem_artifact_response(self) -> None:
        result = create_section_wav_export(
            source_vocal_stem_artifact_id="missingvocal1",
            target_instrumental_stem_artifact_id="missingbed001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_unavailable_start_requires_confirmation(self) -> None:
        errors = validate_section_export_request(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            start_seconds_unavailable=True,
            confirm_advisory_section_export=True,
            confirm_start_from_artifact_beginning=False,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertTrue(
            any("confirm_start_from_artifact_beginning" in error for error in errors)
        )

    def test_negative_start_and_duration_rejected(self) -> None:
        errors = validate_section_export_request(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=-5,
            start_seconds=-1,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        joined = " ".join(errors)
        self.assertIn("duration_seconds", joined)
        self.assertIn("start_seconds", joined)

    def test_path_traversal_prevention(self) -> None:
        result = create_section_wav_export(
            source_vocal_stem_artifact_id="..%2Fetc",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_stale_context_requires_confirmation(self) -> None:
        errors = validate_section_export_request(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            binding_freshness_status="stale",
            confirm_stale_context=False,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertTrue(any("confirm_stale_context" in error for error in errors))

    def test_arrangement_context_required(self) -> None:
        errors = validate_section_export_request(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            arrangement_context=None,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertTrue(any("arrangement_context" in error for error in errors))

    def test_wrong_artifact_type_in_context_label(self) -> None:
        bad_context = {
            **VALID_ARRANGEMENT_CONTEXT,
            "section_label": "Verse detected by AI",
        }
        errors = validate_section_export_request(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            arrangement_context=bad_context,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertTrue(any("section_label" in error for error in errors))


class SectionExportCommandTests(unittest.TestCase):
    def test_ffmpeg_trim_command_includes_ss_and_t(self) -> None:
        command = build_ffmpeg_trim_command(
            "ffmpeg",
            __import__("pathlib").Path("input.wav"),
            __import__("pathlib").Path("output.wav"),
            30,
            16.0,
        )
        joined = " ".join(command)
        self.assertIn("-ss", joined)
        self.assertIn("16.0", joined)
        self.assertIn("-t", joined)
        self.assertIn("30", joined)

    def test_section_context_serialization_mode(self) -> None:
        self.assertEqual(SECTION_EXPORT_SUBTYPE, "section-wav")
        self.assertEqual(VALID_ARRANGEMENT_CONTEXT["export_context_mode"], "section_export")


class SectionExportResponseShapeTests(unittest.TestCase):
    def test_validation_failure_has_no_public_share(self) -> None:
        result = create_section_wav_export(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=0,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=True,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertNotEqual(getattr(result, "public_share", None), True)


if __name__ == "__main__":
    unittest.main()

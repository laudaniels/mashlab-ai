import unittest

from arrangement_export_processing import create_arrangement_wav_export

CLEAN_BLEND_PLAN = {
    "mode": "clean_blend",
    "mode_label": "Clean Blend",
    "target_bpm": 120.0,
    "sections": [
        {
            "label": "full",
            "source": "mix",
            "start_seconds": 0.0,
            "duration_seconds": 30.0,
            "start_bar": 1,
            "bar_length": 16,
        }
    ],
}

MULTI_SECTION_PLAN = {
    "mode": "club_edit",
    "mode_label": "Club Edit",
    "target_bpm": 120.0,
    "sections": [
        {
            "label": "intro",
            "source": "instrumental",
            "start_seconds": 0.0,
            "duration_seconds": 15.0,
            "start_bar": 1,
            "bar_length": 8,
        },
        {
            "label": "verse",
            "source": "mix",
            "start_seconds": 15.0,
            "duration_seconds": 15.0,
            "start_bar": 9,
            "bar_length": 8,
        },
    ],
}


class ArrangementExportProcessingTests(unittest.TestCase):
    def test_clean_blend_delegates_to_full_export_and_threads_instrumental_ratio(self) -> None:
        result = create_arrangement_wav_export(
            source_vocal_stem_artifact_id="missingvocal1",
            target_instrumental_stem_artifact_id="missingbed001",
            arrangement_plan=CLEAN_BLEND_PLAN,
            tempo_ratio=1.05,
            instrumental_tempo_ratio=1.2,
            neutral_processing=False,
            confirm_neutral_settings=True,
        )
        # Delegates straight to create_full_wav_export, so the same missing-artifact
        # path applies (proves instrumental_tempo_ratio reached that function without
        # a TypeError on an unexpected kwarg).
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_custom_instrumental_ratio_rejected_for_multi_section_plans(self) -> None:
        result = create_arrangement_wav_export(
            source_vocal_stem_artifact_id="missingvocal1",
            target_instrumental_stem_artifact_id="missingbed001",
            arrangement_plan=MULTI_SECTION_PLAN,
            tempo_ratio=1.05,
            instrumental_tempo_ratio=1.2,
            neutral_processing=False,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "unsupported_request")
        self.assertIn("multi-section arrangement exports", result.message)

    def test_multi_section_plan_unaffected_without_custom_instrumental_ratio(self) -> None:
        # Default (no instrumental_tempo_ratio) must reach the existing missing-artifact
        # check rather than the new unsupported_request guard — confirms no regression
        # to the pre-existing multi-section path.
        result = create_arrangement_wav_export(
            source_vocal_stem_artifact_id="missingvocal1",
            target_instrumental_stem_artifact_id="missingbed001",
            arrangement_plan=MULTI_SECTION_PLAN,
            tempo_ratio=1.05,
            neutral_processing=False,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_out_of_range_instrumental_ratio_rejected_before_delegation(self) -> None:
        result = create_arrangement_wav_export(
            source_vocal_stem_artifact_id="missingvocal1",
            target_instrumental_stem_artifact_id="missingbed001",
            arrangement_plan=CLEAN_BLEND_PLAN,
            tempo_ratio=1.05,
            instrumental_tempo_ratio=3.0,
            neutral_processing=False,
            confirm_neutral_settings=True,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertTrue(any("tempo_ratio must be between" in error for error in result.validation_errors))


if __name__ == "__main__":
    unittest.main()

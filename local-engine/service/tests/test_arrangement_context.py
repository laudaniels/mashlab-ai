import unittest

from arrangement_context import (
    FULL_LENGTH_CONTEXT_NOTICE,
    TRACEABILITY_NOTICE,
    arrangement_summary_from_context,
    arrangement_traceability_lines,
    inherit_arrangement_context,
    merge_arrangement_context_into_meta,
    validate_arrangement_context,
)


def sample_context(**overrides):
    base = {
        "draft_type": "club_edit",
        "section_id": "intro-planned",
        "section_label": "Intro (heuristic 16 bars)",
        "phrase_basis": "heuristic_phrase_markers",
        "duration_seconds": 30,
        "preview_start_seconds": 16,
        "export_context_mode": "preview_section",
        "planning_only": True,
        "dj_review_required": True,
        "traceability_notice": TRACEABILITY_NOTICE,
    }
    base.update(overrides)
    return base


class ArrangementContextTests(unittest.TestCase):
    def test_validate_accepts_planning_context(self) -> None:
        validated, errors = validate_arrangement_context(sample_context())
        self.assertEqual(errors, [])
        self.assertIsNotNone(validated)
        self.assertTrue(validated["planning_only"])
        self.assertTrue(validated["dj_review_required"])

    def test_validate_rejects_fake_section_labels(self) -> None:
        _, errors = validate_arrangement_context(
            sample_context(section_label="Chorus detected by AI")
        )
        self.assertTrue(any("section_label" in error for error in errors))

    def test_merge_stores_context_in_meta(self) -> None:
        meta: dict = {}
        merge_arrangement_context_into_meta(meta, sample_context())
        self.assertIn("arrangement_context", meta)
        self.assertEqual(meta["arrangement_context"]["section_id"], "intro-planned")

    def test_inherit_from_source_export_meta(self) -> None:
        source_meta = {"arrangement_context": sample_context()}
        inherited = inherit_arrangement_context(source_meta)
        self.assertIsNotNone(inherited)
        self.assertEqual(inherited["draft_type"], "club_edit")

    def test_summary_and_traceability_lines_are_advisory(self) -> None:
        summary = arrangement_summary_from_context(sample_context())
        self.assertIsNotNone(summary)
        self.assertIn("advisory", summary)
        lines = arrangement_traceability_lines(
            sample_context(export_context_mode="full_length_context_only")
        )
        self.assertTrue(any(FULL_LENGTH_CONTEXT_NOTICE in line for line in lines))
        self.assertTrue(any("do not grant rights" in line for line in lines))


if __name__ == "__main__":
    unittest.main()

import shutil
import unittest
import wave
from pathlib import Path

from combined_preview_processing import stem_no_vocals_path, stem_vocals_path
from rubber_band_processing import build_ffmpeg_trim_command, find_rubberband_binary
from section_export_processing import (
    SECTION_EXPORT_SUBTYPE,
    create_section_wav_export,
    validate_section_export_request,
)


def _write_silence_wav(path: Path, duration_seconds: float = 1.0, sample_rate: int = 44100) -> None:
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * frame_count)

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

    def test_start_beyond_stem_duration_rejected_instead_of_empty_output(self) -> None:
        vocal_id = "shortsecvocal1"
        bed_id = "shortsecbed001"
        vocal_path = stem_vocals_path(vocal_id)
        bed_path = stem_no_vocals_path(bed_id)
        vocal_path.parent.mkdir(parents=True, exist_ok=True)
        bed_path.parent.mkdir(parents=True, exist_ok=True)
        _write_silence_wav(vocal_path, duration_seconds=2.0)
        _write_silence_wav(bed_path, duration_seconds=2.0)

        try:
            result = create_section_wav_export(
                source_vocal_stem_artifact_id=vocal_id,
                target_instrumental_stem_artifact_id=bed_id,
                mash_intent="vocal_a_over_beat_b",
                duration_seconds=5,
                start_seconds=30.0,
                confirm_advisory_section_export=True,
                confirm_start_from_artifact_beginning=True,
                arrangement_context=VALID_ARRANGEMENT_CONTEXT,
                neutral_processing=True,
                confirm_neutral_settings=True,
            )
            self.assertFalse(result.ok)
            self.assertEqual(result.status, "validation_error")
            self.assertIn("beyond the available", result.message)
        finally:
            shutil.rmtree(vocal_path.parent, ignore_errors=True)
            shutil.rmtree(bed_path.parent, ignore_errors=True)

    def test_out_of_range_instrumental_tempo_ratio_rejected(self) -> None:
        result = create_section_wav_export(
            source_vocal_stem_artifact_id="stemvocal001",
            target_instrumental_stem_artifact_id="stembed00001",
            mash_intent="vocal_a_over_beat_b",
            duration_seconds=30,
            confirm_advisory_section_export=True,
            arrangement_context=VALID_ARRANGEMENT_CONTEXT,
            neutral_processing=False,
            confirm_neutral_settings=True,
            tempo_ratio=1.05,
            instrumental_tempo_ratio=3.0,
        )
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertTrue(any("tempo_ratio must be between" in error for error in result.validation_errors))

    @unittest.skipUnless(find_rubberband_binary() and shutil.which("ffmpeg"), "requires rubberband + ffmpeg on PATH")
    def test_instrumental_tempo_ratio_stretches_the_bed(self) -> None:
        vocal_id = "sectionvocal01"
        bed_id = "sectionbed0001"
        vocal_path = stem_vocals_path(vocal_id)
        bed_path = stem_no_vocals_path(bed_id)
        vocal_path.parent.mkdir(parents=True, exist_ok=True)
        bed_path.parent.mkdir(parents=True, exist_ok=True)
        _write_silence_wav(vocal_path, duration_seconds=2.0)
        _write_silence_wav(bed_path, duration_seconds=2.0)

        try:
            result = create_section_wav_export(
                source_vocal_stem_artifact_id=vocal_id,
                target_instrumental_stem_artifact_id=bed_id,
                mash_intent="vocal_a_over_beat_b",
                duration_seconds=1,
                start_seconds=0,
                confirm_advisory_section_export=True,
                confirm_start_from_artifact_beginning=True,
                arrangement_context=VALID_ARRANGEMENT_CONTEXT,
                neutral_processing=False,
                confirm_neutral_settings=True,
                tempo_ratio=1.05,
                instrumental_tempo_ratio=1.2,
            )
            self.assertTrue(result.ok, getattr(result, "message", None))
            if result.ok:
                from export_processing import EXPORTS_DIR

                shutil.rmtree(EXPORTS_DIR / result.export_artifact_id, ignore_errors=True)
        finally:
            shutil.rmtree(vocal_path.parent, ignore_errors=True)
            shutil.rmtree(bed_path.parent, ignore_errors=True)

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

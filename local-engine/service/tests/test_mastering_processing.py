import json
import shutil
import unittest
from pathlib import Path
from unittest.mock import patch

import config
from artifact_management import (
    LoudnessReadout,
    TechnicalReadout,
    clear_all_preview_artifacts,
    is_valid_artifact_id,
    list_preview_artifacts,
)
from export_processing import RIGHTS_NOTICE
from mastering_presets import (
    ALLOWED_MASTERING_PRESETS,
    CLUB_LOUDNESS_PROTOTYPE_PRESET,
    DJ_LOUDNESS_PROTOTYPE_PRESET,
    GENERAL_SAFE_NORMALIZE_PRESET,
    MEASUREMENT_ONLY_PRESET,
    build_loudnorm_encode_command,
    evaluate_mastering_gate,
    get_mastering_preset,
)
from mastering_processing import create_master_wav


class MasteringPresetsTests(unittest.TestCase):
    def _create_wav_export_artifact(self, artifact_id: str = "wavexportmst01") -> str:
        export_dir = config.WORK_DIR / "artifacts" / "exports" / artifact_id
        export_dir.mkdir(parents=True, exist_ok=True)
        (export_dir / "export.wav").write_bytes(b"RIFF")
        (export_dir / "export.meta.json").write_text(
            json.dumps({"export_format": "wav", "export_subtype": "preview-copy"}),
            encoding="utf-8",
        )
        self.addCleanup(lambda: shutil.rmtree(export_dir, ignore_errors=True))
        return artifact_id

    def test_allowed_presets(self) -> None:
        self.assertEqual(
            ALLOWED_MASTERING_PRESETS,
            frozenset(
                {
                    MEASUREMENT_ONLY_PRESET,
                    GENERAL_SAFE_NORMALIZE_PRESET,
                    DJ_LOUDNESS_PROTOTYPE_PRESET,
                    CLUB_LOUDNESS_PROTOTYPE_PRESET,
                }
            ),
        )

    def test_club_preset_is_prototype_not_certification(self) -> None:
        preset = get_mastering_preset(CLUB_LOUDNESS_PROTOTYPE_PRESET)
        self.assertIsNotNone(preset)
        assert preset is not None
        self.assertIn("club", preset.label.lower())
        joined = " ".join(preset.preset_warnings).lower()
        self.assertIn("not professional mastering", joined)
        self.assertIn("club-ready", joined)

    def test_build_loudnorm_encode_command(self) -> None:
        command = build_loudnorm_encode_command(
            "/usr/bin/ffmpeg",
            Path("/tmp/source.wav"),
            Path("/tmp/master.wav"),
            loudnorm_filter="loudnorm=I=-14:TP=-1:LRA=11",
        )
        self.assertIn("loudnorm=I=-14:TP=-1:LRA=11", command)
        self.assertNotIn("..", " ".join(command))

    def test_create_master_rejects_invalid_source(self) -> None:
        result = create_master_wav("../bad", preset=MEASUREMENT_ONLY_PRESET)
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_create_master_rejects_invalid_preset(self) -> None:
        result = create_master_wav("validid123", preset="club_master")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_create_master_missing_wav_artifact(self) -> None:
        result = create_master_wav("missingwav001", preset=MEASUREMENT_ONLY_PRESET)
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_create_master_rejects_mp3_source(self) -> None:
        mp3_id = "mp3source002"
        mp3_dir = config.WORK_DIR / "artifacts" / "exports" / mp3_id
        mp3_dir.mkdir(parents=True, exist_ok=True)
        (mp3_dir / "export.mp3").write_bytes(b"ID3")
        try:
            result = create_master_wav(mp3_id, preset=MEASUREMENT_ONLY_PRESET)
            self.assertFalse(result.ok)
            self.assertEqual(result.status, "wrong_artifact_type")
        finally:
            shutil.rmtree(mp3_dir, ignore_errors=True)

    def test_path_traversal_prevention(self) -> None:
        self.assertFalse(is_valid_artifact_id("../escape"))

    @patch("mastering_processing.analyze_technical_readout")
    def test_measurement_only_creates_metadata_without_audio(
        self, mock_readout: unittest.mock.Mock
    ) -> None:
        wav_id = self._create_wav_export_artifact()
        readout = TechnicalReadout(
            duration_seconds=30.0,
            sample_rate=44100,
            channel_count=2,
            codec="pcm_s16le",
            container="WAV",
            file_size_bytes=2048,
            loudness=LoudnessReadout(
                integrated_lufs=-16.0,
                true_peak_dbtp=-2.0,
                peak_level_db=-2.0,
                status="available",
                message="Measured.",
            ),
        )
        mock_readout.return_value = readout

        result = create_master_wav(wav_id, preset=MEASUREMENT_ONLY_PRESET)
        self.assertTrue(result.ok)
        self.assertFalse(result.audio_created)
        self.assertIsNone(result.artifact_url)
        self.assertTrue(result.final_export)
        self.assertFalse(result.public_share)
        self.assertTrue(result.mastering_prototype)
        self.assertEqual(result.rights_notice, RIGHTS_NOTICE)
        self.assertIn("not professional mastering", " ".join(result.warnings).lower())

        master_dir = config.WORK_DIR / "artifacts" / "masters" / result.master_artifact_id
        self.assertTrue((master_dir / "master.meta.json").is_file())
        self.assertFalse((master_dir / "master.wav").exists())
        self.addCleanup(lambda: shutil.rmtree(master_dir, ignore_errors=True))

    @patch("mastering_processing.analyze_technical_readout")
    @patch("mastering_processing.shutil.which", return_value="/usr/bin/ffmpeg")
    def test_general_safe_normalize_creates_master_wav(
        self,
        _mock_which: unittest.mock.Mock,
        mock_readout: unittest.mock.Mock,
    ) -> None:
        wav_id = self._create_wav_export_artifact("wavexportmst02")
        readout = TechnicalReadout(
            duration_seconds=30.0,
            sample_rate=44100,
            channel_count=2,
            codec="pcm_s16le",
            container="WAV",
            file_size_bytes=2048,
            loudness=LoudnessReadout(
                integrated_lufs=-14.1,
                true_peak_dbtp=-1.1,
                peak_level_db=-1.1,
                status="available",
                message="Measured.",
            ),
        )
        mock_readout.return_value = readout

        def fake_run(command, **kwargs):
            Path(command[-1]).write_bytes(b"RIFFmaster")
            return unittest.mock.Mock(returncode=0, stderr="")

        with patch("mastering_processing.subprocess.run", side_effect=fake_run):
            result = create_master_wav(wav_id, preset=GENERAL_SAFE_NORMALIZE_PRESET)

        self.assertTrue(result.ok)
        self.assertTrue(result.audio_created)
        self.assertIn("/v1/artifacts/masters/", result.artifact_url or "")
        preset_def = get_mastering_preset(GENERAL_SAFE_NORMALIZE_PRESET)
        self.assertIsNotNone(preset_def)
        self.assertNotIn("public_share_url", str(result.__dict__).lower())

        master_dir = config.WORK_DIR / "artifacts" / "masters" / result.master_artifact_id
        self.assertTrue((master_dir / "master.wav").is_file())
        self.addCleanup(lambda: shutil.rmtree(master_dir, ignore_errors=True))

    def test_evaluate_mastering_gate_not_available(self) -> None:
        gate = evaluate_mastering_gate(
            MEASUREMENT_ONLY_PRESET,
            LoudnessReadout(None, None, None, "not_available", "Unavailable."),
        )
        self.assertEqual(gate.status, "not_available")

    @patch("mastering_processing.analyze_technical_readout")
    def test_clear_session_includes_master_artifacts(
        self, mock_readout: unittest.mock.Mock
    ) -> None:
        wav_id = self._create_wav_export_artifact("wavexportmst03")
        mock_readout.return_value = TechnicalReadout(
            duration_seconds=10.0,
            sample_rate=44100,
            channel_count=2,
            codec="pcm_s16le",
            container="WAV",
            file_size_bytes=512,
            loudness=LoudnessReadout(None, None, None, "not_available", "Unavailable."),
        )
        created = create_master_wav(wav_id, preset=MEASUREMENT_ONLY_PRESET)
        self.assertTrue(created.ok)
        master_dir = config.WORK_DIR / "artifacts" / "masters" / created.master_artifact_id
        self.assertTrue(master_dir.is_dir())

        deleted_count, errors = clear_all_preview_artifacts()
        self.assertGreater(deleted_count, 0)
        self.assertEqual(errors, [])
        self.assertFalse(master_dir.exists())


if __name__ == "__main__":
    unittest.main()

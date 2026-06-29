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
from mp3_export_processing import (
    ALLOWED_MP3_BITRATES,
    build_ffmpeg_mp3_command,
    create_mp3_export,
)


class Mp3ExportProcessingTests(unittest.TestCase):
    def _create_wav_export_artifact(self, artifact_id: str = "wavexportmp301") -> str:
        export_dir = config.WORK_DIR / "artifacts" / "exports" / artifact_id
        export_dir.mkdir(parents=True, exist_ok=True)
        (export_dir / "export.wav").write_bytes(b"RIFF")
        (export_dir / "export.meta.json").write_text(
            json.dumps(
                {
                    "export_subtype": "preview-copy",
                    "export_format": "wav",
                    "created_at": "2026-06-23T12:00:00Z",
                    "public_share": False,
                    "final_export": True,
                }
            ),
            encoding="utf-8",
        )
        self.addCleanup(lambda: shutil.rmtree(export_dir, ignore_errors=True))
        return artifact_id

    def test_build_ffmpeg_mp3_command(self) -> None:
        command = build_ffmpeg_mp3_command(
            "/usr/bin/ffmpeg",
            Path("/tmp/source.wav"),
            Path("/tmp/output.mp3"),
            bitrate_kbps=320,
        )
        self.assertEqual(command[0], "/usr/bin/ffmpeg")
        self.assertIn("libmp3lame", command)
        self.assertIn("320k", command)
        self.assertNotIn("..", " ".join(command))

    def test_create_mp3_export_rejects_invalid_source_id(self) -> None:
        result = create_mp3_export("../bad")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")

    def test_create_mp3_export_rejects_invalid_bitrate(self) -> None:
        result = create_mp3_export("validid123", bitrate_kbps=128)
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "validation_error")
        self.assertIn("320, 256, or 192", " ".join(result.validation_errors or []))

    def test_create_mp3_export_missing_wav_artifact(self) -> None:
        result = create_mp3_export("missingwav001")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, "missing_artifact")

    def test_create_mp3_export_rejects_mp3_source(self) -> None:
        mp3_id = "mp3source001"
        mp3_dir = config.WORK_DIR / "artifacts" / "exports" / mp3_id
        mp3_dir.mkdir(parents=True, exist_ok=True)
        (mp3_dir / "export.mp3").write_bytes(b"ID3")
        (mp3_dir / "export.meta.json").write_text(
            json.dumps({"export_format": "mp3", "export_subtype": "mp3"}),
            encoding="utf-8",
        )
        try:
            result = create_mp3_export(mp3_id)
            self.assertFalse(result.ok)
            self.assertEqual(result.status, "wrong_artifact_type")
        finally:
            shutil.rmtree(mp3_dir, ignore_errors=True)

    def test_path_traversal_prevention_on_source_id(self) -> None:
        self.assertFalse(is_valid_artifact_id("../escape"))

    def test_create_mp3_export_success_metadata(self) -> None:
        wav_id = self._create_wav_export_artifact()
        readout = TechnicalReadout(
            duration_seconds=30.0,
            sample_rate=44100,
            channel_count=2,
            codec="mp3",
            container="mp3",
            file_size_bytes=1024,
            loudness=LoudnessReadout(
                integrated_lufs=None,
                true_peak_dbtp=None,
                peak_level_db=None,
                status="not_available",
                message="Loudness readout unavailable.",
            ),
        )

        def fake_run(command, **kwargs):
            output_path = Path(command[-1])
            output_path.write_bytes(b"ID3fake")
            return unittest.mock.Mock(returncode=0, stderr="")

        with patch("mp3_export_processing.analyze_technical_readout", return_value=readout), patch(
            "mp3_export_processing.shutil.which", return_value="/usr/bin/ffmpeg"
        ), patch("mp3_export_processing.subprocess.run", side_effect=fake_run):
            result = create_mp3_export(wav_id, bitrate_kbps=256, export_label="Test MP3")

        self.assertTrue(result.ok)
        self.assertEqual(result.status, "ready")
        self.assertEqual(result.source_wav_export_artifact_id, wav_id)
        self.assertEqual(result.export_format, "mp3")
        self.assertEqual(result.bitrate_kbps, 256)
        self.assertTrue(result.final_export)
        self.assertFalse(result.public_share)
        self.assertEqual(result.rights_notice, RIGHTS_NOTICE)
        self.assertIn("not proof of distribution rights", " ".join(result.warnings).lower())
        self.assertNotIn("public_share_url", str(result.__dict__).lower())

        export_dir = config.WORK_DIR / "artifacts" / "exports" / result.export_artifact_id
        self.assertTrue((export_dir / "export.mp3").is_file())
        meta = json.loads((export_dir / "export.meta.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["source_wav_export_artifact_id"], wav_id)
        self.assertFalse(meta["public_share"])

        artifacts = list_preview_artifacts()
        mp3_entry = next(item for item in artifacts if item.artifact_id == result.export_artifact_id)
        self.assertEqual(mp3_entry.export_subtype, "mp3")
        self.assertEqual(mp3_entry.export_format, "mp3")
        self.assertEqual(mp3_entry.source_wav_export_artifact_id, wav_id)
        self.assertIn("/export.mp3", mp3_entry.playback_urls.primary or "")

        self.addCleanup(lambda: shutil.rmtree(export_dir, ignore_errors=True))

    def test_allowed_bitrates(self) -> None:
        self.assertEqual(ALLOWED_MP3_BITRATES, frozenset({320, 256, 192}))

    def test_clear_session_includes_mp3_artifacts(self) -> None:
        wav_id = self._create_wav_export_artifact("wavexportmp302")
        readout = TechnicalReadout(
            duration_seconds=30.0,
            sample_rate=44100,
            channel_count=2,
            codec="mp3",
            container="mp3",
            file_size_bytes=512,
            loudness=LoudnessReadout(
                integrated_lufs=None,
                true_peak_dbtp=None,
                peak_level_db=None,
                status="not_available",
                message="Loudness readout unavailable.",
            ),
        )

        def fake_run(command, **kwargs):
            Path(command[-1]).write_bytes(b"ID3fake")
            return unittest.mock.Mock(returncode=0, stderr="")

        with patch("mp3_export_processing.analyze_technical_readout", return_value=readout), patch(
            "mp3_export_processing.shutil.which", return_value="/usr/bin/ffmpeg"
        ), patch("mp3_export_processing.subprocess.run", side_effect=fake_run):
            created = create_mp3_export(wav_id)

        self.assertTrue(created.ok)
        mp3_dir = config.WORK_DIR / "artifacts" / "exports" / created.export_artifact_id
        self.assertTrue(mp3_dir.is_dir())

        cleared_count, errors = clear_all_preview_artifacts()
        self.assertGreater(cleared_count, 0)
        self.assertEqual(errors, [])
        self.assertFalse(mp3_dir.exists())


if __name__ == "__main__":
    unittest.main()

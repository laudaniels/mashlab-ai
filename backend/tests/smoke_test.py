"""End-to-end smoke test for the mashup pipeline using synthetic audio.

Run from the backend/ directory:
    .\\venv\\Scripts\\python.exe -m tests.smoke_test
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from app.audio import analysis
from app.audio.pipeline import build_mashup
from tests.gen_audio import make_acapella, make_instrumental


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_p = Path(tmp)
        instr_path = tmp_p / "instrumental.wav"
        acap_path = tmp_p / "acapella.wav"
        make_instrumental(instr_path)
        make_acapella(acap_path)

        acap_an = analysis.analyze_file(str(acap_path))
        instr_an = analysis.analyze_file(str(instr_path))
        print("Acapella   :", acap_an.bpm, "BPM,", acap_an.key,
              "downbeat", acap_an.downbeat_sec)
        print("Instrumental:", instr_an.bpm, "BPM,", instr_an.key,
              "downbeat", instr_an.downbeat_sec)

        out_dir = tmp_p / "out"
        result = build_mashup(str(acap_path), str(instr_path), str(out_dir))

        print(
            "Remix score:",
            result.params.get("plan", {}).get("score"),
            "tier:",
            result.params.get("confidence_tier"),
            "offset_ms:",
            (result.params.get("validation") or {}).get("anchor_offset_ms"),
        )
        assert result.wav_path.exists(), "wav not written"
        assert result.mp3_path.exists(), "mp3 not written"
        wav_size = result.wav_path.stat().st_size
        mp3_size = result.mp3_path.stat().st_size
        print(f"WAV: {wav_size} bytes, MP3: {mp3_size} bytes")
        assert wav_size > 1000 and mp3_size > 1000, "output files too small"

        # Verify the mix is audible and not clipping badly.
        data, _ = sf.read(str(result.wav_path))
        peak = float(np.max(np.abs(data)))
        rms = float(np.sqrt(np.mean(data ** 2)))
        print(f"Mix peak={peak:.3f} rms={rms:.4f}")
        assert 0.05 < peak <= 1.0, "unexpected peak level"

        print("\nSMOKE TEST PASSED")


if __name__ == "__main__":
    main()

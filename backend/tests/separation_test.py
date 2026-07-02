"""Validate Demucs stem separation on a short sample.

The first run downloads the model weights, so this can take a while.
Run from the backend/ directory:
    .\\venv\\Scripts\\python.exe -m tests.separation_test
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import soundfile as sf

from app.audio import separation
from tests.gen_audio import make_instrumental


def main() -> None:
    assert separation.is_available(), "Demucs is not installed"

    with tempfile.TemporaryDirectory() as tmp:
        tmp_p = Path(tmp)
        song = tmp_p / "song.wav"
        # A short clip keeps CPU separation quick.
        make_instrumental(song, seconds=4.0)

        out_root = tmp_p / "stems"
        vocals = separation.separate_stem(song, out_root, "vocals")
        instrumental = separation.separate_stem(song, out_root, "instrumental")

        print("vocals stem:", vocals, vocals.stat().st_size, "bytes")
        print("instrumental stem:", instrumental, instrumental.stat().st_size, "bytes")

        for p in (vocals, instrumental):
            assert p.exists() and p.stat().st_size > 1000, f"bad stem: {p}"
            data, sr = sf.read(str(p))
            assert data.shape[0] > 0, "empty stem audio"

        print("\nSEPARATION TEST PASSED")


if __name__ == "__main__":
    main()

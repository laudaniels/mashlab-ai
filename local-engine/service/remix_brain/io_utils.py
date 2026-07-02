"""Audio decode/encode helpers.

All audio is handled internally as float32 numpy arrays shaped ``(channels, n)``
at a fixed sample rate. Decoding is done through ffmpeg so that any input
container/codec (mp3, m4a, wav, flac, ogg, ...) works reliably on Windows,
where libsndfile's codec coverage is inconsistent.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

SAMPLE_RATE = 44100


def _ffmpeg_bin() -> str:
    exe = shutil.which("ffmpeg")
    if exe is None:
        raise RuntimeError(
            "ffmpeg was not found on PATH. Install ffmpeg and make sure it is "
            "available from the command line."
        )
    return exe


def load_audio(path: str | Path, sr: int = SAMPLE_RATE) -> tuple[np.ndarray, int]:
    """Decode ``path`` to a float32 array shaped ``(channels, n)`` at ``sr``.

    Always returns stereo (2 channels); mono sources are duplicated.
    """
    path = Path(path)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "decoded.wav"
        cmd = [
            _ffmpeg_bin(),
            "-y",
            "-i",
            str(path),
            "-ac",
            "2",
            "-ar",
            str(sr),
            "-c:a",
            "pcm_f32le",
            str(wav_path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed to decode {path.name}: {proc.stderr[-500:]}")

        data, file_sr = sf.read(str(wav_path), dtype="float32", always_2d=True)

    # soundfile returns (n, channels) -> transpose to (channels, n)
    y = data.T.copy()
    if y.shape[0] == 1:
        y = np.vstack([y, y])
    return y, file_sr


def to_mono(y: np.ndarray) -> np.ndarray:
    """Collapse a ``(channels, n)`` array to a 1-D mono array."""
    if y.ndim == 1:
        return y
    return np.mean(y, axis=0)


def write_wav(path: str | Path, y: np.ndarray, sr: int = SAMPLE_RATE) -> Path:
    """Write a ``(channels, n)`` float array to a 16-bit PCM wav file."""
    path = Path(path)
    data = np.clip(y.T, -1.0, 1.0)
    sf.write(str(path), data, sr, subtype="PCM_16")
    return path


def write_mp3(path: str | Path, y: np.ndarray, sr: int = SAMPLE_RATE, bitrate: str = "320k") -> Path:
    """Write a ``(channels, n)`` float array to an mp3 file via ffmpeg."""
    path = Path(path)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "mix.wav"
        write_wav(wav_path, y, sr)
        cmd = [
            _ffmpeg_bin(),
            "-y",
            "-i",
            str(wav_path),
            "-b:a",
            bitrate,
            str(path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg failed to encode mp3: {proc.stderr[-500:]}")
    return path

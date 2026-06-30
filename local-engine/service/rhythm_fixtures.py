"""Synthetic rhythm validation fixtures — no copyrighted audio."""

from __future__ import annotations

import struct
import wave
from pathlib import Path

DEFAULT_VALIDATION_BPM = 120.0
DEFAULT_VALIDATION_DURATION_SECONDS = 16.0
DEFAULT_SAMPLE_RATE = 44100


def expected_beat_times(
    *,
    bpm: float = DEFAULT_VALIDATION_BPM,
    duration_seconds: float = DEFAULT_VALIDATION_DURATION_SECONDS,
) -> list[float]:
    beat_interval = 60.0 / bpm
    beat_times: list[float] = []
    time_seconds = 0.0
    while time_seconds < duration_seconds - 0.001:
        beat_times.append(round(time_seconds, 4))
        time_seconds += beat_interval
    return beat_times


def expected_downbeat_times(beat_times: list[float], beats_per_bar: int = 4) -> list[float]:
    return [beat_times[index] for index in range(0, len(beat_times), beats_per_bar)]


def write_click_track_wav(
    path: Path,
    *,
    bpm: float = DEFAULT_VALIDATION_BPM,
    duration_seconds: float = DEFAULT_VALIDATION_DURATION_SECONDS,
    sample_rate: int = DEFAULT_SAMPLE_RATE,
    accent_downbeats: bool = False,
    beats_per_bar: int = 4,
) -> list[float]:
    """Write mono 16-bit WAV clicks; optional louder accent on downbeats (bar 1)."""
    beat_times = expected_beat_times(bpm=bpm, duration_seconds=duration_seconds)
    num_samples = int(duration_seconds * sample_rate)
    samples = [0] * num_samples
    click_length = min(400, sample_rate // 100)

    for beat_index, beat_time in enumerate(beat_times):
        sample_index = int(beat_time * sample_rate)
        if sample_index >= num_samples:
            continue
        is_downbeat = accent_downbeats and beat_index % beats_per_bar == 0
        amplitude = 28000 if is_downbeat else 18000
        for offset in range(min(click_length, num_samples - sample_index)):
            envelope = 1.0 - (offset / click_length)
            samples[sample_index + offset] = int(amplitude * envelope)

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack("<" + "h" * len(samples), *samples))

    return beat_times


def validation_fixture_path(work_temp_dir: Path, *, accented: bool = True) -> Path:
    suffix = "accented" if accented else "flat"
    return work_temp_dir / f"rhythm-validation-{suffix}-120bpm.wav"


def generate_validation_fixture(
    work_temp_dir: Path,
    *,
    accented: bool = True,
    keep_file: bool = False,
) -> tuple[Path, list[float]]:
    path = validation_fixture_path(work_temp_dir, accented=accented)
    beat_times = write_click_track_wav(path, accent_downbeats=accented)
    if not keep_file and path.exists():
        # Caller may want to keep for phrase endpoint upload tests
        pass
    return path, beat_times


def cleanup_validation_fixture(path: Path) -> None:
    if path.exists():
        path.unlink(missing_ok=True)

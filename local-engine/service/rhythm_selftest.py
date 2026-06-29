"""Rhythm engine self-test — synthetic signal smoke tests without user audio."""

from __future__ import annotations

import platform
import struct
import uuid
import wave
from pathlib import Path
from typing import Literal

import config
from librosa_support import LIBROSA_SETUP_GUIDANCE, librosa_available
from models import RhythmEngineSelfTestResult, RhythmSelfTestResponse
from phrase_analysis import heuristic_phrase_start_times
from rhythm_engines.base import setup_guidance_for
from rhythm_engines.registry import analyze_with_engine, engine_status

RhythmSelfTestStatus = Literal[
    "pass",
    "missing_dependency",
    "not_configured",
    "failed",
    "not_implemented",
    "skipped",
]

RIGHTS_NOTICE = (
    "Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. "
    "Rights to publish or distribute are separate and remain the user's responsibility."
)

SELF_TEST_LIMITATIONS = [
    "Self-test uses a synthetic click track only — no user audio is processed.",
    "Pass status confirms the engine ran on generated test signal; DJ review still required for real tracks.",
    "Verified labels appear only when the engine returns real downbeat or phrase markers.",
]

ENGINE_ORDER: tuple[str, ...] = ("heuristic", "essentia", "madmom", "beatnet")

BASIS_LABELS = {
    "verified_phrase": "Verified phrase",
    "verified_downbeat": "Verified downbeat",
    "heuristic_from_beats": "Heuristic",
    "unavailable": "Unavailable",
}


def basis_label_for(basis: str) -> str:
    return BASIS_LABELS.get(basis, "Unavailable")


def _format_basis_label(basis: str, verified: bool) -> str:
    if verified and basis in {"verified_phrase", "verified_downbeat"}:
        return basis_label_for(basis)
    if basis == "heuristic_from_beats":
        return "Heuristic"
    return "Unavailable"


def generate_click_track_wav(
    path: Path,
    *,
    bpm: float = 120.0,
    duration_seconds: float = 8.0,
    sample_rate: int = 44100,
) -> list[float]:
    """Write a mono 16-bit WAV with synthetic clicks; return expected beat times."""
    beat_interval = 60.0 / bpm
    beat_times: list[float] = []
    time_seconds = 0.0
    while time_seconds < duration_seconds - 0.001:
        beat_times.append(round(time_seconds, 4))
        time_seconds += beat_interval

    num_samples = int(duration_seconds * sample_rate)
    samples = [0] * num_samples
    click_length = min(400, sample_rate // 100)

    for beat_time in beat_times:
        sample_index = int(beat_time * sample_rate)
        if sample_index >= num_samples:
            continue
        for offset in range(min(click_length, num_samples - sample_index)):
            envelope = 1.0 - (offset / click_length)
            samples[sample_index + offset] = int(20000 * envelope)

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack("<" + "h" * len(samples), *samples))

    return beat_times


def _detect_beats_from_test_wav(path: Path) -> tuple[list[float], float | None]:
    if not librosa_available():
        return [], None

    try:
        import librosa
        import numpy as np
    except Exception:
        return [], None

    try:
        audio, sample_rate = librosa.load(str(path), sr=None, mono=True)
        if audio.size == 0:
            return [], None
        tempo, beat_frames = librosa.beat.beat_track(y=audio, sr=sample_rate)
        tempo_value = float(np.atleast_1d(tempo)[0])
        beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate).astype(float).tolist()
        return [round(value, 4) for value in beat_times], round(tempo_value, 2)
    except Exception:
        return [], None


def _test_heuristic(test_wav: Path, expected_beats: list[float]) -> RhythmEngineSelfTestResult:
    engine_name = "Heuristic phrase planning"
    engine_id = "heuristic"

    if not librosa_available():
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status="missing",
            smoke_test_status="missing_dependency",
            basis_label="Heuristic",
            setup_guidance=LIBROSA_SETUP_GUIDANCE,
            message="librosa not installed — heuristic phrase planning unavailable.",
            limitations=["Heuristic self-test requires librosa."],
        )

    detected_beats, detected_bpm = _detect_beats_from_test_wav(test_wav)
    beat_times = detected_beats if len(detected_beats) >= 16 else expected_beats
    phrase_starts = heuristic_phrase_start_times(beat_times, 8)

    if not phrase_starts:
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status="available",
            smoke_test_status="failed",
            beat_marker_count=len(beat_times),
            basis_label="Unavailable",
            message="Heuristic smoke test could not derive phrase windows from synthetic signal.",
            limitations=["Synthetic signal may be too short for 8-bar heuristic windows."],
        )

    return RhythmEngineSelfTestResult(
        engine_name=engine_name,
        engine_id=engine_id,
        import_status="available",
        smoke_test_status="pass",
        beat_marker_count=len(beat_times),
        phrase_marker_count=len(phrase_starts),
        basis_label="Heuristic",
        bpm=detected_bpm or 120.0,
        message="Heuristic phrase windows computed from synthetic click track.",
        limitations=[
            "Heuristic only — not verified downbeats.",
            "DJ review required for real tracks.",
        ],
    )


def _test_advanced_engine(
    engine_id: str,
    engine_name: str,
    test_wav: Path,
) -> RhythmEngineSelfTestResult:
    status = engine_status(engine_id)  # type: ignore[arg-type]
    guidance = setup_guidance_for(engine_id)  # type: ignore[arg-type]

    if not status.importable:
        smoke_status: RhythmSelfTestStatus = (
            "not_configured" if status.status == "not_configured" else "missing_dependency"
        )
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status=status.status,
            smoke_test_status=smoke_status,
            basis_label="Unavailable",
            setup_guidance=guidance,
            message=status.message,
            limitations=[f"{engine_name} is optional and not installed."],
        )

    if engine_id == "beatnet":
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status=status.status,
            smoke_test_status="not_implemented",
            basis_label="Unavailable",
            setup_guidance=guidance,
            message="BeatNet+ adapter is installed but integration is not active yet.",
            limitations=["BeatNet+ smoke test reserved for a future phase."],
        )

    output = analyze_with_engine(engine_id, test_wav, 8)  # type: ignore[arg-type]
    if output is None:
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status=status.status,
            smoke_test_status="failed",
            basis_label="Unavailable",
            setup_guidance=guidance,
            message=f"{engine_name} is importable but smoke test produced no markers.",
            limitations=["Engine returned no output on synthetic click track."],
        )

    verified = output.phrase_basis in {"verified_phrase", "verified_downbeat"}
    basis_label = _format_basis_label(output.phrase_basis, verified)

    if verified and output.phrase_basis == "verified_phrase" and not output.phrase_start_times:
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status=status.status,
            smoke_test_status="failed",
            basis_label="Unavailable",
            message="Engine claimed verified phrase without phrase markers — not reported as pass.",
            limitations=["Verified claim rejected without marker evidence."],
        )

    if verified and output.phrase_basis == "verified_downbeat" and not output.downbeat_times:
        return RhythmEngineSelfTestResult(
            engine_name=engine_name,
            engine_id=engine_id,
            import_status=status.status,
            smoke_test_status="failed",
            basis_label="Unavailable",
            message="Engine claimed verified downbeat without downbeat markers — not reported as pass.",
            limitations=["Verified claim rejected without downbeat evidence."],
        )

    smoke_status: RhythmSelfTestStatus = "pass"
    if output.phrase_basis == "unavailable" and not output.beat_times:
        smoke_status = "failed"

    return RhythmEngineSelfTestResult(
        engine_name=engine_name,
        engine_id=engine_id,
        import_status=status.status,
        smoke_test_status=smoke_status,
        beat_marker_count=len(output.beat_times),
        downbeat_marker_count=len(output.downbeat_times),
        phrase_marker_count=len(output.phrase_start_times),
        basis_label=basis_label,
        confidence=output.confidence,
        setup_guidance=None if smoke_status == "pass" else guidance,
        message=(
            f"{engine_name} smoke test completed on synthetic click track."
            if smoke_status == "pass"
            else f"{engine_name} smoke test did not produce usable markers."
        ),
        limitations=list(output.limitations),
    )


def run_rhythm_selftest() -> RhythmSelfTestResponse:
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)

    test_wav = config.TEMP_DIR / f"rhythm-selftest-{uuid.uuid4().hex}.wav"
    expected_beats = generate_click_track_wav(test_wav, bpm=120.0, duration_seconds=8.0)

    try:
        results = [
            _test_heuristic(test_wav, expected_beats),
            _test_advanced_engine("essentia", "Essentia", test_wav),
            _test_advanced_engine("madmom", "madmom", test_wav),
            _test_advanced_engine("beatnet", "BeatNet+", test_wav),
        ]

        heuristic_pass = any(
            item.engine_id == "heuristic" and item.smoke_test_status == "pass" for item in results
        )
        verified_downbeat = any(
            item.smoke_test_status == "pass"
            and item.basis_label == "Verified downbeat"
            and item.downbeat_marker_count > 0
            for item in results
        )
        verified_phrase = any(
            item.smoke_test_status == "pass"
            and item.basis_label == "Verified phrase"
            and item.phrase_marker_count > 0
            for item in results
        )

        return RhythmSelfTestResponse(
            ok=True,
            service=config.SERVICE_NAME,
            python_version=platform.python_version(),
            platform=platform.platform(),
            no_user_audio_processed=True,
            test_signal="synthetic_click_track_120bpm_8s",
            dj_review_required=True,
            heuristic_fallback_available=heuristic_pass,
            verified_downbeat_available=verified_downbeat,
            verified_phrase_available=verified_phrase,
            results=results,
            rights_notice=RIGHTS_NOTICE,
            limitations=list(SELF_TEST_LIMITATIONS),
        )
    finally:
        if test_wav.exists():
            test_wav.unlink(missing_ok=True)


def run_heuristic_only_selftest_for_tests(test_wav: Path, expected_beats: list[float]) -> RhythmEngineSelfTestResult:
    """Expose heuristic test for unit tests without full orchestration."""
    return _test_heuristic(test_wav, expected_beats)

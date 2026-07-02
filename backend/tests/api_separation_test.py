"""End-to-end HTTP test WITH Demucs separation.

Builds a synthetic full song (beat + melody), then drives the real flow:
extract vocals from one upload, instrumental from another, and remix.

Start the server first, then run from backend/:
    .\\venv\\Scripts\\python.exe -m tests.api_separation_test
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import requests
import soundfile as sf

from tests.gen_audio import make_acapella, make_instrumental

BASE = "http://127.0.0.1:8000"


def build_song(path: Path) -> None:
    samples = path.parent
    instr = samples / "_tmp_instr.wav"
    acap = samples / "_tmp_acap.wav"
    make_instrumental(instr, seconds=6.0)
    make_acapella(acap, seconds=6.0)
    a, sr = sf.read(str(instr))
    b, _ = sf.read(str(acap))
    n = min(len(a), len(b))
    mix = a[:n] * 0.7 + b[:n] * 0.6
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.9
    sf.write(str(path), mix, sr, subtype="PCM_16")
    instr.unlink(missing_ok=True)
    acap.unlink(missing_ok=True)


def upload_and_wait(path: Path, role: str) -> dict:
    with path.open("rb") as fh:
        r = requests.post(
            f"{BASE}/api/upload",
            files={"file": (path.name, fh, "audio/wav")},
            data={"role": role, "skip_separation": "false"},
            timeout=60,
        )
    r.raise_for_status()
    tid = r.json()["id"]
    deadline = time.time() + 600
    stage = None
    while time.time() < deadline:
        t = requests.get(f"{BASE}/api/track/{tid}", timeout=10).json()
        if t.get("stage") != stage:
            stage = t.get("stage")
            print(f"  [{role}] stage: {stage}")
        if t["status"] in ("done", "error"):
            assert t["status"] == "done", f"track failed: {t}"
            return t
        time.sleep(1.0)
    raise AssertionError("timed out")


def main() -> None:
    samples = Path(__file__).resolve().parent.parent / "samples"
    samples.mkdir(exist_ok=True)
    song = samples / "sample_full_song.wav"
    build_song(song)
    print("built full song:", song)

    vocals_src = upload_and_wait(song, "acapella")
    print("vocals source:", vocals_src["bpm"], vocals_src["key"], "separated:", vocals_src["separated"])

    beat_src = upload_and_wait(song, "instrumental")
    print("beat source:", beat_src["bpm"], beat_src["key"], "separated:", beat_src["separated"])

    r = requests.post(
        f"{BASE}/api/remix",
        json={"acapellaId": vocals_src["id"], "instrumentalId": beat_src["id"]},
        timeout=30,
    )
    r.raise_for_status()
    job_id = r.json()["jobId"]
    deadline = time.time() + 180
    while time.time() < deadline:
        j = requests.get(f"{BASE}/api/remix/{job_id}", timeout=10).json()
        if j["status"] in ("done", "error"):
            break
        time.sleep(1.0)
    assert j["status"] == "done", f"remix failed: {j}"

    out = requests.get(f"{BASE}/api/result/{job_id}?fmt=mp3", timeout=60)
    out.raise_for_status()
    (samples / "e2e_separated_remix.mp3").write_bytes(out.content)
    print(f"remix bytes: {len(out.content)}")
    assert len(out.content) > 2000

    print("\nSEPARATION API TEST PASSED")


if __name__ == "__main__":
    main()

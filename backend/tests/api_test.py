"""HTTP integration test against a running server.

Start the server first, then run from the backend/ directory:
    .\\venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8000
    .\\venv\\Scripts\\python.exe -m tests.api_test
"""

from __future__ import annotations

import time
from pathlib import Path

import requests

from tests.gen_audio import make_acapella, make_instrumental

BASE = "http://127.0.0.1:8000"


def main() -> None:
    samples = Path(__file__).resolve().parent.parent / "samples"
    samples.mkdir(exist_ok=True)
    acap_path = samples / "sample_acapella.wav"
    instr_path = samples / "sample_instrumental.wav"
    make_acapella(acap_path)
    make_instrumental(instr_path)

    health = requests.get(f"{BASE}/api/health", timeout=10).json()
    print("health:", health)

    def upload_and_wait(path: Path, role: str, skip: bool) -> dict:
        with path.open("rb") as fh:
            r = requests.post(
                f"{BASE}/api/upload",
                files={"file": (path.name, fh, "audio/wav")},
                data={"role": role, "skip_separation": str(skip).lower()},
                timeout=60,
            )
        r.raise_for_status()
        track_id = r.json()["id"]
        deadline = time.time() + 600
        while time.time() < deadline:
            t = requests.get(f"{BASE}/api/track/{track_id}", timeout=10).json()
            if t["status"] in ("done", "error"):
                assert t["status"] == "done", f"track failed: {t}"
                return t
            time.sleep(1.0)
        raise AssertionError("track processing timed out")

    # Samples are already isolated stems, so skip separation for a fast test.
    acap = upload_and_wait(acap_path, "acapella", skip=True)
    print("acapella uploaded:", acap["id"], acap["bpm"], acap["key"])

    instr = upload_and_wait(instr_path, "instrumental", skip=True)
    print("instrumental uploaded:", instr["id"], instr["bpm"], instr["key"])

    for key in ("beat_times", "downbeat_times", "beats_per_bar", "grid_source"):
        assert key in acap and key in instr, f"missing grid field {key}"

    ar = requests.post(
        f"{BASE}/api/align",
        json={"acapellaId": acap["id"], "instrumentalId": instr["id"]},
        timeout=60,
    )
    ar.raise_for_status()
    align = ar.json()
    print("align:", align)
    assert "recommended_offset_ms" in align
    assert "phrase_candidates" in align and align["phrase_candidates"]

    r = requests.post(
        f"{BASE}/api/remix",
        json={
            "acapellaId": acap["id"],
            "instrumentalId": instr["id"],
            "offsetMs": 0,
            "acapellaGain": 1.0,
            "instrumentalGain": 1.0,
        },
        timeout=30,
    )
    r.raise_for_status()
    job_id = r.json()["jobId"]
    print("remix job:", job_id)

    deadline = time.time() + 180
    status = None
    while time.time() < deadline:
        j = requests.get(f"{BASE}/api/remix/{job_id}", timeout=10).json()
        status = j["status"]
        if status in ("done", "error"):
            break
        time.sleep(1.0)

    assert status == "done", f"job did not finish cleanly: {j}"
    print("remix params:", j["params"])

    out = requests.get(f"{BASE}/api/result/{job_id}?fmt=mp3", timeout=60)
    out.raise_for_status()
    out_path = samples / "e2e_remix.mp3"
    out_path.write_bytes(out.content)
    print(f"downloaded remix: {out_path} ({len(out.content)} bytes)")
    assert len(out.content) > 2000, "downloaded remix too small"

    print("\nAPI TEST PASSED")


if __name__ == "__main__":
    main()

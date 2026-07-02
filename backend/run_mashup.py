"""Drive the full DJ Remix pipeline over HTTP (local dev smoke only).

Set env vars before running (paths stay on your machine, never commit audio):
  DJ_REMIX_VOCAL_PATH  — Track A (vocal source)
  DJ_REMIX_BEAT_PATH   — Track B (beat source)
  DJ_REMIX_OUT_PATH    — optional output mp3 path
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests

BASE = "http://127.0.0.1:8000"


def _path(name: str) -> str:
    val = os.environ.get(name, "").strip()
    if not val:
        print(f"Missing env {name}", file=sys.stderr)
        sys.exit(1)
    return val


VOCAL_PATH = _path("DJ_REMIX_VOCAL_PATH")
BEAT_PATH = _path("DJ_REMIX_BEAT_PATH")
OUT = Path(os.environ.get("DJ_REMIX_OUT_PATH", "tmp/qa/track_a_x_track_b_remix.mp3"))


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def upload(path: str, role: str, filename: str) -> str:
    with open(path, "rb") as f:
        files = {"file": (filename, f, "audio/mpeg")}
        data = {"role": role, "skip_separation": "false"}
        r = requests.post(f"{BASE}/api/upload", files=files, data=data, timeout=120)
    r.raise_for_status()
    tid = r.json()["id"]
    log(f"uploaded {role} -> track {tid}")
    return tid


def wait_track(tid: str, label: str) -> dict:
    last_stage = None
    start = time.time()
    while True:
        r = requests.get(f"{BASE}/api/track/{tid}", timeout=30)
        r.raise_for_status()
        j = r.json()
        stage = j.get("stage")
        if stage != last_stage:
            log(f"{label}: {stage}  ({int(time.time()-start)}s)")
            last_stage = stage
        if j.get("status") == "done":
            log(
                f"{label}: DONE  bpm={j.get('bpm')} key={j.get('key')} "
                f"grid={j.get('beats_per_bar')}/bar via {j.get('grid_source')}"
            )
            return j
        if j.get("status") == "error":
            raise RuntimeError(f"{label} failed: {j.get('error')}")
        time.sleep(3)


def main() -> None:
    for p in (VOCAL_PATH, BEAT_PATH):
        if not Path(p).exists():
            log(f"MISSING FILE: {p}")
            sys.exit(1)

    log("=== uploading Track A (vocal) + Track B (beat) ===")
    acap_id = upload(VOCAL_PATH, "acapella", "track_a.mp3")
    instr_id = upload(BEAT_PATH, "instrumental", "track_b.mp3")

    log("=== separating stems + analyzing ===")
    wait_track(acap_id, "Track A/vocal")
    wait_track(instr_id, "Track B/beat")

    log("=== auto-aligning ===")
    r = requests.post(
        f"{BASE}/api/align",
        json={"acapellaId": acap_id, "instrumentalId": instr_id},
        timeout=120,
    )
    r.raise_for_status()
    al = r.json()
    log(
        f"align: offset={al.get('recommended_offset_ms')}ms "
        f"conf={al.get('offset_confidence')} snap={al.get('snapped_to')}"
    )

    log("=== remixing (Remix Brain) ===")
    remix_req = {
        "acapellaId": acap_id,
        "instrumentalId": instr_id,
        "offsetMs": al.get("recommended_offset_ms", 0.0) or 0.0,
        "semitones": al.get("semitone_shift"),
        "snap": "bar",
        "autoPlacement": True,
        "remixMode": "clean_blend",
    }
    r = requests.post(f"{BASE}/api/remix", json=remix_req, timeout=120)
    r.raise_for_status()
    job_id = r.json()["jobId"]
    log(f"remix job {job_id}")

    start = time.time()
    while True:
        r = requests.get(f"{BASE}/api/remix/{job_id}", timeout=30)
        r.raise_for_status()
        j = r.json()
        if j.get("status") == "done":
            tier = (j.get("params") or {}).get("confidence_tier")
            val = (j.get("params") or {}).get("validation") or {}
            log(
                f"remix DONE ({int(time.time()-start)}s) tier={tier} "
                f"anchor_offset={val.get('anchor_offset_ms')}ms"
            )
            break
        if j.get("status") == "error":
            raise RuntimeError(f"remix failed: {j.get('error')}")
        time.sleep(3)

    log("=== downloading result ===")
    r = requests.get(f"{BASE}/api/result/{job_id}?fmt=mp3", timeout=120)
    r.raise_for_status()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(r.content)
    log(f"SAVED -> {OUT}  ({len(r.content):,} bytes)")


if __name__ == "__main__":
    main()

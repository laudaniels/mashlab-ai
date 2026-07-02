"""Simple in-process storage for uploaded tracks and remix jobs.

The app is designed for local single-user use, so an in-memory dict plus files
under ``tmp/`` is sufficient. Nothing here is persisted across restarts.
"""

from __future__ import annotations

import threading
import uuid
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()
tracks: dict[str, dict] = {}
jobs: dict[str, dict] = {}


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def track_dir(track_id: str) -> Path:
    d = TMP_DIR / "tracks" / track_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def job_dir(job_id: str) -> Path:
    d = TMP_DIR / "jobs" / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def add_track(track: dict) -> None:
    with _lock:
        tracks[track["id"]] = track


def get_track(track_id: str) -> dict | None:
    with _lock:
        return tracks.get(track_id)


def update_track(track_id: str, **changes) -> None:
    with _lock:
        if track_id in tracks:
            tracks[track_id].update(changes)


def set_job(job_id: str, data: dict) -> None:
    with _lock:
        jobs[job_id] = data


def update_job(job_id: str, **changes) -> None:
    with _lock:
        if job_id in jobs:
            jobs[job_id].update(changes)


def get_job(job_id: str) -> dict | None:
    with _lock:
        return jobs.get(job_id)

"""FastAPI entrypoint for the DJ Remix / Mashup app."""

from __future__ import annotations

import shutil
import traceback
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import store
from .audio import align, analysis, beatgrid, remix_brain, separation
from .audio.pipeline import build_mashup
from .audio.remix_brain import UserOverrides

app = FastAPI(title="DJ Remix API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    # Allow the Next.js dev server on its usual port and common fallbacks.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):(3000|3001|3002)",
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_ROLES = {"acapella", "instrumental"}


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "rubberband": shutil.which("rubberband") is not None,
        "separation": separation.is_available(),
        "beatGrid": {
            "beatThis": beatgrid.beat_this_available(),
            "detector": "beat_this" if beatgrid.beat_this_available() else "librosa",
        },
    }


# role -> which stem to extract from a full song
_STEM_FOR_ROLE = {"acapella": "vocals", "instrumental": "instrumental"}


def _process_upload(track_id: str, role: str, skip_separation: bool) -> None:
    """Background task: optionally separate the stem, then analyze it."""
    track = store.get_track(track_id)
    if track is None:
        return
    try:
        source_path = track["path"]

        if skip_separation:
            stem_path = source_path
            # No full song available; grid must come from the isolated stem.
            grid_path = source_path
            store.update_track(track_id, stage="analyzing")
        else:
            store.update_track(track_id, stage="separating")
            out_root = store.track_dir(track_id) / "stems"
            want = _STEM_FOR_ROLE[role]
            stem_path = str(
                separation.separate_stem(source_path, out_root, want)
            )
            # Detect the beat grid + key from the ORIGINAL full song: it still
            # has percussion, so the grid is far more reliable than one derived
            # from an isolated vocal (whose onsets are sparse/syncopated). The
            # stem shares the source timeline, so the grid applies directly.
            grid_path = source_path
            store.update_track(track_id, stage="analyzing")

        an = analysis.analyze_file(grid_path)
        store.update_track(
            track_id,
            status="done",
            stage="done",
            stem_path=stem_path,
            separated=not skip_separation,
            analysis=an.to_dict(),
        )
    except Exception as exc:  # noqa: BLE001
        store.update_track(
            track_id, status="error", stage="error", error=f"{exc}"
        )


@app.post("/api/upload")
async def upload(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    role: str = Form("acapella"),
    skip_separation: bool = Form(False),
) -> dict:
    if role not in ALLOWED_ROLES:
        raise HTTPException(400, f"role must be one of {sorted(ALLOWED_ROLES)}")

    track_id = store.new_id()
    dest_dir = store.track_dir(track_id)
    suffix = Path(file.filename or "upload").suffix or ".audio"
    dest = dest_dir / f"source{suffix}"

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    if not skip_separation and not separation.is_available():
        raise HTTPException(
            500,
            "Stem separation (Demucs) is not installed on the server. "
            "Install it or upload isolated stems with 'Already isolated' enabled.",
        )

    store.add_track(
        {
            "id": track_id,
            "role": role,
            "filename": file.filename,
            "path": str(dest),
            "status": "processing",
            "stage": "queued",
        }
    )
    background.add_task(_process_upload, track_id, role, skip_separation)

    return {"id": track_id, "role": role, "filename": file.filename, "status": "processing"}


@app.get("/api/track/{track_id}")
def track_status(track_id: str) -> dict:
    track = store.get_track(track_id)
    if track is None:
        raise HTTPException(404, "track not found")

    out = {
        "id": track_id,
        "role": track["role"],
        "filename": track.get("filename"),
        "status": track["status"],
        "stage": track.get("stage"),
    }
    if track["status"] == "done":
        out["separated"] = track.get("separated", False)
        out.update(track["analysis"])
    elif track["status"] == "error":
        out["error"] = track.get("error")
    return out


@app.get("/api/track/{track_id}/audio")
def track_audio(track_id: str) -> FileResponse:
    """Stream the processed stem (or source) for live alignment preview."""
    track = store.get_track(track_id)
    if track is None:
        raise HTTPException(404, "track not found")
    if track.get("status") != "done":
        raise HTTPException(409, "track still processing")
    path = track.get("stem_path") or track.get("path")
    if not path or not Path(path).exists():
        raise HTTPException(404, "audio missing")
    suffix = Path(path).suffix.lower()
    media = {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".m4a": "audio/mp4",
    }.get(suffix, "application/octet-stream")
    return FileResponse(path, media_type=media)


class RemixRequest(BaseModel):
    acapellaId: str
    instrumentalId: str
    targetBpm: float | None = None
    semitones: float | None = None
    offsetMs: float = 0.0
    acapellaGain: float = 1.0
    instrumentalGain: float = 1.0
    downbeatShift: int = 0
    snap: str = "off"  # "off" | "beat" | "bar"
    acapellaTempoMult: float = 1.0  # 0.5 = half, 2.0 = double
    instrumentalTempoMult: float = 1.0
    beatLock: bool = True  # warp vocal onto the instrumental beat grid
    autoPlacement: bool = True  # Remix Brain picks anchors (legacy name)
    remixMode: str = "clean_blend"
    sectionStartSec: float | None = None
    sectionDurationSec: float | None = None
    mixPreset: str = "full"  # "off" | "light" | "balanced" | "full"


def _run_remix(
    job_id: str,
    req: RemixRequest,
    acap_path: str,
    instr_path: str,
    acap_analysis: dict | None,
    instr_analysis: dict | None,
) -> None:
    try:
        out_dir = store.job_dir(job_id)
        snap = req.snap if req.snap in ("off", "beat", "bar") else "off"
        align_offset_ms: float | None = None
        if acap_analysis and instr_analysis:
            try:
                align_result = align.align_tracks(
                    acap_path, instr_path, acap_analysis, instr_analysis
                )
                align_offset_ms = align_result.recommended_offset_ms
            except Exception:
                align_offset_ms = None

        remix_mode = req.remixMode if req.remixMode in ("clean_blend",) else "clean_blend"
        result = build_mashup(
            acap_path,
            instr_path,
            str(out_dir),
            target_bpm=req.targetBpm,
            semitones=req.semitones,
            offset_ms=req.offsetMs,
            acapella_gain=req.acapellaGain,
            instrumental_gain=req.instrumentalGain,
            downbeat_shift=req.downbeatShift,
            snap=snap,
            acapella_tempo_mult=req.acapellaTempoMult,
            instrumental_tempo_mult=req.instrumentalTempoMult,
            beat_lock=req.beatLock,
            auto_placement=req.autoPlacement,
            remix_mode=remix_mode,
            mix_preset=req.mixPreset if req.mixPreset in ("off", "light", "balanced", "full") else "full",
            acap_analysis=acap_analysis,
            instr_analysis=instr_analysis,
            align_offset_ms=align_offset_ms,
            section_start_sec=req.sectionStartSec,
            section_duration_sec=req.sectionDurationSec,
        )
        store.update_job(
            job_id,
            status="done",
            params=result.params,
            acapellaAnalysis=result.acapella_analysis,
            instrumentalAnalysis=result.instrumental_analysis,
            wavPath=str(result.wav_path),
            mp3Path=str(result.mp3_path),
        )
    except Exception as exc:  # noqa: BLE001
        store.update_job(
            job_id, status="error", error=f"{exc}", trace=traceback.format_exc()
        )


@app.post("/api/remix")
def remix(req: RemixRequest, background: BackgroundTasks) -> dict:
    acap = store.get_track(req.acapellaId)
    instr = store.get_track(req.instrumentalId)
    if acap is None:
        raise HTTPException(404, "acapella track not found")
    if instr is None:
        raise HTTPException(404, "instrumental track not found")
    if acap.get("status") != "done" or instr.get("status") != "done":
        raise HTTPException(409, "tracks are still processing; try again shortly")

    acap_path = acap.get("stem_path", acap["path"])
    instr_path = instr.get("stem_path", instr["path"])

    job_id = store.new_id()
    store.set_job(job_id, {"id": job_id, "status": "processing"})
    background.add_task(
        _run_remix,
        job_id,
        req,
        acap_path,
        instr_path,
        acap.get("analysis"),
        instr.get("analysis"),
    )
    return {"jobId": job_id, "status": "processing"}


class AlignRequest(BaseModel):
    acapellaId: str
    instrumentalId: str


@app.post("/api/align")
def align_endpoint(req: AlignRequest) -> dict:
    acap = store.get_track(req.acapellaId)
    instr = store.get_track(req.instrumentalId)
    if acap is None:
        raise HTTPException(404, "acapella track not found")
    if instr is None:
        raise HTTPException(404, "instrumental track not found")
    if acap.get("status") != "done" or instr.get("status") != "done":
        raise HTTPException(409, "tracks are still processing; try again shortly")

    acap_path = acap.get("stem_path", acap["path"])
    instr_path = instr.get("stem_path", instr["path"])
    try:
        result = align.align_tracks(
            acap_path, instr_path, acap["analysis"], instr["analysis"]
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"alignment failed: {exc}") from exc
    return result.to_dict()


@app.get("/api/plan")
def plan_preview(acapellaId: str, instrumentalId: str) -> dict:
    """Return the top Remix Brain plan without rendering."""
    acap = store.get_track(acapellaId)
    instr = store.get_track(instrumentalId)
    if acap is None:
        raise HTTPException(404, "acapella track not found")
    if instr is None:
        raise HTTPException(404, "instrumental track not found")
    if acap.get("status") != "done" or instr.get("status") != "done":
        raise HTTPException(409, "tracks are still processing; try again shortly")

    acap_path = acap.get("stem_path", acap["path"])
    instr_path = instr.get("stem_path", instr["path"])
    align_offset_ms: float | None = None
    try:
        align_result = align.align_tracks(
            acap_path, instr_path, acap["analysis"], instr["analysis"]
        )
        align_offset_ms = align_result.recommended_offset_ms
    except Exception:
        pass

    from .audio.io_utils import SAMPLE_RATE, load_audio, to_mono
    from .audio.models import confidence_tier_from_score

    acap_y, _ = load_audio(acap_path, sr=SAMPLE_RATE)
    instr_y, _ = load_audio(instr_path, sr=SAMPLE_RATE)

    best, candidates, vocal_ra, instr_ra = remix_brain.pick_best_plan(
        acap["analysis"],
        instr["analysis"],
        UserOverrides(),
        vocal_mono=to_mono(acap_y),
        instr_mono=to_mono(instr_y),
        align_offset_ms=align_offset_ms,
    )
    return {
        "plan": best.to_dict(),
        "plan_summary": remix_brain.plan_summary_for_ui(best),
        "candidates": [c.to_dict() for c in candidates],
        "confidence_tier": confidence_tier_from_score(best.score),
        "vocal_analysis": vocal_ra.to_dict(),
        "instrumental_analysis": instr_ra.to_dict(),
    }


@app.get("/api/remix/{job_id}")
def remix_status(job_id: str) -> dict:
    job = store.get_job(job_id)
    if job is None:
        raise HTTPException(404, "job not found")

    out = {"jobId": job_id, "status": job["status"]}
    if job["status"] == "done":
        out["params"] = job.get("params")
        out["resultUrl"] = f"/api/result/{job_id}?fmt=mp3"
        out["wavUrl"] = f"/api/result/{job_id}?fmt=wav"
    elif job["status"] == "error":
        out["error"] = job.get("error")
    return out


@app.get("/api/result/{job_id}")
def result(job_id: str, fmt: str = "mp3") -> FileResponse:
    job = store.get_job(job_id)
    if job is None or job.get("status") != "done":
        raise HTTPException(404, "result not ready")

    if fmt == "wav":
        path = job.get("wavPath")
        media = "audio/wav"
        filename = "remix.wav"
    else:
        path = job.get("mp3Path")
        media = "audio/mpeg"
        filename = "remix.mp3"

    if not path or not Path(path).exists():
        raise HTTPException(404, "file missing")
    return FileResponse(path, media_type=media, filename=filename)

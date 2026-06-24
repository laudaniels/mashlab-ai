"""In-memory local job store for the sidecar foundation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from models import CreateJobRequest, JobPhase, JobResponse, JobState

_jobs: dict[str, JobResponse] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(request: CreateJobRequest) -> JobResponse:
    job_id = str(uuid4())
    timestamp = _now_iso()

    job = JobResponse(
        job_id=job_id,
        phase=request.phase,
        state="queued",
        status=_phase_status(request.phase),
        message=_phase_message(request.phase),
        session_id=request.session_id,
        slot_id=request.slot_id,
        result=request.input or None,
        created_at=timestamp,
        updated_at=timestamp,
    )
    _jobs[job_id] = job
    return job


def get_job(job_id: str) -> JobResponse | None:
    return _jobs.get(job_id)


def update_job(
    job_id: str,
    *,
    state: JobState | None = None,
    status: str | None = None,
    message: str | None = None,
    result: dict[str, Any] | None = None,
) -> JobResponse | None:
    job = _jobs.get(job_id)
    if job is None:
        return None

    updated = job.model_copy(
        update={
            "state": state or job.state,
            "status": status or job.status,
            "message": message or job.message,
            "result": result if result is not None else job.result,
            "updated_at": _now_iso(),
        }
    )
    _jobs[job_id] = updated
    return updated


def complete_metadata_job(job_id: str, metadata_result: dict[str, Any]) -> JobResponse | None:
    return update_job(
        job_id,
        state="complete",
        status="implemented",
        message="Metadata job completed through local ffprobe inspection.",
        result=metadata_result,
    )


def fail_job(job_id: str, message: str, *, status: str = "failed") -> JobResponse | None:
    return update_job(job_id, state="failed", status=status, message=message)


def _phase_status(phase: JobPhase) -> str:
    if phase == "metadata":
        return "implemented"
    if phase in {"beat", "key"}:
        return "analysis-coming-next"
    return "engine-pending"


def _phase_message(phase: JobPhase) -> str:
    messages = {
        "metadata": "Metadata job queued for local ffprobe inspection.",
        "beat": "Beat analysis is not implemented in this service phase.",
        "key": "Key analysis is not implemented in this service phase.",
        "stems": "Stem separation is not implemented in this service phase.",
        "pitch-time": "Pitch/time processing is not implemented in this service phase.",
        "vocal-cleanup": "Vocal cleanup is not implemented in this service phase.",
        "arrangement": "Arrangement drafts are not implemented in this service phase.",
        "export": "Export/mastering is not implemented in this service phase.",
    }
    return messages.get(phase, "Job queued.")

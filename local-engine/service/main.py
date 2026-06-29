"""MashLab AI local analysis helper service."""

from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

import config
from beat_analysis import analyze_beat_file
from capabilities import detect_capabilities, python_version_label
from jobs import complete_metadata_job, create_job, fail_job, get_job, update_job
from key_analysis import analyze_key_file
from metadata import analyze_metadata_file
from pitch_time_planning import PitchTimePlanRequest, PitchTimePlanResponse, build_pitch_time_plan
from rubber_band_processing import (
    DEFAULT_MAX_PREVIEW_SECONDS,
    PitchTimePreviewFailure,
    PitchTimePreviewSuccess,
    process_pitch_time_preview,
)
from models import (
    BeatAnalysisResponse,
    CapabilitiesResponse,
    CreateJobRequest,
    HealthResponse,
    JobResponse,
    KeyAnalysisResponse,
    MetadataAnalysisResponse,
    PitchTimePreviewInputSummary,
    PitchTimePreviewOutputSummary,
    PitchTimePreviewResponse,
)
from uploads import cleanup_path, save_upload

app = FastAPI(
    title="MashLab Local Engine",
    description=(
        "Private localhost helper for MashLab AI / CyphaBlend AI. "
        "This is not a cloud API. Audio stays on the user's machine."
    ),
    version=config.SERVICE_VERSION,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_work_dirs() -> None:
    config.WORK_DIR.mkdir(parents=True, exist_ok=True)
    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
def on_startup() -> None:
    _ensure_work_dirs()


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        bind=f"http://{config.DEFAULT_HOST}:{config.DEFAULT_PORT}",
        privacy=(
            "Local helper service only. Upload audio you own or are authorized to use. "
            "MashLab AI helps process and arrange it. Rights to publish or distribute "
            "remain the user's responsibility."
        ),
    )


@app.get("/v1/capabilities", response_model=CapabilitiesResponse)
def capabilities() -> CapabilitiesResponse:
    return CapabilitiesResponse(
        service=config.SERVICE_NAME,
        version=config.SERVICE_VERSION,
        python_version=python_version_label(),
        capabilities=detect_capabilities(),
    )


@app.post("/v1/jobs", response_model=JobResponse)
def submit_job(request: CreateJobRequest) -> JobResponse:
    job = create_job(request)

    if request.phase not in {"metadata", "beat", "key"}:
        return update_job(
            job.job_id,
            state="failed",
            status=_phase_status_for(request.phase),
            message=(
                f"{request.phase} is not implemented in this service phase. "
                "Beat and key prototype analysis are available through /v1/analyze/beat and /v1/analyze/key."
            ),
        ) or job

    endpoint_hint = {
        "metadata": "POST /v1/analyze/metadata",
        "beat": "POST /v1/analyze/beat",
        "key": "POST /v1/analyze/key",
    }[request.phase]

    return update_job(
        job.job_id,
        state="queued",
        message=f"{request.phase} job accepted. Upload the file through {endpoint_hint}.",
    ) or job


@app.get("/v1/jobs/{job_id}", response_model=JobResponse)
def read_job(job_id: str) -> JobResponse:
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@app.post("/v1/analyze/metadata", response_model=MetadataAnalysisResponse)
async def analyze_metadata(
    file: UploadFile = File(...),
    job_id: str | None = None,
) -> MetadataAnalysisResponse:
    temp_path, filename = await save_upload(file, "metadata")

    try:
        response = analyze_metadata_file(temp_path, filename)

        if job_id is not None:
            if response.ok and response.result is not None:
                complete_metadata_job(job_id, response.result.model_dump())
            else:
                fail_job(job_id, response.message, status=response.status)

        return response
    finally:
        cleanup_path(temp_path)


@app.post("/v1/analyze/beat", response_model=BeatAnalysisResponse)
async def analyze_beat(file: UploadFile = File(...)) -> BeatAnalysisResponse:
    temp_path, filename = await save_upload(file, "beat")

    try:
        return analyze_beat_file(temp_path, filename)
    finally:
        cleanup_path(temp_path)


@app.post("/v1/analyze/key", response_model=KeyAnalysisResponse)
async def analyze_key(file: UploadFile = File(...)) -> KeyAnalysisResponse:
    temp_path, filename = await save_upload(file, "key")

    try:
        return analyze_key_file(temp_path, filename)
    finally:
        cleanup_path(temp_path)


@app.post("/v1/plan/pitch-time", response_model=PitchTimePlanResponse)
def plan_pitch_time(request: PitchTimePlanRequest) -> PitchTimePlanResponse:
    plan = build_pitch_time_plan(request)
    return PitchTimePlanResponse(
        ok=True,
        status="planning-only",
        message="Pitch/time plan generated. No audio was processed.",
        plan=plan,
    )


@app.post("/v1/process/pitch-time-preview", response_model=PitchTimePreviewResponse)
async def process_pitch_time_preview_endpoint(
    file: UploadFile = File(...),
    tempo_ratio: float | None = Form(default=None),
    source_bpm: float | None = Form(default=None),
    target_bpm: float | None = Form(default=None),
    pitch_shift_semitones: float = Form(default=0),
    max_preview_seconds: int = Form(default=DEFAULT_MAX_PREVIEW_SECONDS),
    formant_preservation: bool = Form(default=True),
) -> PitchTimePreviewResponse:
    temp_path, filename = await save_upload(file, "pitch-time-preview")

    try:
        result = process_pitch_time_preview(
            temp_path,
            filename,
            tempo_ratio=tempo_ratio,
            source_bpm=source_bpm,
            target_bpm=target_bpm,
            pitch_shift_semitones=pitch_shift_semitones,
            max_preview_seconds=max_preview_seconds,
            formant_preservation=formant_preservation,
        )
    finally:
        cleanup_path(temp_path)

    if isinstance(result, PitchTimePreviewFailure):
        return PitchTimePreviewResponse(
            ok=False,
            status=result.status,
            message=result.message,
            setup_guidance=result.setup_guidance,
            validation_errors=result.validation_errors,
            limitations=[
                "Preview only — not a final mashup, stem separation, or export.",
            ],
        )

    return PitchTimePreviewResponse(
        ok=True,
        status=result.status,
        message=result.message,
        method=result.method,
        audio_processed=result.audio_processed,
        input_summary=PitchTimePreviewInputSummary(
            file_name=result.input_summary.file_name,
            duration_seconds=result.input_summary.duration_seconds,
            sample_rate=result.input_summary.sample_rate,
            channel_count=result.input_summary.channel_count,
            tempo_ratio=result.input_summary.tempo_ratio,
            pitch_shift_semitones=result.input_summary.pitch_shift_semitones,
            max_preview_seconds=result.input_summary.max_preview_seconds,
            formant_preservation=result.input_summary.formant_preservation,
        ),
        output_summary=PitchTimePreviewOutputSummary(
            file_name=result.output_summary.file_name,
            duration_seconds=result.output_summary.duration_seconds,
            sample_rate=result.output_summary.sample_rate,
            channel_count=result.output_summary.channel_count,
            artifact_id=result.output_summary.artifact_id,
        ),
        artifact_path=result.artifact_path,
        artifact_url=result.artifact_url,
        warnings=result.warnings,
        limitations=result.limitations,
    )


@app.get("/v1/artifacts/pitch-time-preview/{artifact_id}")
def get_pitch_time_preview_artifact(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = config.WORK_DIR / "artifacts" / "pitch-time-preview" / f"{artifact_id}.wav"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Preview artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/wav",
        filename=artifact_path.name,
    )


def _phase_status_for(phase: str) -> str:
    if phase in {"beat", "key"}:
        return "analysis-coming-next"
    return "engine-pending"


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=config.DEFAULT_HOST,
        port=config.DEFAULT_PORT,
        reload=False,
    )

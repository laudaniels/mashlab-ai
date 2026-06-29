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
from artifact_management import (
    ArtifactOperationFailure,
    ArtifactMetadataSuccess,
    clear_all_preview_artifacts,
    delete_preview_artifact,
    get_artifact_metadata,
    list_preview_artifacts,
)
from combined_preview_processing import (
    CombinedPreviewFailure,
    CombinedPreviewSuccess,
    process_combined_preview,
)
from demucs_processing import (
    DEFAULT_MAX_PREVIEW_SECONDS as STEM_DEFAULT_MAX_PREVIEW_SECONDS,
    StemPreviewFailure,
    StemPreviewSuccess,
    process_stem_preview,
)
from rubber_band_processing import (
    DEFAULT_MAX_PREVIEW_SECONDS,
    PitchTimePreviewFailure,
    PitchTimePreviewSuccess,
    process_pitch_time_preview,
)
from models import (
    BeatAnalysisResponse,
    CapabilitiesResponse,
    CombinedPreviewInputSummaryModel,
    CombinedPreviewProcessingSummaryModel,
    CombinedPreviewRequest,
    CombinedPreviewResponse,
    ArtifactDeleteResponse,
    ArtifactListResponse,
    ArtifactMetadataResponse,
    ArtifactPlaybackUrlsModel,
    LoudnessReadoutModel,
    PreviewArtifactSummary,
    TechnicalReadoutModel,
    CreateJobRequest,
    HealthResponse,
    JobResponse,
    KeyAnalysisResponse,
    MetadataAnalysisResponse,
    PitchTimePreviewInputSummary,
    PitchTimePreviewOutputSummary,
    PitchTimePreviewResponse,
    StemArtifactSummaryModel,
    StemPreviewInputSummary,
    StemPreviewResponse,
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


@app.post("/v1/process/stem-preview", response_model=StemPreviewResponse)
async def process_stem_preview_endpoint(
    file: UploadFile = File(...),
    split_mode: str = Form(default="vocals_no_vocals"),
    max_preview_seconds: int | None = Form(default=STEM_DEFAULT_MAX_PREVIEW_SECONDS),
) -> StemPreviewResponse:
    temp_path, filename = await save_upload(file, "stem-preview")

    try:
        result = process_stem_preview(
            temp_path,
            filename,
            split_mode=split_mode,
            max_preview_seconds=max_preview_seconds,
        )
    finally:
        cleanup_path(temp_path)

    if isinstance(result, StemPreviewFailure):
        return StemPreviewResponse(
            ok=False,
            status=result.status,
            message=result.message,
            setup_guidance=result.setup_guidance,
            validation_errors=result.validation_errors,
            limitations=[
                "Preview only — not studio-quality stem separation, final mashup, or export.",
            ],
        )

    return StemPreviewResponse(
        ok=True,
        status=result.status,
        message=result.message,
        method=result.method,
        audio_processed=result.audio_processed,
        artifact_id=result.artifact_id,
        input_summary=StemPreviewInputSummary(
            file_name=result.input_summary.file_name,
            duration_seconds=result.input_summary.duration_seconds,
            sample_rate=result.input_summary.sample_rate,
            channel_count=result.input_summary.channel_count,
            split_mode=result.input_summary.split_mode,
            max_preview_seconds=result.input_summary.max_preview_seconds,
        ),
        vocals=StemArtifactSummaryModel(
            file_name=result.vocals.file_name,
            duration_seconds=result.vocals.duration_seconds,
            sample_rate=result.vocals.sample_rate,
            channel_count=result.vocals.channel_count,
            artifact_url=result.vocals.artifact_url,
        ),
        no_vocals=StemArtifactSummaryModel(
            file_name=result.no_vocals.file_name,
            duration_seconds=result.no_vocals.duration_seconds,
            sample_rate=result.no_vocals.sample_rate,
            channel_count=result.no_vocals.channel_count,
            artifact_url=result.no_vocals.artifact_url,
        ),
        warnings=result.warnings,
        limitations=result.limitations,
    )


@app.get("/v1/artifacts/stems/{artifact_id}/vocals")
def get_stem_preview_vocals(artifact_id: str) -> FileResponse:
    return _stem_artifact_response(artifact_id, "vocals.wav", "vocals")


@app.get("/v1/artifacts/stems/{artifact_id}/no_vocals")
def get_stem_preview_no_vocals(artifact_id: str) -> FileResponse:
    return _stem_artifact_response(artifact_id, "no_vocals.wav", "no_vocals")


def _stem_artifact_response(artifact_id: str, file_name: str, label: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = config.WORK_DIR / "artifacts" / "stems" / artifact_id / file_name
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail=f"{label} stem preview artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/wav",
        filename=artifact_path.name,
    )


@app.post("/v1/process/combined-preview", response_model=CombinedPreviewResponse)
def process_combined_preview_endpoint(
    request: CombinedPreviewRequest,
) -> CombinedPreviewResponse:
    result = process_combined_preview(
        mash_intent=request.mash_intent,
        source_vocal_artifact_id=request.source_vocal_artifact_id,
        target_instrumental_artifact_id=request.target_instrumental_artifact_id,
        tempo_ratio=request.tempo_ratio,
        source_bpm=request.source_bpm,
        target_bpm=request.target_bpm,
        pitch_shift_semitones=request.pitch_shift_semitones,
        alignment_offset_ms=request.alignment_offset_ms,
        max_preview_seconds=request.max_preview_seconds,
        formant_preservation=request.formant_preservation,
        neutral_processing=request.neutral_processing,
    )

    if isinstance(result, CombinedPreviewFailure):
        return CombinedPreviewResponse(
            ok=False,
            status=result.status,
            message=result.message,
            final_export=False,
            setup_guidance=result.setup_guidance,
            validation_errors=result.validation_errors,
            limitations=[
                "Preview only — not a final export, mastered mashup, or distribution-ready mix.",
            ],
        )

    return CombinedPreviewResponse(
        ok=True,
        status=result.status,
        message=result.message,
        method=result.method,
        audio_processed=result.audio_processed,
        final_export=result.final_export,
        artifact_id=result.artifact_id,
        artifact_url=result.artifact_url,
        input_summary=CombinedPreviewInputSummaryModel(
            mash_intent=result.input_summary.mash_intent,
            source_vocal_artifact_id=result.input_summary.source_vocal_artifact_id,
            target_instrumental_artifact_id=result.input_summary.target_instrumental_artifact_id,
            tempo_ratio=result.input_summary.tempo_ratio,
            pitch_shift_semitones=result.input_summary.pitch_shift_semitones,
            alignment_offset_ms=result.input_summary.alignment_offset_ms,
            max_preview_seconds=result.input_summary.max_preview_seconds,
            neutral_processing=result.input_summary.neutral_processing,
        ),
        processing_summary=CombinedPreviewProcessingSummaryModel(
            method=result.processing_summary.method,
            vocal_rubberband_ratio=result.processing_summary.vocal_rubberband_ratio,
            pitch_shift_semitones=result.processing_summary.pitch_shift_semitones,
            alignment_offset_ms=result.processing_summary.alignment_offset_ms,
            max_preview_seconds=result.processing_summary.max_preview_seconds,
        ),
        output_duration_seconds=result.output_duration_seconds,
        warnings=result.warnings,
        limitations=result.limitations,
    )


@app.get("/v1/artifacts/combined-preview/{artifact_id}/preview")
def get_combined_preview_artifact(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = config.WORK_DIR / "artifacts" / "combined-preview" / artifact_id / "preview.wav"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Combined preview artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/wav",
        filename=artifact_path.name,
    )


@app.get("/v1/artifacts", response_model=ArtifactListResponse)
def list_artifacts() -> ArtifactListResponse:
    artifacts = list_preview_artifacts()
    return ArtifactListResponse(
        ok=True,
        status="ready",
        message="Local preview artifacts listed. Preview only — not final exports.",
        artifacts=[
            PreviewArtifactSummary(
                artifact_id=item.artifact_id,
                artifact_type=item.artifact_type,
                status=item.status,
                created_at=item.created_at,
                duration_seconds=item.duration_seconds,
                playback_urls=ArtifactPlaybackUrlsModel(
                    primary=item.playback_urls.primary,
                    vocals=item.playback_urls.vocals,
                    no_vocals=item.playback_urls.no_vocals,
                ),
                preview_only=item.preview_only,
                final_export=item.final_export,
                primary_file_name=item.primary_file_name,
            )
            for item in artifacts
        ],
    )


@app.get("/v1/artifacts/{artifact_id}/metadata", response_model=ArtifactMetadataResponse)
def read_artifact_metadata(artifact_id: str) -> ArtifactMetadataResponse:
    result = get_artifact_metadata(artifact_id)
    if isinstance(result, ArtifactOperationFailure):
        return ArtifactMetadataResponse(
            ok=False,
            status=result.status,
            message=result.message,
            final_export=False,
        )

    return ArtifactMetadataResponse(
        ok=True,
        status=result.status,
        message="Preview artifact metadata returned. Not a final export.",
        artifact_id=result.artifact_id,
        artifact_type=result.artifact_type,
        preview_only=result.preview_only,
        final_export=result.final_export,
        playback_url=result.playback_url,
        technical=TechnicalReadoutModel(
            duration_seconds=result.technical.duration_seconds,
            sample_rate=result.technical.sample_rate,
            channel_count=result.technical.channel_count,
            codec=result.technical.codec,
            container=result.technical.container,
            file_size_bytes=result.technical.file_size_bytes,
            loudness=LoudnessReadoutModel(
                integrated_lufs=result.technical.loudness.integrated_lufs,
                true_peak_dbtp=result.technical.loudness.true_peak_dbtp,
                peak_level_db=result.technical.loudness.peak_level_db,
                status=result.technical.loudness.status,
                message=result.technical.loudness.message,
            ),
        ),
    )


@app.delete("/v1/artifacts/{artifact_id}", response_model=ArtifactDeleteResponse)
def delete_artifact(artifact_id: str) -> ArtifactDeleteResponse:
    ok, status, message = delete_preview_artifact(artifact_id)
    if not ok:
        return ArtifactDeleteResponse(
            ok=False,
            status=status,
            message=message or "Could not delete preview artifact.",
            artifact_id=artifact_id,
        )

    return ArtifactDeleteResponse(
        ok=True,
        status=status,
        message="Preview artifact deleted from local workspace.",
        artifact_id=artifact_id,
    )


@app.delete("/v1/artifacts", response_model=ArtifactDeleteResponse)
def clear_preview_artifacts(scope: str = "session") -> ArtifactDeleteResponse:
    if scope != "session":
        return ArtifactDeleteResponse(
            ok=False,
            status="validation_error",
            message="Only scope=session is supported for preview artifact cleanup.",
        )

    deleted_count, errors = clear_all_preview_artifacts()
    if errors:
        return ArtifactDeleteResponse(
            ok=False,
            status="processing_failed",
            message=f"Deleted {deleted_count} artifacts with errors: {'; '.join(errors[:3])}",
            deleted_count=deleted_count,
        )

    return ArtifactDeleteResponse(
        ok=True,
        status="deleted",
        message=f"Cleared {deleted_count} local preview artifacts.",
        deleted_count=deleted_count,
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

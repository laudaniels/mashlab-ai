"""MashLab AI local analysis helper service."""

from __future__ import annotations

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

import config
from beat_analysis import analyze_beat_file
from capabilities import detect_capabilities, python_version_label
from rhythm_selftest import run_rhythm_selftest
from jobs import complete_metadata_job, create_job, fail_job, get_job, update_job
from key_analysis import analyze_key_file
from phrase_analysis import analyze_phrase_file
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
from mastering_processing import MasterWavFailure, MasterWavSuccess, create_master_wav
from mp3_export_processing import ExportMp3Failure, ExportMp3Success, create_mp3_export
from export_processing import ExportWavFailure, ExportWavSuccess, create_wav_export
from package_export_processing import PackageExportFailure, PackageExportSuccess, create_project_package
from mix_settings import MixSettings, mix_settings_to_dict
from full_length_export_processing import (
    FullWavExportFailure,
    FullWavExportSuccess,
    create_full_wav_export,
)
from section_export_processing import (
    SectionWavExportFailure,
    SectionWavExportSuccess,
    create_section_wav_export,
)
from models import (
    BeatAnalysisResponse,
    CapabilitiesResponse,
    RhythmSelfTestResponse,
    CombinedPreviewInputSummaryModel,
    CombinedPreviewProcessingSummaryModel,
    CombinedPreviewRequest,
    CombinedPreviewResponse,
    FullWavExportRequest,
    FullWavExportResponse,
    SectionExportInputSummaryModel,
    SectionExportProcessingSummaryModel,
    SectionWavExportRequest,
    SectionWavExportResponse,
    FullExportInputSummaryModel,
    FullExportProcessingSummaryModel,
    LoudnessGateModel,
    MasterWavRequest,
    MasterWavResponse,
    PackageExportRequest,
    PackageExportResponse,
    PackageIncludedFileModel,
    ExportMp3Request,
    ExportMp3Response,
    ExportWavRequest,
    ExportWavResponse,
    ArtifactDeleteResponse,
    ArtifactListResponse,
    ArtifactMetadataResponse,
    ArtifactPlaybackUrlsModel,
    LoudnessReadoutModel,
    MixSettingsModel,
    PreviewArtifactSummary,
    TechnicalReadoutModel,
    CreateJobRequest,
    HealthResponse,
    JobResponse,
    KeyAnalysisResponse,
    PhraseAnalysisResponse,
    MetadataAnalysisResponse,
    PitchTimePreviewInputSummary,
    PitchTimePreviewOutputSummary,
    PitchTimePreviewResponse,
    StemArtifactSummaryModel,
    StemPreviewInputSummary,
    StemPreviewResponse,
)
from quick_mix_source_prep import (
    QuickMixSourcePrepFailure,
    prepare_quick_mix_source,
)
from uploads import cleanup_path, save_upload, save_upload_bytes

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
    expose_headers=[
        "X-Mashlab-Trimmed",
        "X-Mashlab-Start-Offset",
        "X-Mashlab-Source-Duration",
        "X-Mashlab-Output-Duration",
        "X-Mashlab-Output-Filename",
        "X-Mashlab-Fade-Out",
    ],
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


@app.get("/v1/capabilities/rhythm-selftest", response_model=RhythmSelfTestResponse)
def rhythm_selftest() -> RhythmSelfTestResponse:
    return run_rhythm_selftest()


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
        response = await run_in_threadpool(analyze_metadata_file, temp_path, filename)

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
        return await run_in_threadpool(analyze_beat_file, temp_path, filename)
    finally:
        cleanup_path(temp_path)


@app.post("/v1/analyze/key", response_model=KeyAnalysisResponse)
async def analyze_key(file: UploadFile = File(...)) -> KeyAnalysisResponse:
    temp_path, filename = await save_upload(file, "key")

    try:
        return await run_in_threadpool(analyze_key_file, temp_path, filename)
    finally:
        cleanup_path(temp_path)


@app.post("/v1/analyze/phrases", response_model=PhraseAnalysisResponse)
async def analyze_phrases(
    file: UploadFile | None = File(default=None),
    bpm: float | None = Form(default=None),
    beat_times: str | None = Form(default=None),
    phrase_length_bars: int | None = Form(default=8),
    method: str = Form(default="auto"),
) -> PhraseAnalysisResponse:
    temp_path = None
    filename = "phrase-analysis.wav"
    try:
        if file is not None and file.filename:
            temp_path, filename = await save_upload(file, "phrases")
        return await run_in_threadpool(
            analyze_phrase_file,
            temp_path,
            filename,
            bpm=bpm,
            beat_times_raw=beat_times,
            phrase_length_bars=phrase_length_bars,
            method=method,
        )
    finally:
        if temp_path is not None:
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
        result = await run_in_threadpool(
            process_pitch_time_preview,
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


@app.post("/v1/process/quick-mix-source-prep", response_model=None)
async def quick_mix_source_prep_endpoint(
    file: UploadFile = File(...),
    max_seconds: int = Form(default=180),
    start_offset_seconds: float = Form(default=0.0),
) -> FileResponse | JSONResponse:
    if file.filename is None or file.filename.strip() == "":
        raise HTTPException(status_code=400, detail="A local audio filename is required.")

    upload_bytes = await file.read()
    filename = file.filename
    temp_path, filename = await run_in_threadpool(
        save_upload_bytes,
        filename,
        upload_bytes,
        "quick-mix-prep",
    )

    try:
        result = await run_in_threadpool(
            prepare_quick_mix_source,
            temp_path,
            filename,
            max_seconds=max_seconds,
            start_offset_seconds=start_offset_seconds,
        )
    finally:
        cleanup_path(temp_path)

    if isinstance(result, QuickMixSourcePrepFailure):
        return JSONResponse(
            status_code=422,
            content={
                "ok": False,
                "status": result.status,
                "message": result.message,
                "setup_guidance": result.setup_guidance,
                "validation_errors": result.validation_errors,
            },
        )

    output_path = result.output_path

    def cleanup_output() -> None:
        cleanup_path(output_path)

    return FileResponse(
        path=output_path,
        media_type="audio/wav",
        filename=result.output_file_name,
        background=BackgroundTask(cleanup_output),
        headers={
            "X-Mashlab-Start-Offset": str(result.start_offset_seconds),
            "X-Mashlab-Trimmed": "true" if result.trimmed else "false",
            "X-Mashlab-Fade-Out": "true" if result.fade_out_applied else "false",
            "X-Mashlab-Source-Duration": "" if result.source_duration_seconds is None else str(result.source_duration_seconds),
            "X-Mashlab-Output-Duration": "" if result.output_duration_seconds is None else str(result.output_duration_seconds),
            "X-Mashlab-Output-Filename": result.output_file_name,
        },
    )


@app.post("/v1/process/stem-preview", response_model=StemPreviewResponse)
async def process_stem_preview_endpoint(
    file: UploadFile = File(...),
    split_mode: str = Form(default="vocals_no_vocals"),
    max_preview_seconds: int | None = Form(default=STEM_DEFAULT_MAX_PREVIEW_SECONDS),
    preview_start_seconds: float = Form(default=0.0),
) -> StemPreviewResponse:
    if file.filename is None or file.filename.strip() == "":
        raise HTTPException(status_code=400, detail="A local audio filename is required.")

    upload_bytes = await file.read()
    filename = file.filename
    temp_path, filename = await run_in_threadpool(
        save_upload_bytes,
        filename,
        upload_bytes,
        "stem-preview",
    )

    try:
        result = await run_in_threadpool(
            process_stem_preview,
            temp_path,
            filename,
            split_mode=split_mode,
            max_preview_seconds=max_preview_seconds,
            preview_start_seconds=preview_start_seconds,
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
            preview_start_seconds=result.input_summary.preview_start_seconds,
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
        preview_start_seconds=request.preview_start_seconds,
        formant_preservation=request.formant_preservation,
        neutral_processing=request.neutral_processing,
        vocal_gain_db=request.vocal_gain_db,
        instrumental_gain_db=request.instrumental_gain_db,
        master_gain_db=request.master_gain_db,
        vocal_fade_in_ms=request.vocal_fade_in_ms,
        vocal_fade_out_ms=request.vocal_fade_out_ms,
        instrumental_fade_in_ms=request.instrumental_fade_in_ms,
        instrumental_fade_out_ms=request.instrumental_fade_out_ms,
        limiter_safety=request.limiter_safety,
        clipping_guard=request.clipping_guard,
        instrumental_duck_under_vocal=request.instrumental_duck_under_vocal,
        arrangement_context=request.arrangement_context,
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
            preview_start_seconds=result.input_summary.preview_start_seconds,
            neutral_processing=result.input_summary.neutral_processing,
            mix_settings=_mix_settings_model(result.input_summary.mix_settings),
        ),
        processing_summary=CombinedPreviewProcessingSummaryModel(
            method=result.processing_summary.method,
            vocal_rubberband_ratio=result.processing_summary.vocal_rubberband_ratio,
            pitch_shift_semitones=result.processing_summary.pitch_shift_semitones,
            alignment_offset_ms=result.processing_summary.alignment_offset_ms,
            max_preview_seconds=result.processing_summary.max_preview_seconds,
            preview_start_seconds=result.processing_summary.preview_start_seconds,
            mix_settings=_mix_settings_model(result.processing_summary.mix_settings),
            limiter_safety_applied=result.processing_summary.limiter_safety_applied,
            clipping_guard_applied=result.processing_summary.clipping_guard_applied,
            instrumental_duck_applied=result.processing_summary.instrumental_duck_applied,
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


@app.get("/v1/artifacts/exports/{artifact_id}/export")
def get_export_artifact(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = config.WORK_DIR / "artifacts" / "exports" / artifact_id / "export.wav"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Export artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/wav",
        filename=f"mashlab-export-{artifact_id}.wav",
    )


@app.get("/v1/artifacts/exports/{artifact_id}/section-export")
def get_section_export_artifact(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = (
        config.WORK_DIR / "artifacts" / "exports" / artifact_id / "section-export.wav"
    )
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Section export artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/wav",
        filename=f"mashlab-section-export-{artifact_id}.wav",
    )


@app.get("/v1/artifacts/exports/{artifact_id}/export.mp3")
def get_export_mp3_artifact(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = config.WORK_DIR / "artifacts" / "exports" / artifact_id / "export.mp3"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="MP3 export artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/mpeg",
        filename=f"mashlab-export-{artifact_id}.mp3",
    )


@app.get("/v1/artifacts/masters/{artifact_id}/master")
def get_master_artifact(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    artifact_path = config.WORK_DIR / "artifacts" / "masters" / artifact_id / "master.wav"
    if not artifact_path.exists():
        raise HTTPException(status_code=404, detail="Master artifact not found.")

    return FileResponse(
        path=artifact_path,
        media_type="audio/wav",
        filename=f"mashlab-master-{artifact_id}.wav",
    )


@app.get("/v1/artifacts/packages/{artifact_id}/download")
def get_package_download(artifact_id: str) -> FileResponse:
    if not artifact_id.isalnum():
        raise HTTPException(status_code=400, detail="Invalid artifact id.")

    zip_path = config.WORK_DIR / "artifacts" / "packages" / artifact_id / "mashlab-package.zip"
    if not zip_path.exists():
        raise HTTPException(status_code=404, detail="Package ZIP artifact not found.")

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"mashlab-package-{artifact_id}.zip",
    )


@app.post("/v1/export/package", response_model=PackageExportResponse)
def export_package(request: PackageExportRequest) -> PackageExportResponse:
    result = create_project_package(
        selected_artifact_ids=request.selected_artifact_ids,
        package_label=request.package_label,
        package_type=request.package_type,
        include_technical_report=request.include_technical_report,
    )

    if isinstance(result, PackageExportFailure):
        return PackageExportResponse(
            ok=False,
            status=result.status,
            message=result.message,
            validation_errors=result.validation_errors,
            setup_guidance=result.setup_guidance,
            public_share=False,
            package_only=False,
        )

    return PackageExportResponse(
        ok=True,
        status=result.status,
        message=result.message,
        package_artifact_id=result.package_artifact_id,
        package_label=result.package_label,
        package_type=result.package_type,
        local_folder_path=result.local_folder_path,
        download_url=result.download_url,
        manifest_path=result.manifest_path,
        rights_notice_path=result.rights_notice_path,
        technical_report_path=result.technical_report_path,
        included_files=[
            PackageIncludedFileModel(
                artifact_id=item.artifact_id,
                artifact_type=item.artifact_type,
                artifact_subtype=item.artifact_subtype,
                source_path=item.source_path,
                package_path=item.package_path,
            )
            for item in result.included_files
        ],
        included_artifact_ids=result.included_artifact_ids,
        public_share=result.public_share,
        package_only=result.package_only,
        rights_notice=result.rights_notice,
        warnings=result.warnings,
        limitations=result.limitations,
    )


@app.post("/v1/export/wav", response_model=ExportWavResponse)
def export_wav(request: ExportWavRequest) -> ExportWavResponse:
    result = create_wav_export(
        source_combined_preview_artifact_id=request.source_combined_preview_artifact_id,
        export_format=request.export_format,
        export_label=request.export_label,
        loudness_target_mode=request.loudness_target_mode,
        arrangement_context=request.arrangement_context,
    )

    if isinstance(result, ExportWavFailure):
        return ExportWavResponse(
            ok=False,
            status=result.status,
            message=result.message,
            validation_errors=result.validation_errors,
            final_export=False,
            public_share=False,
        )

    loudness_model = LoudnessReadoutModel(
        integrated_lufs=result.loudness.integrated_lufs,
        true_peak_dbtp=result.loudness.true_peak_dbtp,
        peak_level_db=result.loudness.peak_level_db,
        status=result.loudness.status,
        message=result.loudness.message,
    )

    return ExportWavResponse(
        ok=True,
        status=result.status,
        message=result.message,
        export_artifact_id=result.export_artifact_id,
        source_combined_preview_artifact_id=result.source_combined_preview_artifact_id,
        artifact_url=result.artifact_url,
        download_url=result.download_url,
        file_size_bytes=result.file_size_bytes,
        duration_seconds=result.duration_seconds,
        sample_rate=result.sample_rate,
        channel_count=result.channel_count,
        codec=result.codec,
        loudness=loudness_model,
        final_export=result.final_export,
        public_share=result.public_share,
        rights_notice=result.rights_notice,
        warnings=result.warnings,
        limitations=result.limitations,
        export_label=result.export_label,
    )


@app.post("/v1/export/mp3", response_model=ExportMp3Response)
def export_mp3(request: ExportMp3Request) -> ExportMp3Response:
    result = create_mp3_export(
        source_wav_export_artifact_id=request.source_wav_export_artifact_id,
        bitrate_kbps=request.bitrate_kbps,
        export_label=request.export_label,
    )

    if isinstance(result, ExportMp3Failure):
        return ExportMp3Response(
            ok=False,
            status=result.status,
            message=result.message,
            validation_errors=result.validation_errors,
            setup_guidance=result.setup_guidance,
            final_export=False,
            public_share=False,
        )

    loudness_model = LoudnessReadoutModel(
        integrated_lufs=result.loudness.integrated_lufs,
        true_peak_dbtp=result.loudness.true_peak_dbtp,
        peak_level_db=result.loudness.peak_level_db,
        status=result.loudness.status,
        message=result.loudness.message,
    )

    return ExportMp3Response(
        ok=True,
        status=result.status,
        message=result.message,
        export_artifact_id=result.export_artifact_id,
        source_wav_export_artifact_id=result.source_wav_export_artifact_id,
        artifact_url=result.artifact_url,
        download_url=result.download_url,
        export_format=result.export_format,
        bitrate_kbps=result.bitrate_kbps,
        file_size_bytes=result.file_size_bytes,
        duration_seconds=result.duration_seconds,
        sample_rate=result.sample_rate,
        channel_count=result.channel_count,
        codec=result.codec,
        loudness=loudness_model,
        final_export=result.final_export,
        public_share=result.public_share,
        rights_notice=result.rights_notice,
        warnings=result.warnings,
        limitations=result.limitations,
        export_label=result.export_label,
    )


@app.post("/v1/master/wav", response_model=MasterWavResponse)
def master_wav(request: MasterWavRequest) -> MasterWavResponse:
    result = create_master_wav(
        source_wav_export_artifact_id=request.source_wav_export_artifact_id,
        preset=request.preset,
        export_label=request.export_label,
    )

    if isinstance(result, MasterWavFailure):
        return MasterWavResponse(
            ok=False,
            status=result.status,
            message=result.message,
            validation_errors=result.validation_errors,
            setup_guidance=result.setup_guidance,
            final_export=False,
            public_share=False,
            mastering_prototype=False,
        )

    gate = result.loudness_gate
    gate_model = LoudnessGateModel(
        status=gate.status,
        message=gate.message,
        integrated_lufs=gate.integrated_lufs,
        true_peak_dbtp=gate.true_peak_dbtp,
        target_integrated_lufs=gate.target_integrated_lufs,
        target_true_peak_dbtp=gate.target_true_peak_dbtp,
    )

    return MasterWavResponse(
        ok=True,
        status=result.status,
        message=result.message,
        master_artifact_id=result.master_artifact_id,
        source_wav_export_artifact_id=result.source_wav_export_artifact_id,
        preset=result.preset,
        artifact_url=result.artifact_url,
        download_url=result.download_url,
        before_readout=_technical_readout_model(result.before_readout),
        after_readout=_technical_readout_model(result.after_readout),
        target_integrated_lufs=result.target_integrated_lufs,
        target_true_peak_dbtp=result.target_true_peak_dbtp,
        loudness_gate=gate_model,
        audio_created=result.audio_created,
        final_export=result.final_export,
        public_share=result.public_share,
        mastering_prototype=result.mastering_prototype,
        rights_notice=result.rights_notice,
        warnings=result.warnings,
        limitations=result.limitations,
        export_label=result.export_label,
    )


@app.post("/v1/export/full-wav", response_model=FullWavExportResponse)
def export_full_wav(request: FullWavExportRequest) -> FullWavExportResponse:
    result = create_full_wav_export(
        source_vocal_stem_artifact_id=request.source_vocal_stem_artifact_id,
        target_instrumental_stem_artifact_id=request.target_instrumental_stem_artifact_id,
        mash_intent=request.mash_intent,
        tempo_ratio=request.tempo_ratio,
        source_bpm=request.source_bpm,
        target_bpm=request.target_bpm,
        pitch_shift_semitones=request.pitch_shift_semitones,
        alignment_offset_ms=request.alignment_offset_ms,
        export_label=request.export_label,
        loudness_target_mode=request.loudness_target_mode,
        neutral_processing=request.neutral_processing,
        confirm_neutral_settings=request.confirm_neutral_settings,
        max_test_seconds=request.max_test_seconds,
        vocal_gain_db=request.vocal_gain_db,
        instrumental_gain_db=request.instrumental_gain_db,
        master_gain_db=request.master_gain_db,
        vocal_fade_in_ms=request.vocal_fade_in_ms,
        vocal_fade_out_ms=request.vocal_fade_out_ms,
        instrumental_fade_in_ms=request.instrumental_fade_in_ms,
        instrumental_fade_out_ms=request.instrumental_fade_out_ms,
        limiter_safety=request.limiter_safety,
        clipping_guard=request.clipping_guard,
        instrumental_duck_under_vocal=request.instrumental_duck_under_vocal,
        arrangement_context=request.arrangement_context,
    )
    if not result.ok:
        return FullWavExportResponse(
            ok=False,
            status=result.status,
            message=result.message,
            validation_errors=result.validation_errors,
            setup_guidance=result.setup_guidance,
            final_export=False,
            public_share=False,
        )

    loudness_model = LoudnessReadoutModel(
        integrated_lufs=result.loudness.integrated_lufs,
        true_peak_dbtp=result.loudness.true_peak_dbtp,
        peak_level_db=result.loudness.peak_level_db,
        status=result.loudness.status,
        message=result.loudness.message,
    )
    gate_model = LoudnessGateModel(
        status=result.loudness_gate.status,
        message=result.loudness_gate.message,
        integrated_lufs=result.loudness_gate.integrated_lufs,
        true_peak_dbtp=result.loudness_gate.true_peak_dbtp,
        target_integrated_lufs=result.loudness_gate.target_integrated_lufs,
        target_true_peak_dbtp=result.loudness_gate.target_true_peak_dbtp,
    )

    return FullWavExportResponse(
        ok=True,
        status=result.status,
        message=result.message,
        export_artifact_id=result.export_artifact_id,
        artifact_url=result.artifact_url,
        download_url=result.download_url,
        input_summary=FullExportInputSummaryModel(
            mash_intent=result.input_summary.mash_intent,
            source_vocal_stem_artifact_id=result.input_summary.source_vocal_stem_artifact_id,
            target_instrumental_stem_artifact_id=result.input_summary.target_instrumental_stem_artifact_id,
            tempo_ratio=result.input_summary.tempo_ratio,
            pitch_shift_semitones=result.input_summary.pitch_shift_semitones,
            alignment_offset_ms=result.input_summary.alignment_offset_ms,
            neutral_processing=result.input_summary.neutral_processing,
            mix_settings=_mix_settings_model(result.input_summary.mix_settings),
        ),
        processing_summary=FullExportProcessingSummaryModel(
            method=result.processing_summary.method,
            vocal_rubberband_ratio=result.processing_summary.vocal_rubberband_ratio,
            pitch_shift_semitones=result.processing_summary.pitch_shift_semitones,
            alignment_offset_ms=result.processing_summary.alignment_offset_ms,
            full_length=result.processing_summary.full_length,
            max_test_seconds=result.processing_summary.max_test_seconds,
            mix_settings=_mix_settings_model(result.processing_summary.mix_settings),
            limiter_safety_applied=result.processing_summary.limiter_safety_applied,
            clipping_guard_applied=result.processing_summary.clipping_guard_applied,
            instrumental_duck_applied=result.processing_summary.instrumental_duck_applied,
        ),
        file_size_bytes=result.file_size_bytes,
        duration_seconds=result.duration_seconds,
        sample_rate=result.sample_rate,
        channel_count=result.channel_count,
        codec=result.codec,
        loudness=loudness_model,
        loudness_gate=gate_model,
        final_export=result.final_export,
        public_share=result.public_share,
        rights_notice=result.rights_notice,
        warnings=result.warnings,
        limitations=result.limitations,
        export_label=result.export_label,
    )


@app.post("/v1/export/section-wav", response_model=SectionWavExportResponse)
def export_section_wav(request: SectionWavExportRequest) -> SectionWavExportResponse:
    result = create_section_wav_export(
        source_vocal_stem_artifact_id=request.source_vocal_stem_artifact_id,
        target_instrumental_stem_artifact_id=request.target_instrumental_stem_artifact_id,
        mash_intent=request.mash_intent,
        tempo_ratio=request.tempo_ratio,
        source_bpm=request.source_bpm,
        target_bpm=request.target_bpm,
        pitch_shift_semitones=request.pitch_shift_semitones,
        alignment_offset_ms=request.alignment_offset_ms,
        start_seconds=request.start_seconds,
        duration_seconds=request.duration_seconds,
        start_seconds_unavailable=request.start_seconds_unavailable,
        confirm_advisory_section_export=request.confirm_advisory_section_export,
        confirm_start_from_artifact_beginning=request.confirm_start_from_artifact_beginning,
        confirm_stale_context=request.confirm_stale_context,
        binding_freshness_status=request.binding_freshness_status,
        settings_mode=request.settings_mode,
        export_label=request.export_label,
        loudness_target_mode=request.loudness_target_mode,
        neutral_processing=request.neutral_processing,
        confirm_neutral_settings=request.confirm_neutral_settings,
        vocal_gain_db=request.vocal_gain_db,
        instrumental_gain_db=request.instrumental_gain_db,
        master_gain_db=request.master_gain_db,
        vocal_fade_in_ms=request.vocal_fade_in_ms,
        vocal_fade_out_ms=request.vocal_fade_out_ms,
        instrumental_fade_in_ms=request.instrumental_fade_in_ms,
        instrumental_fade_out_ms=request.instrumental_fade_out_ms,
        limiter_safety=request.limiter_safety,
        clipping_guard=request.clipping_guard,
        instrumental_duck_under_vocal=request.instrumental_duck_under_vocal,
        arrangement_context=request.arrangement_context,
    )
    if not result.ok:
        return SectionWavExportResponse(
            ok=False,
            status=result.status,
            message=result.message,
            validation_errors=result.validation_errors,
            setup_guidance=result.setup_guidance,
            final_export=False,
            public_share=False,
            section_trimmed_export=False,
        )

    loudness_model = LoudnessReadoutModel(
        integrated_lufs=result.loudness.integrated_lufs,
        true_peak_dbtp=result.loudness.true_peak_dbtp,
        peak_level_db=result.loudness.peak_level_db,
        status=result.loudness.status,
        message=result.loudness.message,
    )

    return SectionWavExportResponse(
        ok=True,
        status=result.status,
        message=result.message,
        export_artifact_id=result.export_artifact_id,
        artifact_url=result.artifact_url,
        download_url=result.download_url,
        input_summary=SectionExportInputSummaryModel(
            mash_intent=result.input_summary.mash_intent,
            source_vocal_stem_artifact_id=result.input_summary.source_vocal_stem_artifact_id,
            target_instrumental_stem_artifact_id=result.input_summary.target_instrumental_stem_artifact_id,
            start_seconds=result.input_summary.start_seconds,
            duration_seconds=result.input_summary.duration_seconds,
            start_seconds_unavailable=result.input_summary.start_seconds_unavailable,
            tempo_ratio=result.input_summary.tempo_ratio,
            pitch_shift_semitones=result.input_summary.pitch_shift_semitones,
            alignment_offset_ms=result.input_summary.alignment_offset_ms,
            mix_settings=_mix_settings_model(result.input_summary.mix_settings),
            binding_freshness_status=result.input_summary.binding_freshness_status,
            settings_mode=result.input_summary.settings_mode,
        ),
        processing_summary=SectionExportProcessingSummaryModel(
            method=result.processing_summary.method,
            section_trimmed=result.processing_summary.section_trimmed,
            start_seconds_used=result.processing_summary.start_seconds_used,
            duration_seconds_used=result.processing_summary.duration_seconds_used,
            pitch_shift_semitones=result.processing_summary.pitch_shift_semitones,
            alignment_offset_ms=result.processing_summary.alignment_offset_ms,
            mix_settings=_mix_settings_model(result.processing_summary.mix_settings),
            limiter_safety_applied=result.processing_summary.limiter_safety_applied,
            clipping_guard_applied=result.processing_summary.clipping_guard_applied,
            instrumental_duck_applied=result.processing_summary.instrumental_duck_applied,
        ),
        file_size_bytes=result.file_size_bytes,
        duration_seconds=result.duration_seconds,
        sample_rate=result.sample_rate,
        channel_count=result.channel_count,
        codec=result.codec,
        loudness=loudness_model,
        final_export=result.final_export,
        public_share=result.public_share,
        section_trimmed_export=result.section_trimmed_export,
        rights_notice=result.rights_notice,
        warnings=result.warnings,
        limitations=result.limitations,
        export_label=result.export_label,
    )


@app.get("/v1/artifacts", response_model=ArtifactListResponse)
def list_artifacts() -> ArtifactListResponse:
    artifacts = list_preview_artifacts()
    return ArtifactListResponse(
        ok=True,
        status="ready",
        message="Local session artifacts listed. Previews are not final exports; exports are local user-generated files.",
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
                preview_label=item.preview_label,
                source_combined_preview_artifact_id=item.source_combined_preview_artifact_id,
                export_subtype=item.export_subtype,
                export_format=item.export_format,
                source_vocal_stem_artifact_id=item.source_vocal_stem_artifact_id,
                target_instrumental_stem_artifact_id=item.target_instrumental_stem_artifact_id,
                source_wav_export_artifact_id=item.source_wav_export_artifact_id,
                master_preset=item.master_preset,
                mastering_prototype=item.mastering_prototype,
                package_only=item.package_only,
                package_subtype=item.package_subtype,
                package_label=item.package_label,
                included_file_count=item.included_file_count,
                selected_artifact_ids=item.selected_artifact_ids,
                public_share=item.public_share,
                mix_summary=item.mix_summary,
                arrangement_draft_type=item.arrangement_draft_type,
                arrangement_section_label=item.arrangement_section_label,
                arrangement_preview_start_seconds=item.arrangement_preview_start_seconds,
                arrangement_duration_seconds=item.arrangement_duration_seconds,
                arrangement_phrase_basis=item.arrangement_phrase_basis,
                arrangement_context_summary=item.arrangement_context_summary,
                arrangement_export_context_mode=item.arrangement_export_context_mode,
                section_trimmed_export=item.section_trimmed_export,
                binding_freshness_at_export=item.binding_freshness_at_export,
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
        message=(
            "Export artifact metadata returned. Local user-generated export — not a published release."
            if result.final_export
            else "Preview artifact metadata returned. Not a final export."
        ),
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
            message=message or "Could not delete session artifact.",
            artifact_id=artifact_id,
        )

    return ArtifactDeleteResponse(
        ok=True,
        status=status,
        message="Session artifact deleted from local workspace.",
        artifact_id=artifact_id,
    )


@app.delete("/v1/artifacts", response_model=ArtifactDeleteResponse)
def clear_preview_artifacts(scope: str = "session") -> ArtifactDeleteResponse:
    if scope != "session":
        return ArtifactDeleteResponse(
            ok=False,
            status="validation_error",
            message="Only scope=session is supported for session artifact cleanup.",
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
        message=f"Cleared {deleted_count} local session artifacts (previews and exports).",
        deleted_count=deleted_count,
    )


def _mix_settings_model(settings: MixSettings) -> MixSettingsModel:
    payload = mix_settings_to_dict(settings)
    return MixSettingsModel(**payload)


def _technical_readout_model(readout) -> TechnicalReadoutModel:
    return TechnicalReadoutModel(
        duration_seconds=readout.duration_seconds,
        sample_rate=readout.sample_rate,
        channel_count=readout.channel_count,
        codec=readout.codec,
        container=readout.container,
        file_size_bytes=readout.file_size_bytes,
        loudness=LoudnessReadoutModel(
            integrated_lufs=readout.loudness.integrated_lufs,
            true_peak_dbtp=readout.loudness.true_peak_dbtp,
            peak_level_db=readout.loudness.peak_level_db,
            status=readout.loudness.status,
            message=readout.loudness.message,
        ),
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

"""Pydantic models for the MashLab local engine API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

CapabilityStatus = Literal["available", "missing", "not_configured", "planned"]
JobState = Literal["queued", "running", "complete", "failed", "cancelled"]
JobPhase = Literal[
    "metadata",
    "beat",
    "key",
    "stems",
    "pitch-time",
    "vocal-cleanup",
    "arrangement",
    "export",
]


class HealthResponse(BaseModel):
    ok: bool = True
    service: str
    version: str
    bind: str
    privacy: str


class ServiceCapability(BaseModel):
    id: str
    label: str
    status: CapabilityStatus
    message: str
    version: str | None = None


class CapabilitiesResponse(BaseModel):
    service: str
    version: str
    python_version: str
    capabilities: list[ServiceCapability]


class CreateJobRequest(BaseModel):
    phase: JobPhase
    session_id: str = Field(min_length=1)
    slot_id: str = Field(min_length=1)
    input: dict[str, Any] = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    phase: JobPhase
    state: JobState
    status: str
    message: str
    session_id: str
    slot_id: str
    result: dict[str, Any] | None = None
    created_at: str
    updated_at: str


class MetadataAnalysisResult(BaseModel):
    file_name: str
    file_size_bytes: int
    duration_seconds: float | None = None
    bitrate: int | None = None
    codec: str | None = None
    container: str | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    format_name: str | None = None
    source: Literal["ffprobe", "unavailable"] = "ffprobe"


class MetadataAnalysisResponse(BaseModel):
    ok: bool
    status: str
    message: str
    result: MetadataAnalysisResult | None = None
    setup_guidance: str | None = None


class BeatAnalysisResult(BaseModel):
    file_name: str
    bpm: float | None = None
    beat_times: list[float] = Field(default_factory=list)
    beat_count: int = 0
    method: str
    limitations: list[str] = Field(default_factory=list)
    confidence: float | None = None
    downbeat_status: Literal["not_implemented", "implemented"] = "not_implemented"
    phrase_marker_status: Literal["not_implemented", "implemented"] = "not_implemented"


class BeatAnalysisResponse(BaseModel):
    ok: bool
    status: str
    message: str
    result: BeatAnalysisResult | None = None
    setup_guidance: str | None = None


class KeyAnalysisResult(BaseModel):
    file_name: str
    key: str | None = None
    mode: Literal["major", "minor", "unknown"] = "unknown"
    camelot: str | None = None
    method: str
    limitations: list[str] = Field(default_factory=list)
    confidence: float | None = None


class KeyAnalysisResponse(BaseModel):
    ok: bool
    status: str
    message: str
    result: KeyAnalysisResult | None = None
    setup_guidance: str | None = None


class PitchTimePreviewInputSummary(BaseModel):
    file_name: str
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    tempo_ratio: float | None = None
    pitch_shift_semitones: float = 0
    max_preview_seconds: int = 30
    formant_preservation: bool = True


class PitchTimePreviewOutputSummary(BaseModel):
    file_name: str
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    artifact_id: str


class PitchTimePreviewResponse(BaseModel):
    ok: bool
    status: str
    message: str
    method: str | None = None
    audio_processed: bool = False
    input_summary: PitchTimePreviewInputSummary | None = None
    output_summary: PitchTimePreviewOutputSummary | None = None
    artifact_path: str | None = None
    artifact_url: str | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


class StemArtifactSummaryModel(BaseModel):
    file_name: str
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    artifact_url: str


class StemPreviewInputSummary(BaseModel):
    file_name: str
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    split_mode: str
    max_preview_seconds: int | None = None


class StemPreviewResponse(BaseModel):
    ok: bool
    status: str
    message: str
    method: str | None = None
    audio_processed: bool = False
    artifact_id: str | None = None
    input_summary: StemPreviewInputSummary | None = None
    vocals: StemArtifactSummaryModel | None = None
    no_vocals: StemArtifactSummaryModel | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


class CombinedPreviewRequest(BaseModel):
    mash_intent: Literal["vocal_a_over_beat_b", "vocal_b_over_beat_a"]
    source_vocal_artifact_id: str = Field(min_length=1)
    target_instrumental_artifact_id: str = Field(min_length=1)
    tempo_ratio: float | None = None
    source_bpm: float | None = None
    target_bpm: float | None = None
    pitch_shift_semitones: float = 0
    alignment_offset_ms: float = 0
    max_preview_seconds: int = 30
    formant_preservation: bool = True
    neutral_processing: bool = False


class CombinedPreviewInputSummaryModel(BaseModel):
    mash_intent: str
    source_vocal_artifact_id: str
    target_instrumental_artifact_id: str
    tempo_ratio: float | None = None
    pitch_shift_semitones: float = 0
    alignment_offset_ms: float = 0
    max_preview_seconds: int = 30
    neutral_processing: bool = False


class CombinedPreviewProcessingSummaryModel(BaseModel):
    method: str
    vocal_rubberband_ratio: float | None = None
    pitch_shift_semitones: float = 0
    alignment_offset_ms: float = 0
    max_preview_seconds: int = 30


class CombinedPreviewResponse(BaseModel):
    ok: bool
    status: str
    message: str
    method: str | None = None
    audio_processed: bool = False
    final_export: bool = False
    artifact_id: str | None = None
    artifact_url: str | None = None
    input_summary: CombinedPreviewInputSummaryModel | None = None
    processing_summary: CombinedPreviewProcessingSummaryModel | None = None
    output_duration_seconds: float | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    setup_guidance: str | None = None
    validation_errors: list[str] | None = None


class ArtifactPlaybackUrlsModel(BaseModel):
    primary: str | None = None
    vocals: str | None = None
    no_vocals: str | None = None


class PreviewArtifactSummary(BaseModel):
    artifact_id: str
    artifact_type: str
    status: str
    created_at: str
    duration_seconds: float | None = None
    playback_urls: ArtifactPlaybackUrlsModel
    preview_only: bool = True
    final_export: bool = False
    primary_file_name: str
    preview_label: str = "Preview only — not a final export or master."


class ArtifactListResponse(BaseModel):
    ok: bool
    status: str
    message: str
    artifacts: list[PreviewArtifactSummary] = Field(default_factory=list)


class LoudnessReadoutModel(BaseModel):
    integrated_lufs: float | None = None
    true_peak_dbtp: float | None = None
    peak_level_db: float | None = None
    status: str
    message: str


class TechnicalReadoutModel(BaseModel):
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    codec: str | None = None
    container: str | None = None
    file_size_bytes: int | None = None
    loudness: LoudnessReadoutModel


class ArtifactMetadataResponse(BaseModel):
    ok: bool
    status: str
    message: str
    artifact_id: str | None = None
    artifact_type: str | None = None
    preview_only: bool = True
    final_export: bool = False
    playback_url: str | None = None
    technical: TechnicalReadoutModel | None = None


class ArtifactDeleteResponse(BaseModel):
    ok: bool
    status: str
    message: str
    artifact_id: str | None = None
    deleted_count: int | None = None

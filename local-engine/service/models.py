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


class MixSettingsModel(BaseModel):
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    master_gain_db: float = 0.0
    vocal_fade_in_ms: float = 0.0
    vocal_fade_out_ms: float = 0.0
    instrumental_fade_in_ms: float = 0.0
    instrumental_fade_out_ms: float = 0.0
    limiter_safety: bool = False
    clipping_guard: bool = False


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
    preview_start_seconds: float = 0
    formant_preservation: bool = True
    neutral_processing: bool = False
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    master_gain_db: float = 0.0
    vocal_fade_in_ms: float = 0.0
    vocal_fade_out_ms: float = 0.0
    instrumental_fade_in_ms: float = 0.0
    instrumental_fade_out_ms: float = 0.0
    limiter_safety: bool = False
    clipping_guard: bool = False
    arrangement_context: dict | None = None


class CombinedPreviewInputSummaryModel(BaseModel):
    mash_intent: str
    source_vocal_artifact_id: str
    target_instrumental_artifact_id: str
    tempo_ratio: float | None = None
    pitch_shift_semitones: float = 0
    alignment_offset_ms: float = 0
    max_preview_seconds: int = 30
    preview_start_seconds: float = 0
    neutral_processing: bool = False
    mix_settings: MixSettingsModel | None = None


class CombinedPreviewProcessingSummaryModel(BaseModel):
    method: str
    vocal_rubberband_ratio: float | None = None
    pitch_shift_semitones: float = 0
    alignment_offset_ms: float = 0
    max_preview_seconds: int = 30
    preview_start_seconds: float = 0
    mix_settings: MixSettingsModel | None = None
    limiter_safety_applied: bool = False
    clipping_guard_applied: bool = False


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
    source_combined_preview_artifact_id: str | None = None
    export_subtype: str | None = None
    export_format: str | None = None
    source_vocal_stem_artifact_id: str | None = None
    target_instrumental_stem_artifact_id: str | None = None
    source_wav_export_artifact_id: str | None = None
    master_preset: str | None = None
    mastering_prototype: bool = False
    package_only: bool = False
    package_subtype: str | None = None
    package_label: str | None = None
    included_file_count: int | None = None
    selected_artifact_ids: list[str] | None = None
    public_share: bool = False
    mix_summary: str | None = None
    arrangement_draft_type: str | None = None
    arrangement_section_label: str | None = None
    arrangement_preview_start_seconds: float | None = None
    arrangement_duration_seconds: float | None = None
    arrangement_phrase_basis: str | None = None
    arrangement_context_summary: str | None = None
    arrangement_export_context_mode: str | None = None


class PackageIncludedFileModel(BaseModel):
    artifact_id: str
    artifact_type: str
    artifact_subtype: str | None = None
    source_path: str
    package_path: str


class PackageExportRequest(BaseModel):
    package_label: str
    selected_artifact_ids: list[str]
    package_type: str = "folder"
    include_technical_report: bool = False


class PackageExportResponse(BaseModel):
    ok: bool
    status: str
    message: str
    package_artifact_id: str | None = None
    package_label: str | None = None
    package_type: str | None = None
    local_folder_path: str | None = None
    download_url: str | None = None
    manifest_path: str | None = None
    rights_notice_path: str | None = None
    technical_report_path: str | None = None
    included_files: list[PackageIncludedFileModel] = Field(default_factory=list)
    included_artifact_ids: list[str] = Field(default_factory=list)
    public_share: bool = False
    package_only: bool = False
    rights_notice: str | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None


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


class ExportWavRequest(BaseModel):
    source_combined_preview_artifact_id: str
    export_format: str = "wav"
    export_label: str | None = None
    loudness_target_mode: str = "measurement_only"
    arrangement_context: dict | None = None


class ExportWavResponse(BaseModel):
    ok: bool
    status: str
    message: str
    export_artifact_id: str | None = None
    source_combined_preview_artifact_id: str | None = None
    artifact_url: str | None = None
    download_url: str | None = None
    file_size_bytes: int | None = None
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    codec: str | None = None
    loudness: LoudnessReadoutModel | None = None
    final_export: bool = False
    public_share: bool = False
    rights_notice: str | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    export_label: str | None = None
    validation_errors: list[str] | None = None


class ExportMp3Request(BaseModel):
    source_wav_export_artifact_id: str
    bitrate_kbps: int = 320
    export_label: str | None = None


class ExportMp3Response(BaseModel):
    ok: bool
    status: str
    message: str
    export_artifact_id: str | None = None
    source_wav_export_artifact_id: str | None = None
    artifact_url: str | None = None
    download_url: str | None = None
    export_format: str | None = None
    bitrate_kbps: int | None = None
    file_size_bytes: int | None = None
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    codec: str | None = None
    loudness: LoudnessReadoutModel | None = None
    final_export: bool = False
    public_share: bool = False
    rights_notice: str | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    export_label: str | None = None
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None


class MasterWavRequest(BaseModel):
    source_wav_export_artifact_id: str
    preset: str = "measurement_only"
    export_label: str | None = None


class MasterWavResponse(BaseModel):
    ok: bool
    status: str
    message: str
    master_artifact_id: str | None = None
    source_wav_export_artifact_id: str | None = None
    preset: str | None = None
    artifact_url: str | None = None
    download_url: str | None = None
    before_readout: TechnicalReadoutModel | None = None
    after_readout: TechnicalReadoutModel | None = None
    target_integrated_lufs: float | None = None
    target_true_peak_dbtp: float | None = None
    loudness_gate: LoudnessGateModel | None = None
    audio_created: bool = False
    final_export: bool = False
    public_share: bool = False
    mastering_prototype: bool = False
    rights_notice: str | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    export_label: str | None = None
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None


class FullExportInputSummaryModel(BaseModel):
    mash_intent: str
    source_vocal_stem_artifact_id: str
    target_instrumental_stem_artifact_id: str
    tempo_ratio: float | None = None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    neutral_processing: bool
    mix_settings: MixSettingsModel | None = None


class FullExportProcessingSummaryModel(BaseModel):
    method: str
    vocal_rubberband_ratio: float | None = None
    pitch_shift_semitones: float
    alignment_offset_ms: float
    full_length: bool
    max_test_seconds: int | None = None
    mix_settings: MixSettingsModel | None = None
    limiter_safety_applied: bool = False
    clipping_guard_applied: bool = False


class LoudnessGateModel(BaseModel):
    status: str
    message: str
    integrated_lufs: float | None = None
    true_peak_dbtp: float | None = None
    target_integrated_lufs: float
    target_true_peak_dbtp: float


class FullWavExportRequest(BaseModel):
    source_vocal_stem_artifact_id: str
    target_instrumental_stem_artifact_id: str
    mash_intent: str
    tempo_ratio: float | None = None
    source_bpm: float | None = None
    target_bpm: float | None = None
    pitch_shift_semitones: float = 0.0
    alignment_offset_ms: float = 0.0
    export_label: str | None = None
    loudness_target_mode: str = "measurement_only"
    neutral_processing: bool = False
    confirm_neutral_settings: bool = False
    max_test_seconds: int | None = None
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    master_gain_db: float = 0.0
    vocal_fade_in_ms: float = 0.0
    vocal_fade_out_ms: float = 0.0
    instrumental_fade_in_ms: float = 0.0
    instrumental_fade_out_ms: float = 0.0
    limiter_safety: bool = False
    clipping_guard: bool = False
    arrangement_context: dict | None = None


class FullWavExportResponse(BaseModel):
    ok: bool
    status: str
    message: str
    export_artifact_id: str | None = None
    artifact_url: str | None = None
    download_url: str | None = None
    input_summary: FullExportInputSummaryModel | None = None
    processing_summary: FullExportProcessingSummaryModel | None = None
    file_size_bytes: int | None = None
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channel_count: int | None = None
    codec: str | None = None
    loudness: LoudnessReadoutModel | None = None
    loudness_gate: LoudnessGateModel | None = None
    final_export: bool = False
    public_share: bool = False
    rights_notice: str | None = None
    warnings: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    export_label: str | None = None
    validation_errors: list[str] | None = None
    setup_guidance: str | None = None

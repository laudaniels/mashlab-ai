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

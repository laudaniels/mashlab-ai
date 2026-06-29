import type { MashTrackJob } from "./jobs.ts";
import type { SessionArtifactStore } from "./sessionArtifacts.ts";
import { hasActiveOverrides } from "./trackOverrides.ts";
import type { SlotId, TrackState } from "./types.ts";
import type { ServiceCapability } from "../lib/localEngine/types.ts";
import {
  exportPanelHasAnySource,
  hasFullLengthExportSource,
  isMasteringAvailable,
  isMp3ExportAvailable,
  isProjectPackageAvailable,
} from "./exportPrep.ts";
import {
  isDemucsAvailable,
  isFfmpegAvailable,
  isRubberBandAvailable,
} from "../lib/localEngine/capabilities.ts";

export const WORKFLOW_READINESS_NOTICE =
  "Session checklist is informational only. Each step requires explicit user action — nothing auto-processes.";

export type WorkflowStepStatusKind = "complete" | "partial" | "pending" | "blocked";

export interface WorkflowStepStatus {
  id: string;
  label: string;
  status: WorkflowStepStatusKind;
  detail: string;
}

export interface WorkflowArtifactCounts {
  stem: number;
  combinedPreview: number;
  wavExport: number;
  fullWavExport: number;
  mp3Export: number;
  master: number;
  package: number;
}

export interface WorkflowReadinessInput {
  tracks: Record<SlotId, TrackState | null>;
  trackJobs: Record<SlotId, MashTrackJob | null>;
  artifactStore: SessionArtifactStore;
  sidecarOnline: boolean;
  capabilities: ServiceCapability[];
  artifactCounts: WorkflowArtifactCounts;
}

export function emptyWorkflowArtifactCounts(): WorkflowArtifactCounts {
  return {
    stem: 0,
    combinedPreview: 0,
    wavExport: 0,
    fullWavExport: 0,
    mp3Export: 0,
    master: 0,
    package: 0,
  };
}

export function countWorkflowArtifacts(
  artifacts: Array<{ artifactType: string; exportSubtype?: string | null; exportFormat?: string | null }>
): WorkflowArtifactCounts {
  const counts = emptyWorkflowArtifactCounts();

  for (const artifact of artifacts) {
    switch (artifact.artifactType) {
      case "stem":
        counts.stem += 1;
        break;
      case "combined-preview":
        counts.combinedPreview += 1;
        break;
      case "export":
        if (artifact.exportFormat === "mp3") {
          counts.mp3Export += 1;
        } else if (artifact.exportSubtype === "full-wav") {
          counts.fullWavExport += 1;
          counts.wavExport += 1;
        } else {
          counts.wavExport += 1;
        }
        break;
      case "master":
        counts.master += 1;
        break;
      case "package":
        counts.package += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}

function tracksLoadedCount(tracks: Record<SlotId, TrackState | null>): number {
  return (["trackA", "trackB"] as const).filter((slot) => tracks[slot]?.status === "ready").length;
}

function analysisAvailableCount(
  tracks: Record<SlotId, TrackState | null>,
  trackJobs: Record<SlotId, MashTrackJob | null>
): number {
  return (["trackA", "trackB"] as const).filter((slot) => {
    const track = tracks[slot];
    if (track?.status !== "ready") {
      return false;
    }
    const job = trackJobs[slot];
    const beatDone = job?.steps.some((step) => step.id === "beat" && step.state === "complete");
    const keyDone = job?.steps.some((step) => step.id === "key" && step.state === "complete");
    return Boolean(beatDone && keyDone);
  }).length;
}

function overridesPresentCount(artifactStore: SessionArtifactStore): number {
  return (["trackA", "trackB"] as const).filter((slot) => {
    const artifact = artifactStore.tracks[slot];
    return artifact ? hasActiveOverrides(artifact.overrides) : false;
  }).length;
}

function stemsPresentCount(artifactStore: SessionArtifactStore): number {
  return (["trackA", "trackB"] as const).filter(
    (slot) => Boolean(artifactStore.tracks[slot]?.stemPreview?.artifactId)
  ).length;
}

export function buildWorkflowReadiness(input: WorkflowReadinessInput): WorkflowStepStatus[] {
  const {
    tracks,
    trackJobs,
    artifactStore,
    sidecarOnline,
    capabilities,
    artifactCounts,
  } = input;

  const loaded = tracksLoadedCount(tracks);
  const analyzed = analysisAvailableCount(tracks, trackJobs);
  const overrides = overridesPresentCount(artifactStore);
  const stems = stemsPresentCount(artifactStore);
  const hasStemArtifacts = hasFullLengthExportSource(artifactStore);
  const hasCombined = artifactCounts.combinedPreview > 0;
  const hasAnyExportSource = exportPanelHasAnySource(hasCombined, hasStemArtifacts);

  const stemReadyA =
    sidecarOnline &&
    isDemucsAvailable(capabilities) &&
    Boolean(tracks.trackA?.file);
  const stemReadyB =
    sidecarOnline &&
    isDemucsAvailable(capabilities) &&
    Boolean(tracks.trackB?.file);

  const combinedReady =
    stems === 2 &&
    sidecarOnline &&
    isRubberBandAvailable(capabilities) &&
    isFfmpegAvailable(capabilities);

  const missingDeps: string[] = [];
  if (!sidecarOnline) {
    missingDeps.push("Python sidecar offline");
  } else {
    if (!isFfmpegAvailable(capabilities)) {
      missingDeps.push("FFmpeg/ffprobe missing from PATH");
    }
    if (!isRubberBandAvailable(capabilities)) {
      missingDeps.push("Rubber Band CLI missing from PATH");
    }
    if (!isDemucsAvailable(capabilities)) {
      missingDeps.push("Demucs/PyTorch not configured");
    }
  }

  return [
    {
      id: "tracks_loaded",
      label: "Tracks loaded",
      status: loaded === 2 ? "complete" : loaded === 1 ? "partial" : "pending",
      detail: `${loaded}/2 tracks ready with browser metadata.`,
    },
    {
      id: "analysis_available",
      label: "BPM/key analysis",
      status:
        analyzed === 2
          ? "complete"
          : analyzed === 1
            ? "partial"
            : sidecarOnline
              ? "pending"
              : "blocked",
      detail:
        analyzed === 2
          ? "Beat and key lanes complete for both tracks."
          : sidecarOnline
            ? `${analyzed}/2 tracks analyzed — run analysis when librosa is available.`
            : "Sidecar offline — browser-only metadata only.",
    },
    {
      id: "overrides_present",
      label: "DJ overrides",
      status: overrides > 0 ? "complete" : "pending",
      detail:
        overrides > 0
          ? `${overrides} track(s) have active DJ overrides.`
          : "Optional — set BPM, key, alignment, or phrase overrides when needed.",
    },
    {
      id: "arrangement_draft",
      label: "Arrangement draft plan",
      status: loaded === 2 ? "pending" : "blocked",
      detail:
        loaded === 2
          ? "Choose Clean Blend, Club Edit, or Creative Blend on Drafts/Timeline/Export — planning only until preview/export."
          : "Load both tracks to open arrangement draft templates.",
    },
    {
      id: "stems_available",
      label: "Stem previews",
      status: stems === 2 ? "complete" : stems === 1 ? "partial" : stemReadyA || stemReadyB ? "pending" : "blocked",
      detail:
        stems === 2
          ? "Vocal/instrumental stem previews exist for both tracks."
          : stems === 1
            ? "One stem preview created — run stem separation for the other track."
            : stemReadyA || stemReadyB
              ? "Ready to create stem previews — user action required."
              : !sidecarOnline
                ? "Sidecar offline — stem preview unavailable."
                : !isDemucsAvailable(capabilities)
                  ? "Install Demucs and PyTorch in the sidecar environment."
                  : "Upload both tracks before creating stem previews.",
    },
    {
      id: "combined_preview",
      label: "Combined preview",
      status: hasCombined ? "complete" : combinedReady ? "pending" : "blocked",
      detail: hasCombined
        ? `${artifactCounts.combinedPreview} combined preview artifact(s) on disk.`
        : combinedReady
          ? "Stem previews ready — create combined preview from the timeline screen."
          : stems < 2
            ? "Create stem previews for both tracks first."
            : !isRubberBandAvailable(capabilities)
              ? "Rubber Band CLI required for combined preview processing."
              : "Combined preview blocked — check FFmpeg and plan state.",
    },
    {
      id: "mix_controls",
      label: "Mix controls",
      status: hasCombined || hasStemArtifacts ? "pending" : "blocked",
      detail:
        hasCombined || hasStemArtifacts
          ? "Adjust mix settings before creating a new preview or full-length export."
          : "Create stem previews or a combined preview first.",
    },
    {
      id: "full_wav_export",
      label: "Full-length WAV export",
      status:
        artifactCounts.fullWavExport > 0
          ? "complete"
          : hasAnyExportSource
            ? "pending"
            : "blocked",
      detail:
        artifactCounts.fullWavExport > 0
          ? `${artifactCounts.fullWavExport} full-length WAV export(s) available.`
          : hasAnyExportSource
            ? "Ready when stem artifacts and plan state are confirmed — user-initiated only."
            : "Requires stem previews for both tracks or a combined preview source.",
    },
    {
      id: "mp3_reference",
      label: "MP3 reference export",
      status: artifactCounts.mp3Export > 0 ? "complete" : isMp3ExportAvailable(artifactCounts.wavExport) ? "pending" : "blocked",
      detail:
        artifactCounts.mp3Export > 0
          ? `${artifactCounts.mp3Export} MP3 reference export(s) available.`
          : isMp3ExportAvailable(artifactCounts.wavExport)
            ? "Create from an existing WAV export artifact."
            : "Requires a local WAV export first.",
    },
    {
      id: "mastering",
      label: "Mastering preset",
      status: artifactCounts.master > 0 ? "complete" : isMasteringAvailable(artifactCounts.wavExport) ? "pending" : "blocked",
      detail:
        artifactCounts.master > 0
          ? `${artifactCounts.master} mastering prototype artifact(s) available.`
          : isMasteringAvailable(artifactCounts.wavExport)
            ? "Run a mastering preset from a WAV export — prototype only."
            : "Requires a local WAV export first.",
    },
    {
      id: "project_package",
      label: "Project package",
      status: artifactCounts.package > 0 ? "complete" : isProjectPackageAvailable(artifactCounts.stem + artifactCounts.combinedPreview + artifactCounts.wavExport + artifactCounts.master) ? "pending" : "blocked",
      detail:
        artifactCounts.package > 0
          ? `${artifactCounts.package} local project package(s) created.`
          : isProjectPackageAvailable(
                artifactCounts.stem +
                  artifactCounts.combinedPreview +
                  artifactCounts.wavExport +
                  artifactCounts.master
              )
            ? "Bundle selected local artifacts into a folder or ZIP."
            : "Create at least one exportable artifact first.",
    },
    {
      id: "artifact_inspection",
      label: "Inspect artifacts",
      status:
        artifactCounts.stem + artifactCounts.combinedPreview + artifactCounts.wavExport + artifactCounts.master + artifactCounts.package > 0
          ? "pending"
          : "blocked",
      detail: "Use the artifact browser to inspect loudness readouts and metadata.",
    },
    {
      id: "cleanup",
      label: "Delete / cleanup",
      status:
        artifactCounts.stem + artifactCounts.combinedPreview + artifactCounts.wavExport + artifactCounts.master + artifactCounts.package > 0
          ? "pending"
          : "blocked",
      detail: "Remove individual artifacts or clear the session — deletes only under `.work/artifacts`.",
    },
    {
      id: "missing_dependencies",
      label: "Missing dependencies",
      status: missingDeps.length === 0 ? "complete" : sidecarOnline ? "partial" : "blocked",
      detail:
        missingDeps.length === 0
          ? "Core local dependencies reported available."
          : missingDeps.join(" · "),
    },
  ];
}

export function formatWorkflowStepStatus(status: WorkflowStepStatusKind): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "partial":
      return "Partial";
    case "blocked":
      return "Blocked";
    default:
      return "Pending";
  }
}

export function workflowStepsComplete(steps: WorkflowStepStatus[]): number {
  return steps.filter((step) => step.status === "complete").length;
}

import type { EngineCapability, WorkflowScreen } from "./types.ts";

export const workflowScreens: WorkflowScreen[] = [
  {
    id: "intro",
    label: "Intro",
    description: "Project promise, product boundary, and local-first posture.",
  },
  {
    id: "upload",
    label: "Upload",
    description: "Two local files enter the workspace.",
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "Metadata now; tempo, key, beat grid, and phrase engines next.",
  },
  {
    id: "stems",
    label: "Stems",
    description: "Separation queue and future Demucs/MDX adapter status.",
  },
  {
    id: "drafts",
    label: "Drafts",
    description: "Mashup generation slots for clean, club, and creative drafts.",
  },
  {
    id: "timeline",
    label: "Timeline",
    description: "Arrangement preview surface for phrase-aligned edits.",
  },
  {
    id: "export",
    label: "Export",
    description: "DJ-safe render controls and mastering targets.",
  },
  {
    id: "rights",
    label: "Rights",
    description: "Use responsibility, privacy, and product restrictions.",
  },
];

export const engineCapabilities: EngineCapability[] = [
  {
    id: "stem-separation",
    name: "Stem separation",
    status: "engine-pending",
    target: "Vocals, drums, bass, and other stems",
    adapterPlan: "Demucs / HTDemucs first, MDX-Net and UVR-style models later.",
  },
  {
    id: "beat-phrase",
    name: "Beat, downbeat, tempo, phrase",
    status: "analysis-coming-next",
    target: "Beat grid, downbeats, tempo confidence, 8/16/32-bar phrases",
    adapterPlan: "BeatNet+ and Essentia as preferred lanes; librosa-style prototype path.",
  },
  {
    id: "key-harmony",
    name: "Key and harmonic matching",
    status: "analysis-coming-next",
    target: "Detected key, Camelot compatibility, relative major/minor hints",
    adapterPlan: "Key detector behind confidence scoring and pitch-shift guardrails.",
  },
  {
    id: "pitch-time",
    name: "Pitch/time processing",
    status: "engine-pending",
    target: "High-quality tempo and pitch changes with artifact limits",
    adapterPlan: "Rubber Band preferred; SoundTouch fallback for lightweight previews.",
  },
  {
    id: "vocal-chain",
    name: "Vocal cleanup and tone",
    status: "engine-pending",
    target: "Gain, EQ, compression, de-essing, reverb/delay matching",
    adapterPlan: "Deterministic chain before higher-level tone matching automation.",
  },
  {
    id: "arrangement",
    name: "Arrangement intelligence",
    status: "engine-pending",
    target: "Clean blend, club blend, hook-over-drop, creative blend",
    adapterPlan: "Phrase-aware draft generator with explicit user-editable decisions.",
  },
  {
    id: "export-mastering",
    name: "Export and mastering",
    status: "engine-pending",
    target: "DJ-safe WAV, MP3, and stem exports with loudness/peak targets",
    adapterPlan: "FFmpeg plus mastering chain with LUFS, true peak, and headroom checks.",
  },
];

export const draftTemplates = [
  {
    name: "Clean Blend",
    description: "Phrase-safe intro/outro transition with conservative vocal handling.",
  },
  {
    name: "Hook Over Drop",
    description: "Vocal hook from one track over the highest-energy section of the other.",
  },
  {
    name: "Club Blend",
    description: "Longer 16/32-bar DJ mix shape with controllable energy and exit.",
  },
];

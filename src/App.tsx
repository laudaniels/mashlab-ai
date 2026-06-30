import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Cpu,
  Download,
  FileAudio2,
  Gauge,
  KeyRound,
  Layers3,
  Music2,
  Radio,
  RefreshCw,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  Waves,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  engineCapabilities,
  workflowScreens,
} from "./domain/enginePlan";
import type { EngineCapability, SlotId, TrackState, WorkflowScreen } from "./domain/types";
import {
  formatDuration,
  formatFileSize,
  inspectAudioFile,
  validateAudioFile,
} from "./lib/audioMetadata";
import { legalDoctrineBullets, requiredRightsNotice } from "./lib/legal";
import { clearAnalysisCache } from "./lib/localEngine/analysisCache.ts";
import { TrackAnalysisPanel } from "./components/TrackAnalysisPanel";
import { FirstRunGuidancePanel } from "./components/FirstRunGuidancePanel";
import { LocalEngineStatus } from "./components/LocalEngineStatus";
import { ArrangementPlanPanel } from "./components/ArrangementPlanPanel.tsx";
import { WorkflowReadinessPanel } from "./components/WorkflowReadinessPanel";
import { MashupPlanningPanel } from "./components/MashupPlanningPanel";
import { ExportPrepPanel } from "./components/ExportPrepPanel";
import { PreviewArtifactBrowser } from "./components/PreviewArtifactBrowser";
import { CombinedPreviewPanel } from "./components/CombinedPreviewPanel";
import { PitchTimePlanPanel } from "./components/PitchTimePlanPanel";
import { StemPreviewPanel } from "./components/StemPreviewPanel";
import { TimelineAlignmentPanel } from "./components/TimelineAlignmentPanel";
import { PhraseAnalysisPanel } from "./components/PhraseAnalysisPanel";
import { TrackOverridePanel } from "./components/TrackOverridePanel";
import {
  QuickMixApp,
} from "./components/QuickMixApp.tsx";
import {
  loadAppExperienceMode,
  QUICK_MIX_ADVANCED_STUDIO_LABEL,
  saveAppExperienceMode,
  type AppExperienceMode,
} from "./domain/quickMix.ts";
import type { MashTrackJob } from "./domain/jobs.ts";
import type { MashIntent } from "./domain/pitchTimePlanning.ts";
import {
  clearTrackArtifactOverrides,
  createSessionArtifactStore,
  createTrackArtifact,
  rebuildTrackArtifact,
  resolvePlanningBpm,
  syncTrackArtifactFromJob,
  updateTrackArtifactOverrides,
  updateTrackPhraseAnalysis,
  updateTrackStemPreviewArtifact,
  type SessionArtifactStore,
} from "./domain/sessionArtifacts.ts";
import type { TrackDjOverrides } from "./domain/trackOverrides.ts";
import { buildRegistryEntry } from "./domain/previewArtifacts.ts";
import {
  upsertPreviewArtifactRegistryEntry,
} from "./lib/previewArtifactRegistry.ts";
import { notifyArtifactRefresh } from "./lib/artifactRefresh.ts";
import {
  applyPersistedOverrides,
  clearSessionSnapshot,
  loadSessionSnapshot,
  saveSessionSnapshot,
  serializeSessionSnapshot,
} from "./lib/sessionPersistence.ts";

type ScreenId = WorkflowScreen["id"];
type TrackMap = Record<SlotId, TrackState | null>;
type SlotErrorMap = Record<SlotId, string | null>;

const screenIcons: Record<ScreenId, LucideIcon> = {
  intro: Music2,
  upload: UploadCloud,
  analysis: Activity,
  stems: Layers3,
  drafts: Sparkles,
  timeline: SlidersHorizontal,
  export: Download,
  rights: ShieldCheck,
};

const trackLabels: Record<SlotId, string> = {
  trackA: "Track A",
  trackB: "Track B",
};

const emptyTracks: TrackMap = {
  trackA: null,
  trackB: null,
};

const emptySlotErrors: SlotErrorMap = {
  trackA: null,
  trackB: null,
};

function App() {
  const sessionIdRef = useRef(crypto.randomUUID());
  const [appMode, setAppMode] = useState<AppExperienceMode>(() => loadAppExperienceMode());
  const [activeScreen, setActiveScreen] = useState<ScreenId>("intro");
  const [tracks, setTracks] = useState<TrackMap>(emptyTracks);
  const [slotErrors, setSlotErrors] = useState<SlotErrorMap>(emptySlotErrors);
  const [trackJobs, setTrackJobs] = useState<Record<SlotId, MashTrackJob | null>>({
    trackA: null,
    trackB: null,
  });
  const [artifactStore, setArtifactStore] = useState<SessionArtifactStore>(() =>
    createSessionArtifactStore(sessionIdRef.current)
  );
  const [mashIntent, setMashIntent] = useState<MashIntent>("compare_both");
  const tracksRef = useRef(tracks);

  useEffect(() => {
    const snapshot = loadSessionSnapshot();
    if (snapshot && snapshot.sessionId === sessionIdRef.current) {
      setMashIntent(snapshot.mashIntent);
      setArtifactStore((current) => {
        const merged = applyPersistedOverrides(current, snapshot);
        return {
          ...merged,
          tracks: {
            trackA: merged.tracks.trackA ? rebuildTrackArtifact(merged.tracks.trackA) : null,
            trackB: merged.tracks.trackB ? rebuildTrackArtifact(merged.tracks.trackB) : null,
          },
        };
      });
    }
  }, []);

  useEffect(() => {
    saveSessionSnapshot(serializeSessionSnapshot({ store: artifactStore, mashIntent }));
  }, [artifactStore, mashIntent]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  useEffect(() => {
    return () => {
      Object.values(tracksRef.current).forEach((track) => {
        if (track) {
          URL.revokeObjectURL(track.objectUrl);
        }
      });
    };
  }, []);

  const loadedTracks = useMemo(
    () => Object.values(tracks).filter((track): track is TrackState => Boolean(track)),
    [tracks]
  );
  const readyTracks = loadedTracks.filter((track) => track.status === "ready");

  function updateTrackJob(slotId: SlotId, job: MashTrackJob | null) {
    setTrackJobs((current) => ({ ...current, [slotId]: job }));
    setArtifactStore((current) => {
      const artifact = current.tracks[slotId];
      if (!artifact) {
        return current;
      }

      return {
        ...current,
        tracks: {
          ...current.tracks,
          [slotId]: syncTrackArtifactFromJob(artifact, job),
        },
      };
    });
  }

  function ensureTrackArtifact(slotId: SlotId, track: TrackState) {
    setArtifactStore((current) => {
      const existing = current.tracks[slotId];
      const identityMatches =
        existing &&
        existing.fileIdentity.name === track.file.name &&
        existing.fileIdentity.sizeBytes === track.file.size &&
        existing.fileIdentity.lastModified === track.file.lastModified;

      if (identityMatches && existing) {
        if (existing.browserMetadata?.id === track.inspection?.id) {
          return current;
        }

        return {
          ...current,
          tracks: {
            ...current.tracks,
            [slotId]: syncTrackArtifactFromJob(
              {
                ...existing,
                browserMetadata: track.inspection,
                inspectionId: track.inspection?.id ?? null,
              },
              trackJobs[slotId]
            ),
          },
        };
      }

      const snapshot = loadSessionSnapshot();
      const persisted = snapshot?.tracks[slotId];
      const canRestoreOverrides =
        persisted &&
        persisted.fileIdentity.name === track.file.name &&
        persisted.fileIdentity.sizeBytes === track.file.size &&
        persisted.fileIdentity.lastModified === track.file.lastModified;

      let artifact = createTrackArtifact({
        sessionId: sessionIdRef.current,
        slotId,
        file: track.file,
        inspection: track.inspection,
      });

      if (canRestoreOverrides) {
        artifact = updateTrackArtifactOverrides(artifact, persisted.overrides);
      }

      return {
        ...current,
        tracks: {
          ...current.tracks,
          [slotId]: syncTrackArtifactFromJob(artifact, null),
        },
      };
    });
  }

  function handlePhraseAnalysisComplete(
    slotId: SlotId,
    result: import("./domain/phraseAnalysis.ts").PhraseAnalysisResult | null
  ) {
    setArtifactStore((current) => {
      const artifact = current.tracks[slotId];
      if (!artifact) {
        return current;
      }

      return {
        ...current,
        tracks: {
          ...current.tracks,
          [slotId]: updateTrackPhraseAnalysis(artifact, result),
        },
      };
    });
  }

  function updateTrackOverrides(slotId: SlotId, patch: Partial<TrackDjOverrides>) {
    setArtifactStore((current) => {
      const artifact = current.tracks[slotId];
      if (!artifact) {
        return current;
      }

      return {
        ...current,
        tracks: {
          ...current.tracks,
          [slotId]: updateTrackArtifactOverrides(artifact, patch),
        },
      };
    });
  }

  function resetTrackOverrides(slotId: SlotId) {
    setArtifactStore((current) => {
      const artifact = current.tracks[slotId];
      if (!artifact) {
        return current;
      }

      return {
        ...current,
        tracks: {
          ...current.tracks,
          [slotId]: clearTrackArtifactOverrides(artifact),
        },
      };
    });
  }

  function updateStemPreviewArtifact(slotId: SlotId, artifactId: string) {
    setArtifactStore((current) => {
      const artifact = current.tracks[slotId];
      if (!artifact) {
        return current;
      }

      return {
        ...current,
        tracks: {
          ...current.tracks,
          [slotId]: updateTrackStemPreviewArtifact(artifact, artifactId),
        },
      };
    });

    upsertPreviewArtifactRegistryEntry(
      buildRegistryEntry({
        artifactId,
        artifactType: "stem",
        sourceTrackSlot: slotId,
        label: `${trackLabels[slotId]} stem preview`,
      })
    );
    notifyArtifactRefresh();
  }

  function registerCombinedPreviewArtifact(params: {
    artifactId: string;
    mashIntent: string;
    sourceTrackSlot: SlotId;
    targetTrackSlot: SlotId;
    label: string;
  }) {
    upsertPreviewArtifactRegistryEntry(
      buildRegistryEntry({
        artifactId: params.artifactId,
        artifactType: "combined-preview",
        sourceTrackSlot: params.sourceTrackSlot,
        targetTrackSlot: params.targetTrackSlot,
        mashIntent: params.mashIntent,
        label: params.label,
      })
    );
    notifyArtifactRefresh();
  }

  async function handleFileChange(slotId: SlotId, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    const validation = validateAudioFile(file);
    if (!validation.ok) {
      setSlotErrors((current) => ({
        ...current,
        [slotId]: validation.message,
      }));
      return;
    }

    const previousTrack = tracksRef.current[slotId];
    if (previousTrack) {
      URL.revokeObjectURL(previousTrack.objectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSlotErrors((current) => ({ ...current, [slotId]: null }));
    setTracks((current) => ({
      ...current,
      [slotId]: {
        slotId,
        label: trackLabels[slotId],
        file,
        objectUrl,
        inspection: null,
        status: "loading",
        error: null,
      },
    }));

    try {
      const inspection = await inspectAudioFile(file);
      setTracks((current) => {
        const activeTrack = current[slotId];
        if (!activeTrack || activeTrack.objectUrl !== objectUrl) {
          return current;
        }

        const updatedTrack: TrackState = {
          ...activeTrack,
          inspection,
          status: "ready",
          error: null,
        };

        queueMicrotask(() => ensureTrackArtifact(slotId, updatedTrack));

        return {
          ...current,
          [slotId]: updatedTrack,
        };
      });
    } catch (error) {
      setTracks((current) => {
        const activeTrack = current[slotId];
        if (!activeTrack || activeTrack.objectUrl !== objectUrl) {
          return current;
        }

        return {
          ...current,
          [slotId]: {
            ...activeTrack,
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "The browser could not inspect this audio file.",
          },
        };
      });
    }
  }

  function clearTrack(slotId: SlotId) {
    const track = tracksRef.current[slotId];
    if (track) {
      URL.revokeObjectURL(track.objectUrl);
    }
    setTracks((current) => ({ ...current, [slotId]: null }));
    setSlotErrors((current) => ({ ...current, [slotId]: null }));
    updateTrackJob(slotId, null);
    setArtifactStore((current) => ({
      ...current,
      tracks: { ...current.tracks, [slotId]: null },
    }));
    clearSessionSnapshot();
    clearAnalysisCache();
  }

  function openAdvancedStudio() {
    saveAppExperienceMode("advanced-studio");
    setAppMode("advanced-studio");
  }

  function openQuickMix() {
    saveAppExperienceMode("quick-mix");
    setAppMode("quick-mix");
  }

  if (appMode === "quick-mix") {
    return <QuickMixApp onOpenAdvancedStudio={openAdvancedStudio} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Waves aria-hidden="true" size={26} />
          </div>
          <div>
            <p className="eyebrow">MashLab AI / CyphaBlend AI</p>
            <h1>{QUICK_MIX_ADVANCED_STUDIO_LABEL}</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="secondary-action" onClick={openQuickMix} type="button">
            Quick Mix
          </button>
          <div className="privacy-badge">
            <ShieldCheck aria-hidden="true" size={18} />
            <span>Local-first MVP</span>
          </div>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="sidebar" aria-label="Advanced Studio workflow">
          <div className="sidebar-header">
            <span>Advanced Studio</span>
            <strong>{readyTracks.length}/2 ready</strong>
          </div>
          <nav className="workflow-nav">
            {workflowScreens.map((screen) => {
              const Icon = screenIcons[screen.id];
              const isActive = activeScreen === screen.id;

              return (
                <button
                  className={`nav-item ${isActive ? "is-active" : ""}`}
                  key={screen.id}
                  onClick={() => setActiveScreen(screen.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} />
                  <span>{screen.label}</span>
                </button>
              );
            })}
          </nav>
          <LocalEngineStatus />
          <WorkflowReadinessPanel
            artifactStore={artifactStore}
            mashIntent={mashIntent}
            trackJobs={trackJobs}
            tracks={tracks}
          />
          <div className="legal-mini">
            <ShieldCheck aria-hidden="true" size={18} />
            <p>{requiredRightsNotice}</p>
          </div>
        </aside>

        <main className="main-stage">
          <FirstRunGuidancePanel onNavigate={setActiveScreen} />
          {renderScreen()}
        </main>
      </div>
    </div>
  );

  function renderScreen() {
    switch (activeScreen) {
      case "intro":
        return (
          <section className="screen intro-screen">
            <div className="intro-copy">
              <p className="eyebrow">Neutral private audio-processing tool</p>
              <h2>Build the mashup workflow before claiming the magic.</h2>
              <p className="lead">
                Load two tracks you own or are authorized to use, plan the mashup locally, and
                create previews or exports on your machine. No cloud upload or public sharing.
              </p>
              <div className="hero-actions">
                <button className="primary-action" onClick={() => setActiveScreen("upload")} type="button">
                  <UploadCloud aria-hidden="true" size={18} />
                  Start with uploads
                </button>
                <button className="secondary-action" onClick={() => setActiveScreen("rights")} type="button">
                  <ShieldCheck aria-hidden="true" size={18} />
                  Review use notice
                </button>
              </div>
              <p className="intro-setup-hint">
                Optional processing needs FFmpeg and the Python sidecar on PATH. Run{" "}
                <code>npm run setup:windows:check</code> or <code>npm run start:local</code>.
              </p>
            </div>

            <div className="studio-visual" aria-label="Audio workflow signal preview">
              <div className="meter-header">
                <span>Engine map</span>
                <span>Local lanes</span>
              </div>
              <div className="meter-stack">
                {engineCapabilities.slice(0, 5).map((capability, index) => (
                  <div className="meter-row" key={capability.id}>
                    <span>{capability.name}</span>
                    <div className="meter-rail">
                      <div style={{ width: `${34 + index * 11}%` }} />
                    </div>
                    <StatusPill capability={capability} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      case "upload":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Step 1 — Upload"
              icon={UploadCloud}
              title="Upload Two Local Tracks"
              subtitle="Files stay in this browser session. No downloader, streaming import, or cloud upload. Sidecar and FFmpeg are not required to load tracks."
            />
            <div className="upload-grid">
              <TrackUploadSlot
                error={slotErrors.trackA}
                onChange={(event) => void handleFileChange("trackA", event)}
                onClear={() => clearTrack("trackA")}
                slotId="trackA"
                track={tracks.trackA}
              />
              <TrackUploadSlot
                error={slotErrors.trackB}
                onChange={(event) => void handleFileChange("trackB", event)}
                onClear={() => clearTrack("trackB")}
                slotId="trackB"
                track={tracks.trackB}
              />
            </div>
            <NoticeStrip icon={ShieldCheck} text={requiredRightsNotice} />
          </section>
        );
      case "analysis":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Step 2 — Analysis"
              icon={Activity}
              title="Track Analysis and Mashup Planning"
              subtitle="Browser metadata is always local. BPM/key prototypes require sidecar + librosa. Harmonic and phrase planning are advisory — DJ review required."
            />
            <div className="stats-grid">
              <StatTile icon={FileAudio2} label="Loaded files" value={`${loadedTracks.length}/2`} />
              <StatTile icon={Clock3} label="Total duration" value={totalDurationLabel(readyTracks)} />
              <StatTile
                icon={Gauge}
                label="BPM / beat grid"
                value={planningBpmLabel(artifactStore)}
              />
              <StatTile
                icon={KeyRound}
                label="Harmonic planning"
                value={readyTracks.length === 2 ? "Ready to compare" : "Load both tracks"}
              />
            </div>
            {readyTracks.length === 2 ? (
              <>
                <MashupPlanningPanel artifactStore={artifactStore} />
                <PitchTimePlanPanel
                  artifactStore={artifactStore}
                  intent={mashIntent}
                  onIntentChange={setMashIntent}
                  tracks={readyTracks}
                />
              </>
            ) : null}
            {readyTracks.length > 0 ? (
              <div className="override-panel-grid">
                {readyTracks.map((track) => (
                  <TrackOverridePanel
                    key={track.objectUrl}
                    artifact={artifactStore.tracks[track.slotId]}
                    label={track.label}
                    onChange={(patch) => updateTrackOverrides(track.slotId, patch)}
                    onClear={() => resetTrackOverrides(track.slotId)}
                    slotId={track.slotId}
                  />
                ))}
              </div>
            ) : null}
            <div className="capability-grid">
              {engineCapabilities.slice(1, 3).map((capability) => (
                <CapabilityCard capability={capability} key={capability.id} />
              ))}
            </div>
            <TrackMetadataTable tracks={readyTracks} />
            {readyTracks.length > 0 ? (
              <div className="analysis-track-grid">
                {readyTracks.map((track) => (
                  <TrackAnalysisPanel
                    key={track.objectUrl}
                    onJobUpdate={(job) => updateTrackJob(track.slotId, job)}
                    sessionId={sessionIdRef.current}
                    track={track}
                  />
                ))}
              </div>
            ) : null}
          </section>
        );
      case "stems":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Step 3 — Stems"
              icon={Layers3}
              title="Vocal / Instrumental Preview"
              subtitle="User-initiated Demucs two-stem preview. Requires sidecar, FFmpeg, and Demucs. One track at a time."
            />
            <StemPreviewPanel
              onStemPreviewComplete={updateStemPreviewArtifact}
              tracks={readyTracks}
            />
            <div className="stem-board stem-board-reference">
              {["Vocals", "Drums", "Bass", "Other"].map((stem, index) => (
                <div className="stem-lane stem-lane-reference" key={stem}>
                  <div className="stem-icon">
                    <Scissors aria-hidden="true" size={18} />
                  </div>
                  <h3>{stem}</h3>
                  <p>{stem === "Vocals" ? "Preview lane above" : "Future 4-stem lane"}</p>
                  <div className="stem-bars" aria-hidden="true">
                    <span style={{ height: `${40 + index * 8}%` }} />
                    <span style={{ height: `${64 - index * 6}%` }} />
                    <span style={{ height: `${52 + index * 4}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <CapabilityCard capability={engineCapabilities[0]} />
          </section>
        );
      case "drafts":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Step 2b — Drafts"
              icon={Sparkles}
              title="Arrangement Draft Planning"
              subtitle="Clean Blend, Club Edit, and Creative Blend templates. Planning only — no audio until you create preview or export."
            />
            {readyTracks.length === 2 ? (
              <ArrangementPlanPanel
                artifactStore={artifactStore}
                mashIntent={mashIntent}
                onIntentChange={setMashIntent}
                onNavigateToScreen={setActiveScreen}
              />
            ) : (
              <NoticeStrip
                icon={AlertTriangle}
                text="Upload and inspect both tracks to open arrangement draft planning."
              />
            )}
            <CapabilityCard capability={engineCapabilities[5]} />
          </section>
        );
      case "timeline":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Step 4 — Timeline & preview"
              icon={SlidersHorizontal}
              title="Timeline Alignment and Combined Preview"
              subtitle="Beat and phrase planning with DJ overrides. Combined preview needs stem previews on both tracks and Rubber Band."
            />
            <TimelineAlignmentPanel artifactStore={artifactStore} tracks={readyTracks} />
            {readyTracks.length > 0 ? (
              <PhraseAnalysisPanel
                artifactStore={artifactStore}
                onPhraseAnalysisComplete={handlePhraseAnalysisComplete}
                tracks={readyTracks}
              />
            ) : null}
            {readyTracks.length > 0 ? (
              <div className="override-panel-grid">
                {readyTracks.map((track) => (
                  <TrackOverridePanel
                    key={track.objectUrl}
                    artifact={artifactStore.tracks[track.slotId]}
                    label={track.label}
                    onChange={(patch) => updateTrackOverrides(track.slotId, patch)}
                    onClear={() => resetTrackOverrides(track.slotId)}
                    slotId={track.slotId}
                  />
                ))}
              </div>
            ) : null}
            {readyTracks.length === 2 ? (
              <>
                <ArrangementPlanPanel
                  artifactStore={artifactStore}
                  mashIntent={mashIntent}
                  onIntentChange={setMashIntent}
                  onNavigateToScreen={setActiveScreen}
                />
                <CombinedPreviewPanel
                  artifactStore={artifactStore}
                  intent={mashIntent}
                  onCombinedPreviewComplete={registerCombinedPreviewArtifact}
                />
                <MashupPlanningPanel artifactStore={artifactStore} />
                <PitchTimePlanPanel
                  artifactStore={artifactStore}
                  intent={mashIntent}
                  onIntentChange={setMashIntent}
                  tracks={readyTracks}
                />
              </>
            ) : null}
          </section>
        );
      case "export":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Step 5 — Export"
              icon={Download}
              title="Preview Session and Local Export"
              subtitle="Manage local artifacts. WAV/MP3/master/package export requires FFmpeg and prior previews. Artifacts stay on your machine."
            />
            <PreviewArtifactBrowser />
            {readyTracks.length === 2 ? (
              <ArrangementPlanPanel
                artifactStore={artifactStore}
                mashIntent={mashIntent}
                onIntentChange={setMashIntent}
                onNavigateToScreen={setActiveScreen}
              />
            ) : null}
            <ExportPrepPanel artifactStore={artifactStore} mashIntent={mashIntent} />
          </section>
        );
      case "rights":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Legal and product doctrine"
              icon={ShieldCheck}
              title="Private Tool, User-Supplied Audio"
              subtitle="The MVP avoids copyrighted-song catalogs, streaming imports, downloaders, public sharing, and training use of uploads."
            />
            <div className="rights-panel">
              <blockquote>{requiredRightsNotice}</blockquote>
              <ul>
                {legalDoctrineBullets.map((bullet) => (
                  <li key={bullet}>
                    <CheckCircle2 aria-hidden="true" size={18} />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      default:
        return null;
    }
  }
}

interface ScreenTitleProps {
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

function ScreenTitle({ eyebrow, icon: Icon, title, subtitle }: ScreenTitleProps) {
  return (
    <div className="screen-title">
      <div className="title-icon">
        <Icon aria-hidden="true" size={22} />
      </div>
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

interface TrackUploadSlotProps {
  error: string | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  slotId: SlotId;
  track: TrackState | null;
}

function TrackUploadSlot({ error, onChange, onClear, slotId, track }: TrackUploadSlotProps) {
  const inputId = `${slotId}-input`;

  return (
    <article className="track-slot">
      <div className="track-slot-header">
        <div>
          <p className="eyebrow">{trackLabels[slotId]}</p>
          <h3>{track?.file.name ?? "Choose local audio"}</h3>
        </div>
        {track ? (
          <button className="icon-button" onClick={onClear} title="Clear track" type="button">
            <RefreshCw aria-hidden="true" size={17} />
          </button>
        ) : null}
      </div>

      <label className={`drop-target ${track ? "has-file" : ""}`} htmlFor={inputId}>
        <input
          accept="audio/*,.aif,.aiff,.flac,.m4a,.mp3,.ogg,.wav"
          id={inputId}
          onChange={onChange}
          type="file"
        />
        <UploadCloud aria-hidden="true" size={24} />
        <span>{track ? "Replace local audio" : "Choose local audio"}</span>
        <small>WAV, MP3, FLAC, AIFF, M4A, or OGG</small>
      </label>

      {error ? <p className="error-text">{error}</p> : null}

      {track ? (
        <div className="track-details">
          <div className="track-status-row">
            <StatusText>{track.status === "loading" ? "Inspecting locally" : "Local metadata"}</StatusText>
            <span>{formatFileSize(track.file.size)}</span>
          </div>

          <WaveformCanvas peaks={track.inspection?.waveformPeaks ?? []} status={track.status} />

          <div className="metadata-list">
            <MetadataItem
              label="Duration"
              value={formatDuration(track.inspection?.durationSeconds ?? null)}
            />
            <MetadataItem
              label="Sample rate"
              value={track.inspection?.sampleRate ? `${track.inspection.sampleRate.toLocaleString()} Hz` : "Pending"}
            />
            <MetadataItem
              label="Channels"
              value={track.inspection?.channelCount ? String(track.inspection.channelCount) : "Pending"}
            />
            <MetadataItem label="Type" value={(track.inspection?.fileType ?? track.file.type) || "audio/unknown"} />
          </div>

          <audio controls preload="metadata" src={track.objectUrl}>
            <track kind="captions" />
          </audio>

          {track.error ? <p className="error-text">{track.error}</p> : null}
          {track.inspection?.notes.map((note) => (
            <p className="note-text" key={note}>
              {note}
            </p>
          ))}
        </div>
      ) : (
        <div className="empty-slot">
          <Radio aria-hidden="true" size={18} />
          <span>No file loaded.</span>
        </div>
      )}
    </article>
  );
}

interface WaveformCanvasProps {
  peaks: number[];
  status: TrackState["status"];
}

function WaveformCanvas({ peaks, status }: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(320, Math.floor(rect.width));
      const height = 118;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;

      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      context.scale(pixelRatio, pixelRatio);
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#10141d";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "#273044";
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.stroke();

      if (peaks.length === 0) {
        context.fillStyle = "#3a4255";
        context.font = "14px Inter, system-ui, sans-serif";
        context.fillText(status === "loading" ? "Inspecting waveform..." : "Waveform pending", 18, 64);
        return;
      }

      const barWidth = Math.max(2, width / peaks.length);
      peaks.forEach((peak, index) => {
        const barHeight = Math.max(2, peak * (height - 24));
        const x = index * barWidth;
        const y = (height - barHeight) / 2;
        const gradient = context.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, "#2ee6a6");
        gradient.addColorStop(0.5, "#7aa7ff");
        gradient.addColorStop(1, "#ffb84d");
        context.fillStyle = gradient;
        context.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
      });
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [peaks, status]);

  return <canvas className="waveform-canvas" ref={canvasRef} />;
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="metadata-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

interface StatusTextProps {
  children: string;
}

function StatusText({ children }: StatusTextProps) {
  return <span className="status-text">{children}</span>;
}

function StatusPill({ capability }: { capability: EngineCapability }) {
  return (
    <span className={`status-pill status-${capability.status}`}>
      {capability.status === "implemented" ? "Implemented" : capability.status.replace(/-/g, " ")}
    </span>
  );
}

function NoticeStrip({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="notice-strip">
      <Icon aria-hidden="true" size={20} />
      <p>{text}</p>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="stat-tile">
      <Icon aria-hidden="true" size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CapabilityCard({ capability }: { capability: EngineCapability }) {
  return (
    <article className="capability-card">
      <div className="capability-header">
        <Cpu aria-hidden="true" size={19} />
        <StatusPill capability={capability} />
      </div>
      <h3>{capability.name}</h3>
      <p>{capability.target}</p>
      <small>{capability.adapterPlan}</small>
    </article>
  );
}

function TrackMetadataTable({ tracks }: { tracks: TrackState[] }) {
  if (tracks.length === 0) {
    return (
      <div className="empty-analysis">
        <AlertTriangle aria-hidden="true" size={20} />
        <span>Upload audio on the Upload screen to populate local metadata.</span>
      </div>
    );
  }

  return (
    <div className="metadata-table" role="table" aria-label="Loaded track metadata">
      <div className="metadata-row metadata-row-head" role="row">
        <span role="columnheader">Track</span>
        <span role="columnheader">Duration</span>
        <span role="columnheader">Sample rate</span>
        <span role="columnheader">Channels</span>
        <span role="columnheader">Format</span>
      </div>
      {tracks.map((track) => (
        <div className="metadata-row" key={track.objectUrl} role="row">
          <span role="cell">{track.file.name}</span>
          <span role="cell">{formatDuration(track.inspection?.durationSeconds ?? null)}</span>
          <span role="cell">
            {track.inspection?.sampleRate ? `${track.inspection.sampleRate.toLocaleString()} Hz` : "Unknown"}
          </span>
          <span role="cell">{track.inspection?.channelCount ?? "Unknown"}</span>
          <span role="cell">{track.inspection?.fileType ?? "audio/unknown"}</span>
        </div>
      ))}
    </div>
  );
}

function totalDurationLabel(tracks: TrackState[]) {
  const seconds = tracks.reduce((sum, track) => sum + (track.inspection?.durationSeconds ?? 0), 0);
  return tracks.length > 0 ? formatDuration(seconds) : "No files";
}

function planningBpmLabel(artifactStore: SessionArtifactStore): string {
  const bpmA = resolvePlanningBpm(artifactStore.tracks.trackA);
  const bpmB = resolvePlanningBpm(artifactStore.tracks.trackB);

  if (bpmA.value !== null && bpmB.value !== null) {
    return `${bpmA.value} / ${bpmB.value} BPM`;
  }

  if (bpmA.value !== null || bpmB.value !== null) {
    return `${bpmA.value ?? "—"} / ${bpmB.value ?? "—"} BPM`;
  }

  if (artifactStore.tracks.trackA || artifactStore.tracks.trackB) {
    return "Analysis in progress";
  }

  return "Pending analysis";
}

export default App;

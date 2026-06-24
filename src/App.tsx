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
  TimerReset,
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
  draftTemplates,
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
import { TrackAnalysisPanel } from "./components/TrackAnalysisPanel";
import { LocalEngineStatus } from "./components/LocalEngineStatus";

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
  const [activeScreen, setActiveScreen] = useState<ScreenId>("intro");
  const [tracks, setTracks] = useState<TrackMap>(emptyTracks);
  const [slotErrors, setSlotErrors] = useState<SlotErrorMap>(emptySlotErrors);
  const tracksRef = useRef(tracks);

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

        return {
          ...current,
          [slotId]: {
            ...activeTrack,
            inspection,
            status: "ready",
            error: null,
          },
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
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Waves aria-hidden="true" size={26} />
          </div>
          <div>
            <p className="eyebrow">Project MashLab AI / CyphaBlend AI</p>
            <h1>Two songs in. A DJ-ready mashup out.</h1>
          </div>
        </div>
        <div className="privacy-badge">
          <ShieldCheck aria-hidden="true" size={18} />
          <span>Local-first MVP</span>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="sidebar" aria-label="MVP screens">
          <div className="sidebar-header">
            <span>Workflow</span>
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
          <div className="legal-mini">
            <ShieldCheck aria-hidden="true" size={18} />
            <p>{requiredRightsNotice}</p>
          </div>
        </aside>

        <main className="main-stage">{renderScreen()}</main>
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
                This MVP foundation accepts two user-supplied audio files, reads safe local
                metadata, and maps the future engines for stems, beat grids, key matching,
                arrangement drafts, and DJ-safe export.
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
            </div>

            <div className="studio-visual" aria-label="Audio workflow signal preview">
              <div className="meter-header">
                <span>Mash Engine Map</span>
                <span>Prototype</span>
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
              eyebrow="Phase 2 prototype"
              icon={UploadCloud}
              title="Upload Two Local Tracks"
              subtitle="Files are inspected in this browser. No downloader, streaming import, or remote training path exists in this MVP."
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
              eyebrow="Analysis dashboard"
              icon={Activity}
              title="Local Metadata Now, MIR Engines Next"
              subtitle="Duration, sample rate, channels, file size, and waveform summary are real when browser decoding succeeds. BPM, key, downbeat, and phrase structure remain pending."
            />
            <div className="stats-grid">
              <StatTile icon={FileAudio2} label="Loaded files" value={`${loadedTracks.length}/2`} />
              <StatTile icon={Clock3} label="Total duration" value={totalDurationLabel(readyTracks)} />
              <StatTile icon={Gauge} label="BPM / beat grid" value="Analysis coming next" />
              <StatTile icon={KeyRound} label="Key match" value="Engine pending" />
            </div>
            <div className="capability-grid">
              {engineCapabilities.slice(1, 3).map((capability) => (
                <CapabilityCard capability={capability} key={capability.id} />
              ))}
            </div>
            <TrackMetadataTable tracks={readyTracks} />
            {readyTracks.length > 0 ? (
              <div className="analysis-track-grid">
                {readyTracks.map((track) => (
                  <TrackAnalysisPanel key={track.objectUrl} sessionId={sessionIdRef.current} track={track} />
                ))}
              </div>
            ) : null}
          </section>
        );
      case "stems":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Stem separation"
              icon={Layers3}
              title="Separation Queue Placeholder"
              subtitle="The adapter lane is planned for Demucs / HTDemucs first, with MDX-Net and UVR-style options later."
            />
            <div className="stem-board">
              {["Vocals", "Drums", "Bass", "Other"].map((stem, index) => (
                <div className="stem-lane" key={stem}>
                  <div className="stem-icon">
                    <Scissors aria-hidden="true" size={18} />
                  </div>
                  <h3>{stem}</h3>
                  <p>Engine pending</p>
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
              eyebrow="Mashup generation"
              icon={Sparkles}
              title="Draft Slots for Future Arrangement Intelligence"
              subtitle="Draft cards describe target behaviors only. No AI mashup has been generated in this MVP."
            />
            <div className="draft-grid">
              {draftTemplates.map((draft) => (
                <div className="draft-card" key={draft.name}>
                  <div className="draft-header">
                    <Sparkles aria-hidden="true" size={18} />
                    <StatusText>Engine pending</StatusText>
                  </div>
                  <h3>{draft.name}</h3>
                  <p>{draft.description}</p>
                  <button className="disabled-action" disabled type="button">
                    Generate draft after engine integration
                  </button>
                </div>
              ))}
            </div>
            <CapabilityCard capability={engineCapabilities[5]} />
          </section>
        );
      case "timeline":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Arrangement preview"
              icon={SlidersHorizontal}
              title="Phrase Timeline Placeholder"
              subtitle="The future timeline will expose bar-aligned edits, stems, vocal timing, energy curves, intro length, and outro length."
            />
            <TimelinePreview tracks={loadedTracks} />
            <div className="control-grid">
              {["Tempo", "Key", "Vocal level", "Timing", "Reverb", "Tone", "Energy", "Intro/outro"].map(
                (control) => (
                  <div className="control-placeholder" key={control}>
                    <span>{control}</span>
                    <strong>Control pending</strong>
                  </div>
                )
              )}
            </div>
          </section>
        );
      case "export":
        return (
          <section className="screen">
            <ScreenTitle
              eyebrow="Export panel"
              icon={Download}
              title="DJ-Safe Export Targets"
              subtitle="Export stays locked until real rendering, loudness, and true peak checks are implemented."
            />
            <div className="export-grid">
              {[
                ["WAV master", "Primary professional export path"],
                ["MP3 reference", "Optional compressed review render"],
                ["Stem package", "Future separated-stem delivery"],
              ].map(([name, description]) => (
                <div className="export-option" key={name}>
                  <Download aria-hidden="true" size={18} />
                  <div>
                    <h3>{name}</h3>
                    <p>{description}</p>
                  </div>
                  <StatusText>Engine pending</StatusText>
                </div>
              ))}
            </div>
            <NoticeStrip icon={AlertTriangle} text={requiredRightsNotice} />
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

function TimelinePreview({ tracks }: { tracks: TrackState[] }) {
  return (
    <div className="timeline-preview">
      <div className="timeline-ruler" aria-hidden="true">
        {["1", "9", "17", "25", "33", "41", "49", "57"].map((bar) => (
          <span key={bar}>Bar {bar}</span>
        ))}
      </div>
      {["trackA", "trackB"].map((slot, index) => {
        const track = tracks.find((candidate) => candidate.slotId === slot);

        return (
          <div className="timeline-row" key={slot}>
            <div className="timeline-label">{track?.label ?? trackLabels[slot as SlotId]}</div>
            <div className="timeline-lane">
              <div
                className={`timeline-region region-${index + 1}`}
                style={{ width: track ? `${index === 0 ? 78 : 64}%` : "36%" }}
              >
                {track?.file.name ?? "Awaiting local file"}
              </div>
            </div>
          </div>
        );
      })}
      <div className="timeline-note">
        <TimerReset aria-hidden="true" size={18} />
        <span>Beat grid, downbeat, phrase markers, and alignment edits are engine pending.</span>
      </div>
    </div>
  );
}

function totalDurationLabel(tracks: TrackState[]) {
  const seconds = tracks.reduce((sum, track) => sum + (track.inspection?.durationSeconds ?? 0), 0);
  return tracks.length > 0 ? formatDuration(seconds) : "No files";
}

export default App;

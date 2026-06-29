import { AlertTriangle, FolderOpen, LoaderCircle, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ArtifactMetadataResult, PreviewArtifactSummary } from "../domain/previewArtifacts.ts";
import { PREVIEW_ARTIFACT_LABEL } from "../domain/previewArtifacts.ts";
import { artifactDeletionScopeNotice, formatArtifactLifecycleSummary } from "../domain/artifactLifecycle.ts";
import {
  artifactClearFailureMessage,
  artifactDeleteFailureMessage,
} from "../domain/userFacingErrors.ts";
import { formatArtifactTypeLabel, isMasterArtifact } from "../domain/masteringPresets.ts";
import { formatPackageArtifactLabel, isPackageArtifact } from "../domain/projectPackage.ts";
import { isMp3ExportArtifact } from "../domain/mp3Export.ts";
import { localEngineClient } from "../lib/localEngine/client.ts";
import {
  clearPreviewArtifactRegistry,
  loadPreviewArtifactRegistry,
  removePreviewArtifactRegistryEntry,
} from "../lib/previewArtifactRegistry.ts";
import { notifyArtifactRefresh, subscribeArtifactRefresh } from "../lib/artifactRefresh.ts";
import { useLocalEngineStatus } from "../hooks/useLocalEngineStatus.ts";

interface PreviewArtifactBrowserProps {
  onRegistryChange?: () => void;
}

export function PreviewArtifactBrowser({ onRegistryChange }: PreviewArtifactBrowserProps) {
  const { status: localStatus } = useLocalEngineStatus();
  const [artifacts, setArtifacts] = useState<PreviewArtifactSummary[]>([]);
  const [metadataById, setMetadataById] = useState<Record<string, ArtifactMetadataResult | null>>({});
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!localStatus.online) {
      setArtifacts([]);
      setMessage("Local sidecar offline. Preview artifacts remain on disk but cannot be listed.");
      setErrorMessage(null);
      return;
    }

    setLoading(true);
    const registry = loadPreviewArtifactRegistry();
    const listed = await localEngineClient.listArtifacts(registry);
    setArtifacts(listed);
    setLoading(false);
    setMessage(listed.length === 0 ? "No local preview artifacts found yet." : null);
  }, [localStatus.online]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => subscribeArtifactRefresh(() => void refresh()), [refresh]);

  async function handleInspect(artifactId: string) {
    setBusyId(artifactId);
    const metadata = await localEngineClient.getArtifactMetadata(artifactId);
    setMetadataById((current) => ({ ...current, [artifactId]: metadata }));
    setBusyId(null);
  }

  async function handleDelete(artifactId: string) {
    setBusyId(artifactId);
    setErrorMessage(null);
    const artifact = artifacts.find((item) => item.artifactId === artifactId);
    const result = await localEngineClient.deleteArtifact(artifactId);
    if (result?.ok) {
      removePreviewArtifactRegistryEntry(artifactId);
      onRegistryChange?.();
      setMessage(
        formatArtifactLifecycleSummary({
          artifactType: artifact?.artifactType ?? "artifact",
          artifactId,
          action: "delete",
        })
      );
    } else {
      setErrorMessage(
        artifactDeleteFailureMessage(result?.status ?? "processing_failed", result?.message)
      );
    }
    setBusyId(null);
    notifyArtifactRefresh();
    await refresh();
  }

  async function handleClearAll() {
    setBusyId("clear-all");
    setErrorMessage(null);
    const result = await localEngineClient.clearPreviewArtifacts();
    if (result?.ok) {
      clearPreviewArtifactRegistry();
      onRegistryChange?.();
      setMessage(artifactClearFailureMessage(result.deletedCount ?? 0, []));
    } else {
      setErrorMessage(
        artifactDeleteFailureMessage(result?.status ?? "processing_failed", result?.message)
      );
    }
    setMetadataById({});
    setBusyId(null);
    notifyArtifactRefresh();
    await refresh();
  }

  return (
    <section className="preview-artifact-browser" aria-label="Preview artifact browser">
      <div className="preview-artifact-browser-header">
        <FolderOpen aria-hidden="true" size={20} />
        <div>
          <h3>Preview Artifact Browser</h3>
          <p>{PREVIEW_ARTIFACT_LABEL}</p>
        </div>
        <button className="preview-artifact-refresh" disabled={loading} onClick={() => void refresh()} type="button">
          <RefreshCw aria-hidden="true" size={16} />
          Refresh
        </button>
      </div>

      <div className="preview-artifact-actions">
        <button
          className="preview-artifact-clear-all"
          disabled={!localStatus.online || artifacts.length === 0 || busyId !== null}
          onClick={() => void handleClearAll()}
          type="button"
        >
          <Trash2 aria-hidden="true" size={16} />
          Clear all session artifacts (previews and exports)
        </button>
      </div>

      <p className="preview-artifact-scope-note">{artifactDeletionScopeNotice()}</p>

      {message ? <p className="preview-artifact-message">{message}</p> : null}
      {errorMessage ? (
        <p className="preview-artifact-error" role="alert">
          <AlertTriangle aria-hidden="true" size={16} />
          {errorMessage}
        </p>
      ) : null}

      {loading ? (
        <p className="preview-artifact-loading">
          <LoaderCircle aria-hidden="true" className="spin-icon" size={18} />
          Loading local preview artifacts…
        </p>
      ) : null}

      <div className="preview-artifact-grid">
        {artifacts.map((artifact) => {
          const metadata = metadataById[artifact.artifactId] ?? null;
          const isBusy = busyId === artifact.artifactId;

          return (
            <article className="preview-artifact-card" key={`${artifact.artifactType}-${artifact.artifactId}`}>
              <div className="preview-artifact-card-header">
                <strong>
                  {isPackageArtifact(artifact)
                    ? formatPackageArtifactLabel(artifact)
                    : (artifact.registryLabel ?? artifact.artifactType)}
                </strong>
                <span className="preview-artifact-type">{formatArtifactTypeLabel(artifact)}</span>
              </div>

              <dl className="preview-artifact-meta">
                <div>
                  <dt>Artifact ID</dt>
                  <dd>{artifact.artifactId}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{artifact.status}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatTimestamp(artifact.createdAt)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{artifact.durationSeconds !== null ? `${artifact.durationSeconds.toFixed(1)}s` : "—"}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{artifact.sourceTrackLabel ?? "—"}</dd>
                </div>
                <div>
                  <dt>Target</dt>
                  <dd>{artifact.targetTrackLabel ?? "—"}</dd>
                </div>
                {artifact.sourceCombinedPreviewArtifactId ? (
                  <div>
                    <dt>Source combined preview</dt>
                    <dd>{artifact.sourceCombinedPreviewArtifactId}</dd>
                  </div>
                ) : null}
                {artifact.sourceVocalStemArtifactId ? (
                  <div>
                    <dt>Vocal stem</dt>
                    <dd>{artifact.sourceVocalStemArtifactId}</dd>
                  </div>
                ) : null}
                {artifact.targetInstrumentalStemArtifactId ? (
                  <div>
                    <dt>Instrumental stem</dt>
                    <dd>{artifact.targetInstrumentalStemArtifactId}</dd>
                  </div>
                ) : null}
                {artifact.sourceWavExportArtifactId ? (
                  <div>
                    <dt>Source WAV export</dt>
                    <dd>{artifact.sourceWavExportArtifactId}</dd>
                  </div>
                ) : null}
                {artifact.masterPreset ? (
                  <div>
                    <dt>Mastering preset</dt>
                    <dd>{artifact.masterPreset}</dd>
                  </div>
                ) : null}
                {artifact.mixSummary ? (
                  <div>
                    <dt>Mix settings</dt>
                    <dd>{artifact.mixSummary}</dd>
                  </div>
                ) : null}
                {artifact.packageSubtype ? (
                  <div>
                    <dt>Package type</dt>
                    <dd>{artifact.packageSubtype}</dd>
                  </div>
                ) : null}
                {artifact.includedFileCount !== null ? (
                  <div>
                    <dt>Included files</dt>
                    <dd>{artifact.includedFileCount}</dd>
                  </div>
                ) : null}
                {artifact.selectedArtifactIds && artifact.selectedArtifactIds.length > 0 ? (
                  <div>
                    <dt>Source artifacts</dt>
                    <dd>{artifact.selectedArtifactIds.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>

              <p
                className={`preview-artifact-label ${
                  artifact.artifactType === "export" ||
                  artifact.artifactType === "master" ||
                  isPackageArtifact(artifact)
                    ? "preview-artifact-label-export"
                    : ""
                }`}
              >
                {artifact.previewLabel}
              </p>

              {artifact.playbackUrl ? (
                <>
                  {artifact.artifactType === "export" ? (
                    <>
                      <audio controls preload="none" src={artifact.playbackUrl} />
                      <a className="preview-artifact-download" download href={artifact.playbackUrl}>
                        {isMp3ExportArtifact(artifact)
                          ? "Download local MP3 reference"
                          : "Download local export WAV"}
                      </a>
                    </>
                  ) : artifact.artifactType === "master" ? (
                    <>
                      <audio controls preload="none" src={artifact.playbackUrl} />
                      <a className="preview-artifact-download" download href={artifact.playbackUrl}>
                        Download local master WAV
                      </a>
                    </>
                  ) : isPackageArtifact(artifact) ? (
                    <a className="preview-artifact-download" download href={artifact.playbackUrl}>
                      Download local package ZIP
                    </a>
                  ) : (
                    <audio controls preload="none" src={artifact.playbackUrl} />
                  )}
                </>
              ) : isMasterArtifact(artifact) ? (
                <p className="preview-artifact-no-playback">Measurement-only — no master audio file.</p>
              ) : isPackageArtifact(artifact) ? (
                <p className="preview-artifact-no-playback">
                  Folder package — open local folder on disk. Not public sharing.
                </p>
              ) : (
                <p className="preview-artifact-no-playback">Playback unavailable.</p>
              )}

              {artifact.artifactType === "stem" && artifact.playbackUrls.noVocals ? (
                <div className="preview-artifact-secondary-playback">
                  <p>Instrumental stem preview</p>
                  <audio controls preload="none" src={artifact.playbackUrls.noVocals} />
                </div>
              ) : null}

              <div className="preview-artifact-card-actions">
                <button disabled={isBusy} onClick={() => void handleInspect(artifact.artifactId)} type="button">
                  Technical readout
                </button>
                <button disabled={isBusy} onClick={() => void handleDelete(artifact.artifactId)} type="button">
                  Delete artifact
                </button>
              </div>

              {metadata ? (
                <div className="preview-artifact-technical">
                  {metadata.ok && metadata.technical ? (
                    <>
                      <p>
                        {metadata.technical.codec ?? "unknown codec"} ·{" "}
                        {metadata.technical.sampleRate ?? "—"} Hz · {metadata.technical.channelCount ?? "—"} ch ·{" "}
                        {formatFileSize(metadata.technical.fileSizeBytes)}
                      </p>
                      <p>
                        Loudness ({metadata.technical.loudness.status}):{" "}
                        {metadata.technical.loudness.integratedLufs !== null
                          ? `${metadata.technical.loudness.integratedLufs.toFixed(1)} LUFS`
                          : "not available"}
                        {" · "}
                        True peak:{" "}
                        {metadata.technical.loudness.truePeakDbtp !== null
                          ? `${metadata.technical.loudness.truePeakDbtp.toFixed(1)} dBTP`
                          : "not available"}
                      </p>
                      <p className="preview-artifact-loudness-note">{metadata.technical.loudness.message}</p>
                    </>
                  ) : (
                    <p>{metadata.message}</p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {!localStatus.online ? (
        <div className="planning-warning">
          <AlertTriangle aria-hidden="true" size={18} />
          <span>Start the local sidecar to list, inspect, and delete preview artifacts.</span>
        </div>
      ) : null}
    </section>
  );
}

function formatTimestamp(value: string): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(1)} KB`;
}

import type { MashIntent } from "../domain/pitchTimePlanning.ts";
import type { SessionArtifactStore } from "../domain/sessionArtifacts.ts";
import type { TrackDjOverrides } from "../domain/trackOverrides.ts";
import type { SlotId } from "../domain/types.ts";

const STORAGE_KEY = "mashlab-session-planning-v1";

export interface PersistedTrackSnapshot {
  fileIdentity: {
    name: string;
    sizeBytes: number;
    lastModified: number;
  };
  inspectionId: string | null;
  overrides: TrackDjOverrides;
  beatBpm: number | null;
  keySummary: {
    key: string | null;
    mode: "major" | "minor" | "unknown";
    camelot: string | null;
  } | null;
}

export interface PersistedSessionSnapshot {
  version: number;
  sessionId: string;
  mashIntent: MashIntent;
  tracks: Record<SlotId, PersistedTrackSnapshot | null>;
}

export function serializeSessionSnapshot(params: {
  store: SessionArtifactStore;
  mashIntent: MashIntent;
}): PersistedSessionSnapshot {
  return {
    version: 1,
    sessionId: params.store.sessionId,
    mashIntent: params.mashIntent,
    tracks: {
      trackA: serializeTrackSnapshot(params.store.tracks.trackA),
      trackB: serializeTrackSnapshot(params.store.tracks.trackB),
    },
  };
}

export function saveSessionSnapshot(snapshot: PersistedSessionSnapshot): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota or privacy mode failures — in-memory planning still works.
  }
}

export function loadSessionSnapshot(): PersistedSessionSnapshot | null {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedSessionSnapshot;
    if (parsed.version !== 1 || typeof parsed.sessionId !== "string") {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionSnapshot(): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(STORAGE_KEY);
}

export function applyPersistedOverrides(
  store: SessionArtifactStore,
  snapshot: PersistedSessionSnapshot
): SessionArtifactStore {
  if (snapshot.sessionId !== store.sessionId) {
    return store;
  }

  const nextTracks = { ...store.tracks };

  for (const slotId of ["trackA", "trackB"] as SlotId[]) {
    const artifact = store.tracks[slotId];
    const persisted = snapshot.tracks[slotId];
    if (!artifact || !persisted) {
      continue;
    }

    const identityMatches =
      artifact.fileIdentity.name === persisted.fileIdentity.name &&
      artifact.fileIdentity.sizeBytes === persisted.fileIdentity.sizeBytes &&
      artifact.fileIdentity.lastModified === persisted.fileIdentity.lastModified;

    if (!identityMatches) {
      continue;
    }

    nextTracks[slotId] = {
      ...artifact,
      overrides: persisted.overrides,
    };
  }

  return {
    ...store,
    tracks: nextTracks,
  };
}

function serializeTrackSnapshot(
  artifact: SessionArtifactStore["tracks"][SlotId]
): PersistedTrackSnapshot | null {
  if (!artifact) {
    return null;
  }

  return {
    fileIdentity: artifact.fileIdentity,
    inspectionId: artifact.inspectionId,
    overrides: artifact.overrides,
    beatBpm: artifact.beatAnalysis?.bpm ?? artifact.overrides.bpm ?? null,
    keySummary: artifact.effectiveKeyProfile
      ? {
          key: artifact.effectiveKeyProfile.key,
          mode: artifact.effectiveKeyProfile.mode,
          camelot: artifact.effectiveKeyProfile.camelot,
        }
      : null,
  };
}

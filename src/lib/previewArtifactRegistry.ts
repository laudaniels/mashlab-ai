import type { PreviewArtifactRegistryEntry } from "../domain/previewArtifacts.ts";

const REGISTRY_KEY = "mashlab-preview-artifacts-v1";

export function loadPreviewArtifactRegistry(): PreviewArtifactRegistryEntry[] {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(REGISTRY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as PreviewArtifactRegistryEntry[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry) => typeof entry?.artifactId === "string");
  } catch {
    return [];
  }
}

export function savePreviewArtifactRegistry(entries: PreviewArtifactRegistryEntry[]): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  try {
    window.sessionStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota failures.
  }
}

export function upsertPreviewArtifactRegistryEntry(
  entry: PreviewArtifactRegistryEntry
): PreviewArtifactRegistryEntry[] {
  const current = loadPreviewArtifactRegistry().filter((item) => item.artifactId !== entry.artifactId);
  const next = [entry, ...current];
  savePreviewArtifactRegistry(next);
  return next;
}

export function removePreviewArtifactRegistryEntry(artifactId: string): PreviewArtifactRegistryEntry[] {
  const next = loadPreviewArtifactRegistry().filter((item) => item.artifactId !== artifactId);
  savePreviewArtifactRegistry(next);
  return next;
}

export function clearPreviewArtifactRegistry(): void {
  if (typeof window === "undefined" || !window.sessionStorage) {
    return;
  }

  window.sessionStorage.removeItem(REGISTRY_KEY);
}

export function findRegistryEntry(
  artifactId: string,
  registry: PreviewArtifactRegistryEntry[]
): PreviewArtifactRegistryEntry | null {
  return registry.find((entry) => entry.artifactId === artifactId) ?? null;
}

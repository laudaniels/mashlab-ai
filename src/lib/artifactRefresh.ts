type ArtifactRefreshListener = () => void;

const listeners = new Set<ArtifactRefreshListener>();

export function subscribeArtifactRefresh(listener: ArtifactRefreshListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyArtifactRefresh(): void {
  for (const listener of listeners) {
    listener();
  }
}

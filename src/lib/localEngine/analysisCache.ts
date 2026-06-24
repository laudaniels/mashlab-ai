function buildFileCacheKey(file: File, inspectionId?: string): string {
  return `${inspectionId ?? "direct"}:${file.name}:${file.size}:${file.lastModified}`;
}

const beatCache = new Map<string, Promise<unknown>>();
const keyCache = new Map<string, Promise<unknown>>();

export function getCachedBeatAnalysis<T>(file: File, inspectionId?: string): Promise<T> | undefined {
  return beatCache.get(buildFileCacheKey(file, inspectionId)) as Promise<T> | undefined;
}

export function setCachedBeatAnalysis<T>(
  file: File,
  promise: Promise<T>,
  inspectionId?: string
): Promise<T> {
  const key = buildFileCacheKey(file, inspectionId);
  beatCache.set(key, promise);
  return promise;
}

export function getCachedKeyAnalysis<T>(file: File, inspectionId?: string): Promise<T> | undefined {
  return keyCache.get(buildFileCacheKey(file, inspectionId)) as Promise<T> | undefined;
}

export function setCachedKeyAnalysis<T>(
  file: File,
  promise: Promise<T>,
  inspectionId?: string
): Promise<T> {
  const key = buildFileCacheKey(file, inspectionId);
  keyCache.set(key, promise);
  return promise;
}

export function clearAnalysisCache(): void {
  beatCache.clear();
  keyCache.clear();
}

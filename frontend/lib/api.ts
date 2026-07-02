import type {
  AlignResult,
  JobResponse,
  PlanPreviewResponse,
  RemixRequestBody,
  Role,
  TrackStatus,
  UploadAck,
} from "./types";

// Default to 127.0.0.1 (not "localhost") on purpose: on Windows, "localhost"
// often resolves to IPv6 ::1 first while the backend binds IPv4 127.0.0.1,
// which causes intermittent "Failed to fetch" connection errors.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE}${path}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class NotFoundError extends Error {}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function uploadTrack(
  file: File,
  role: Role,
  skipSeparation = false
): Promise<UploadAck> {
  const buildForm = () => {
    const form = new FormData();
    form.append("file", file);
    form.append("role", role);
    form.append("skip_separation", skipSeparation ? "true" : "false");
    return form;
  };

  // One transient-failure retry: uploads are large and a single dropped
  // connection shouldn't fail the whole flow.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/api/upload`,
        { method: "POST", body: buildForm() },
        180000
      );
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Upload failed (${res.status}): ${detail}`);
      }
      return res.json();
    } catch (e) {
      lastErr = e;
      // Only retry on network-level errors, not HTTP error responses.
      if (e instanceof Error && e.message.startsWith("Upload failed")) throw e;
      await sleep(1000);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Upload failed: network error");
}

export async function getTrack(trackId: string): Promise<TrackStatus> {
  const res = await fetchWithTimeout(`${API_BASE}/api/track/${trackId}`, {}, 15000);
  if (res.status === 404) {
    throw new NotFoundError("track not found");
  }
  if (!res.ok) throw new Error(`Track poll failed (${res.status})`);
  return res.json();
}

/**
 * Poll a track to completion, tolerating transient network failures. A single
 * dropped request no longer fails the whole flow — we only give up after many
 * consecutive failures (server truly gone) or the overall timeout.
 */
export async function pollTrack(
  trackId: string,
  onStage?: (stage: string | undefined) => void,
  { intervalMs = 1500, timeoutMs = 900000, maxConsecutiveErrors = 10 } = {}
): Promise<TrackStatus> {
  const start = Date.now();
  let consecutiveErrors = 0;
  while (true) {
    try {
      const t = await getTrack(trackId);
      consecutiveErrors = 0;
      onStage?.(t.stage);
      if (t.status === "done" || t.status === "error") return t;
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new Error(
          "This track is no longer on the server (it may have restarted). Please re-upload the song."
        );
      }
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw new Error(
          "Lost connection to the server while processing. Is the backend still running on port 8000?"
        );
      }
      // transient blip — keep polling
    }
    if (Date.now() - start > timeoutMs) throw new Error("Processing timed out");
    await sleep(intervalMs);
  }
}

export async function startRemix(body: RemixRequestBody): Promise<JobResponse> {
  const res = await fetchWithTimeout(
    `${API_BASE}/api/remix`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    30000
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Remix failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function getPlanPreview(
  acapellaId: string,
  instrumentalId: string
): Promise<PlanPreviewResponse> {
  const params = new URLSearchParams({ acapellaId, instrumentalId });
  const res = await fetchWithTimeout(`${API_BASE}/api/plan?${params}`, {}, 120000);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Plan preview failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function alignTracks(
  acapellaId: string,
  instrumentalId: string
): Promise<AlignResult> {
  const res = await fetchWithTimeout(
    `${API_BASE}/api/align`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acapellaId, instrumentalId }),
    },
    120000
  );
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Auto-align failed (${res.status}): ${detail}`);
  }
  return res.json();
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const res = await fetchWithTimeout(`${API_BASE}/api/remix/${jobId}`, {}, 15000);
  if (res.status === 404) throw new NotFoundError("job not found");
  if (!res.ok) throw new Error(`Job poll failed (${res.status})`);
  return res.json();
}

export async function pollJob(
  jobId: string,
  { intervalMs = 1200, timeoutMs = 600000, maxConsecutiveErrors = 10 } = {}
): Promise<JobResponse> {
  const start = Date.now();
  let consecutiveErrors = 0;
  while (true) {
    try {
      const job = await getJob(jobId);
      consecutiveErrors = 0;
      if (job.status === "done" || job.status === "error") return job;
    } catch (e) {
      if (e instanceof NotFoundError) {
        throw new Error(
          "The remix job is no longer on the server (it may have restarted). Please try again."
        );
      }
      consecutiveErrors += 1;
      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw new Error(
          "Lost connection to the server while rendering. Is the backend still running on port 8000?"
        );
      }
    }
    if (Date.now() - start > timeoutMs) throw new Error("Remix timed out");
    await sleep(intervalMs);
  }
}

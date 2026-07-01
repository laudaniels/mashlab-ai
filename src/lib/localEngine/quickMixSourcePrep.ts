import { DEFAULT_LOCAL_ENGINE_URL, createLocalEngineAbortSignal } from "./types.ts";
import type { QuickMixPreparedSource } from "../../domain/quickMixSourcePrep.ts";
import { QUICK_MIX_DURATION_CAP_SECONDS } from "../../domain/quickMix.ts";

const QUICK_MIX_PREP_TIMEOUT_MS = 10 * 60 * 1000;

function parseHeaderNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function prepareQuickMixSourceFile(
  file: File,
  options?: {
    maxSeconds?: number;
    startOffsetSeconds?: number;
    baseUrl?: string;
  }
): Promise<QuickMixPreparedSource> {
  const maxSeconds = options?.maxSeconds ?? QUICK_MIX_DURATION_CAP_SECONDS;
  const startOffsetSeconds = options?.startOffsetSeconds ?? 0;
  const baseUrl = options?.baseUrl ?? DEFAULT_LOCAL_ENGINE_URL;

  const formData = new FormData();
  formData.append("file", file);
  formData.append("max_seconds", String(maxSeconds));
  formData.append("start_offset_seconds", String(startOffsetSeconds));

  const response = await fetch(`${baseUrl}/v1/process/quick-mix-source-prep`, {
    method: "POST",
    body: formData,
    signal: createLocalEngineAbortSignal(QUICK_MIX_PREP_TIMEOUT_MS),
  });

  if (!response.ok) {
    let message = "Quick Mix could not prepare this source clip.";
    try {
      const payload = (await response.json()) as {
        message?: string;
        setup_guidance?: string;
        validation_errors?: string[];
      };
      const parts = [
        payload.message,
        ...(payload.validation_errors ?? []),
        payload.setup_guidance,
      ].filter(Boolean);
      message = parts.join(" ") || message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const outputName =
    response.headers.get("X-Mashlab-Output-Filename") ??
    file.name.replace(/\.[^.]+$/i, "") + `-quick-mix-${startOffsetSeconds}s-${maxSeconds}s.wav`;

  return {
    file: new File([blob], outputName, { type: "audio/wav" }),
    sourceDurationSeconds: parseHeaderNumber(response.headers.get("X-Mashlab-Source-Duration")),
    outputDurationSeconds: parseHeaderNumber(response.headers.get("X-Mashlab-Output-Duration")),
    startOffsetSeconds: parseHeaderNumber(response.headers.get("X-Mashlab-Start-Offset")) ?? startOffsetSeconds,
    trimmed: response.headers.get("X-Mashlab-Trimmed") === "true",
    fadeOutApplied: response.headers.get("X-Mashlab-Fade-Out") === "true",
  };
}

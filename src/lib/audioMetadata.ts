import type { AudioInspection } from "../domain/types";

export const ACCEPTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a", ".ogg"];
export const MAX_LOCAL_AUDIO_BYTES = 500 * 1024 * 1024;

type AudioContextConstructor = typeof AudioContext;

export interface AudioFileValidationResult {
  ok: boolean;
  message: string | null;
}

export function isSupportedAudioFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return (
    file.type.startsWith("audio/") ||
    ACCEPTED_AUDIO_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
}

export function validateAudioFile(file: File): AudioFileValidationResult {
  if (file.size === 0) {
    return {
      ok: false,
      message: "This file is empty. Choose a local audio file with playable audio data.",
    };
  }

  if (file.size > MAX_LOCAL_AUDIO_BYTES) {
    return {
      ok: false,
      message: "This browser prototype accepts local audio files up to 500 MB.",
    };
  }

  if (!isSupportedAudioFile(file)) {
    return {
      ok: false,
      message: "Choose a local audio file such as WAV, MP3, FLAC, AIFF, M4A, or OGG.",
    };
  }

  return { ok: true, message: null };
}

export async function inspectAudioFile(file: File): Promise<AudioInspection> {
  const notes: string[] = [];
  const mediaDuration = await readDurationFromMediaElement(file).catch(() => null);
  let containerMetadata = emptyContainerMetadata();

  try {
    const arrayBuffer = await file.arrayBuffer();
    containerMetadata = readWaveContainerMetadata(arrayBuffer);
    const decoded = await decodeWithWebAudio(arrayBuffer.slice(0));

    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      fileType: file.type || "audio/unknown",
      fileSizeBytes: file.size,
      durationSeconds: decoded.durationSeconds ?? mediaDuration,
      sampleRate: containerMetadata.sampleRate ?? decoded.sampleRate,
      channelCount: containerMetadata.channelCount ?? decoded.channelCount,
      waveformPeaks: decoded.waveformPeaks,
      decoded: true,
      notes,
    };
  } catch (error) {
    notes.push(
      error instanceof Error
        ? `Browser decode unavailable. Local metadata may be limited. ${error.message}`
        : "Browser decode unavailable for this file. Local metadata may be limited."
    );

    return {
      id: crypto.randomUUID(),
      fileName: file.name,
      fileType: file.type || "audio/unknown",
      fileSizeBytes: file.size,
      durationSeconds: mediaDuration,
      sampleRate: containerMetadata.sampleRate,
      channelCount: containerMetadata.channelCount,
      waveformPeaks: [],
      decoded: false,
      notes,
    };
  }
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "Unknown";
  }

  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

async function readDurationFromMediaElement(file: File): Promise<number | null> {
  const objectUrl = URL.createObjectURL(file);

  try {
    return await new Promise((resolve, reject) => {
      const audio = document.createElement("audio");
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute("src");
        audio.load();
      };
      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error("media metadata timed out"));
      }, 8000);

      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const duration = Number.isFinite(audio.duration) ? audio.duration : null;
        cleanup();
        resolve(duration);
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("media metadata could not be read"));
      };
      audio.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function decodeWithWebAudio(arrayBuffer: ArrayBuffer): Promise<{
  durationSeconds: number;
  sampleRate: number;
  channelCount: number;
  waveformPeaks: number[];
}> {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;

  if (!AudioContextClass) {
    throw new Error("Web Audio API is not available");
  }

  const context = new AudioContextClass();

  try {
    const audioBuffer = await context.decodeAudioData(arrayBuffer);

    return {
      durationSeconds: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channelCount: audioBuffer.numberOfChannels,
      waveformPeaks: calculateWaveformPeaks(audioBuffer),
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function calculateWaveformPeaks(audioBuffer: AudioBuffer, bucketCount = 192): number[] {
  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) =>
    audioBuffer.getChannelData(index)
  );
  const sampleLength = channels[0]?.length ?? 0;
  const bucketSize = Math.max(1, Math.floor(sampleLength / bucketCount));
  const peaks: number[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = bucket * bucketSize;
    const end = Math.min(start + bucketSize, sampleLength);
    let peak = 0;

    for (let index = start; index < end; index += 1) {
      const averageAmplitude =
        channels.reduce((sum, channelData) => sum + Math.abs(channelData[index] ?? 0), 0) /
        Math.max(1, channels.length);
      peak = Math.max(peak, averageAmplitude);
    }

    peaks.push(peak);
  }

  const maxPeak = Math.max(...peaks, 0.0001);
  return peaks.map((peak) => peak / maxPeak);
}

export function readWaveContainerMetadata(arrayBuffer: ArrayBuffer): {
  sampleRate: number | null;
  channelCount: number | null;
} {
  const view = new DataView(arrayBuffer);

  if (
    view.byteLength < 44 ||
    readAscii(view, 0, 4) !== "RIFF" ||
    readAscii(view, 8, 4) !== "WAVE"
  ) {
    return { sampleRate: null, channelCount: null };
  }

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt " && chunkDataOffset + 16 <= view.byteLength) {
      return {
        channelCount: view.getUint16(chunkDataOffset + 2, true),
        sampleRate: view.getUint32(chunkDataOffset + 4, true),
      };
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  return { sampleRate: null, channelCount: null };
}

function emptyContainerMetadata(): {
  sampleRate: number | null;
  channelCount: number | null;
} {
  return { sampleRate: null, channelCount: null };
}

function readAscii(view: DataView, offset: number, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

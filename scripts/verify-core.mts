import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function importSrc(relativePath: string) {
  return import(pathToFileURL(join(root, relativePath)).href);
}

describe("MashLab core verification", async () => {
  const legal = await importSrc("src/lib/legal.ts");
  const audioMetadata = await importSrc("src/lib/audioMetadata.ts");
  const { createEngineRegistry } = await importSrc("src/engines/engineRegistry.ts");
  const { engineCapabilities } = await importSrc("src/domain/enginePlan.ts");
  const { runMashAnalysis } = await importSrc("src/lib/analysisPipeline.ts");

  it("includes the required rights notice verbatim", () => {
    assert.match(legal.requiredRightsNotice, /Upload audio you own or are authorized to use/);
    assert.match(legal.requiredRightsNotice, /remain the user's responsibility/);
  });

  it("states no streaming imports or training use", () => {
    assert.ok(
      legal.legalDoctrineBullets.some((bullet: string) => bullet.includes("streaming-source imports"))
    );
    assert.ok(
      legal.legalDoctrineBullets.some((bullet: string) => bullet.includes("not used for training"))
    );
  });

  it("formats duration and file size for UI display", () => {
    assert.equal(audioMetadata.formatDuration(125), "2:05");
    assert.equal(audioMetadata.formatDuration(null), "Unknown");
    assert.equal(audioMetadata.formatFileSize(2048), "2.00 KB");
  });

  it("validates local audio files with friendly rejection reasons", () => {
    assert.equal(
      audioMetadata.validateAudioFile(new File(["audio"], "authorized.wav", { type: "audio/wav" })).ok,
      true
    );
    assert.match(
      audioMetadata.validateAudioFile(new File([], "empty.wav", { type: "audio/wav" })).message,
      /empty/
    );
    assert.match(
      audioMetadata.validateAudioFile(new File(["text"], "notes.txt", { type: "text/plain" })).message,
      /local audio file/
    );
  });

  it("reads WAV container sample rate and channel count", () => {
    const metadata = audioMetadata.readWaveContainerMetadata(makeWavHeader({ channels: 2, sampleRate: 44100 }));
    assert.deepEqual(metadata, { sampleRate: 44100, channelCount: 2 });
  });

  it("maps planned capabilities to stub adapters", () => {
    const registry = createEngineRegistry();
    assert.deepEqual(registry.capabilities, engineCapabilities);
    assert.equal(registry.beat.status, "analysis-coming-next");
    assert.equal(registry.stems.status, "engine-pending");
    assert.equal(registry.pitchTime.status, "engine-pending");
    assert.equal(registry.vocalCleanup.status, "engine-pending");
    assert.equal(registry.arrangement.status, "engine-pending");
    assert.equal(registry.exportMastering.status, "engine-pending");
  });

  it("returns honest pending results for decoded inspections", async () => {
    const snapshot = await runMashAnalysis({
      id: "test-id",
      fileName: "demo.wav",
      fileType: "audio/wav",
      fileSizeBytes: 1024,
      durationSeconds: 180,
      sampleRate: 44100,
      channelCount: 2,
      waveformPeaks: [0.2, 0.5],
      decoded: true,
      notes: [],
    });

    assert.equal(snapshot.beat.data, null);
    assert.equal(snapshot.beat.status, "analysis-coming-next");
    assert.equal(snapshot.key.status, "analysis-coming-next");
    assert.equal(snapshot.stems.status, "engine-pending");
  });

  it("fails beat/key analysis when decode did not succeed", async () => {
    const snapshot = await runMashAnalysis({
      id: "test-id-2",
      fileName: "broken.mp3",
      fileType: "audio/mpeg",
      fileSizeBytes: 512,
      durationSeconds: 60,
      sampleRate: null,
      channelCount: null,
      waveformPeaks: [],
      decoded: false,
      notes: ["Browser decode unavailable"],
    });

    assert.equal(snapshot.beat.state, "failed");
    assert.equal(snapshot.key.state, "failed");
    assert.equal(snapshot.stems.status, "engine-pending");
  });

  it("isolates adapter failures to the failing lane", async () => {
    const registry = createEngineRegistry();
    const snapshot = await runMashAnalysis(
      {
        id: "test-id-3",
        fileName: "authorized.wav",
        fileType: "audio/wav",
        fileSizeBytes: 1024,
        durationSeconds: 60,
        sampleRate: 44100,
        channelCount: 2,
        waveformPeaks: [0.1, 0.4],
        decoded: true,
        notes: [],
      },
      {
        ...registry,
        beat: {
          ...registry.beat,
          async analyze() {
            throw new Error("simulated adapter failure");
          },
        },
      }
    );

    assert.equal(snapshot.beat.state, "failed");
    assert.match(snapshot.beat.message, /adapter failed/);
    assert.equal(snapshot.key.status, "analysis-coming-next");
    assert.equal(snapshot.stems.status, "engine-pending");
  });
});

function makeWavHeader({ channels, sampleRate }: { channels: number; sampleRate: number }) {
  const bytesPerSample = 2;
  const dataSize = sampleRate * channels * bytesPerSample;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

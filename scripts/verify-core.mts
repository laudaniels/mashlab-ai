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
  const { engineCapabilities, draftTemplates } = await importSrc("src/domain/enginePlan.ts");
  const { runMashAnalysis } = await importSrc("src/lib/analysisPipeline.ts");
  const { createTrackJob, deriveJobState } = await importSrc("src/domain/jobs.ts");
  const { runTrackJob, summarizeTrackJob } = await importSrc("src/lib/jobRunner.ts");
  const {
    createBrowserOnlyStatus,
    parseCapabilitiesResponse,
    summarizeCapabilities,
  } = await importSrc("src/lib/localEngine/capabilities.ts");
  const {
    beatResultDetails,
    isLibrosaAvailable,
    parseBeatAnalysisResponse,
    parseKeyAnalysisResponse,
  } = await importSrc("src/lib/localEngine/analysis.ts");
  const { LocalEngineClient } = await importSrc("src/lib/localEngine/client.ts");
  const { createLocalAwareBeatEngine } = await importSrc("src/engines/localMirEngines.ts");

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
    assert.equal(registry.metadata.status, "implemented");
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

    assert.equal(snapshot.metadata.state, "complete");
    assert.equal(snapshot.metadata.status, "implemented");
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

  it("creates a track job with metadata marked implemented", () => {
    const job = createTrackJob({
      sessionId: "session-1",
      slotId: "trackA",
      inspectionId: "inspection-1",
    });

    assert.equal(job.steps.length, 8);
    assert.equal(job.steps[0]?.id, "metadata");
    assert.equal(job.steps[0]?.status, "implemented");
    assert.equal(deriveJobState(job.steps), "idle");
  });

  it("runs a sequential track job and completes metadata first", async () => {
    const job = await runTrackJob({
      sessionId: "session-2",
      slotId: "trackB",
      inspection: {
        id: "inspection-2",
        fileName: "authorized.wav",
        fileType: "audio/wav",
        fileSizeBytes: 2048,
        durationSeconds: 90,
        sampleRate: 44100,
        channelCount: 2,
        waveformPeaks: [0.2, 0.6],
        decoded: true,
        notes: [],
      },
    });

    const metadataStep = job.steps.find((step: { id: string }) => step.id === "metadata");
    assert.equal(metadataStep?.state, "complete");
    assert.equal(metadataStep?.status, "implemented");

    const summary = summarizeTrackJob(job);
    assert.equal(summary.completedSteps, 1);
    assert.ok(summary.nextPendingLabel);
  });

  it("stops the track job when a required MIR lane fails on undecoded audio", async () => {
    const job = await runTrackJob({
      sessionId: "session-3",
      slotId: "trackA",
      inspection: {
        id: "inspection-3",
        fileName: "limited.mp3",
        fileType: "audio/mpeg",
        fileSizeBytes: 1024,
        durationSeconds: 45,
        sampleRate: null,
        channelCount: null,
        waveformPeaks: [],
        decoded: false,
        notes: ["Browser decode unavailable"],
      },
    });

    const beatStep = job.steps.find((step: { id: string }) => step.id === "beat");
    assert.equal(beatStep?.state, "failed");
    assert.equal(job.state, "failed");
  });

  it("uses the three MVP draft template names", () => {
    assert.ok(engineCapabilities.length >= 8);
    assert.deepEqual(
      draftTemplates.map((draft: { name: string }) => draft.name),
      ["Clean Blend", "Club Edit", "Creative Blend"]
    );
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

  it("parses local engine capability payloads", () => {
    const parsed = parseCapabilitiesResponse({
      service: "mashlab-local-engine",
      version: "0.1.0",
      python_version: "3.12.0",
      capabilities: [
        {
          id: "ffprobe",
          label: "ffprobe",
          status: "missing",
          message: "Install FFmpeg.",
        },
      ],
    });

    assert.ok(parsed);
    assert.equal(parsed?.capabilities[0]?.status, "missing");
    assert.match(summarizeCapabilities(parsed?.capabilities ?? []), /0\/1 local capabilities available/);
  });

  it("falls back to browser-only mode when local service is offline", async () => {
    const offline = createBrowserOnlyStatus("Local helper service is offline.");
    assert.equal(offline.mode, "browser-only");
    assert.equal(offline.online, false);

    const client = new LocalEngineClient("http://127.0.0.1:59999");
    const status = await client.probeConnection();
    assert.equal(status.online, false);
    assert.equal(status.mode, "browser-only");
  });

  it("maps local service job phases to the existing track job model", () => {
    const job = createTrackJob({
      sessionId: "session-local",
      slotId: "trackA",
      inspectionId: "inspection-local",
    });

    const localPhases = job.steps.map((step: { id: string }) => step.id);
    assert.deepEqual(localPhases, [
      "metadata",
      "beat",
      "key",
      "stems",
      "pitch-time",
      "vocal-cleanup",
      "arrangement",
      "export",
    ]);
  });

  it("parses beat and key analysis responses", () => {
    const beat = parseBeatAnalysisResponse({
      ok: true,
      status: "implemented",
      message: "Experimental BPM",
      result: {
        file_name: "authorized.wav",
        bpm: 128.2,
        beat_times: [0.5, 1.0],
        beat_count: 2,
        method: "librosa.beat.beat_track (experimental prototype)",
        limitations: ["Experimental prototype"],
        confidence: 0.71,
        downbeat_status: "not_implemented",
        phrase_marker_status: "not_implemented",
      },
    });

    assert.ok(beat?.result);
    assert.equal(beat?.result?.beat_count, 2);
    assert.match(beatResultDetails(beat!.result!)[0], /128.2/);

    const key = parseKeyAnalysisResponse({
      ok: false,
      status: "missing_dependency",
      message: "librosa is not installed",
      setup_guidance: "pip install librosa soundfile",
    });

    assert.equal(key?.ok, false);
    assert.equal(key?.status, "missing_dependency");
  });

  it("detects librosa availability from capability payloads", () => {
    assert.equal(
      isLibrosaAvailable([
        { id: "librosa", label: "librosa", status: "available", message: "installed" },
      ]),
      true
    );
    assert.equal(
      isLibrosaAvailable([
        { id: "librosa", label: "librosa", status: "not_configured", message: "missing" },
      ]),
      false
    );
  });

  it("keeps beat lane pending when local service is offline", async () => {
    const beatEngine = createLocalAwareBeatEngine({ file: null, localStatus: null });
    const result = await beatEngine.analyze({
      id: "offline-beat",
      fileName: "authorized.wav",
      fileType: "audio/wav",
      fileSizeBytes: 1024,
      durationSeconds: 60,
      sampleRate: 44100,
      channelCount: 2,
      waveformPeaks: [0.2],
      decoded: true,
      notes: [],
    });

    assert.equal(result.state, "idle");
    assert.equal(result.status, "analysis-coming-next");
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

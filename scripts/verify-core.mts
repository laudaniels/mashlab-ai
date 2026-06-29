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

  const { classifyCamelotCompatibility, planHarmonicCompatibility, formatPlanningPanelLines, buildMashupPlanningSummary, keyProfileFromAnalysis, suggestInstrumentalShiftSemitones } = await importSrc("src/domain/harmonicPlanning.ts");
  const { planHeuristicPhrases, buildBeatGridFromAnalysis } = await importSrc("src/domain/beatGrid.ts");
  const { buildPairPlanningSummary } = await importSrc("src/domain/mashupPlanning.ts");

  it("maps Camelot compatibility labels", () => {
    assert.equal(classifyCamelotCompatibility("8A", "8A"), "strong");
    assert.equal(classifyCamelotCompatibility("8A", "9A"), "compatible");
    assert.equal(classifyCamelotCompatibility("8A", "8B"), "compatible");
    assert.equal(classifyCamelotCompatibility("8A", "11B"), "risky");
    assert.equal(classifyCamelotCompatibility("bad", "8A"), "unknown");
  });

  it("suggests practical pitch-shift planning values", () => {
    const trackA = keyProfileFromAnalysis(
      {
        key: "A",
        mode: "minor",
        camelot: "8A",
        confidence: 0.72,
        method: "test",
        limitations: [],
        pitchShiftSemitones: null,
      },
      true
    );
    const trackB = keyProfileFromAnalysis(
      {
        key: "C",
        mode: "major",
        camelot: "8B",
        confidence: 0.68,
        method: "test",
        limitations: [],
      },
      true
    );

    const plan = planHarmonicCompatibility(trackA, trackB);
    assert.equal(plan.label, "compatible");
    assert.equal(suggestInstrumentalShiftSemitones(trackA, trackB), -3);
    assert.ok(plan.suggestedInstrumentalShiftSemitones !== null);
  });

  it("returns unknown harmonic planning for uncertain keys", () => {
    const uncertain = keyProfileFromAnalysis(
      {
        key: "F#",
        mode: "minor",
        camelot: "11A",
        confidence: 0.4,
        method: "test",
        limitations: [],
      },
      true
    );
    const missing = keyProfileFromAnalysis(null, false);
    const plan = planHarmonicCompatibility(uncertain, missing);

    assert.equal(plan.label, "unknown");
    assert.match(plan.experimentalKeyWarning ?? "", /low-confidence/i);
    assert.equal(plan.suggestedInstrumentalShiftSemitones, null);
  });

  it("builds heuristic phrase windows from detected beats", () => {
    const beatTimes = Array.from({ length: 64 }, (_, index) => index * 0.5);
    const plan = planHeuristicPhrases(beatTimes, 120);

    assert.ok(plan);
    assert.equal(plan?.phraseLengthBars, 8);
    assert.equal(plan?.phraseLengthBeats, 32);
    assert.equal(plan?.method, "heuristic_from_detected_beats");
    assert.equal(plan?.phraseStartTimes.length, 2);
    assert.match(plan?.limitations.join(" "), /not true downbeat detection/i);
  });

  it("does not fake phrase markers when beats are missing", () => {
    const grid = buildBeatGridFromAnalysis(null, { jobComplete: false });
    assert.equal(grid.phraseMarkers.length, 0);
    assert.equal(grid.phrasePlan, null);
    assert.equal(grid.phraseStatus, "unavailable");

    const sparse = buildBeatGridFromAnalysis(
      {
        bpm: 128,
        beatTimes: [0, 0.5, 1],
        beatCount: 3,
        bpmConfidence: 0.6,
        method: "test",
        limitations: [],
        downbeatOffsetMs: null,
        phraseBarMarkers: [],
        downbeatStatus: "not_implemented",
        phraseMarkerStatus: "not_implemented",
      },
      { jobComplete: true }
    );
    assert.equal(sparse.phrasePlan, null);
    assert.equal(sparse.phraseMarkers.length, 0);
  });

  it("formats mashup planning panel lines", () => {
    const summary = buildMashupPlanningSummary({
      trackALabel: "Track A",
      trackBLabel: "Track B",
      trackABpm: 128,
      trackBBpm: 130,
      trackAKey: keyProfileFromAnalysis(
        {
          key: "A",
          mode: "minor",
          camelot: "8A",
          confidence: 0.7,
          method: "test",
          limitations: [],
        },
        true
      ),
      trackBKey: keyProfileFromAnalysis(
        {
          key: "A",
          mode: "minor",
          camelot: "8A",
          confidence: 0.66,
          method: "test",
          limitations: [],
        },
        true
      ),
      phraseReadinessA: "Heuristic 2 phrase windows",
      phraseReadinessB: "Phrase planning unavailable",
    });

    const lines = formatPlanningPanelLines(summary);
    assert.match(lines[0], /Track A: 128 BPM/);
    assert.match(lines[1], /Track B: 130 BPM/);
    assert.match(lines[3], /strong/);
  });

  it("stores beat and key result data on completed job steps", async () => {
    const beatData = {
      bpm: 124,
      beatTimes: Array.from({ length: 40 }, (_, index) => index * 0.48),
      beatCount: 40,
      bpmConfidence: 0.7,
      method: "test-beat",
      limitations: [],
      downbeatOffsetMs: null,
      phraseBarMarkers: [],
      downbeatStatus: "not_implemented" as const,
      phraseMarkerStatus: "not_implemented" as const,
    };
    const keyData = {
      key: "G",
      mode: "major" as const,
      camelot: "9B",
      confidence: 0.62,
      method: "test-key",
      limitations: [],
      pitchShiftSemitones: null,
    };

    const registry = createEngineRegistry();
    const job = await runTrackJob({
      sessionId: "planning-session",
      slotId: "trackA",
      inspection: {
        id: "planning-inspection",
        fileName: "authorized.wav",
        fileType: "audio/wav",
        fileSizeBytes: 2048,
        durationSeconds: 120,
        sampleRate: 44100,
        channelCount: 2,
        waveformPeaks: [0.2, 0.5],
        decoded: true,
        notes: [],
      },
      registry: {
        ...registry,
        beat: {
          ...registry.beat,
          async analyze() {
            return {
              state: "complete" as const,
              status: "implemented" as const,
              message: "Beat complete",
              data: beatData,
            };
          },
        },
        key: {
          ...registry.key,
          async analyze() {
            return {
              state: "complete" as const,
              status: "implemented" as const,
              message: "Key complete",
              data: keyData,
            };
          },
        },
      },
    });

    const beatStep = job.steps.find((step: { id: string }) => step.id === "beat");
    const keyStep = job.steps.find((step: { id: string }) => step.id === "key");
    assert.deepEqual(beatStep?.resultData, beatData);
    assert.deepEqual(keyStep?.resultData, keyData);

    const summary = buildPairPlanningSummary({
      trackALabel: "Track A",
      trackBLabel: "Track B",
      trackAJob: job,
      trackBJob: job,
    });

    assert.ok(summary);
    assert.equal(summary?.harmonic.label, "strong");
    assert.equal(summary?.trackA.beatCount, 40);
  });

  const {
    createSessionArtifactStore,
    createTrackArtifact,
    syncTrackArtifactFromJob,
    updateTrackArtifactOverrides,
    resolvePlanningBpm,
    rebuildTrackArtifact,
  } = await importSrc("src/domain/sessionArtifacts.ts");
  const { buildTimelineLaneData, formatTimelineSummaryLines } = await importSrc("src/domain/timelineAlignment.ts");

  it("creates and syncs session artifacts per track slot", () => {
    const store = createSessionArtifactStore("session-artifacts");
    const artifact = createTrackArtifact({
      sessionId: "session-artifacts",
      slotId: "trackA",
      file: new File(["audio"], "authorized.wav", { type: "audio/wav", lastModified: 1000 }),
      inspection: {
        id: "inspection-artifact",
        fileName: "authorized.wav",
        fileType: "audio/wav",
        fileSizeBytes: 1024,
        durationSeconds: 120,
        sampleRate: 44100,
        channelCount: 2,
        waveformPeaks: [0.2, 0.5],
        decoded: true,
        notes: [],
      },
    });

    assert.equal(artifact.sessionId, "session-artifacts");
    assert.equal(artifact.version, 1);
    assert.equal(artifact.fileIdentity.name, "authorized.wav");

    const synced = syncTrackArtifactFromJob(artifact, {
      jobId: "job-1",
      sessionId: "session-artifacts",
      slotId: "trackA",
      inspectionId: "inspection-artifact",
      state: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: "beat",
          label: "Beat",
          state: "complete",
          status: "implemented",
          message: "done",
          resultData: {
            bpm: 126,
            beatTimes: Array.from({ length: 40 }, (_, index) => index * 0.47),
            beatCount: 40,
            bpmConfidence: 0.7,
            method: "test",
            limitations: [],
            downbeatOffsetMs: null,
            phraseBarMarkers: [],
          },
          startedAt: null,
          completedAt: null,
        },
      ],
    });

    assert.equal(synced.beatAnalysis?.bpm, 126);
    assert.ok(synced.effectiveBeatGrid);
    assert.equal(store.tracks.trackA, null);
  });

  it("prefers DJ overrides over detected analysis for planning", () => {
    const beatData = {
      bpm: 124,
      beatTimes: Array.from({ length: 40 }, (_, index) => index * 0.48),
      beatCount: 40,
      bpmConfidence: 0.7,
      method: "test-beat",
      limitations: [],
      downbeatOffsetMs: null,
      phraseBarMarkers: [],
      downbeatStatus: "not_implemented" as const,
      phraseMarkerStatus: "not_implemented" as const,
    };
    const keyData = {
      key: "G",
      mode: "major" as const,
      camelot: "9B",
      confidence: 0.62,
      method: "test-key",
      limitations: [],
      pitchShiftSemitones: null,
    };

    let artifact = createTrackArtifact({
      sessionId: "override-session",
      slotId: "trackA",
      file: new File(["audio"], "authorized.wav", { type: "audio/wav" }),
      inspection: null,
    });

    artifact = rebuildTrackArtifact({
      ...artifact,
      beatAnalysis: beatData,
      keyAnalysis: keyData,
    });

    artifact = updateTrackArtifactOverrides(artifact, {
      bpm: 130,
      camelot: "8A",
      key: "A",
      mode: "minor",
    });

    const bpm = resolvePlanningBpm(artifact);
    assert.equal(bpm.value, 130);
    assert.equal(bpm.source, "user_override");
    assert.equal(artifact.effectiveKeyProfile?.camelot, "8A");
    assert.equal(artifact.effectiveKeyProfile?.keySource, "user_override");
    assert.equal(artifact.effectiveKeyProfile?.confidence, null);
  });

  it("recalculates pair planning when overrides change tempo compatibility", () => {
    const beat = {
      bpm: 120,
      beatTimes: Array.from({ length: 40 }, (_, index) => index * 0.5),
      beatCount: 40,
      bpmConfidence: 0.7,
      method: "test",
      limitations: [],
      downbeatOffsetMs: null,
      phraseBarMarkers: [],
      downbeatStatus: "not_implemented" as const,
      phraseMarkerStatus: "not_implemented" as const,
    };

    const buildArtifact = (slotId: "trackA" | "trackB", bpm: number, withOverride: boolean) =>
      updateTrackArtifactOverrides(
        rebuildTrackArtifact({
          ...createTrackArtifact({
            sessionId: "pair-session",
            slotId,
            file: new File(["audio"], `${slotId}.wav`, { type: "audio/wav" }),
            inspection: null,
          }),
          beatAnalysis: { ...beat, bpm },
          keyAnalysis: {
            key: "A",
            mode: "minor" as const,
            camelot: "8A",
            confidence: 0.7,
            method: "test",
            limitations: [],
            pitchShiftSemitones: null,
          },
        }),
        withOverride && slotId === "trackB" ? { bpm: 128 } : {}
      );

    const store = createSessionArtifactStore("pair-session");
    store.tracks.trackA = buildArtifact("trackA", 120, false);
    store.tracks.trackB = buildArtifact("trackB", 124, false);

    const detectedSummary = buildPairPlanningSummary({
      trackALabel: "Track A",
      trackBLabel: "Track B",
      artifactStore: store,
    });

    assert.equal(detectedSummary?.tempo.bpmDifference, 4);
    assert.equal(detectedSummary?.trackB.bpmSource, "detected");

    store.tracks.trackB = buildArtifact("trackB", 124, true);
    const overrideSummary = buildPairPlanningSummary({
      trackALabel: "Track A",
      trackBLabel: "Track B",
      artifactStore: store,
    });

    assert.equal(overrideSummary?.trackB.bpmSource, "user_override");
    assert.equal(overrideSummary?.tempo.bpmDifference, 8);
  });

  it("builds phrase windows for custom phrase lengths", () => {
    const beatTimes = Array.from({ length: 64 }, (_, index) => index * 0.5);
    const fourBarPlan = planHeuristicPhrases(beatTimes, 120, 4);
    const sixteenBarPlan = planHeuristicPhrases(beatTimes, 120, 16);

    assert.equal(fourBarPlan?.phraseLengthBars, 4);
    assert.equal(fourBarPlan?.phraseLengthBeats, 16);
    assert.ok((fourBarPlan?.phraseStartTimes.length ?? 0) > (sixteenBarPlan?.phraseStartTimes.length ?? 0));
    assert.equal(sixteenBarPlan?.phraseLengthBars, 16);
  });

  it("formats timeline lane data and summary lines", () => {
    const artifact = rebuildTrackArtifact({
      ...createTrackArtifact({
        sessionId: "timeline-session",
        slotId: "trackA",
        file: new File(["audio"], "authorized.wav", { type: "audio/wav" }),
        inspection: null,
      }),
      beatAnalysis: {
        bpm: 128,
        beatTimes: Array.from({ length: 40 }, (_, index) => index * 0.47),
        beatCount: 40,
        bpmConfidence: 0.66,
        method: "test",
        limitations: [],
        downbeatOffsetMs: null,
        phraseBarMarkers: [],
      },
    });

    const lane = buildTimelineLaneData(
      {
        slotId: "trackA",
        label: "Track A",
        file: new File(["audio"], "authorized.wav", { type: "audio/wav" }),
        objectUrl: "blob:track-a",
        inspection: {
          id: "inspection-timeline",
          fileName: "authorized.wav",
          fileType: "audio/wav",
          fileSizeBytes: 1024,
          durationSeconds: 60,
          sampleRate: 44100,
          channelCount: 2,
          waveformPeaks: [0.1, 0.8, 0.3],
          decoded: true,
          notes: [],
        },
        status: "ready",
        error: null,
      },
      artifact
    );

    assert.ok(lane);
    assert.equal(lane?.hasBeatData, true);
    assert.ok(lane!.beatMarkers.length > 0);
    assert.ok(lane!.phraseRegions.length > 0);
    assert.match(formatTimelineSummaryLines([lane!])[0], /Track A/);
  });

  it("does not fake timeline markers when beat data is missing", () => {
    const lane = buildTimelineLaneData(
      {
        slotId: "trackB",
        label: "Track B",
        file: new File(["audio"], "pending.wav", { type: "audio/wav" }),
        objectUrl: "blob:track-b",
        inspection: {
          id: "inspection-empty",
          fileName: "pending.wav",
          fileType: "audio/wav",
          fileSizeBytes: 512,
          durationSeconds: 45,
          sampleRate: 44100,
          channelCount: 2,
          waveformPeaks: [],
          decoded: true,
          notes: [],
        },
        status: "ready",
        error: null,
      },
      createTrackArtifact({
        sessionId: "timeline-empty",
        slotId: "trackB",
        file: new File(["audio"], "pending.wav", { type: "audio/wav" }),
        inspection: null,
      })
    );

    assert.ok(lane);
    assert.equal(lane?.hasBeatData, false);
    assert.equal(lane?.beatMarkers.length, 0);
    assert.equal(lane?.phraseRegions.length, 0);
    assert.match(lane?.phraseReadiness ?? "", /unavailable/i);
  });

  const {
    buildPitchTimePlan,
    buildPitchTimePlanFromArtifacts,
    buildSafeRangeWarning,
    computeTempoStretchPercent,
    computeTempoStretchRatio,
    planClaimsAudioProcessed,
    resolveIntentDirectionPairs,
    resolveTempoDirection,
    buildTrackPlanningInput,
  } = await importSrc("src/domain/pitchTimePlanning.ts");
  const { rubberBandCapabilitySummary } = await importSrc("src/lib/localEngine/capabilities.ts");

  it("computes tempo stretch ratio and direction", () => {
    const ratio = computeTempoStretchRatio(120, 128);
    assert.equal(ratio, 1.067);
    assert.equal(computeTempoStretchPercent(ratio), 6.7);
    assert.equal(resolveTempoDirection(ratio), "speed_up");
    assert.equal(resolveTempoDirection(computeTempoStretchRatio(128, 120)), "slow_down");
    assert.equal(resolveTempoDirection(computeTempoStretchRatio(120, 120)), "none");
  });

  it("warns on unsafe pitch shift ranges", () => {
    assert.equal(buildSafeRangeWarning(3), null);
    assert.match(buildSafeRangeWarning(5) ?? "", /comfort zone/i);
    assert.match(buildSafeRangeWarning(7) ?? "", /vocal-safe range/i);
  });

  it("updates pitch/time planning by mash intent", () => {
    const trackA = {
      slotId: "trackA" as const,
      label: "Track A",
      bpm: 120,
      bpmSource: "detected" as const,
      keyProfile: { key: "A", mode: "minor" as const, camelot: "8A", confidence: 0.7, method: "test" },
      keySource: "detected" as const,
      camelotSource: "detected" as const,
    };
    const trackB = {
      slotId: "trackB" as const,
      label: "Track B",
      bpm: 128,
      bpmSource: "detected" as const,
      keyProfile: { key: "C", mode: "major" as const, camelot: "8B", confidence: 0.66, method: "test" },
      keySource: "detected" as const,
      camelotSource: "detected" as const,
    };

    const single = buildPitchTimePlan({ trackA, trackB, intent: "vocal_a_over_beat_b" });
    const both = buildPitchTimePlan({ trackA, trackB, intent: "compare_both" });

    assert.equal(single.directions.length, 1);
    assert.equal(both.directions.length, 2);
    assert.equal(resolveIntentDirectionPairs("vocal_b_over_beat_a", trackA, trackB).length, 1);
  });

  it("prefers DJ overrides in pitch/time planning", () => {
    const store = createSessionArtifactStore("pitch-time-session");
    store.tracks.trackA = updateTrackArtifactOverrides(
      rebuildTrackArtifact({
        ...createTrackArtifact({
          sessionId: "pitch-time-session",
          slotId: "trackA",
          file: new File(["a"], "a.wav", { type: "audio/wav" }),
          inspection: null,
        }),
        beatAnalysis: {
          bpm: 120,
          beatTimes: [],
          beatCount: 0,
          bpmConfidence: 0.7,
          method: "test",
          limitations: [],
          downbeatOffsetMs: null,
          phraseBarMarkers: [],
        },
        keyAnalysis: {
          key: "A",
          mode: "minor",
          camelot: "8A",
          confidence: 0.7,
          method: "test",
          limitations: [],
          pitchShiftSemitones: null,
        },
      }),
      { bpm: 130 }
    );
    store.tracks.trackB = rebuildTrackArtifact({
      ...createTrackArtifact({
        sessionId: "pitch-time-session",
        slotId: "trackB",
        file: new File(["b"], "b.wav", { type: "audio/wav" }),
        inspection: null,
      }),
      beatAnalysis: {
        bpm: 128,
        beatTimes: [],
        beatCount: 0,
        bpmConfidence: 0.7,
        method: "test",
        limitations: [],
        downbeatOffsetMs: null,
        phraseBarMarkers: [],
      },
      keyAnalysis: {
        key: "C",
        mode: "major",
        camelot: "8B",
        confidence: 0.66,
        method: "test",
        limitations: [],
        pitchShiftSemitones: null,
      },
    });

    const plan = buildPitchTimePlanFromArtifacts({
      artifactStore: store,
      intent: "vocal_a_over_beat_b",
    });

    assert.ok(plan);
    assert.equal(plan?.directions[0]?.sourceBpm, 130);
    assert.equal(plan?.directions[0]?.bpmSource, "user_override");
  });

  it("does not claim audio was processed in pitch/time plans", () => {
    const plan = buildPitchTimePlan({
      trackA: buildTrackPlanningInput(createSessionArtifactStore("x"), "trackA", "Track A"),
      trackB: buildTrackPlanningInput(createSessionArtifactStore("x"), "trackB", "Track B"),
      intent: "compare_both",
    });
    assert.equal(plan.audioProcessed, false);
    assert.equal(planClaimsAudioProcessed(plan), false);
    assert.match(plan.planningOnlyNotice, /Planning only/i);
  });

  it("parses Rubber Band capability summaries", () => {
    const available = rubberBandCapabilitySummary([
      { id: "rubberband", label: "Rubber Band CLI", status: "available", message: "found", version: null },
    ]);
    const missing = rubberBandCapabilitySummary([
      { id: "rubberband", label: "Rubber Band CLI", status: "missing", message: "not found", version: null },
    ]);

    assert.equal(available.status, "available");
    assert.equal(missing.status, "missing");
  });
});

describe("Pitch/time preview processing", async () => {
  const {
    PREVIEW_ONLY_NOTICE,
    PREVIEW_PROCESSED_LABEL,
    buildPreviewRequestParams,
    hasActionablePitchTimeAdjustment,
    isPreviewProcessingReady,
    previewResultClaimsFinalExport,
    resolvePreviewDirections,
  } = await importSrc("src/domain/pitchTimePreview.ts");
  const {
    buildPitchTimePlan,
    buildTrackPlanningInput,
  } = await importSrc("src/domain/pitchTimePlanning.ts");
  const {
    parsePitchTimePreviewResponse,
    previewFailureIsMissingDependency,
    previewResponseIsProcessedPreview,
    validatePreviewRequestParams,
  } = await importSrc("src/lib/localEngine/pitchTimePreview.ts");
  const { isRubberBandAvailable } = await importSrc("src/lib/localEngine/capabilities.ts");
  const { createSessionArtifactStore } = await importSrc("src/domain/sessionArtifacts.ts");

  const sampleDirection = {
    intentLabel: "Vocal A over Beat B",
    vocalTrackLabel: "Track A",
    instrumentalTrackLabel: "Track B",
    sourceBpm: 120,
    targetBpm: 128,
    bpmDifference: 8,
    tempoStretchRatio: 1.067,
    tempoStretchPercent: 6.7,
    tempoDirection: "speed_up" as const,
    tempoPlanSummary: "Planning only",
    sourceKeyLabel: "8A",
    targetKeyLabel: "8B",
    sourceCamelot: "8A",
    targetCamelot: "8B",
    suggestedPitchShiftSemitones: 1,
    safeRangeWarning: null,
    formantPreservationNote: "Use formants",
    vocalAdjustmentNote: "Vocal note",
    instrumentalAdjustmentNote: "Instrumental note",
    bpmSource: "detected" as const,
    keySource: "detected" as const,
    camelotSource: "detected" as const,
    limitations: [PREVIEW_ONLY_NOTICE],
    djReviewRequired: true as const,
  };

  it("validates preview request parameters", () => {
    const errors = validatePreviewRequestParams({
      tempoRatio: 1,
      sourceBpm: 120,
      targetBpm: 120,
      pitchShiftSemitones: 0,
      maxPreviewSeconds: 30,
      formantPreservation: true,
      vocalSlotId: "trackA",
      vocalFileName: "a.wav",
    });
    assert.ok(errors.some((error: string) => error.includes("actionable")));
  });

  it("detects preview-ready actionable plans", () => {
    assert.equal(hasActionablePitchTimeAdjustment(sampleDirection), true);
    assert.equal(
      hasActionablePitchTimeAdjustment({
        ...sampleDirection,
        tempoStretchRatio: 1,
        suggestedPitchShiftSemitones: 0,
      }),
      false
    );
  });

  it("requires sidecar, Rubber Band, and user file before preview is ready", () => {
    const vocalTrack = {
      slotId: "trackA" as const,
      label: "Track A",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      objectUrl: "blob:a",
      inspection: null,
      status: "ready" as const,
      error: null,
    };

    const ready = isPreviewProcessingReady({
      sidecarOnline: true,
      rubberBandStatus: "available",
      direction: sampleDirection,
      vocalTrack,
    });
    const offline = isPreviewProcessingReady({
      sidecarOnline: false,
      rubberBandStatus: "available",
      direction: sampleDirection,
      vocalTrack,
    });

    assert.equal(ready.ready, true);
    assert.equal(offline.ready, false);
  });

  it("parses missing Rubber Band preview responses", () => {
    const parsed = parsePitchTimePreviewResponse({
      ok: false,
      status: "missing_dependency",
      message: "Rubber Band CLI is not available.",
      setup_guidance: "Install Rubber Band CLI.",
      limitations: [PREVIEW_ONLY_NOTICE],
    });

    assert.ok(parsed);
    assert.equal(previewFailureIsMissingDependency(parsed!), true);
    assert.equal(parsed?.audioProcessed, false);
  });

  it("parses processed preview responses without claiming final export", () => {
    const parsed = parsePitchTimePreviewResponse({
      ok: true,
      status: "preview_complete",
      message: "Pitch/time preview processed locally.",
      method: "rubberband-cli preview",
      audio_processed: true,
      artifact_url: "/v1/artifacts/pitch-time-preview/abc123",
      limitations: [PREVIEW_ONLY_NOTICE],
      warnings: [],
    });

    assert.ok(parsed);
    assert.equal(previewResponseIsProcessedPreview(parsed!), true);
    assert.equal(previewResultClaimsFinalExport(parsed!), false);
    assert.match(PREVIEW_ONLY_NOTICE, /not a final mashup/i);
    assert.match(PREVIEW_PROCESSED_LABEL, /Processed preview/i);
  });

  it("maps preview directions to vocal source tracks by mash intent", () => {
    const store = createSessionArtifactStore("preview-session");
    const plan = buildPitchTimePlan({
      trackA: buildTrackPlanningInput(store, "trackA", "Track A"),
      trackB: buildTrackPlanningInput(store, "trackB", "Track B"),
      intent: "compare_both",
    });
    const directions = resolvePreviewDirections(plan, store, "compare_both");

    assert.equal(directions.length, 2);
    assert.equal(directions[0]?.vocalSlotId, "trackA");
    assert.equal(directions[1]?.vocalSlotId, "trackB");
  });

  it("builds preview request params from direction and track", () => {
    const params = buildPreviewRequestParams(sampleDirection, {
      slotId: "trackA",
      label: "Track A",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      objectUrl: "blob:a",
      inspection: null,
      status: "ready",
      error: null,
    });

    assert.equal(params.tempoRatio, 1.067);
    assert.equal(params.pitchShiftSemitones, 1);
    assert.equal(params.maxPreviewSeconds, 30);
  });

  it("does not auto-process preview through job queue pitch-time stub", async () => {
    const { stubPitchTimeEngine } = await importSrc("src/engines/stubEngines.ts");
    const result = await stubPitchTimeEngine.analyze({
      id: "inspection-preview",
      fileName: "a.wav",
      fileType: "audio/wav",
      fileSizeBytes: 1024,
      durationSeconds: 60,
      sampleRate: 44100,
      channelCount: 2,
      waveformPeaks: [],
      decoded: true,
      notes: [],
    });

    assert.equal(result.state, "idle");
    assert.equal(result.status, "engine-pending");
    assert.match(result.message, /planning|Rubber Band|pending/i);
  });

  it("reports Rubber Band availability from capabilities", () => {
    assert.equal(
      isRubberBandAvailable([
        { id: "rubberband", label: "Rubber Band CLI", status: "available", message: "ok", version: null },
      ]),
      true
    );
    assert.equal(
      isRubberBandAvailable([
        { id: "rubberband", label: "Rubber Band CLI", status: "missing", message: "missing", version: null },
      ]),
      false
    );
  });
});

describe("Stem preview processing", async () => {
  const {
    STEM_PREVIEW_ONLY_NOTICE,
    STEM_PROCESSED_LABEL,
    buildStemPreviewRequestParams,
    isStemPreviewReady,
    stemPreviewClaimsStudioQuality,
    formatStemPreviewStatusMessage,
  } = await importSrc("src/domain/stemPreview.ts");
  const {
    parseStemPreviewResponse,
    stemPreviewFailureIsMissingDependency,
    stemPreviewResponseIsProcessed,
    validateStemPreviewRequestParams,
  } = await importSrc("src/lib/localEngine/stemPreview.ts");
  const { isDemucsAvailable, demucsCapabilitySummary } = await importSrc(
    "src/lib/localEngine/capabilities.ts"
  );
  const { stubStemEngine } = await importSrc("src/engines/stubEngines.ts");

  it("validates stem preview request parameters", () => {
    const errors = validateStemPreviewRequestParams({
      splitMode: "vocals_no_vocals",
      maxPreviewSeconds: 60,
      trackSlotId: "trackA",
      fileName: "a.wav",
    });
    assert.equal(errors.length, 0);

    const invalid = validateStemPreviewRequestParams({
      splitMode: "vocals_no_vocals",
      maxPreviewSeconds: 500,
      trackSlotId: "trackA",
      fileName: "a.wav",
    });
    assert.ok(invalid.some((error: string) => error.includes("max_preview_seconds")));
  });

  it("requires sidecar, Demucs, and track file before stem preview is ready", () => {
    const file = new File(["a"], "a.wav", { type: "audio/wav" });
    const ready = isStemPreviewReady({
      sidecarOnline: true,
      demucsAvailable: true,
      trackFile: file,
    });
    const missingDemucs = isStemPreviewReady({
      sidecarOnline: true,
      demucsAvailable: false,
      trackFile: file,
    });

    assert.equal(ready.ready, true);
    assert.equal(missingDemucs.ready, false);
  });

  it("parses missing Demucs stem preview responses", () => {
    const parsed = parseStemPreviewResponse({
      ok: false,
      status: "missing_dependency",
      message: "Demucs and PyTorch are not installed.",
      setup_guidance: "pip install demucs torch",
      limitations: [STEM_PREVIEW_ONLY_NOTICE],
    });

    assert.ok(parsed);
    assert.equal(stemPreviewFailureIsMissingDependency(parsed!), true);
  });

  it("parses processed stem preview responses with two playback URLs", () => {
    const parsed = parseStemPreviewResponse(
      {
        ok: true,
        status: "preview_complete",
        message: "Vocal/instrumental stem preview processed locally.",
        method: "demucs-two-stems-vocals",
        audio_processed: true,
        artifact_id: "abc123",
        vocals: {
          file_name: "vocals.wav",
          artifact_url: "/v1/artifacts/stems/abc123/vocals",
        },
        no_vocals: {
          file_name: "no_vocals.wav",
          artifact_url: "/v1/artifacts/stems/abc123/no_vocals",
        },
        limitations: [STEM_PREVIEW_ONLY_NOTICE],
        warnings: ["Demucs preview output is not studio-quality."],
      },
      "http://127.0.0.1:47831"
    );

    assert.ok(parsed);
    assert.equal(stemPreviewResponseIsProcessed(parsed!), true);
    assert.equal(parsed?.vocals?.playbackUrl, "http://127.0.0.1:47831/v1/artifacts/stems/abc123/vocals");
    assert.equal(
      parsed?.noVocals?.playbackUrl,
      "http://127.0.0.1:47831/v1/artifacts/stems/abc123/no_vocals"
    );
    assert.equal(stemPreviewClaimsStudioQuality(parsed!), false);
    assert.match(STEM_PREVIEW_ONLY_NOTICE, /not studio-quality/i);
    assert.match(formatStemPreviewStatusMessage(parsed!), /Processed stem preview/i);
  });

  it("builds stem preview request params for one track", () => {
    const params = buildStemPreviewRequestParams(
      "trackA",
      new File(["a"], "a.wav", { type: "audio/wav" })
    );
    assert.equal(params.splitMode, "vocals_no_vocals");
    assert.equal(params.maxPreviewSeconds, 60);
  });

  it("does not auto-process stem separation through job queue stub", async () => {
    const result = await stubStemEngine.analyze({
      id: "inspection-stem",
      fileName: "a.wav",
      fileType: "audio/wav",
      fileSizeBytes: 1024,
      durationSeconds: 60,
      sampleRate: 44100,
      channelCount: 2,
      waveformPeaks: [],
      decoded: true,
      notes: [],
    });

    assert.equal(result.state, "idle");
    assert.equal(result.status, "engine-pending");
  });

  it("reports Demucs availability from capabilities", () => {
    assert.equal(
      isDemucsAvailable([
        { id: "demucs", label: "Demucs", status: "available", message: "ok", version: null },
      ]),
      true
    );
    const summary = demucsCapabilitySummary([
      { id: "demucs", label: "Demucs", status: "missing", message: "missing", version: null },
    ]);
    assert.equal(summary.status, "missing");
  });

  it("does not claim final export in stem preview model strings", () => {
    assert.match(STEM_PROCESSED_LABEL, /preview/i);
    assert.doesNotMatch(STEM_PREVIEW_ONLY_NOTICE, /finished mashup/i);
  });
});

describe("Combined preview processing", async () => {
  const {
    COMBINED_PREVIEW_ONLY_NOTICE,
    MISSING_STEM_ARTIFACTS_MESSAGE,
    buildCombinedPreviewRequestParams,
    combinedPreviewFinalExportIsFalse,
    isCombinedPreviewReady,
    resolveCombinedPreviewDirections,
  } = await importSrc("src/domain/combinedPreview.ts");
  const {
    parseCombinedPreviewResponse,
    combinedPreviewFailureIsMissingArtifact,
    combinedPreviewFailureIsMissingDependency,
    validateCombinedPreviewRequestParams,
  } = await importSrc("src/lib/localEngine/combinedPreview.ts");
  const { isRubberBandAvailable } = await importSrc("src/lib/localEngine/capabilities.ts");
  const { buildPitchTimePlan, buildTrackPlanningInput } = await importSrc(
    "src/domain/pitchTimePlanning.ts"
  );
  const {
    createSessionArtifactStore,
    updateTrackStemPreviewArtifact,
    createTrackArtifact,
  } = await importSrc("src/domain/sessionArtifacts.ts");

  const sampleDirection = {
    intentLabel: "Vocal A over Beat B",
    vocalTrackLabel: "Track A",
    instrumentalTrackLabel: "Track B",
    sourceBpm: 120,
    targetBpm: 128,
    bpmDifference: 8,
    tempoStretchRatio: 1.067,
    tempoStretchPercent: 6.7,
    tempoDirection: "speed_up" as const,
    tempoPlanSummary: "Planning only",
    sourceKeyLabel: "8A",
    targetKeyLabel: "8B",
    sourceCamelot: "8A",
    targetCamelot: "8B",
    suggestedPitchShiftSemitones: 1,
    safeRangeWarning: null,
    formantPreservationNote: "Use formants",
    vocalAdjustmentNote: "Vocal note",
    instrumentalAdjustmentNote: "Instrumental note",
    bpmSource: "detected" as const,
    keySource: "detected" as const,
    camelotSource: "detected" as const,
    limitations: [],
    djReviewRequired: true as const,
  };

  it("maps mash intent to vocal and instrumental stem artifact slots", () => {
    const store = createSessionArtifactStore("combined-session");
    store.tracks.trackA = updateTrackStemPreviewArtifact(
      createTrackArtifact({
        sessionId: "combined-session",
        slotId: "trackA",
        file: new File(["a"], "a.wav", { type: "audio/wav" }),
        inspection: null,
      }),
      "artifacttracka"
    );
    store.tracks.trackB = updateTrackStemPreviewArtifact(
      createTrackArtifact({
        sessionId: "combined-session",
        slotId: "trackB",
        file: new File(["b"], "b.wav", { type: "audio/wav" }),
        inspection: null,
      }),
      "artifacttrackb"
    );

    const plan = buildPitchTimePlan({
      trackA: buildTrackPlanningInput(store, "trackA", "Track A"),
      trackB: buildTrackPlanningInput(store, "trackB", "Track B"),
      intent: "vocal_a_over_beat_b",
    });

    const directions = resolveCombinedPreviewDirections(store, "vocal_a_over_beat_b", plan.directions);
    assert.equal(directions[0]?.mashIntent, "vocal_a_over_beat_b");
    assert.equal(directions[0]?.sourceVocalArtifactId, "artifacttracka");
    assert.equal(directions[0]?.targetInstrumentalArtifactId, "artifacttrackb");

    const reverse = resolveCombinedPreviewDirections(store, "vocal_b_over_beat_a", plan.directions);
    assert.equal(reverse[0]?.mashIntent, "vocal_b_over_beat_a");
    assert.equal(reverse[0]?.sourceVocalArtifactId, "artifacttrackb");
    assert.equal(reverse[0]?.targetInstrumentalArtifactId, "artifacttracka");
  });

  it("requires stem previews for both tracks before combined preview is ready", () => {
    const context = {
      mashIntent: "vocal_a_over_beat_b" as const,
      intentLabel: "Vocal A over Beat B",
      direction: sampleDirection,
      sourceVocalSlotId: "trackA" as const,
      targetInstrumentalSlotId: "trackB" as const,
      sourceVocalArtifactId: null,
      targetInstrumentalArtifactId: null,
      alignmentOffsetMs: 0,
    };

    const readiness = isCombinedPreviewReady({
      sidecarOnline: true,
      rubberBandAvailable: true,
      context,
      useNeutralProcessing: false,
    });

    assert.equal(readiness.ready, false);
    assert.equal(readiness.reason, MISSING_STEM_ARTIFACTS_MESSAGE);
  });

  it("parses missing artifact and missing dependency combined preview responses", () => {
    const missingArtifact = parseCombinedPreviewResponse({
      ok: false,
      status: "missing_artifact",
      message: MISSING_STEM_ARTIFACTS_MESSAGE,
      final_export: false,
    });
    const missingDependency = parseCombinedPreviewResponse({
      ok: false,
      status: "missing_dependency",
      message: "Rubber Band CLI is not available.",
      final_export: false,
    });

    assert.ok(missingArtifact);
    assert.ok(missingDependency);
    assert.equal(combinedPreviewFailureIsMissingArtifact(missingArtifact!), true);
    assert.equal(combinedPreviewFailureIsMissingDependency(missingDependency!), true);
    assert.equal(combinedPreviewFinalExportIsFalse(missingArtifact!), true);
  });

  it("parses successful combined preview with finalExport false", () => {
    const parsed = parseCombinedPreviewResponse(
      {
        ok: true,
        status: "preview_complete",
        message: "Combined preview processed locally.",
        audio_processed: true,
        final_export: false,
        artifact_url: "/v1/artifacts/combined-preview/abc123/preview",
      },
      "http://127.0.0.1:47831"
    );

    assert.ok(parsed);
    assert.equal(parsed?.finalExport, false);
    assert.equal(combinedPreviewFinalExportIsFalse(parsed!), true);
    assert.match(COMBINED_PREVIEW_ONLY_NOTICE, /not a final export/i);
  });

  it("builds combined preview request params from direction context", () => {
    const params = buildCombinedPreviewRequestParams(
      {
        mashIntent: "vocal_a_over_beat_b",
        intentLabel: "Vocal A over Beat B",
        direction: sampleDirection,
        sourceVocalSlotId: "trackA",
        targetInstrumentalSlotId: "trackB",
        sourceVocalArtifactId: "aaa111",
        targetInstrumentalArtifactId: "bbb222",
        alignmentOffsetMs: 120,
      },
      false
    );

    assert.equal(params.mashIntent, "vocal_a_over_beat_b");
    assert.equal(params.sourceVocalArtifactId, "aaa111");
    assert.equal(params.targetInstrumentalArtifactId, "bbb222");
    assert.equal(validateCombinedPreviewRequestParams(params).length, 0);
  });

  it("does not auto-process combined preview through arrangement stub", async () => {
    const { stubArrangementEngine } = await importSrc("src/engines/stubEngines.ts");
    const result = await stubArrangementEngine.analyze({
      id: "inspection-arr",
      fileName: "a.wav",
      fileType: "audio/wav",
      fileSizeBytes: 1024,
      durationSeconds: 60,
      sampleRate: 44100,
      channelCount: 2,
      waveformPeaks: [],
      decoded: true,
      notes: [],
    });
    assert.equal(result.state, "idle");
    assert.equal(result.status, "engine-pending");
  });

  it("reports Rubber Band availability for combined preview lane", () => {
    assert.equal(
      isRubberBandAvailable([
        { id: "rubberband", label: "Rubber Band CLI", status: "available", message: "ok", version: null },
      ]),
      true
    );
  });
});

describe("Preview session management", async () => {
  const {
    PREVIEW_ARTIFACT_LABEL,
    buildRegistryEntry,
    previewArtifactClaimsFinalExport,
  } = await importSrc("src/domain/previewArtifacts.ts");
  const {
    parseArtifactDeleteResponse,
    parseArtifactListResponse,
    parseArtifactMetadataResponse,
    validateCleanupArtifactId,
  } = await importSrc("src/lib/localEngine/artifacts.ts");
  const {
    EXPORT_PREP_LOCKED_NOTICE,
    exportPanelClaimsFinalMaster,
    exportPanelIsLocked,
  } = await importSrc("src/domain/exportPrep.ts");
  const {
    COMBINED_PREVIEW_MAX_SECONDS,
    combinedPreviewDurationWarning,
    validateCombinedPreviewDuration,
  } = await importSrc("src/domain/combinedPreview.ts");

  it("parses preview artifact list with preview-only labeling", () => {
    const parsed = parseArtifactListResponse({
      ok: true,
      status: "ready",
      artifacts: [
        {
          artifact_id: "abc123",
          artifact_type: "combined-preview",
          status: "ready",
          created_at: "2026-01-01T00:00:00.000Z",
          duration_seconds: 30,
          playback_urls: { primary: "/v1/artifacts/combined-preview/abc123/preview" },
          preview_only: true,
          final_export: false,
          primary_file_name: "preview.wav",
        },
      ],
    }, "http://127.0.0.1:47831");

    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.finalExport, false);
    assert.equal(previewArtifactClaimsFinalExport(parsed[0]!), false);
    assert.match(PREVIEW_ARTIFACT_LABEL, /not a final export/i);
  });

  it("parses artifact metadata loudness readout without faking values", () => {
    const parsed = parseArtifactMetadataResponse({
      ok: true,
      status: "ready",
      artifact_id: "abc123",
      artifact_type: "combined-preview",
      preview_only: true,
      final_export: false,
      technical: {
        duration_seconds: 30,
        sample_rate: 44100,
        channel_count: 2,
        codec: "pcm_s16le",
        container: "WAV",
        file_size_bytes: 1024,
        loudness: {
          integrated_lufs: null,
          true_peak_dbtp: null,
          peak_level_db: -3.2,
          status: "partial",
          message: "Integrated LUFS could not be measured.",
        },
      },
    });

    assert.ok(parsed?.technical);
    assert.equal(parsed?.technical?.loudness.integratedLufs, null);
    assert.equal(parsed?.technical?.loudness.status, "partial");
    assert.equal(parsed?.finalExport, false);
  });

  it("validates cleanup artifact id and delete response parsing", () => {
    assert.ok(validateCleanupArtifactId("../bad").length > 0);
    assert.equal(validateCleanupArtifactId("abc123").length, 0);

    const deleted = parseArtifactDeleteResponse({
      ok: true,
      status: "deleted",
      message: "Preview artifact deleted.",
      artifact_id: "abc123",
    });
    assert.equal(deleted?.ok, true);
  });

  it("validates combined preview duration limits", () => {
    assert.equal(validateCombinedPreviewDuration(30).length, 0);
    assert.ok(validateCombinedPreviewDuration(90).length > 0);
    assert.equal(COMBINED_PREVIEW_MAX_SECONDS, 60);
    assert.match(combinedPreviewDurationWarning(60) ?? "", /more time/i);
  });

  it("locked export panel does not claim final master export", () => {
    assert.equal(exportPanelIsLocked(false), true);
    assert.equal(exportPanelIsLocked(true), false);
    assert.equal(exportPanelClaimsFinalMaster(), false);
    assert.match(EXPORT_PREP_LOCKED_NOTICE, /stem previews/i);
  });

  it("builds preview registry entries with finalExport false", () => {
    const entry = buildRegistryEntry({
      artifactId: "stem123",
      artifactType: "stem",
      sourceTrackSlot: "trackA",
      label: "Track A stem preview",
    });
    assert.equal(entry.finalExport, false);
    assert.equal(entry.isPreviewOnly, true);
  });
});

describe("Local WAV export prototype", async () => {
  const { parseExportWavResponse } = await importSrc("src/lib/localEngine/export.ts");
  const {
    LOCAL_EXPORT_ARTIFACT_LABEL,
    exportResultClaimsFinalExport,
    exportResultGrantsPublicShare,
    validateExportWavRequest,
    DEFAULT_EXPORT_RIGHTS_NOTICE,
    EXPORT_WAV_ONLY_NOTICE,
  } = await importSrc("src/domain/localExport.ts");
  const {
    exportPanelIsLocked,
    isWavExportAvailable,
    EXPORT_MP3_STEMS_NOTICE,
  } = await importSrc("src/domain/exportPrep.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { previewArtifactClaimsFinalExport } = await importSrc("src/domain/previewArtifacts.ts");

  it("parses successful export response with finalExport true and publicShare false", () => {
    const parsed = parseExportWavResponse({
      ok: true,
      status: "ready",
      message: "Local WAV export created.",
      export_artifact_id: "exportabc123",
      source_combined_preview_artifact_id: "combinedabc1",
      artifact_url: "/v1/artifacts/exports/exportabc123/export",
      download_url: "/v1/artifacts/exports/exportabc123/export",
      file_size_bytes: 2048,
      duration_seconds: 30,
      sample_rate: 44100,
      channel_count: 2,
      codec: "pcm_s16le",
      loudness: {
        integrated_lufs: null,
        true_peak_dbtp: -1.2,
        peak_level_db: -2.0,
        status: "partial",
        message: "Integrated LUFS could not be measured.",
      },
      final_export: true,
      public_share: false,
      rights_notice: DEFAULT_EXPORT_RIGHTS_NOTICE,
      warnings: ["Local user-generated export prototype."],
      limitations: ["No MP3 or public sharing."],
    }, "http://127.0.0.1:47831");

    assert.ok(parsed);
    assert.equal(parsed?.finalExport, true);
    assert.equal(parsed?.publicShare, false);
    assert.equal(exportResultClaimsFinalExport(parsed!), true);
    assert.equal(exportResultGrantsPublicShare(parsed!), false);
    assert.match(parsed?.rightsNotice ?? "", /Rights to publish or distribute/i);
    assert.ok(parsed?.playbackUrl?.includes("/v1/artifacts/exports/exportabc123/export"));
  });

  it("validates combined-preview-only source id", () => {
    assert.ok(validateExportWavRequest({
      sourceCombinedPreviewArtifactId: "../bad",
      loudnessTargetMode: "measurement_only",
    }).length > 0);
    assert.equal(validateExportWavRequest({
      sourceCombinedPreviewArtifactId: "combinedabc1",
      loudnessTargetMode: "measurement_only",
    }).length, 0);
  });

  it("parses export artifact in browser list with export label", () => {
    const parsed = parseArtifactSummary({
      artifact_id: "exportabc123",
      artifact_type: "export",
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      duration_seconds: 30,
      playback_urls: { primary: "/v1/artifacts/exports/exportabc123/export" },
      preview_only: false,
      final_export: true,
      primary_file_name: "export.wav",
      preview_label: LOCAL_EXPORT_ARTIFACT_LABEL,
      source_combined_preview_artifact_id: "combinedabc1",
    }, "http://127.0.0.1:47831");

    assert.ok(parsed);
    assert.equal(parsed?.artifactType, "export");
    assert.equal(parsed?.finalExport, true);
    assert.equal(parsed?.previewOnly, false);
    assert.match(parsed?.previewLabel ?? "", /No public distribution rights granted/i);
    assert.equal(parsed?.sourceCombinedPreviewArtifactId, "combinedabc1");
  });

  it("preview artifacts still do not claim finalExport", () => {
    const preview = parseArtifactSummary({
      artifact_id: "combinedabc1",
      artifact_type: "combined-preview",
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      duration_seconds: 30,
      playback_urls: { primary: "/v1/artifacts/combined-preview/combinedabc1/preview" },
      preview_only: true,
      final_export: false,
      primary_file_name: "preview.wav",
    }, "http://127.0.0.1:47831");

    assert.ok(preview);
    assert.equal(previewArtifactClaimsFinalExport(preview!), false);
  });

  it("export panel unlock logic follows combined preview availability", () => {
    assert.equal(isWavExportAvailable(false), false);
    assert.equal(isWavExportAvailable(true), true);
    assert.equal(exportPanelIsLocked(false), true);
    assert.equal(exportPanelIsLocked(true), false);
    assert.match(EXPORT_MP3_STEMS_NOTICE, /not implemented/i);
    assert.match(EXPORT_WAV_ONLY_NOTICE, /WAV export artifact/i);
  });
});

describe("Full-length WAV export", async () => {
  const {
    FULL_EXPORT_SUBTYPE,
    buildFullLengthExportReadiness,
    evaluateLoudnessGateDisplay,
    formatReadinessChecklist,
    fullLengthExportUsesStemSources,
    isFullLengthExportReady,
    validateFullLengthExportRequest,
  } = await importSrc("src/domain/fullLengthExport.ts");
  const { parseFullWavExportResponse } = await importSrc("src/lib/localEngine/export.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { exportPanelHasAnySource, hasFullLengthExportSource } = await importSrc(
    "src/domain/exportPrep.ts"
  );
  const { createSessionArtifactStore, updateTrackStemPreviewArtifact, createTrackArtifact } =
    await importSrc("src/domain/sessionArtifacts.ts");

  it("validates stem artifact sources not preview wav", () => {
    const params = {
      sourceVocalStemArtifactId: "stemvocal001",
      targetInstrumentalStemArtifactId: "stembed00001",
      mashIntent: "vocal_a_over_beat_b",
      tempoRatio: 1.05,
      sourceBpm: 120,
      targetBpm: 128,
      pitchShiftSemitones: 2,
      alignmentOffsetMs: 0,
      loudnessTargetMode: "measurement_only" as const,
      neutralProcessing: false,
      confirmNeutralSettings: false,
    };
    assert.equal(validateFullLengthExportRequest(params).length, 0);
    assert.equal(fullLengthExportUsesStemSources(params), true);
    assert.ok(validateFullLengthExportRequest({
      ...params,
      sourceVocalStemArtifactId: "../preview",
    }).length > 0);
  });

  it("requires neutral confirmation when plan missing", () => {
    const errors = validateFullLengthExportRequest({
      sourceVocalStemArtifactId: "stemvocal001",
      targetInstrumentalStemArtifactId: "stembed00001",
      mashIntent: "vocal_a_over_beat_b",
      tempoRatio: null,
      sourceBpm: null,
      targetBpm: null,
      pitchShiftSemitones: 0,
      alignmentOffsetMs: 0,
      loudnessTargetMode: "measurement_only",
      neutralProcessing: false,
      confirmNeutralSettings: false,
    });
    assert.ok(errors.length > 0);
  });

  it("parses full export response with finalExport true and publicShare false", () => {
    const parsed = parseFullWavExportResponse({
      ok: true,
      status: "ready",
      message: "Full-length export ready.",
      export_artifact_id: "exportfull001",
      artifact_url: "/v1/artifacts/exports/exportfull001/export",
      download_url: "/v1/artifacts/exports/exportfull001/export",
      final_export: true,
      public_share: false,
      rights_notice: "Upload audio you own or are authorized to use.",
      loudness_gate: {
        status: "not_available",
        message: "Gate unavailable.",
        target_integrated_lufs: -14,
        target_true_peak_dbtp: -1,
      },
      processing_summary: {
        method: "rubberband-vocal + ffmpeg-full-mix",
        full_length: true,
        pitch_shift_semitones: 0,
        alignment_offset_ms: 0,
      },
      input_summary: {
        mash_intent: "vocal_a_over_beat_b",
        source_vocal_stem_artifact_id: "stemvocal001",
        target_instrumental_stem_artifact_id: "stembed00001",
        pitch_shift_semitones: 0,
        alignment_offset_ms: 0,
        neutral_processing: true,
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.finalExport, true);
    assert.equal(parsed?.publicShare, false);
    assert.equal(parsed?.processingSummary?.fullLength, true);
  });

  it("parses export artifact subtype full-wav", () => {
    const parsed = parseArtifactSummary({
      artifact_id: "exportfull001",
      artifact_type: "export",
      export_subtype: FULL_EXPORT_SUBTYPE,
      status: "ready",
      created_at: "2026-01-01T00:00:00.000Z",
      duration_seconds: 180,
      playback_urls: { primary: "/v1/artifacts/exports/exportfull001/export" },
      preview_only: false,
      final_export: true,
      primary_file_name: "export.wav",
      source_vocal_stem_artifact_id: "stemvocal001",
      target_instrumental_stem_artifact_id: "stembed00001",
    });
    assert.equal(parsed?.exportSubtype, "full-wav");
    assert.equal(parsed?.sourceVocalStemArtifactId, "stemvocal001");
  });

  it("formats readiness checklist and loudness gate states", () => {
    const store = createSessionArtifactStore("session-1");
    const items = buildFullLengthExportReadiness({
      artifactStore: store,
      context: null,
      sidecarOnline: true,
      rubberBandAvailable: true,
      ffmpegAvailable: true,
      useNeutralProcessing: true,
      confirmNeutralSettings: true,
      rightsAcknowledged: true,
    });
    assert.ok(formatReadinessChecklist(items).length >= 6);
    assert.equal(isFullLengthExportReady(items), false);

    const gate = evaluateLoudnessGateDisplay({
      integratedLufs: null,
      truePeakDbtp: null,
      peakLevelDb: null,
      status: "not_available",
      message: "Unavailable.",
    });
    assert.equal(gate.status, "not_available");
  });

  it("export panel unlocks with stem artifacts without combined preview", () => {
    const store = createSessionArtifactStore("session-2");
    const file = new File(["a"], "a.wav", { type: "audio/wav" });
    store.tracks.trackA = updateTrackStemPreviewArtifact(
      createTrackArtifact({
        sessionId: "session-2",
        slotId: "trackA",
        file,
        inspection: null,
      }),
      "stemtracka001"
    );
    store.tracks.trackB = updateTrackStemPreviewArtifact(
      createTrackArtifact({
        sessionId: "session-2",
        slotId: "trackB",
        file,
        inspection: null,
      }),
      "stemtrackb001"
    );
    assert.equal(hasFullLengthExportSource(store), true);
    assert.equal(exportPanelHasAnySource(false, true), true);
  });
});

describe("MP3 reference export and export session UX", async () => {
  const { parseMp3ExportResponse } = await importSrc("src/lib/localEngine/export.ts");
  const {
    ALLOWED_MP3_BITRATES,
    MP3_EXPORT_ARTIFACT_LABEL,
    MP3_REFERENCE_NOTICE,
    formatExportSubtypeLabel,
    formatMp3Bitrate,
    formatMp3ExportWarnings,
    isMp3ExportArtifact,
    isWavExportArtifact,
    mp3ExportPanelIsLocked,
    mp3ExportResultClaimsFinalExport,
    mp3ExportResultGrantsPublicShare,
    validateMp3ExportRequest,
  } = await importSrc("src/domain/mp3Export.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { isMp3ExportAvailable } = await importSrc("src/domain/exportPrep.ts");
  const {
    canReExportWithCurrentSettings,
    recordSuccessfulExport,
  } = await importSrc("src/lib/exportSession.ts");
  const { validateCleanupArtifactId } = await importSrc("src/lib/localEngine/artifacts.ts");

  it("parses successful MP3 export response with finalExport true and publicShare false", () => {
    const parsed = parseMp3ExportResponse({
      ok: true,
      status: "ready",
      message: "Local MP3 reference export created.",
      export_artifact_id: "mp3export001",
      source_wav_export_artifact_id: "wavexport001",
      artifact_url: "/v1/artifacts/exports/mp3export001/export.mp3",
      download_url: "/v1/artifacts/exports/mp3export001/export.mp3",
      export_format: "mp3",
      bitrate_kbps: 320,
      final_export: true,
      public_share: false,
      rights_notice: "Upload audio you own or are authorized to use.",
      warnings: ["MP3 is a reference/export format, not proof of distribution rights."],
      limitations: ["No public sharing."],
    });

    assert.equal(parsed?.ok, true);
    assert.equal(parsed?.exportFormat, "mp3");
    assert.equal(parsed?.bitrateKbps, 320);
    assert.equal(parsed?.finalExport, true);
    assert.equal(parsed?.publicShare, false);
    assert.equal(mp3ExportResultClaimsFinalExport(parsed!), true);
    assert.equal(mp3ExportResultGrantsPublicShare(parsed!), false);
    assert.ok(parsed?.playbackUrl?.includes("/export.mp3"));
    assert.match(parsed?.rightsNotice ?? "", /authorized/i);
  });

  it("validates WAV-export-only source and bitrate options", () => {
    assert.equal(validateMp3ExportRequest({
      sourceWavExportArtifactId: "validwav001",
      bitrateKbps: 320,
    }).length, 0);
    assert.ok(validateMp3ExportRequest({
      sourceWavExportArtifactId: "../bad",
      bitrateKbps: 320,
    }).length > 0);
    assert.ok(validateMp3ExportRequest({
      sourceWavExportArtifactId: "validwav001",
      bitrateKbps: 128 as never,
    }).length > 0);
    assert.deepEqual([...ALLOWED_MP3_BITRATES], [320, 256, 192]);
    assert.equal(formatMp3Bitrate(256), "256 kbps");
  });

  it("locks MP3 panel until WAV exports exist", () => {
    assert.equal(mp3ExportPanelIsLocked([]), true);
    assert.equal(mp3ExportPanelIsLocked([
      {
        artifactId: "wavex001",
        artifactType: "export",
        status: "ready",
        createdAt: "",
        durationSeconds: 30,
        playbackUrls: { primary: null, vocals: null, noVocals: null },
        playbackUrl: null,
        previewOnly: false,
        finalExport: true,
        previewLabel: "Local export",
        primaryFileName: "export.wav",
        sourceTrackLabel: null,
        targetTrackLabel: null,
        registryLabel: null,
        sourceCombinedPreviewArtifactId: null,
        exportSubtype: "preview-copy",
        exportFormat: "wav",
        sourceVocalStemArtifactId: null,
        targetInstrumentalStemArtifactId: null,
        sourceWavExportArtifactId: null,
      },
    ]), false);
    assert.equal(isMp3ExportAvailable(0), false);
    assert.equal(isMp3ExportAvailable(1), true);
  });

  it("distinguishes export format and subtype labels", () => {
    const wavArtifact = {
      artifactId: "wavex001",
      artifactType: "export" as const,
      status: "ready",
      createdAt: "",
      durationSeconds: 30,
      playbackUrls: { primary: null, vocals: null, noVocals: null },
      playbackUrl: null,
      previewOnly: false,
      finalExport: true,
      previewLabel: "Local export",
      primaryFileName: "export.wav",
      sourceTrackLabel: null,
      targetTrackLabel: null,
      registryLabel: null,
      sourceCombinedPreviewArtifactId: null,
      exportSubtype: "full-wav",
      exportFormat: "wav",
      sourceVocalStemArtifactId: null,
      targetInstrumentalStemArtifactId: null,
      sourceWavExportArtifactId: null,
    };
    const mp3Artifact = { ...wavArtifact, exportSubtype: "mp3", exportFormat: "mp3", primaryFileName: "export.mp3" };

    assert.equal(isWavExportArtifact(wavArtifact), true);
    assert.equal(isMp3ExportArtifact(mp3Artifact), true);
    assert.equal(formatExportSubtypeLabel("full-wav", "wav"), "export / full-wav");
    assert.equal(formatExportSubtypeLabel("mp3", "mp3"), "export / mp3");
    assert.match(MP3_EXPORT_ARTIFACT_LABEL, /No public distribution rights granted/i);
    assert.match(MP3_REFERENCE_NOTICE, /not proof of distribution rights/i);
  });

  it("parses MP3 export artifact in browser list", () => {
    const parsed = parseArtifactSummary({
      artifact_id: "mp3export001",
      artifact_type: "export",
      export_subtype: "mp3",
      export_format: "mp3",
      source_wav_export_artifact_id: "wavexport001",
      status: "ready",
      created_at: "2026-06-23T12:00:00Z",
      playback_urls: { primary: "/v1/artifacts/exports/mp3export001/export.mp3" },
      preview_only: false,
      final_export: true,
      primary_file_name: "export.mp3",
      preview_label: MP3_EXPORT_ARTIFACT_LABEL,
    });
    assert.equal(parsed?.exportFormat, "mp3");
    assert.equal(parsed?.sourceWavExportArtifactId, "wavexport001");
    assert.equal(parsed?.finalExport, true);
  });

  it("export session preferences track last export without raw audio", () => {
    const prefs = recordSuccessfulExport({
      mode: "mp3-reference",
      exportArtifactId: "mp3export001",
      sourceArtifactId: "wavexport001",
      exportFormat: "mp3",
      bitrateKbps: 256,
      createdAt: "2026-06-23T12:00:00Z",
    });
    assert.equal(prefs.lastMp3Bitrate, 256);
    assert.equal(prefs.lastSuccessfulExport?.exportArtifactId, "mp3export001");
    assert.equal(canReExportWithCurrentSettings(prefs, true, false, false), true);
    assert.equal(canReExportWithCurrentSettings(prefs, false, false, false), false);
  });

  it("cleanup validation accepts MP3 export artifact ids safely", () => {
    assert.equal(validateCleanupArtifactId("mp3export001").length, 0);
    assert.ok(validateCleanupArtifactId("../escape").length > 0);
  });

  it("formats MP3 export warnings including rights limitations", () => {
    const parsed = parseMp3ExportResponse({
      ok: true,
      status: "ready",
      message: "ok",
      final_export: true,
      public_share: false,
      warnings: ["Local MP3 reference export."],
      limitations: ["No distribution rights granted."],
    });
    assert.ok(formatMp3ExportWarnings(parsed!).some((line) => /distribution rights/i.test(line)));
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

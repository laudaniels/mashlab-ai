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
    assert.deepEqual(
      draftTemplates.map((draft: { id: string }) => draft.id),
      ["clean_blend", "club_edit", "creative_blend"]
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

  it("builds combined preview request params from direction context", async () => {
    const { createNeutralMixSettings } = await importSrc("src/domain/mixControls.ts");
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
      false,
      undefined,
      createNeutralMixSettings()
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
  const { createNeutralMixSettings } = await importSrc("src/domain/mixControls.ts");
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
      mixSettings: createNeutralMixSettings(),
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
      mixSettings: createNeutralMixSettings(),
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

describe("Mastering preset prototypes", async () => {
  const { parseMasterWavResponse } = await importSrc("src/lib/localEngine/mastering.ts");
  const {
    ALLOWED_MASTERING_PRESETS,
    MASTER_ARTIFACT_LABEL,
    MASTERING_PROTOTYPE_NOTICE,
    formatArtifactTypeLabel,
    formatGateStatus,
    formatMasteringPresetName,
    formatMasteringWarnings,
    formatReadoutLoudnessLine,
    masteringPanelIsLocked,
    masterResultClaimsFinalExport,
    masterResultGrantsPublicShare,
    masterResultIsPrototype,
    validateMasterWavRequest,
    MEASUREMENT_ONLY_PRESET,
  } = await importSrc("src/domain/masteringPresets.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { isMasteringAvailable } = await importSrc("src/domain/exportPrep.ts");
  const { validateCleanupArtifactId } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { isWavExportArtifact } = await importSrc("src/domain/mp3Export.ts");

  it("parses mastering response with finalExport, masteringPrototype, publicShare false", () => {
    const parsed = parseMasterWavResponse({
      ok: true,
      status: "ready",
      message: "Mastering preset applied.",
      master_artifact_id: "master001",
      source_wav_export_artifact_id: "wavexport001",
      preset: "general_safe_normalize",
      artifact_url: "/v1/artifacts/masters/master001/master",
      download_url: "/v1/artifacts/masters/master001/master",
      before_readout: {
        loudness: { integrated_lufs: -18, true_peak_dbtp: -3, status: "available", message: "before" },
      },
      after_readout: {
        loudness: { integrated_lufs: -14.2, true_peak_dbtp: -1.1, status: "available", message: "after" },
      },
      target_integrated_lufs: -14,
      target_true_peak_dbtp: -1,
      loudness_gate: {
        status: "pass",
        message: "Within preset targets — prototype only.",
        target_integrated_lufs: -14,
        target_true_peak_dbtp: -1,
      },
      audio_created: true,
      final_export: true,
      public_share: false,
      mastering_prototype: true,
      rights_notice: "Upload audio you own or are authorized to use.",
      warnings: ["Prototype only."],
      limitations: ["No distribution rights granted."],
    });

    assert.equal(parsed?.finalExport, true);
    assert.equal(parsed?.publicShare, false);
    assert.equal(parsed?.masteringPrototype, true);
    assert.equal(masterResultClaimsFinalExport(parsed!), true);
    assert.equal(masterResultGrantsPublicShare(parsed!), false);
    assert.equal(masterResultIsPrototype(parsed!), true);
    assert.match(parsed?.rightsNotice ?? "", /authorized/i);
  });

  it("validates WAV-export-only source and preset options", () => {
    assert.equal(
      validateMasterWavRequest({
        sourceWavExportArtifactId: "wavexport001",
        preset: MEASUREMENT_ONLY_PRESET,
      }).length,
      0
    );
    assert.ok(
      validateMasterWavRequest({
        sourceWavExportArtifactId: "../bad",
        preset: MEASUREMENT_ONLY_PRESET,
      }).length > 0
    );
    assert.ok(
      validateMasterWavRequest({
        sourceWavExportArtifactId: "wavexport001",
        preset: "club_master" as never,
      }).length > 0
    );
    assert.deepEqual([...ALLOWED_MASTERING_PRESETS].sort(), [
      "club_loudness_prototype",
      "dj_loudness_prototype",
      "general_safe_normalize",
      "measurement_only",
    ]);
  });

  it("locks mastering panel until WAV exports exist", () => {
    assert.equal(masteringPanelIsLocked([]), true);
    assert.equal(isMasteringAvailable(0), false);
    assert.equal(isMasteringAvailable(1), true);
  });

  it("formats before/after readout and gate status", () => {
    const line = formatReadoutLoudnessLine({
      durationSeconds: 30,
      sampleRate: 44100,
      channelCount: 2,
      codec: "pcm_s16le",
      container: "WAV",
      fileSizeBytes: 1024,
      loudness: {
        integratedLufs: -14.2,
        truePeakDbtp: -1.0,
        peakLevelDb: -1.0,
        status: "available",
        message: "Measured.",
      },
    });
    assert.match(line, /-14\.2 LUFS/);
    assert.equal(
      formatGateStatus({
        status: "warn",
        message: "Prototype gate.",
        integratedLufs: -12,
        truePeakDbtp: -0.5,
        targetIntegratedLufs: -14,
        targetTruePeakDbtp: -1,
      }),
      "warn"
    );
    assert.equal(formatMasteringPresetName("dj_loudness_prototype"), "DJ loudness prototype");
  });

  it("parses master artifact in browser list", () => {
    const parsed = parseArtifactSummary({
      artifact_id: "master001",
      artifact_type: "master",
      master_preset: "general_safe_normalize",
      source_wav_export_artifact_id: "wavexport001",
      mastering_prototype: true,
      status: "ready",
      created_at: "2026-06-23T12:00:00Z",
      playback_urls: { primary: "/v1/artifacts/masters/master001/master" },
      preview_only: false,
      final_export: true,
      primary_file_name: "master.wav",
      preview_label: MASTER_ARTIFACT_LABEL,
    });
    assert.equal(parsed?.artifactType, "master");
    assert.equal(parsed?.masterPreset, "general_safe_normalize");
    assert.equal(parsed?.masteringPrototype, true);
    assert.equal(formatArtifactTypeLabel(parsed!), "master / general_safe_normalize");
  });

  it("distinguishes master from export artifacts", () => {
    const wavExport = {
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
      exportSubtype: "preview-copy",
      exportFormat: "wav",
      sourceVocalStemArtifactId: null,
      targetInstrumentalStemArtifactId: null,
      sourceWavExportArtifactId: null,
      masterPreset: null,
      masteringPrototype: false,
    };
    assert.equal(isWavExportArtifact(wavExport), true);
    assert.match(MASTERING_PROTOTYPE_NOTICE, /not professional mastering/i);
    assert.match(MASTER_ARTIFACT_LABEL, /No public distribution rights granted/i);
  });

  it("cleanup validation accepts master artifact ids safely", () => {
    assert.equal(validateCleanupArtifactId("master001").length, 0);
    assert.ok(validateCleanupArtifactId("../escape").length > 0);
  });

  it("formats mastering warnings including rights limitations", () => {
    const parsed = parseMasterWavResponse({
      ok: true,
      status: "ready",
      message: "ok",
      final_export: true,
      public_share: false,
      mastering_prototype: true,
      warnings: ["Prototype only."],
      limitations: ["No distribution rights granted."],
    });
    assert.ok(formatMasteringWarnings(parsed!).some((line) => /distribution rights/i.test(line)));
  });
});

describe("project package export", async () => {
  const { parsePackageExportResponse } = await importSrc("src/lib/localEngine/package.ts");
  const {
    formatPackageManifestSummary,
    isPackageableArtifact,
    isPackageArtifact,
    packageResultIsLocalOnly,
    packageResultRequiresRightsNotice,
    sanitizePackageLabel,
    selectDefaultPackageArtifacts,
    validatePackageExportRequest,
    validateSelectedArtifactIds,
    PACKAGE_RAW_UPLOADS_EXCLUDED_NOTICE,
  } = await importSrc("src/domain/projectPackage.ts");
  const { validateCleanupArtifactId } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { formatArtifactTypeLabel } = await importSrc("src/domain/masteringPresets.ts");

  it("selects default package artifacts with latest exports and stems", () => {
    const artifacts = [
      {
        artifactId: "stemA001",
        artifactType: "stem" as const,
        createdAt: "2026-01-01T00:00:00Z",
        status: "ready",
        durationSeconds: 30,
        playbackUrls: { primary: null, vocals: null, noVocals: null },
        playbackUrl: null,
        previewOnly: true,
        finalExport: false,
        previewLabel: "preview",
        primaryFileName: "vocals.wav",
        sourceTrackLabel: "Track A",
        targetTrackLabel: null,
        registryLabel: null,
        sourceCombinedPreviewArtifactId: null,
        exportSubtype: null,
        exportFormat: null,
        sourceVocalStemArtifactId: null,
        targetInstrumentalStemArtifactId: null,
        sourceWavExportArtifactId: null,
        masterPreset: null,
        masteringPrototype: false,
        packageOnly: false,
        packageSubtype: null,
        packageLabel: null,
        includedFileCount: null,
        selectedArtifactIds: null,
        publicShare: false,
        mixSummary: null,
      },
      {
        artifactId: "wavfull001",
        artifactType: "export" as const,
        createdAt: "2026-01-02T00:00:00Z",
        status: "ready",
        durationSeconds: 60,
        playbackUrls: { primary: "/wav", vocals: null, noVocals: null },
        playbackUrl: "/wav",
        previewOnly: false,
        finalExport: true,
        previewLabel: "export",
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
        masterPreset: null,
        masteringPrototype: false,
        packageOnly: false,
        packageSubtype: null,
        packageLabel: null,
        includedFileCount: null,
        selectedArtifactIds: null,
        publicShare: false,
        mixSummary: null,
      },
      {
        artifactId: "mp3ref001",
        artifactType: "export" as const,
        createdAt: "2026-01-03T00:00:00Z",
        status: "ready",
        durationSeconds: 60,
        playbackUrls: { primary: "/mp3", vocals: null, noVocals: null },
        playbackUrl: "/mp3",
        previewOnly: false,
        finalExport: true,
        previewLabel: "mp3",
        primaryFileName: "export.mp3",
        sourceTrackLabel: null,
        targetTrackLabel: null,
        registryLabel: null,
        sourceCombinedPreviewArtifactId: null,
        exportSubtype: "mp3",
        exportFormat: "mp3",
        sourceVocalStemArtifactId: null,
        targetInstrumentalStemArtifactId: null,
        sourceWavExportArtifactId: null,
        masterPreset: null,
        masteringPrototype: false,
        packageOnly: false,
        packageSubtype: null,
        packageLabel: null,
        includedFileCount: null,
        selectedArtifactIds: null,
        publicShare: false,
        mixSummary: null,
      },
    ];

    const selected = selectDefaultPackageArtifacts(artifacts);
    assert.ok(selected.includes("wavfull001"));
    assert.ok(selected.includes("mp3ref001"));
    assert.ok(selected.includes("stemA001"));
  });

  it("parses package response with packageOnly true and publicShare false", () => {
    const parsed = parsePackageExportResponse({
      ok: true,
      status: "ready",
      message: "Local project package created.",
      package_artifact_id: "pack001",
      package_label: "My Project",
      package_type: "folder",
      local_folder_path: "artifacts/packages/pack001/MashLab_Project_My_Project",
      manifest_path: "artifacts/packages/pack001/MashLab_Project_My_Project/manifest.json",
      rights_notice_path: "artifacts/packages/pack001/MashLab_Project_My_Project/RIGHTS_NOTICE.txt",
      included_files: [
        {
          artifact_id: "stem001",
          artifact_type: "stem",
          artifact_subtype: null,
          source_path: "vocals.wav",
          package_path: "stems/track-a-vocals.wav",
        },
      ],
      included_artifact_ids: ["stem001"],
      public_share: false,
      package_only: true,
      rights_notice: "User responsible for rights.",
      warnings: ["Local only."],
      limitations: ["No distribution rights granted."],
    });

    assert.equal(parsed?.packageOnly, true);
    assert.equal(parsed?.publicShare, false);
    assert.ok(packageResultRequiresRightsNotice(parsed!));
    assert.ok(packageResultIsLocalOnly(parsed!));
    assert.match(formatPackageManifestSummary(parsed!), /manifest \+ rights notice included/i);
  });

  it("validates package export requires label and rejects raw uploads by eligibility", () => {
    assert.ok(
      validatePackageExportRequest({
        packageLabel: "",
        selectedArtifactIds: ["stem001"],
        packageType: "folder",
        includeTechnicalReport: false,
      }).length > 0
    );
    assert.match(PACKAGE_RAW_UPLOADS_EXCLUDED_NOTICE, /raw uploads are excluded/i);
    assert.equal(
      validateSelectedArtifactIds(["pitch001"], []).length,
      1
    );
  });

  it("excludes package and pitch-time artifacts from packageable set", () => {
    assert.equal(
      isPackageableArtifact({
        artifactId: "pack001",
        artifactType: "package",
      } as import("../src/domain/previewArtifacts.ts").PreviewArtifactSummary),
      false
    );
    assert.equal(
      isPackageableArtifact({
        artifactId: "pitch001",
        artifactType: "pitch-time-preview",
      } as import("../src/domain/previewArtifacts.ts").PreviewArtifactSummary),
      false
    );
  });

  it("sanitizes package labels safely", () => {
    assert.equal(sanitizePackageLabel("My Mash!"), "My_Mash");
    assert.equal(sanitizePackageLabel("   "), "project");
  });

  it("parses package artifact summary subtype folder or zip", () => {
    const folder = parseArtifactSummary({
      artifact_id: "pack001",
      artifact_type: "package",
      status: "ready",
      created_at: "2026-01-01T00:00:00Z",
      playback_urls: { primary: null },
      preview_only: false,
      final_export: false,
      primary_file_name: "manifest.json",
      preview_label: "Local project package",
      package_only: true,
      package_subtype: "folder",
      package_label: "Demo",
      public_share: false,
    });
    assert.ok(isPackageArtifact(folder!));
    assert.equal(folder?.packageSubtype, "folder");
    assert.equal(formatArtifactTypeLabel(folder!), "package / folder");
  });

  it("cleanup validation accepts package artifact ids safely", () => {
    assert.equal(validateCleanupArtifactId("package001").length, 0);
    assert.ok(validateCleanupArtifactId("../escape").length > 0);
  });
});

describe("Mix quality controls", async () => {
  const {
    MIX_CONTROLS_NOTICE,
    MIX_DJ_REVIEW_NOTICE,
    createNeutralMixSettings,
    formatMixSettingsSummary,
    mixSettingsToRequestFields,
    validateMixSettings,
  } = await importSrc("src/domain/mixControls.ts");
  const { parseCombinedPreviewResponse } = await importSrc(
    "src/lib/localEngine/combinedPreview.ts"
  );
  const { parseFullWavExportResponse } = await importSrc("src/lib/localEngine/export.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { CLUB_LOUDNESS_PROTOTYPE_PRESET, MASTERING_PRESET_DEFINITIONS } = await importSrc(
    "src/domain/masteringPresets.ts"
  );

  it("validates mix gain and fade ranges", () => {
    const neutral = createNeutralMixSettings();
    assert.equal(validateMixSettings(neutral).length, 0);
    assert.ok(validateMixSettings({ ...neutral, vocalGainDb: 99 }).length > 0);
    assert.match(MIX_DJ_REVIEW_NOTICE, /not professional mastering/i);
    assert.match(MIX_CONTROLS_NOTICE, /new preview or export/i);
  });

  it("serializes mix settings for API requests", () => {
    const fields = mixSettingsToRequestFields({
      ...createNeutralMixSettings(),
      vocalGainDb: 2,
      limiterSafety: true,
    });
    assert.equal(fields.vocal_gain_db, 2);
    assert.equal(fields.limiter_safety, true);
    assert.match(formatMixSettingsSummary(createNeutralMixSettings()), /vocal \+0\.0 dB/);
  });

  it("parses combined preview response mix summaries", () => {
    const parsed = parseCombinedPreviewResponse({
      ok: true,
      status: "preview_complete",
      message: "ok",
      final_export: false,
      input_summary: {
        mash_intent: "vocal_a_over_beat_b",
        source_vocal_artifact_id: "v1",
        target_instrumental_artifact_id: "b1",
        mix_settings: { vocal_gain_db: 1.5, limiter_safety: true },
      },
      processing_summary: {
        method: "rubberband-vocal + ffmpeg-full-mix",
        mix_settings: { vocal_gain_db: 1.5, limiter_safety: true },
        limiter_safety_applied: true,
      },
    });
    assert.equal(parsed?.inputSummary?.mixSettings?.vocalGainDb, 1.5);
    assert.equal(parsed?.processingSummary?.limiterSafetyApplied, true);
  });

  it("parses full export response mix summaries", () => {
    const parsed = parseFullWavExportResponse({
      ok: true,
      status: "ready",
      message: "ok",
      final_export: true,
      input_summary: {
        source_vocal_stem_artifact_id: "v1",
        mix_settings: { clipping_guard: true },
      },
      processing_summary: {
        method: "full-length",
        clipping_guard_applied: true,
      },
    });
    assert.equal(parsed?.inputSummary?.mixSettings?.clippingGuard, true);
    assert.equal(parsed?.processingSummary?.clippingGuardApplied, true);
  });

  it("parses artifact mix_summary for browser display", () => {
    const parsed = parseArtifactSummary({
      artifact_id: "combo001",
      artifact_type: "combined-preview",
      status: "ready",
      created_at: "2026-01-01T00:00:00Z",
      playback_urls: { primary: "/v1/artifacts/combined-preview/combo001/preview" },
      preview_only: true,
      final_export: false,
      primary_file_name: "preview.wav",
      preview_label: "Combined preview",
      mix_summary: "vocal +2.0 dB · bed -1.0 dB · master +0.0 dB",
      public_share: false,
    });
    assert.equal(parsed?.mixSummary, "vocal +2.0 dB · bed -1.0 dB · master +0.0 dB");
  });

  it("includes club loudness prototype without certification claims", () => {
    const club = MASTERING_PRESET_DEFINITIONS.find((p) => p.id === CLUB_LOUDNESS_PROTOTYPE_PRESET);
    assert.ok(club);
    assert.match(club!.label, /prototype/i);
    assert.ok(club!.warnings.some((line) => /not professional mastering|club-ready/i.test(line)));
  });
});

describe("End-to-end workflow QA hardening", async () => {
  const {
    buildWorkflowReadiness,
    countWorkflowArtifacts,
    formatWorkflowStepStatus,
    WORKFLOW_READINESS_NOTICE,
  } = await importSrc("src/domain/workflowReadiness.ts");
  const {
    buildDependencyHealth,
    collectMissingSetupGuidance,
    formatDependencyHealthSummary,
  } = await importSrc("src/domain/dependencyHealth.ts");
  const {
    formatUserFacingError,
    artifactDeleteFailureMessage,
    loudnessUnavailableMessage,
  } = await importSrc("src/domain/userFacingErrors.ts");
  const {
    isSafeArtifactId,
    validateArtifactIdForCleanup,
    artifactDeletionScopeNotice,
  } = await importSrc("src/domain/artifactLifecycle.ts");
  const {
    RIGHTS_DOCTRINE_EXACT,
    RIGHTS_SURFACE_EXPECTATIONS,
    allCriticalSurfacesIncludeRightsDoctrine,
    auditRightsNotice,
  } = await importSrc("src/domain/rightsNoticeAudit.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");
  const { selectDefaultPackageArtifacts } = await importSrc("src/domain/projectPackage.ts");
  const { createSessionArtifactStore } = await importSrc("src/domain/sessionArtifacts.ts");

  it("builds workflow readiness checklist without auto-processing claims", () => {
    const steps = buildWorkflowReadiness({
      tracks: { trackA: { status: "ready" } as never, trackB: null },
      trackJobs: { trackA: null, trackB: null },
      artifactStore: createSessionArtifactStore("qa-session"),
      sidecarOnline: false,
      capabilities: [],
      artifactCounts: countWorkflowArtifacts([]),
    });
    assert.match(WORKFLOW_READINESS_NOTICE, /informational only/i);
    assert.ok(steps.some((step) => step.id === "tracks_loaded"));
    assert.ok(steps.some((step) => step.id === "missing_dependencies"));
    assert.equal(formatWorkflowStepStatus("complete"), "Complete");
  });

  it("formats dependency health and setup guidance when offline", () => {
    const items = buildDependencyHealth(false, []);
    assert.match(formatDependencyHealthSummary(items), /dependency checks/i);
    assert.ok(collectMissingSetupGuidance(items).length > 0);
    assert.match(items[0]!.message, /without FFmpeg/i);
  });

  it("reports WSL advanced rhythm as available once the sidecar reports madmom or Essentia", () => {
    const withoutAdvancedEngines = buildDependencyHealth(true, []);
    const wslMissing = withoutAdvancedEngines.find((item) => item.id === "wsl_rhythm");
    assert.equal(wslMissing?.status, "optional");
    assert.match(wslMissing!.setupGuidance ?? "", /setup-rhythm-linux\.sh/);

    const withMadmom = buildDependencyHealth(true, [
      { id: "madmom", label: "madmom", status: "available", message: "madmom is importable.", version: null },
    ]);
    const wslMadmom = withMadmom.find((item) => item.id === "wsl_rhythm");
    assert.equal(wslMadmom?.status, "available");
    assert.match(wslMadmom!.message, /madmom/i);
    assert.equal(wslMadmom?.setupGuidance, null);
  });

  it("formats actionable user-facing errors", () => {
    const message = formatUserFacingError({
      status: "missing_artifact",
      message: "Preview artifact not found.",
    });
    assert.match(message, /Create the required preview/i);
    assert.match(
      artifactDeleteFailureMessage("processing_failed", "Permission denied."),
      /Processing failed locally/i
    );
    assert.match(loudnessUnavailableMessage(), /not_available/i);
  });

  it("validates artifact lifecycle safety for cleanup ids", () => {
    assert.equal(isSafeArtifactId("abc123"), true);
    assert.equal(isSafeArtifactId("../escape"), false);
    assert.ok(validateArtifactIdForCleanup("../escape").length > 0);
    assert.match(artifactDeletionScopeNotice(), /\.work\/artifacts/);
  });

  it("audits rights doctrine across critical surfaces", () => {
    assert.equal(requiredRightsNotice, RIGHTS_DOCTRINE_EXACT);
    assert.equal(allCriticalSurfacesIncludeRightsDoctrine(), true);
    assert.equal(auditRightsNotice(requiredRightsNotice).length, 0);
    for (const surface of RIGHTS_SURFACE_EXPECTATIONS) {
      for (const forbidden of surface.mustNotInclude) {
        assert.ok(
          !surface.notice.toLowerCase().includes(forbidden) ||
            surface.notice.toLowerCase().includes("not ") ||
            surface.notice.toLowerCase().includes("no "),
          `${surface.surface} should not claim ${forbidden}`
        );
      }
    }
  });

  it("selects package artifacts after exports and masters exist", () => {
    const artifacts = [
      {
        artifactId: "stem001",
        artifactType: "stem" as const,
        createdAt: "2026-01-01T00:00:00Z",
      },
      {
        artifactId: "wavfull001",
        artifactType: "export" as const,
        exportSubtype: "full-wav",
        createdAt: "2026-01-02T00:00:00Z",
      },
      {
        artifactId: "master001",
        artifactType: "master" as const,
        createdAt: "2026-01-03T00:00:00Z",
        playbackUrl: "/v1/artifacts/masters/master001/master",
      },
    ];
    const selected = selectDefaultPackageArtifacts(artifacts as never);
    assert.ok(selected.includes("wavfull001"));
    assert.ok(selected.includes("master001"));
  });
});

describe("Arrangement draft intelligence", async () => {
  const {
    ARRANGEMENT_PLANNING_ONLY_NOTICE,
    applyDraftSettingsFromPlan,
    arrangementAutoProcessingEnabled,
    arrangementPlanClaimsAudioProcessed,
    arrangementSectionsAvoidFakeLabels,
    buildArrangementPlan,
    getDraftTemplateDefinition,
  } = await importSrc("src/domain/arrangementPlanning.ts");
  const { createSessionArtifactStore, createTrackArtifact } = await importSrc(
    "src/domain/sessionArtifacts.ts"
  );
  const { buildBeatGridFromAnalysis } = await importSrc("src/domain/beatGrid.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");

  function buildStoreWithBeats() {
    const store = createSessionArtifactStore("arrangement-session");
    const beat = {
      bpm: 128,
      beatCount: 32,
      beatTimes: Array.from({ length: 32 }, (_, index) => index * 0.46875),
      bpmConfidence: 0.8,
      downbeatStatus: "not_implemented" as const,
      limitations: [],
      method: "librosa",
    };
    const grid = buildBeatGridFromAnalysis(beat, { jobComplete: true, phraseLengthBars: 16 });
    const trackA = createTrackArtifact({
      sessionId: "arrangement-session",
      slotId: "trackA",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      inspection: null,
    });
    const trackB = createTrackArtifact({
      sessionId: "arrangement-session",
      slotId: "trackB",
      file: new File(["b"], "b.wav", { type: "audio/wav" }),
      inspection: null,
    });
    store.tracks.trackA = {
      ...trackA,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemA001", updatedAt: new Date().toISOString() },
    };
    store.tracks.trackB = {
      ...trackB,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemB001", updatedAt: new Date().toISOString() },
    };
    return store;
  }

  it("builds clean blend plan with planningOnly true", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "clean_blend",
      mashIntent: "vocal_a_over_beat_b",
    });
    assert.ok(plan);
    assert.equal(plan?.planningOnly, true);
    assert.equal(plan?.draftType, "clean_blend");
    assert.match(plan?.limitations.join(" "), /Plan only/i);
  });

  it("club edit suggests longer preview and intro/outro sections", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    assert.equal(plan?.suggestedPreviewSeconds, 60);
    assert.ok(plan?.arrangementSections.some((section) => section.label.includes("Intro")));
    assert.ok(plan?.arrangementSections.some((section) => section.label.includes("Outro")));
  });

  it("creative blend includes advisory hook language without fake section detection", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "creative_blend",
      mashIntent: "vocal_a_over_beat_b",
    });
    assert.ok(plan?.warnings.some((line) => /hook-over-drop/i.test(line)));
    assert.ok(arrangementSectionsAvoidFakeLabels(plan!.arrangementSections));
    assert.ok(!plan?.arrangementSections.some((section) => /verse detected|chorus detected/i.test(section.label)));
  });

  it("reports unavailable phrase basis without fabricating downbeats", () => {
    const store = createSessionArtifactStore("empty-grid");
    store.tracks.trackA = createTrackArtifact({
      sessionId: "empty-grid",
      slotId: "trackA",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      inspection: null,
    });
    store.tracks.trackB = createTrackArtifact({
      sessionId: "empty-grid",
      slotId: "trackB",
      file: new File(["b"], "b.wav", { type: "audio/wav" }),
      inspection: null,
    });
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "clean_blend",
      mashIntent: "compare_both",
    });
    assert.ok(plan);
    assert.equal(plan?.phraseBasis, "unavailable");
    assert.match(plan?.missingRequirements.join(" "), /stem previews/i);
  });

  it("apply draft settings does not enable auto processing", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    assert.ok(plan);
    const applied = applyDraftSettingsFromPlan(plan!);
    assert.equal(applied.mashIntent, "vocal_a_over_beat_b");
    assert.equal(applied.previewDurationSeconds, 60);
    assert.equal(arrangementAutoProcessingEnabled(), false);
    assert.equal(arrangementPlanClaimsAudioProcessed(plan!), false);
  });

  it("includes rights doctrine in arrangement planning notices", () => {
    assert.match(ARRANGEMENT_PLANNING_ONLY_NOTICE, /Plan only/i);
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "clean_blend",
      mashIntent: "vocal_a_over_beat_b",
    });
    assert.equal(plan?.rightsNotice, requiredRightsNotice);
    assert.match(getDraftTemplateDefinition("clean_blend").limitations.join(" "), /not detected/i);
  });
});

describe("Arrangement section preview binding", async () => {
  const {
    bindSectionToPreviewSettings,
    buildMissingRequirementActions,
    computeSectionDurationSeconds,
    findMissingRequirementAction,
    formatPhraseBasisSourceLabel,
    resolvePreviewStartOffset,
    sectionBindingAutoProcessingEnabled,
    selectArrangementSection,
    ARRANGEMENT_SECTION_BINDING_NOTICE,
  } = await importSrc("src/domain/arrangementSectionBinding.ts");
  const {
    buildArrangementPlan,
    findArrangementSection,
  } = await importSrc("src/domain/arrangementPlanning.ts");
  const { buildWorkflowReadiness, emptyWorkflowArtifactCounts } = await importSrc(
    "src/domain/workflowReadiness.ts"
  );
  const { createSessionArtifactStore, createTrackArtifact } = await importSrc(
    "src/domain/sessionArtifacts.ts"
  );
  const { buildBeatGridFromAnalysis } = await importSrc("src/domain/beatGrid.ts");
  const {
    serializeCombinedPreviewRequestBody,
    validateCombinedPreviewStartOffset,
  } = await importSrc("src/domain/combinedPreview.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");
  const {
    saveSectionPreviewBinding,
    loadSectionPreviewBinding,
    saveSelectedArrangementSection,
    loadSelectedArrangementSection,
  } = await importSrc("src/lib/arrangementDraftSession.ts");

  function buildStoreWithBeats() {
    const store = createSessionArtifactStore("binding-session");
    const beat = {
      bpm: 128,
      beatCount: 32,
      beatTimes: Array.from({ length: 32 }, (_, index) => index * 0.46875),
      bpmConfidence: 0.8,
      downbeatStatus: "not_implemented" as const,
      limitations: [],
      method: "librosa",
    };
    const grid = buildBeatGridFromAnalysis(beat, { jobComplete: true, phraseLengthBars: 16 });
    const trackA = createTrackArtifact({
      sessionId: "binding-session",
      slotId: "trackA",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      inspection: null,
    });
    const trackB = createTrackArtifact({
      sessionId: "binding-session",
      slotId: "trackB",
      file: new File(["b"], "b.wav", { type: "audio/wav" }),
      inspection: null,
    });
    store.tracks.trackA = {
      ...trackA,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemA001", updatedAt: new Date().toISOString() },
    };
    store.tracks.trackB = {
      ...trackB,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemB001", updatedAt: new Date().toISOString() },
    };
    return store;
  }

  it("selects advisory section with phrase basis metadata", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned");
    assert.ok(section);
    const selected = selectArrangementSection(plan!, section!, 128);
    assert.equal(selected.draftType, "club_edit");
    assert.equal(selected.sectionId, "intro-planned");
    assert.equal(selected.sourceLabel, formatPhraseBasisSourceLabel(section!.basis));
    assert.match(selected.limitations.join(" "), /planning|config/i);
  });

  it("binds section duration from heuristic bars", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "mix-body")!;
    const duration = computeSectionDurationSeconds(section, 128);
    assert.ok(duration);
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    assert.equal(binding.previewDurationSeconds, duration);
    assert.equal(binding.planningOnly, true);
  });

  it("marks start offset pending when section start is unavailable", () => {
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "creative_blend",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = {
      ...findArrangementSection(plan!, "hook-advisory")!,
      startTimeSeconds: null,
    };
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    assert.equal(binding.startOffsetStatus, "pending_unavailable");
    assert.equal(binding.previewStartSeconds, null);
    assert.equal(sectionBindingAutoProcessingEnabled(), false);
  });

  it("maps missing requirements to navigation targets", () => {
    const actions = buildMissingRequirementActions({
      required: {
        trackALoaded: false,
        trackBLoaded: false,
        trackAStemPreview: false,
        trackBStemPreview: false,
        beatAnalysisAvailable: false,
        phraseDataAvailable: false,
      },
      direction: null,
      sidecarOnline: false,
      rubberBandAvailable: false,
      demucsAvailable: false,
      ffmpegAvailable: false,
    });
    assert.ok(findMissingRequirementAction(actions, "tracks_not_loaded"));
    assert.equal(findMissingRequirementAction(actions, "tracks_not_loaded")?.targetScreen, "upload");
    assert.equal(findMissingRequirementAction(actions, "stem_previews_missing")?.targetScreen, "stems");
  });

  it("reflects arrangement binding in workflow readiness", () => {
    const store = buildStoreWithBeats();
    const steps = buildWorkflowReadiness({
      tracks: {
        trackA: { slotId: "trackA", status: "ready" } as never,
        trackB: { slotId: "trackB", status: "ready" } as never,
      },
      trackJobs: { trackA: null, trackB: null },
      artifactStore: store,
      sidecarOnline: true,
      capabilities: [],
      artifactCounts: emptyWorkflowArtifactCounts(),
      arrangementDraftSelected: true,
      arrangementSectionBound: true,
    });
    const bindingStep = steps.find((step) => step.id === "arrangement_preview_binding");
    assert.equal(bindingStep?.status, "complete");
    const draftStep = steps.find((step) => step.id === "arrangement_draft");
    assert.equal(draftStep?.status, "complete");
  });

  it("serializes preview start offset in combined preview request body", () => {
    const body = serializeCombinedPreviewRequestBody({
      mashIntent: "vocal_a_over_beat_b",
      sourceVocalArtifactId: "aaa",
      targetInstrumentalArtifactId: "bbb",
      tempoRatio: 1,
      sourceBpm: 120,
      targetBpm: 128,
      pitchShiftSemitones: 0,
      alignmentOffsetMs: 0,
      maxPreviewSeconds: 30,
      previewStartSeconds: 16,
      formantPreservation: true,
      neutralProcessing: false,
      mixSettings: {
        vocalGainDb: 0,
        instrumentalGainDb: 0,
        masterGainDb: 0,
        vocalFadeInMs: 0,
        vocalFadeOutMs: 0,
        instrumentalFadeInMs: 0,
        instrumentalFadeOutMs: 0,
        limiterSafety: false,
        clippingGuard: false,
        instrumentalDuckUnderVocal: false,
      },
    });
    assert.equal(body.preview_start_seconds, 16);
    assert.equal(validateCombinedPreviewStartOffset(-1).length, 1);
  });

  it("persists selected section and binding in session storage", () => {
    const storage = new Map<string, string>();
    const original = globalThis.localStorage;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    });

    try {
      const plan = buildArrangementPlan({
        artifactStore: buildStoreWithBeats(),
        draftType: "clean_blend",
        mashIntent: "vocal_a_over_beat_b",
      });
      const section = findArrangementSection(plan!, "mix-body")!;
      saveSelectedArrangementSection(selectArrangementSection(plan!, section, 128));
      const binding = bindSectionToPreviewSettings(plan!, section, 128);
      saveSectionPreviewBinding(binding);
      assert.equal(loadSelectedArrangementSection()?.sectionId, "mix-body");
      assert.equal(loadSectionPreviewBinding()?.sectionLabel, section.label);
      assert.equal(loadSectionPreviewBinding()?.rightsNotice, requiredRightsNotice);
    } finally {
      Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: original,
      });
    }
  });

  it("includes binding rights notice without fake section claims", () => {
    assert.match(ARRANGEMENT_SECTION_BINDING_NOTICE, /does not process audio/i);
    const offset = resolvePreviewStartOffset(null);
    assert.equal(offset.startOffsetStatus, "pending_unavailable");
    const plan = buildArrangementPlan({
      artifactStore: buildStoreWithBeats(),
      draftType: "clean_blend",
      mashIntent: "vocal_a_over_beat_b",
    });
    assert.ok(!plan?.arrangementSections.some((item) => /verse detected|downbeat verified/i.test(item.label)));
  });
});

describe("Arrangement traceability (Phase 22)", async () => {
  const {
    buildSectionContextFromBinding,
    evaluateBindingFreshness,
    serializeArrangementContextForApi,
    arrangementContextClaimsFakeSections,
    ARRANGEMENT_SECTIONS_ADVISORY_NOTICE,
    ARRANGEMENT_TRACEABILITY_NOTICE,
  } = await importSrc("src/domain/arrangementSectionContext.ts");
  const { bindSectionToPreviewSettings } = await importSrc(
    "src/domain/arrangementSectionBinding.ts"
  );
  const { buildArrangementPlan, findArrangementSection } = await importSrc(
    "src/domain/arrangementPlanning.ts"
  );
  const { serializeCombinedPreviewRequestBody } = await importSrc("src/domain/combinedPreview.ts");
  const { formatArtifactArrangementTraceability: formatFromArtifact } = await importSrc(
    "src/domain/previewArtifacts.ts"
  );
  const { createSessionArtifactStore, createTrackArtifact } = await importSrc(
    "src/domain/sessionArtifacts.ts"
  );
  const { buildBeatGridFromAnalysis } = await importSrc("src/domain/beatGrid.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");

  function buildStoreWithStems() {
    const store = createSessionArtifactStore("trace-session");
    const beat = {
      bpm: 128,
      beatCount: 32,
      beatTimes: Array.from({ length: 32 }, (_, index) => index * 0.46875),
      bpmConfidence: 0.8,
      downbeatStatus: "not_implemented" as const,
      limitations: [],
      method: "librosa",
    };
    const grid = buildBeatGridFromAnalysis(beat, { jobComplete: true, phraseLengthBars: 16 });
    const trackA = createTrackArtifact({
      sessionId: "trace-session",
      slotId: "trackA",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      inspection: null,
    });
    const trackB = createTrackArtifact({
      sessionId: "trace-session",
      slotId: "trackB",
      file: new File(["b"], "b.wav", { type: "audio/wav" }),
      inspection: null,
    });
    store.tracks.trackA = {
      ...trackA,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemA001", updatedAt: new Date().toISOString() },
    };
    store.tracks.trackB = {
      ...trackB,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemB001", updatedAt: new Date().toISOString() },
    };
    return store;
  }

  it("builds planning-only section context from binding", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: null,
      artifactStore: store,
      exportContextMode: "preview_section",
    });
    assert.equal(context.planningOnly, true);
    assert.equal(context.djReviewRequired, true);
    assert.equal(context.exportContextMode, "preview_section");
    assert.match(context.limitations.join(" "), /advisory|DJ review/i);
    assert.equal(context.rightsNotice, requiredRightsNotice);
  });

  it("detects stale binding when mash intent changes", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: null,
      artifactStore: store,
    });
    const stale = evaluateBindingFreshness({
      binding,
      context,
      currentMashIntent: "vocal_b_over_beat_a",
      currentMixSettings: binding.mixSettings,
      currentDraftType: "clean_blend",
      currentSectionId: binding.sectionId,
      artifactStore: store,
      currentPitchTime: null,
    });
    assert.equal(stale.status, "stale");
    assert.ok(stale.reasons.some((reason) => reason.includes("Mash intent")));
  });

  it("detects partially stale binding when mix settings change", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: null,
      artifactStore: store,
    });
    const partial = evaluateBindingFreshness({
      binding,
      context,
      currentMashIntent: binding.mashIntent,
      currentMixSettings: { ...binding.mixSettings, vocalGainDb: 3 },
      currentDraftType: binding.draftType,
      currentSectionId: binding.sectionId,
      artifactStore: store,
      currentPitchTime: null,
    });
    assert.equal(partial.status, "partially_stale");
  });

  it("includes arrangement context in combined preview request body", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: null,
      artifactStore: store,
      exportContextMode: "preview_section",
    });
    const body = serializeCombinedPreviewRequestBody({
      mashIntent: "vocal_a_over_beat_b",
      sourceVocalArtifactId: "aaa",
      targetInstrumentalArtifactId: "bbb",
      tempoRatio: 1,
      sourceBpm: 120,
      targetBpm: 128,
      pitchShiftSemitones: 0,
      alignmentOffsetMs: 0,
      maxPreviewSeconds: 30,
      previewStartSeconds: 0,
      formantPreservation: true,
      neutralProcessing: false,
      mixSettings: binding.mixSettings,
      arrangementContext: context,
    });
    const ctx = body.arrangement_context as Record<string, unknown>;
    assert.equal(ctx.draft_type, "club_edit");
    assert.equal(ctx.section_id, binding.sectionId);
    assert.equal(ctx.planning_only, true);
    assert.equal(ctx.dj_review_required, true);
    assert.match(String(ctx.traceability_notice), /DJ review/i);
  });

  it("formats artifact browser arrangement traceability without fake section claims", () => {
    const lines = formatFromArtifact({
      artifactId: "abc",
      artifactType: "combined-preview",
      status: "ready",
      createdAt: new Date().toISOString(),
      durationSeconds: 30,
      playbackUrls: { primary: null, vocals: null, noVocals: null },
      playbackUrl: null,
      previewOnly: true,
      finalExport: false,
      previewLabel: "preview",
      primaryFileName: "preview.wav",
      sourceTrackLabel: null,
      targetTrackLabel: null,
      registryLabel: null,
      sourceCombinedPreviewArtifactId: null,
      exportSubtype: null,
      exportFormat: null,
      sourceVocalStemArtifactId: null,
      targetInstrumentalStemArtifactId: null,
      sourceWavExportArtifactId: null,
      masterPreset: null,
      masteringPrototype: false,
      packageOnly: false,
      packageSubtype: null,
      packageLabel: null,
      includedFileCount: null,
      selectedArtifactIds: null,
      publicShare: false,
      mixSummary: null,
      arrangementDraftType: "club_edit",
      arrangementSectionLabel: "Intro (heuristic 16 bars)",
      arrangementPreviewStartSeconds: 16,
      arrangementDurationSeconds: 30,
      arrangementPhraseBasis: "heuristic_phrase_markers",
      arrangementContextSummary:
        "club edit · Intro (heuristic 16 bars) · advisory · DJ review required",
      arrangementExportContextMode: "preview_section",
    });
    assert.ok(lines.some((line) => line.includes("DJ review required")));
    assert.ok(lines.some((line) => line.includes(ARRANGEMENT_SECTIONS_ADVISORY_NOTICE)));
    assert.ok(!lines.some((line) => /verse detected|downbeat verified/i.test(line)));
  });

  it("rejects fake section claims in context labels", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding: { ...binding, sectionLabel: "Verse detected" },
      pitchTimePlanSnapshot: null,
      artifactStore: store,
    });
    assert.equal(arrangementContextClaimsFakeSections(context), true);
    const serialized = serializeArrangementContextForApi(context);
    assert.ok(serialized);
    assert.match(ARRANGEMENT_TRACEABILITY_NOTICE, /do not grant rights/i);
  });
});

describe("Section window export + context diff guard", async () => {
  const {
    SECTION_EXPORT_SUBTYPE,
    buildSectionExportReadiness,
    formatSectionExportArtifactSummary,
    isSectionExportReady,
    sectionExportResultClaimsPublicShare,
    validateSectionExportRequest,
  } = await importSrc("src/domain/sectionExport.ts");
  const {
    buildArrangementContextDiff,
    formatContextDiffSummary,
    resolveSectionExportMixSettings,
  } = await importSrc("src/domain/arrangementContextDiff.ts");
  const { parseSectionWavExportResponse } = await importSrc("src/lib/localEngine/export.ts");
  const { parseArtifactSummary } = await importSrc("src/lib/localEngine/artifacts.ts");
  const { createNeutralMixSettings } = await importSrc("src/domain/mixControls.ts");
  const { bindSectionToPreviewSettings } = await importSrc(
    "src/domain/arrangementSectionBinding.ts"
  );
  const { buildArrangementPlan, findArrangementSection } = await importSrc(
    "src/domain/arrangementPlanning.ts"
  );
  const { buildSectionContextFromBinding } = await importSrc(
    "src/domain/arrangementSectionContext.ts"
  );
  const { createSessionArtifactStore, createTrackArtifact } = await importSrc(
    "src/domain/sessionArtifacts.ts"
  );
  const { buildBeatGridFromAnalysis } = await importSrc("src/domain/beatGrid.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");
  const { isSectionExportArtifact } = await importSrc("src/domain/sectionExport.ts");

  function buildStoreWithStems() {
    const store = createSessionArtifactStore("section-export-session");
    const beat = {
      bpm: 128,
      beatCount: 32,
      beatTimes: Array.from({ length: 32 }, (_, index) => index * 0.46875),
      bpmConfidence: 0.8,
      downbeatStatus: "not_implemented" as const,
      limitations: [],
      method: "librosa",
    };
    const grid = buildBeatGridFromAnalysis(beat, { jobComplete: true, phraseLengthBars: 16 });
    const trackA = createTrackArtifact({
      sessionId: "section-export-session",
      slotId: "trackA",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      inspection: null,
    });
    const trackB = createTrackArtifact({
      sessionId: "section-export-session",
      slotId: "trackB",
      file: new File(["b"], "b.wav", { type: "audio/wav" }),
      inspection: null,
    });
    store.tracks.trackA = {
      ...trackA,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemA001", updatedAt: new Date().toISOString() },
    };
    store.tracks.trackB = {
      ...trackB,
      beatAnalysis: beat,
      effectiveBeatGrid: grid,
      stemPreview: { artifactId: "stemB001", updatedAt: new Date().toISOString() },
    };
    return store;
  }

  it("blocks export when duration missing", () => {
    const errors = validateSectionExportRequest({
      sourceVocalStemArtifactId: "stemA001",
      targetInstrumentalStemArtifactId: "stemB001",
      mashIntent: "vocal_a_over_beat_b",
      tempoRatio: 1,
      sourceBpm: 120,
      targetBpm: 128,
      pitchShiftSemitones: 0,
      alignmentOffsetMs: 0,
      startSeconds: 0,
      durationSeconds: 0,
      startSecondsUnavailable: false,
      confirmAdvisorySectionExport: true,
      confirmStartFromArtifactBeginning: false,
      confirmStaleContext: false,
      loudnessTargetMode: "measurement_only",
      neutralProcessing: true,
      confirmNeutralSettings: true,
      mixSettings: createNeutralMixSettings(),
      arrangementContext: {} as import("../src/domain/arrangementSectionContext.ts").ArrangementSectionContext,
      bindingFreshnessStatus: "current",
      settingsMode: "bound",
    });
    assert.ok(errors.some((error) => error.includes("duration_seconds")));
  });

  it("requires start confirmation when start unavailable", () => {
    const errors = validateSectionExportRequest({
      sourceVocalStemArtifactId: "stemA001",
      targetInstrumentalStemArtifactId: "stemB001",
      mashIntent: "vocal_a_over_beat_b",
      tempoRatio: 1,
      sourceBpm: 120,
      targetBpm: 128,
      pitchShiftSemitones: 0,
      alignmentOffsetMs: 0,
      startSeconds: 0,
      durationSeconds: 30,
      startSecondsUnavailable: true,
      confirmAdvisorySectionExport: true,
      confirmStartFromArtifactBeginning: false,
      confirmStaleContext: false,
      loudnessTargetMode: "measurement_only",
      neutralProcessing: true,
      confirmNeutralSettings: true,
      mixSettings: createNeutralMixSettings(),
      arrangementContext: {} as import("../src/domain/arrangementSectionContext.ts").ArrangementSectionContext,
      bindingFreshnessStatus: "current",
      settingsMode: "bound",
    });
    assert.ok(errors.some((error) => error.includes("confirm_start_from_artifact_beginning")));
  });

  it("builds stale context diff with recommended actions", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: null,
      artifactStore: store,
    });
    const diff = buildArrangementContextDiff({
      binding,
      context,
      currentMashIntent: "vocal_b_over_beat_a",
      currentMixSettings: binding.mixSettings,
      currentDraftType: binding.draftType,
      currentSectionId: binding.sectionId,
      artifactStore: store,
      currentPitchTime: null,
    });
    assert.equal(diff.status, "stale");
    assert.equal(diff.requiresStaleConfirmation, true);
    assert.ok(diff.recommendedActions.includes("re_apply_section"));
    assert.ok(formatContextDiffSummary(diff).some((line) => line.includes("Mash intent")));
  });

  it("formats bound vs current mix settings resolution", () => {
    const store = buildStoreWithStems();
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const current = { ...binding.mixSettings, vocalGainDb: 4 };
    const boundMix = resolveSectionExportMixSettings({
      mode: "bound",
      binding,
      currentMixSettings: current,
    });
    const currentMix = resolveSectionExportMixSettings({
      mode: "current",
      binding,
      currentMixSettings: current,
    });
    assert.equal(boundMix.vocalGainDb, binding.mixSettings.vocalGainDb);
    assert.equal(currentMix.vocalGainDb, 4);
  });

  it("parses section export response with finalExport and sectionTrimmedExport flags", () => {
    const parsed = parseSectionWavExportResponse({
      ok: true,
      status: "ready",
      message: "Section export ready.",
      export_artifact_id: "abc123",
      download_url: "/v1/artifacts/exports/abc123/section-export",
      final_export: true,
      public_share: false,
      section_trimmed_export: true,
      rights_notice: requiredRightsNotice,
      warnings: [],
      limitations: [],
      input_summary: {
        source_vocal_stem_artifact_id: "stemA001",
        target_instrumental_stem_artifact_id: "stemB001",
        start_seconds: 0,
        duration_seconds: 30,
        binding_freshness_status: "current",
        settings_mode: "bound",
      },
      processing_summary: {
        method: "ffmpeg-trim + rubberband-vocal + ffmpeg-section-mix",
        section_trimmed: true,
        start_seconds_used: 0,
        duration_seconds_used: 30,
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.finalExport, true);
    assert.equal(parsed?.publicShare, false);
    assert.equal(parsed?.sectionTrimmedExport, true);
    assert.equal(sectionExportResultClaimsPublicShare(parsed!), false);
    assert.equal(parsed?.rightsNotice, requiredRightsNotice);
  });

  it("formats artifact browser section export without fake song-section labels", () => {
    const lines = formatSectionExportArtifactSummary({
      draftType: "club_edit",
      sectionLabel: "Intro (heuristic 16 bars)",
      startSeconds: 0,
      durationSeconds: 30,
      phraseBasis: "heuristic_phrase_markers",
      bindingFreshnessStatus: "partially_stale",
    });
    assert.ok(lines.some((line) => line.includes("advisory planning window")));
    assert.ok(!lines.some((line) => /verse|chorus|drop detected/i.test(line)));
    const artifact = parseArtifactSummary(
      {
        artifact_id: "sec001",
        artifact_type: "export",
        status: "ready",
        created_at: new Date().toISOString(),
        duration_seconds: 30,
        playback_urls: { primary: "/v1/artifacts/exports/sec001/section-export" },
        preview_only: false,
        final_export: true,
        primary_file_name: "section-export.wav",
        preview_label: "Section window export",
        export_subtype: SECTION_EXPORT_SUBTYPE,
        export_format: "wav",
        public_share: false,
        section_trimmed_export: true,
        binding_freshness_at_export: "current",
        arrangement_draft_type: "club_edit",
        arrangement_section_label: "Intro (heuristic 16 bars)",
        arrangement_duration_seconds: 30,
        arrangement_phrase_basis: "heuristic_phrase_markers",
        arrangement_export_context_mode: "section_export",
      },
      "http://127.0.0.1:8765"
    );
    assert.ok(artifact);
    assert.equal(isSectionExportArtifact(artifact!), true);
    assert.equal(artifact?.sectionTrimmedExport, true);
    assert.equal(artifact?.publicShare, false);
  });

  it("readiness checklist requires stale confirmation when context stale", () => {
    const items = buildSectionExportReadiness({
      artifactStore: buildStoreWithStems(),
      context: null,
      binding: null,
      sectionContext: null,
      sidecarOnline: true,
      rubberBandAvailable: true,
      ffmpegAvailable: true,
      rightsAcknowledged: true,
      confirmAdvisorySectionExport: true,
      confirmStartFromArtifactBeginning: true,
      startSecondsUnavailable: false,
      requiresStaleConfirmation: true,
      confirmStaleContext: false,
      durationSeconds: 30,
    });
    assert.equal(isSectionExportReady(items), false);
    assert.ok(items.some((item) => item.id === "stale_confirm" && !item.ready));
  });
});

describe("Phrase and downbeat analysis upgrade path", async () => {
  const {
    PHRASE_EVIDENCE_PRIORITY,
    applyPhraseAnalysisToBeatGrid,
    formatPhraseAnalysisSummary,
    formatPhraseEvidenceLabel,
    formatMissingPhraseDependency,
    isVerifiedPhraseBasis,
    phraseAnalysisClaimsVerifiedWithoutEvidence,
    phraseBasisPriorityRank,
    preferPhraseBasis,
    validatePhraseAnalysisRequest,
  } = await importSrc("src/domain/phraseAnalysis.ts");
  const { buildBeatGridFromAnalysis, formatPhraseReadiness } = await importSrc("src/domain/beatGrid.ts");
  const { parsePhraseAnalysisResponse } = await importSrc("src/lib/localEngine/analysis.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");
  const { buildArrangementPlan, findArrangementSection } = await importSrc("src/domain/arrangementPlanning.ts");
  const { createSessionArtifactStore, createTrackArtifact, rebuildTrackArtifact } = await importSrc("src/domain/sessionArtifacts.ts");
  const { serializeArrangementContextForApi, buildSectionContextFromBinding } = await importSrc(
    "src/domain/arrangementSectionContext.ts"
  );
  const { bindSectionToPreviewSettings } = await importSrc("src/domain/arrangementSectionBinding.ts");

  it("ranks phrase basis priority dj override > verified > heuristic", () => {
    assert.ok(phraseBasisPriorityRank("dj_override") < phraseBasisPriorityRank("verified_phrase"));
    assert.ok(phraseBasisPriorityRank("verified_phrase") < phraseBasisPriorityRank("verified_downbeat"));
    assert.ok(phraseBasisPriorityRank("verified_downbeat") < phraseBasisPriorityRank("heuristic_from_beats"));
    assert.equal(preferPhraseBasis("heuristic_from_beats", "verified_phrase"), "verified_phrase");
    assert.equal(PHRASE_EVIDENCE_PRIORITY[0], "dj_override");
  });

  it("applies heuristic phrase analysis without fake verified labels", () => {
    const grid = buildBeatGridFromAnalysis(
      {
        bpm: 128,
        bpmConfidence: 0.8,
        beatTimes: Array.from({ length: 32 }, (_, i) => i * 0.46875),
        beatCount: 32,
        method: "librosa",
        limitations: [],
        downbeatOffsetMs: null,
        phraseBarMarkers: [],
      },
      { jobComplete: true, phraseLengthBars: 8 }
    );
    const updated = applyPhraseAnalysisToBeatGrid(grid, {
      fileName: "a.wav",
      methodUsed: "heuristic_from_detected_beats",
      phraseBasis: "heuristic_from_beats",
      beatTimes: grid.beatTimes,
      downbeatTimes: [],
      phraseStartTimes: [0, 15],
      phraseLengthBars: 8,
      confidence: null,
      bpm: 128,
      limitations: ["Heuristic only"],
      djReviewRequired: true,
    });
    assert.equal(updated.phraseEvidenceVerified, false);
    assert.equal(updated.downbeatTimes.length, 0);
    assert.match(formatPhraseReadiness(updated), /Heuristic/i);
    assert.equal(isVerifiedPhraseBasis(updated.phraseEvidenceBasis ?? ""), false);
  });

  it("rejects fake verified claims without evidence", () => {
    assert.equal(
      phraseAnalysisClaimsVerifiedWithoutEvidence({
        fileName: "a.wav",
        methodUsed: "fake",
        phraseBasis: "verified_phrase",
        beatTimes: [],
        downbeatTimes: [],
        phraseStartTimes: [],
        phraseLengthBars: 8,
        confidence: null,
        bpm: null,
        limitations: [],
        djReviewRequired: true,
      }),
      true
    );
  });

  it("parses phrase analysis response and includes rights in UI copy", () => {
    const parsed = parsePhraseAnalysisResponse({
      ok: true,
      status: "implemented",
      message: "Heuristic phrase windows computed.",
      result: {
        file_name: "a.wav",
        method_used: "heuristic_from_detected_beats",
        phrase_basis: "heuristic_from_beats",
        beat_times: [0, 0.5, 1],
        downbeat_times: [],
        phrase_start_times: [0],
        phrase_length_bars: 8,
        confidence: null,
        bpm: 120,
        limitations: ["Heuristic only"],
        dj_review_required: true,
      },
    });
    assert.ok(parsed?.result);
    const summary = formatPhraseAnalysisSummary({
      fileName: "a.wav",
      methodUsed: parsed!.result!.method_used,
      phraseBasis: parsed!.result!.phrase_basis,
      beatTimes: parsed!.result!.beat_times,
      downbeatTimes: [],
      phraseStartTimes: parsed!.result!.phrase_start_times,
      phraseLengthBars: 8,
      confidence: null,
      bpm: 120,
      limitations: [],
      djReviewRequired: true,
    });
    assert.ok(summary.some((line) => /DJ review/i.test(line)));
    assert.equal(formatPhraseEvidenceLabel("heuristic_from_beats", "heuristic"), "Heuristic");
    assert.equal(formatMissingPhraseDependency({ label: "Essentia", status: "not_configured", message: "Optional." }), "Essentia (not_configured): Optional.");
  });

  it("serializes phrase evidence in arrangement context", () => {
    const store = createSessionArtifactStore("phrase-session");
    store.tracks.trackA = createTrackArtifact({
      sessionId: "phrase-session",
      slotId: "trackA",
      file: new File(["a"], "a.wav", { type: "audio/wav" }),
      inspection: null,
    });
    store.tracks.trackB = rebuildTrackArtifact({
      ...createTrackArtifact({
        sessionId: "phrase-session",
        slotId: "trackB",
        file: new File(["b"], "b.wav", { type: "audio/wav" }),
        inspection: null,
      }),
      beatAnalysis: {
        bpm: 128,
        bpmConfidence: 0.8,
        beatTimes: Array.from({ length: 32 }, (_, index) => index * 0.46875),
        beatCount: 32,
        method: "librosa",
        limitations: [],
        downbeatOffsetMs: null,
        phraseBarMarkers: [],
      },
    });
    const plan = buildArrangementPlan({
      artifactStore: store,
      draftType: "club_edit",
      mashIntent: "vocal_a_over_beat_b",
    });
    const section = findArrangementSection(plan!, "intro-planned")!;
    const binding = bindSectionToPreviewSettings(plan!, section, 128);
    const context = buildSectionContextFromBinding({
      binding,
      pitchTimePlanSnapshot: null,
      artifactStore: store,
    });
    const serialized = serializeArrangementContextForApi(context);
    assert.equal(serialized?.phrase_basis, binding.phraseBasis);
    assert.equal(serialized?.planning_only, true);
    assert.equal(context.rightsNotice, requiredRightsNotice);
  });

  it("validates phrase length and method", () => {
    assert.ok(validatePhraseAnalysisRequest({ phraseLengthBars: 8, method: "auto" }).length === 0);
    assert.ok(validatePhraseAnalysisRequest({ phraseLengthBars: 5, method: "auto" }).length > 0);
  });

  it("formats side-by-side phrase comparison", async () => {
    const {
      buildPhraseAnalysisComparison,
      formatPhraseComparisonSummary,
      buildAdvancedComparisonLane,
    } = await importSrc("src/domain/phraseAnalysis.ts");

    const beatTimes = Array.from({ length: 32 }, (_, index) => index * 0.46875);
    const heuristicResult = {
      fileName: "a.wav",
      methodUsed: "heuristic_from_detected_beats",
      phraseBasis: "heuristic_from_beats" as const,
      beatTimes,
      downbeatTimes: [],
      phraseStartTimes: [0],
      phraseLengthBars: 8,
      confidence: null,
      bpm: 128,
      limitations: ["Heuristic only"],
      djReviewRequired: true as const,
    };
    const comparison = buildPhraseAnalysisComparison({
      result: heuristicResult,
      beatTimes,
      bpm: 128,
      phraseLengthBars: 8,
      advancedAvailable: false,
      setupGuidance: "Install Essentia or madmom.",
    });
    assert.equal(comparison.advanced, null);
    assert.equal(comparison.advancedUnavailable, true);
    assert.match(formatPhraseComparisonSummary(comparison).join(" "), /Heuristic/i);
    assert.match(formatPhraseComparisonSummary(comparison).join(" "), /unavailable/i);

    const verifiedResult = {
      ...heuristicResult,
      methodUsed: "madmom_dbn_downbeat_tracker",
      phraseBasis: "verified_phrase" as const,
      downbeatTimes: [0, 2, 4, 6],
      phraseStartTimes: [0, 16],
    };
    const advancedLane = buildAdvancedComparisonLane(verifiedResult);
    assert.equal(advancedLane.basisLabel, "Verified phrase");
    assert.equal(phraseAnalysisClaimsVerifiedWithoutEvidence(verifiedResult), false);
  });

  it("rejects verified label without downbeat evidence", () => {
    assert.equal(
      phraseAnalysisClaimsVerifiedWithoutEvidence({
        fileName: "a.wav",
        methodUsed: "fake",
        phraseBasis: "verified_downbeat",
        beatTimes: [],
        downbeatTimes: [],
        phraseStartTimes: [],
        phraseLengthBars: 8,
        confidence: null,
        bpm: null,
        limitations: [],
        djReviewRequired: true,
      }),
      true
    );
  });
});

describe("Rhythm engine self-test", async () => {
  const { parseRhythmSelfTestResponse } = await importSrc("src/lib/localEngine/rhythmSelfTest.ts");
  const {
    RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE,
    advancedEngineAvailableFromSelfTest,
    formatRhythmEngineSelfTestLine,
    formatRhythmSelfTestStatus,
    formatRhythmSelfTestSummary,
    rhythmSelfTestClaimsVerifiedWithoutMarkers,
  } = await importSrc("src/domain/rhythmSelfTest.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");

  it("parses rhythm self-test response", () => {
    const parsed = parseRhythmSelfTestResponse({
      ok: true,
      service: "mashlab-local-engine",
      python_version: "3.12.0",
      platform: "Windows",
      no_user_audio_processed: true,
      test_signal: "synthetic_click_track_120bpm_8s",
      dj_review_required: true,
      heuristic_fallback_available: true,
      verified_downbeat_available: false,
      verified_phrase_available: false,
      rights_notice: requiredRightsNotice,
      limitations: ["Self-test only"],
      results: [
        {
          engine_name: "Heuristic phrase planning",
          engine_id: "heuristic",
          import_status: "available",
          smoke_test_status: "pass",
          beat_marker_count: 16,
          downbeat_marker_count: 0,
          phrase_marker_count: 2,
          basis_label: "Heuristic",
          confidence: null,
          bpm: 120,
          limitations: [],
          setup_guidance: null,
          message: "ok",
        },
        {
          engine_name: "madmom",
          engine_id: "madmom",
          import_status: "not_configured",
          smoke_test_status: "not_configured",
          beat_marker_count: 0,
          downbeat_marker_count: 0,
          phrase_marker_count: 0,
          basis_label: "Unavailable",
          confidence: null,
          bpm: null,
          limitations: [],
          setup_guidance: "pip install madmom",
          message: "missing",
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.noUserAudioProcessed, true);
    assert.match(formatRhythmSelfTestSummary(parsed!)[0], /Platform/i);
  });

  it("formats missing dependency and pass status", () => {
    assert.equal(formatRhythmSelfTestStatus("missing_dependency"), "missing dependency");
    const line = formatRhythmEngineSelfTestLine({
      engineName: "madmom",
      engineId: "madmom",
      importStatus: "not_configured",
      smokeTestStatus: "not_configured",
      beatMarkerCount: 0,
      downbeatMarkerCount: 0,
      phraseMarkerCount: 0,
      basisLabel: "Unavailable",
      confidence: null,
      bpm: null,
      limitations: [],
      setupGuidance: "Install madmom.",
      message: "missing",
    });
    assert.match(line, /madmom/i);
    assert.match(line, /Unavailable/i);
  });

  it("guards verified labels without markers", () => {
    assert.equal(
      rhythmSelfTestClaimsVerifiedWithoutMarkers({
        engineName: "madmom",
        engineId: "madmom",
        importStatus: "available",
        smokeTestStatus: "pass",
        beatMarkerCount: 1,
        downbeatMarkerCount: 0,
        phraseMarkerCount: 0,
        basisLabel: "Verified phrase",
        confidence: null,
        bpm: null,
        limitations: [],
        setupGuidance: null,
        message: "bad",
      }),
      true
    );
  });

  it("merges self-test pass into engine availability helper", () => {
    const results = [
      {
        engineName: "Essentia",
        engineId: "essentia",
        importStatus: "available",
        smokeTestStatus: "pass" as const,
        beatMarkerCount: 16,
        downbeatMarkerCount: 0,
        phraseMarkerCount: 2,
        basisLabel: "Heuristic",
        confidence: 0.8,
        bpm: 120,
        limitations: [],
        setupGuidance: null,
        message: "ok",
      },
    ];
    assert.equal(advancedEngineAvailableFromSelfTest(results, "essentia", false), true);
    assert.equal(advancedEngineAvailableFromSelfTest(null, "essentia", false), false);
  });

  it("includes no user audio processing copy", () => {
    assert.match(RHYTHM_SELF_TEST_NO_USER_AUDIO_NOTICE, /No user audio/i);
  });
});

describe("WSL rhythm sidecar profile", async () => {
  const {
    SELF_TEST_STATUS_MEANINGS,
    WINDOWS_MVP_RHYTHM_NOTICE,
    buildWslBashCommand,
    buildWslSelfTestCommand,
    evaluateSelfTestHarnessExit,
    formatSelfTestStatusMeaning,
    formatWindowsFallbackMessage,
    parseSidecarUrl,
    parseStrictModeFlag,
    wslSidecarCheckFromAvailability,
  } = await importSrc("src/domain/wslSidecarProfile.ts");

  it("formats WSL bash commands", () => {
    const cmd = buildWslBashCommand("/mnt/c/project", "scripts/setup-rhythm-linux.sh");
    assert.match(cmd, /wsl bash/);
    assert.match(cmd, /setup-rhythm-linux\.sh/);
    assert.match(buildWslSelfTestCommand("/mnt/c/project", true), /STRICT=1/);
  });

  it("parses strict and url flags", () => {
    assert.equal(parseStrictModeFlag(["--strict"]), true);
    assert.equal(parseStrictModeFlag([]), false);
    assert.equal(parseSidecarUrl(["--url", "http://127.0.0.1:47831"]), "http://127.0.0.1:47831");
  });

  it("non-strict exit when sidecar offline", () => {
    assert.equal(evaluateSelfTestHarnessExit(null, { strict: false, sidecarReachable: false }), 0);
    assert.equal(evaluateSelfTestHarnessExit(null, { strict: true, sidecarReachable: false }), 1);
  });

  it("strict exit when heuristic unavailable", () => {
    assert.equal(
      evaluateSelfTestHarnessExit(
        {
          ok: true,
          service: "x",
          pythonVersion: "3.12",
          platform: "Linux",
          noUserAudioProcessed: true,
          testSignal: "synthetic",
          djReviewRequired: true,
          heuristicFallbackAvailable: false,
          verifiedDownbeatAvailable: false,
          verifiedPhraseAvailable: false,
          results: [],
          rightsNotice: "rights",
          limitations: [],
        },
        { strict: true, sidecarReachable: true }
      ),
      1
    );
  });

  it("documents self-test status meanings", () => {
    assert.match(formatSelfTestStatusMeaning("not_configured"), /not installed/i);
    assert.ok(SELF_TEST_STATUS_MEANINGS.pass);
  });

  it("windows fallback messaging", () => {
    assert.match(formatWindowsFallbackMessage(false), /Windows MVP/i);
    assert.match(wslSidecarCheckFromAvailability(false).message, /not installed/i);
    assert.match(WINDOWS_MVP_RHYTHM_NOTICE, /Heuristic/i);
  });
});

describe("Windows runtime setup and MVP UX (Phase 28)", async () => {
  const {
    DEPENDENCY_TIER_LABELS,
    DEPENDENCY_TIER_ORDER,
    FIRST_RUN_STEPS,
    LOCAL_ONLY_PROCESSING_NOTICE,
    WINDOWS_FFMPEG_PATH_NOTICE,
    buildLocalStartChecklist,
    dependencyRequirementExplanation,
    dismissFirstRun,
    evaluateWindowsCheckExitCode,
    firstRunPanelLines,
    formatDependencyTierLabel,
    formatWindowsRuntimeCheckLine,
    formatWindowsRuntimeSummary,
    formatPackageSourceLabel,
    includesNoPublicSharingLanguage,
    isFirstRunDismissed,
    rhythmVenvPythonCandidates,
    sidecarVenvPythonCandidates,
  } = await importSrc("src/domain/windowsRuntimeSetup.ts");
  const {
    buildDependencyHealth,
    orderedDependencyHealthTiers,
  } = await importSrc("src/domain/dependencyHealth.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");
  const { WSL_OPTIONAL_RHYTHM_NOTICE } = await importSrc("src/domain/wslSidecarProfile.ts");

  it("formats Windows runtime check lines and summary", () => {
    const item = {
      id: "ffmpeg",
      label: "FFmpeg / ffprobe",
      tier: "processing" as const,
      status: "missing" as const,
      message: "ffmpeg missing",
      setupGuidance: WINDOWS_FFMPEG_PATH_NOTICE,
    };
    assert.match(formatWindowsRuntimeCheckLine(item), /FFmpeg/);
    assert.match(formatWindowsRuntimeSummary([item, { ...item, status: "available" }]), /1\/2/);
  });

  it("strict exit only blocks python and ffmpeg processing tier", () => {
    const items = [
      {
        id: "python",
        label: "Python",
        tier: "processing",
        status: "missing",
        message: "missing",
        setupGuidance: null,
      },
      {
        id: "rubberband",
        label: "Rubber Band",
        tier: "processing",
        status: "missing",
        message: "missing",
        setupGuidance: null,
      },
    ];
    assert.equal(evaluateWindowsCheckExitCode(items, true), 1);
    assert.equal(evaluateWindowsCheckExitCode(items, false), 0);
    assert.equal(
      evaluateWindowsCheckExitCode(
        [
          { id: "python", label: "Python", tier: "processing", status: "available", message: "venv", setupGuidance: null },
          { id: "ffmpeg", label: "FFmpeg", tier: "processing", status: "available", message: "ok", setupGuidance: null },
        ],
        true
      ),
      0
    );
  });

  it("labels dependency requirement tiers", () => {
    for (const tier of DEPENDENCY_TIER_ORDER) {
      assert.ok(formatDependencyTierLabel(tier).length > 0);
      assert.ok(dependencyRequirementExplanation(tier).length > 0);
      assert.ok(DEPENDENCY_TIER_LABELS[tier]);
    }
    assert.match(formatDependencyTierLabel("browser_mvp"), /Browser MVP/i);
    assert.match(dependencyRequirementExplanation("wsl_optional"), /not required/i);
  });

  it("builds first-run checklist content with rights doctrine", () => {
    assert.equal(FIRST_RUN_STEPS.length, 5);
    assert.match(FIRST_RUN_STEPS[0]!.label, /Load two tracks/i);
    assert.match(FIRST_RUN_STEPS[4]!.label, /Export/i);
    const lines = firstRunPanelLines();
    assert.ok(lines.some((line) => line.includes(requiredRightsNotice)));
    assert.match(LOCAL_ONLY_PROCESSING_NOTICE, /No cloud upload/i);
    assert.ok(includesNoPublicSharingLanguage(LOCAL_ONLY_PROCESSING_NOTICE));
  });

  it("tracks first-run dismiss state in storage", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    assert.equal(isFirstRunDismissed(adapter), false);
    dismissFirstRun(adapter);
    assert.equal(isFirstRunDismissed(adapter), true);
  });

  it("groups dependency health by tier with browser MVP first", () => {
    const items = buildDependencyHealth(false, []);
    const ordered = orderedDependencyHealthTiers(items);
    assert.equal(ordered[0]!.tier, "browser_mvp");
    assert.ok(ordered.some((group) => group.tier === "wsl_optional"));
    assert.match(items[0]!.message, /without FFmpeg/i);
  });

  it("local start checklist mentions sidecar and WSL optional", () => {
    const checklist = buildLocalStartChecklist();
    assert.ok(checklist.some((line) => /sidecar:start/i.test(line)));
    assert.ok(checklist.some((line) => /sidecar:wsl:check/i.test(line)));
    assert.match(WSL_OPTIONAL_RHYTHM_NOTICE, /Optional/i);
  });

  it("resolves sidecar venv python candidates for runtime checks", () => {
    const candidates = sidecarVenvPythonCandidates("/repo");
    assert.equal(candidates.length, 2);
    assert.ok(candidates.some((path) => path.includes(".venv/Scripts/python.exe")));
    assert.ok(candidates.some((path) => path.includes(".venv/bin/python")));
    assert.equal(formatPackageSourceLabel("/venv/python"), "sidecar venv");
    assert.equal(formatPackageSourceLabel(null), "default python");
  });

  it("resolves rhythm venv python candidates (Linux/WSL-only layout)", () => {
    const candidates = rhythmVenvPythonCandidates("/repo");
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0]!.includes(".venv-rhythm/bin/python"));
    assert.ok(!candidates.some((path) => path.includes("Scripts")));
  });
});

describe("Production hardening (Phase 33)", async () => {
  const {
    ANALYSIS_SETUP_GUIDANCE,
    evaluateStrictWindowsRuntimeExit,
    findExistingRhythmVenvPython,
    formatPythonResolutionLabel,
    pythonRuntimeAvailableForSidecar,
    resolvePythonForChecks,
  } = await importSrc("src/domain/pythonRuntime.ts");
  const {
    evaluateSidecarStatus,
    formatSidecarLifecycleMessage,
    includesNoPublicSharingLanguage,
    isMashlabSidecarHealthy,
    SIDECAR_EXTERNAL_KILL_NOTICE,
    sidecarStopSafetyNotice,
  } = await importSrc("src/domain/sidecarLifecycle.ts");

  it("prefers sidecar venv python when global python is missing", () => {
    const resolution = resolvePythonForChecks({
      globalPythonAvailable: false,
      venvPythonPath: "/repo/local-engine/service/.venv/Scripts/python.exe",
      preferVenv: true,
    });
    assert.equal(resolution.source, "venv");
    assert.match(formatPythonResolutionLabel(resolution), /sidecar venv/i);
    assert.equal(pythonRuntimeAvailableForSidecar(false, resolution.venvPath), true);
  });

  it("finds the rhythm venv python only when it exists on disk", () => {
    assert.equal(findExistingRhythmVenvPython("/repo", () => false), null);
    assert.equal(
      findExistingRhythmVenvPython("/repo", (path) => path === "/repo/.venv-rhythm/bin/python"),
      "/repo/.venv-rhythm/bin/python"
    );
  });

  it("strict setup passes with venv python and ffmpeg available", () => {
    const exitCode = evaluateStrictWindowsRuntimeExit(
      [
        { id: "python", tier: "processing", status: "available" },
        { id: "ffmpeg", tier: "processing", status: "available" },
        { id: "demucs", tier: "processing", status: "optional_missing" },
      ],
      true
    );
    assert.equal(exitCode, 0);
  });

  it("evaluates sidecar lifecycle states", () => {
    assert.equal(
      evaluateSidecarStatus({
        health: { ok: true, service: "mashlab-local-engine" },
        portListening: true,
        recordedPid: 1,
      }).state,
      "healthy"
    );
    assert.equal(
      evaluateSidecarStatus({ health: null, portListening: true, recordedPid: null }).state,
      "port_occupied_unknown"
    );
    assert.equal(
      evaluateSidecarStatus({ health: null, portListening: true, recordedPid: 42 }).state,
      "stale_mashlab_sidecar"
    );
    assert.match(formatSidecarLifecycleMessage("port_occupied_unknown"), /47831|Port/i);
    assert.match(formatSidecarLifecycleMessage("stale_mashlab_sidecar"), /stale|MashLab/i);
    assert.equal(isMashlabSidecarHealthy({ ok: true, service: "other" }), false);
  });

  it("documents analysis setup and sidecar safety without public sharing claims", () => {
    assert.match(ANALYSIS_SETUP_GUIDANCE, /setup:analysis/i);
    assert.match(ANALYSIS_SETUP_GUIDANCE, /optional|Optional/i);
    assert.match(sidecarStopSafetyNotice(), /health check/i);
    assert.match(SIDECAR_EXTERNAL_KILL_NOTICE, /4294967295/);
    assert.ok(includesNoPublicSharingLanguage("No public sharing or cloud upload."));
  });
});

describe("Release documentation and local demo (Phase 34)", async () => {
  const {
    APP_DEV_URL,
    buildDemoNextSteps,
    buildDemoStartBanner,
    buildLocalDemoUrls,
    evaluateDemoPreflight,
    formatDemoPreflightLine,
    formatLibrosaCapabilityStatus,
    includesDemoReleaseSafetyLanguage,
    includesNoPublicSharingInDemoCopy,
  } = await importSrc("src/domain/localDemoStart.ts");
  const { SIDECAR_CAPABILITIES_URL, SIDECAR_HEALTH_URL } = await importSrc("src/domain/sidecarLifecycle.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");

  it("formats demo URLs and preflight lines", () => {
    const urls = buildLocalDemoUrls();
    assert.equal(urls.app, APP_DEV_URL);
    assert.equal(urls.sidecarHealth, SIDECAR_HEALTH_URL);
    assert.equal(urls.sidecarCapabilities, SIDECAR_CAPABILITIES_URL);
    const preflight = evaluateDemoPreflight({
      venvPythonExists: true,
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      sidecarHealthy: false,
    });
    assert.equal(preflight.ok, true);
    assert.match(formatDemoPreflightLine(preflight.checks[0]!), /Sidecar venv/);
  });

  it("demo banner and next steps include rights and local-only notices", () => {
    const banner = buildDemoStartBanner().join("\n");
    const steps = buildDemoNextSteps().join("\n");
    assert.ok(banner.includes(requiredRightsNotice));
    assert.ok(steps.includes("sidecar:status"));
    assert.ok(includesDemoReleaseSafetyLanguage(banner));
    assert.ok(includesNoPublicSharingInDemoCopy(banner));
  });

  it("formats librosa capability status honestly", () => {
    assert.match(formatLibrosaCapabilityStatus("available", "0.10.2"), /librosa available/i);
    assert.match(formatLibrosaCapabilityStatus("missing", null), /not installed/i);
  });
});

describe("Release packaging (Phase 35)", async () => {
  const {
    MVP_RELEASE_LIMITATIONS,
    MVP_RELEASE_PREFLIGHT_ITEMS,
    MVP_RELEASE_URLS,
    RELEASE_GITIGNORE_PATTERNS,
    WINDOWS_MVP_VERIFY_COMMANDS,
    buildDemoPackageFileList,
    formatDependencyManifestRow,
    formatDependencyVerifyBlock,
    includesReleaseSafetyLanguage,
    matchesReleaseGitignorePattern,
  } = await importSrc("src/domain/releasePackaging.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");

  it("formats dependency manifest rows", () => {
    assert.match(formatDependencyManifestRow("Node.js", "v24.16.0", "node -v"), /Node.js \| v24.16.0 \| `node -v`/);
  });

  it("lists verify commands for Windows MVP dependencies", () => {
    const block = formatDependencyVerifyBlock(WINDOWS_MVP_VERIFY_COMMANDS).join("\n");
    assert.match(block, /npm run sidecar:status/);
    assert.match(block, /WSL rhythm \(optional\)/);
  });

  it("includes release safety and rights language in limitations", () => {
    const text = [...MVP_RELEASE_LIMITATIONS, requiredRightsNotice].join("\n");
    assert.ok(includesReleaseSafetyLanguage(text));
    assert.match(text, /No public sharing/);
  });

  it("matches gitignore patterns for venv and work dirs", () => {
    assert.ok(matchesReleaseGitignorePattern("local-engine/service/.venv/Lib/site-packages/foo.py"));
    assert.ok(matchesReleaseGitignorePattern("local-engine/service/.work/artifacts/stem.wav"));
    assert.ok(!matchesReleaseGitignorePattern("docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md"));
    assert.ok(RELEASE_GITIGNORE_PATTERNS.includes("local-engine/service/.venv/"));
  });

  it("builds demo package file list with release docs", () => {
    const files = buildDemoPackageFileList();
    assert.ok(files.includes("docs/MVP_RELEASE_CANDIDATE_CHECKLIST.md"));
    assert.ok(files.includes("docs/RELEASE_DEPENDENCIES_WINDOWS.md"));
  });

  it("defines MVP preflight items and local URLs", () => {
    assert.ok(MVP_RELEASE_PREFLIGHT_ITEMS.some((item) => item.commandOrPath === "npm run start:local:windows"));
    assert.equal(MVP_RELEASE_URLS.health, "http://127.0.0.1:47831/health");
  });
});

describe("Quick Mix mode (Phase 36)", async () => {
  const {
    QUICK_MIX_DEFAULT_MIX_SETTINGS,
    QUICK_MIX_LOCAL_ONLY_NOTICE,
    QUICK_MIX_OUTPUT_LABEL,
    QUICK_MIX_PROGRESS_STEPS,
    advanceQuickMixStep,
    canStartQuickMix,
    createInitialQuickMixUploadState,
    includesNoPublicSharingInQuickMixCopy,
    includesQuickMixRightsLanguage,
    validateQuickMixUploads,
  } = await importSrc("src/domain/quickMix.ts");
  const { buildQuickMixReadiness, isQuickMixReady } = await importSrc("src/domain/quickMixReadiness.ts");
  const { mapQuickMixError, recoveryMessageForTopic } = await importSrc("src/domain/quickMixErrors.ts");
  const { buildQuickMixTimingStrategy } = await importSrc("src/domain/quickMixStrategy.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");
  const { loadAppExperienceMode, saveAppExperienceMode } = await importSrc("src/domain/quickMix.ts");

  it("validates two-file upload state", () => {
    const empty = validateQuickMixUploads(createInitialQuickMixUploadState());
    assert.equal(empty.ok, false);
    assert.match(empty.message ?? "", /vocal/i);
  });

  it("requires readiness before mix can start", () => {
    const state = {
      ...createInitialQuickMixUploadState(),
      vocalFile: new File(["a"], "vocal.wav", { type: "audio/wav" }),
      instrumentalFile: new File(["b"], "beat.wav", { type: "audio/wav" }),
    };
    assert.equal(canStartQuickMix(state, false), false);
    assert.equal(canStartQuickMix(state, true), true);
  });

  it("summarizes simplified dependency readiness", () => {
    const summary = buildQuickMixReadiness({ sidecarOnline: false, capabilities: [] });
    assert.equal(summary.status, "setup_needed");
    assert.equal(isQuickMixReady(summary), false);
    assert.ok(summary.items.some((item) => item.id === "demucs"));
    assert.ok(!summary.items.some((item) => item.id === ("wsl" as never)));
  });

  it("models progress steps in order", () => {
    assert.equal(QUICK_MIX_PROGRESS_STEPS.length, 8);
    const active = advanceQuickMixStep(
      QUICK_MIX_PROGRESS_STEPS.map((step) => ({ ...step, status: "pending" as const })),
      "mixing_track",
      "active"
    );
    assert.equal(active.find((step) => step.id === "checking_files")?.status, "complete");
    assert.equal(active.find((step) => step.id === "mixing_track")?.status, "active");
    assert.equal(active.find((step) => step.id === "creating_wav_export")?.status, "pending");
  });

  it("maps stem validation errors with source-specific headlines", async () => {
    const { mapQuickMixStemFailure } = await importSrc("src/domain/quickMixErrors.ts");
    const mapped = mapQuickMixStemFailure(
      {
        message: "Stem preview request failed validation.",
        status: "validation_error",
        validationErrors: ["max_preview_seconds must be between 1 and 180."],
      },
      "vocal"
    );
    assert.match(mapped.headline, /Vocal/i);
    assert.match(mapped.detail, /max_preview_seconds/i);
    assert.equal(mapped.failedStepId, "separating_vocal");
  });

  it("maps errors to plain English recovery topics", () => {
    const mapped = mapQuickMixError({
      message: "Demucs not available for stem separation",
      status: "missing_dependency",
    });
    assert.equal(mapped.recoveryTopic, "demucs");
    assert.match(recoveryMessageForTopic("demucs"), /Demucs/i);
  });

  it("uses neutral timing when BPM analysis is unavailable", () => {
    const strategy = buildQuickMixTimingStrategy({
      vocalBpm: null,
      beatBpm: null,
      pitchShiftSemitones: null,
      librosaUsed: false,
    });
    assert.equal(strategy.useNeutralProcessing, true);
    assert.match(strategy.timingNotice, /No tempo\/key correction applied/i);
  });

  it("labels output honestly without publish-ready claims", () => {
    assert.match(QUICK_MIX_OUTPUT_LABEL, /user responsible for rights/i);
    assert.match(QUICK_MIX_OUTPUT_LABEL, /Local mix export/i);
    assert.ok(!/publish-ready|professionally mastered/i.test(QUICK_MIX_OUTPUT_LABEL));
  });

  it("includes rights and no public sharing language", () => {
    const copy = [requiredRightsNotice, QUICK_MIX_OUTPUT_LABEL, QUICK_MIX_LOCAL_ONLY_NOTICE].join("\n");
    assert.ok(includesQuickMixRightsLanguage(copy));
    assert.ok(includesNoPublicSharingInQuickMixCopy(copy));
  });

  it("defaults mix gains to listening-test profile with safety guards enabled", () => {
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.vocalGainDb, 1.5);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.instrumentalGainDb, -3);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.masterGainDb, -1);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.limiterSafety, true);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.clippingGuard, true);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.instrumentalDuckUnderVocal, true);
  });

  it("persists advanced studio access mode", () => {
    const storage = new Map<string, string>();
    saveAppExperienceMode("advanced-studio", {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    });
    assert.equal(loadAppExperienceMode({ getItem: (key) => storage.get(key) ?? null }), "advanced-studio");
  });
});

describe("Quick Mix orchestrated pipeline (Phase 36 fix)", async () => {
  const {
    QUICK_MIX_PIPELINE_STAGES,
    QUICK_MIX_STEM_MAX_SECONDS,
    QUICK_MIX_STEM_FORM_FIELDS,
    buildQuickMixStemFormData,
    buildQuickMixStemRequestParams,
    listQuickMixStemFormFieldNames,
    quickMixStageTriggersProcessing,
    resolveQuickMixExportStemIds,
    validateQuickMixStemRequest,
  } = await importSrc("src/domain/quickMixPipeline.ts");
  const { buildFullLengthExportRequestParams } = await importSrc("src/domain/fullLengthExport.ts");
  const { buildQuickMixDirectionContext, buildQuickMixTimingStrategy } = await importSrc(
    "src/domain/quickMixStrategy.ts"
  );
  const { QUICK_MIX_DEFAULT_MIX_SETTINGS } = await importSrc("src/domain/quickMix.ts");
  const { createDefaultQuickMixSectionSelection } = await importSrc("src/domain/quickMixSection.ts");

  it("does not trigger processing before validate_uploads", () => {
    assert.equal(quickMixStageTriggersProcessing("validate_uploads"), false);
    assert.equal(quickMixStageTriggersProcessing("stem_vocal"), true);
  });

  it("uses legal stem preview seconds within server limit", () => {
    const file = new File(["a"], "vocal.wav", { type: "audio/wav" });
    const section = createDefaultQuickMixSectionSelection();
    const params = buildQuickMixStemRequestParams("vocal", file, section, false);
    assert.equal(params.maxPreviewSeconds, 180);
    assert.equal(params.previewStartSeconds, 0);
    assert.equal(QUICK_MIX_STEM_MAX_SECONDS, 180);
    assert.deepEqual(validateQuickMixStemRequest(params), []);
  });

  it("builds stem multipart fields expected by the sidecar", () => {
    const file = new File(["a"], "beat.wav", { type: "audio/wav" });
    const section = createDefaultQuickMixSectionSelection();
    const formData = buildQuickMixStemFormData(file, "instrumental", section, false);
    const fields = listQuickMixStemFormFieldNames(formData).sort();
    assert.deepEqual(fields, [...QUICK_MIX_STEM_FORM_FIELDS].sort());
    assert.equal(formData.get("split_mode"), "vocals_no_vocals");
    assert.equal(formData.get("max_preview_seconds"), "180");
    assert.equal(formData.get("preview_start_seconds"), "0");
  });

  it("maps vocal and instrumental stems to vocals.wav and no_vocals.wav roles", () => {
    const ids = resolveQuickMixExportStemIds({
      vocalStem: {
        ok: true,
        artifactId: "vocal123",
        vocals: { artifactUrl: "/v1/artifacts/stems/vocal123/vocals" },
        noVocals: { artifactUrl: "/v1/artifacts/stems/vocal123/no_vocals" },
      },
      instrumentalStem: {
        ok: true,
        artifactId: "beat456",
        vocals: { artifactUrl: "/v1/artifacts/stems/beat456/vocals" },
        noVocals: { artifactUrl: "/v1/artifacts/stems/beat456/no_vocals" },
      },
    } as never);
    assert.deepEqual(ids, {
      sourceVocalStemArtifactId: "vocal123",
      targetInstrumentalStemArtifactId: "beat456",
    });
  });

  it("builds full-length WAV export params after stem resolution", () => {
    const strategy = buildQuickMixTimingStrategy({
      vocalBpm: null,
      beatBpm: null,
      pitchShiftSemitones: 0,
      librosaUsed: false,
    });
    const context = buildQuickMixDirectionContext({
      vocalStemArtifactId: "aaa",
      beatStemArtifactId: "bbb",
      strategy,
    });
    const exportParams = buildFullLengthExportRequestParams(
      context,
      strategy.useNeutralProcessing,
      strategy.confirmNeutralSettings,
      "measurement_only",
      QUICK_MIX_DEFAULT_MIX_SETTINGS,
      "quick-mix"
    );
    assert.equal(exportParams.sourceVocalStemArtifactId, "aaa");
    assert.equal(exportParams.targetInstrumentalStemArtifactId, "bbb");
    assert.equal(exportParams.mixSettings.vocalGainDb, 1.5);
    assert.equal(exportParams.mixSettings.instrumentalGainDb, -3);
    assert.equal(exportParams.mixSettings.masterGainDb, -1);
    assert.equal(exportParams.mixSettings.instrumentalDuckUnderVocal, true);
  });

  it("lists orchestration stages through optional MP3", () => {
    assert.ok(QUICK_MIX_PIPELINE_STAGES.includes("mix_and_export_wav"));
    assert.ok(QUICK_MIX_PIPELINE_STAGES.includes("export_mp3_optional"));
    assert.equal(QUICK_MIX_PIPELINE_STAGES.at(-1), "export_mp3_optional");
  });
});

describe("Quick Mix reliability (Phase 36 hotfix)", async () => {
  const {
    QUICK_MIX_DURATION_CAP_NOTICE,
    QUICK_MIX_DURATION_CAP_SECONDS,
    QUICK_MIX_STEM_ACTIVE_HINT,
    buildQuickMixDurationCapNotice,
    createInitialQuickMixProgress,
    failQuickMixProgress,
    quickMixPipelineShowsDone,
    quickMixProgressStepHint,
    succeedQuickMixProgress,
  } = await importSrc("src/domain/quickMix.ts");
  const {
    mapQuickMixNoResponseStemFailure,
    mapQuickMixSidecarFailure,
    mapQuickMixStemFailure,
    mp3SkippedMessageAfterWavSuccess,
    recoveryMessageForTopic,
  } = await importSrc("src/domain/quickMixErrors.ts");
  const { LOCAL_ENGINE_STEM_PREVIEW_TIMEOUT_MS } = await importSrc("src/lib/localEngine/types.ts");

  it("does not mark Done complete when a required step fails", () => {
    const failed = failQuickMixProgress(createInitialQuickMixProgress(), "preparing_instrumental");
    assert.equal(failed.find((step) => step.id === "preparing_instrumental")?.status, "failed");
    assert.equal(failed.find((step) => step.id === "done")?.status, "pending");
    assert.equal(quickMixPipelineShowsDone(failed), false);
  });

  it("marks Done complete only after full success path", () => {
    const success = succeedQuickMixProgress(createInitialQuickMixProgress());
    assert.equal(quickMixPipelineShowsDone(success), true);
  });

  it("maps no-response stem failures to timeout guidance not Demucs install", () => {
    const mapped = mapQuickMixNoResponseStemFailure("instrumental", { demucsAvailable: true });
    assert.match(mapped.detail, /did not respond/i);
    assert.equal(mapped.recoveryTopic, "timeout");
    assert.match(mapped.recoveryMessage, /several minutes on CPU/i);
    assert.doesNotMatch(mapped.recoveryMessage, /Install Demucs/i);
  });

  it("recommends Demucs install only when capability is missing", () => {
    const mapped = mapQuickMixStemFailure(
      { message: "Demucs is not available.", status: "missing_dependency" },
      "vocal",
      { demucsAvailable: false }
    );
    assert.equal(mapped.recoveryTopic, "demucs");
    assert.match(recoveryMessageForTopic("demucs"), /Demucs/i);

    const withDemucs = mapQuickMixStemFailure(
      { message: "Demucs is not available.", status: "missing_dependency" },
      "vocal",
      { demucsAvailable: true }
    );
    assert.notEqual(withDemucs.recoveryTopic, "demucs");
  });

  it("uses WAV-created copy when MP3 reference is optional and fails", () => {
    assert.match(mp3SkippedMessageAfterWavSuccess("encoder busy"), /WAV created/i);
    assert.match(mp3SkippedMessageAfterWavSuccess("encoder busy"), /MP3 reference failed/i);
  });

  it("maps sidecar health failures between steps clearly", () => {
    const mapped = mapQuickMixSidecarFailure("Local helper service is offline.", "preparing_instrumental");
    assert.equal(mapped.failedStepId, "preparing_instrumental");
    assert.match(mapped.recoveryMessage, /sidecar:start/i);
  });

  it("shows long-running stem step hint while active", () => {
    assert.match(quickMixProgressStepHint("separating_vocal", "active") ?? "", /several minutes/i);
    assert.match(quickMixProgressStepHint("creating_wav_export", "active") ?? "", /Creating your local mix export/i);
    assert.equal(QUICK_MIX_STEM_ACTIVE_HINT, quickMixProgressStepHint("preparing_instrumental", "active"));
  });

  it("discloses 180-second MVP cap for longer sources", () => {
    assert.equal(QUICK_MIX_DURATION_CAP_SECONDS, 180);
    assert.match(QUICK_MIX_DURATION_CAP_NOTICE, /180 seconds/i);
    assert.match(QUICK_MIX_DURATION_CAP_NOTICE, /shortened automatically/i);
    assert.match(QUICK_MIX_DURATION_CAP_NOTICE, /not a full-length/i);
    assert.equal(buildQuickMixDurationCapNotice(200, 120), QUICK_MIX_DURATION_CAP_NOTICE);
    assert.equal(buildQuickMixDurationCapNotice(60, 90), null);
  });

  it("allows long CPU stem requests up to 30 minutes", () => {
    assert.equal(LOCAL_ENGINE_STEM_PREVIEW_TIMEOUT_MS, 30 * 60 * 1000);
  });
});

describe("Sidecar lifecycle reliability (Phase 37)", async () => {
  const {
    evaluateSidecarStatus,
    isSidecarPortBusyFromNetstat,
    isSidecarPortListeningFromNetstat,
    parseSidecarListenerPidFromNetstat,
    sidecarRecoveryPid,
  } = await importSrc("src/domain/sidecarLifecycle.ts");

  const sampleNetstat = [
    "  TCP    127.0.0.1:47831        0.0.0.0:0              LISTENING       26004",
    "  TCP    127.0.0.1:47831        127.0.0.1:53102        TIME_WAIT       0",
    "  TCP    127.0.0.1:51203        127.0.0.1:47831        CLOSE_WAIT      2644",
  ].join("\n");

  it("detects LISTENING without TIME_WAIT false positives", () => {
    assert.equal(isSidecarPortListeningFromNetstat(sampleNetstat), true);
    assert.equal(parseSidecarListenerPidFromNetstat(sampleNetstat), 26004);
    assert.equal(isSidecarPortBusyFromNetstat(sampleNetstat), true);
    assert.equal(
      isSidecarPortListeningFromNetstat(
        "  TCP    127.0.0.1:47831        127.0.0.1:53102        TIME_WAIT       0"
      ),
      false
    );
  });

  it("does not treat TIME_WAIT-only sockets as blocking sidecar start", () => {
    const timeWaitOnly =
      "  TCP    127.0.0.1:47831        127.0.0.1:53102        TIME_WAIT       0\n";
    assert.equal(
      evaluateSidecarStatus({
        health: null,
        portListening: isSidecarPortListeningFromNetstat(timeWaitOnly),
        portBusy: isSidecarPortBusyFromNetstat(timeWaitOnly),
        recordedPid: null,
      }).state,
      "not_running"
    );
  });

  it("selects recovery pid from recorded or listener", () => {
    assert.equal(sidecarRecoveryPid({ recordedPid: 12, listenerPid: 99 }), 12);
    assert.equal(sidecarRecoveryPid({ recordedPid: null, listenerPid: 99 }), 99);
  });
});

describe("Quick Mix real-audio progress (Phase 38)", async () => {
  const {
    formatQuickMixElapsed,
    isQuickMixLongRunningStep,
    quickMixLongRunningHeartbeat,
    QUICK_MIX_DURATION_CAP_SECONDS,
    buildQuickMixDurationCapNotice,
  } = await importSrc("src/domain/quickMix.ts");

  it("formats elapsed time for long-running stem steps", () => {
    assert.equal(formatQuickMixElapsed(0), "0:00");
    assert.equal(formatQuickMixElapsed(9), "0:09");
    assert.equal(formatQuickMixElapsed(75), "1:15");
    assert.equal(formatQuickMixElapsed(600), "10:00");
    assert.equal(formatQuickMixElapsed(-5), "0:00");
    assert.equal(formatQuickMixElapsed(Number.NaN), "0:00");
  });

  it("identifies only stem steps as long-running", () => {
    assert.equal(isQuickMixLongRunningStep("separating_vocal"), true);
    assert.equal(isQuickMixLongRunningStep("preparing_instrumental"), true);
    assert.equal(isQuickMixLongRunningStep("checking_files"), false);
    assert.equal(isQuickMixLongRunningStep("creating_wav_export"), false);
  });

  it("keeps the UI alive with a reassuring heartbeat that does not claim failure", () => {
    const vocal = quickMixLongRunningHeartbeat("separating_vocal", 132);
    assert.ok(vocal);
    assert.match(vocal, /Still separating vocals/i);
    assert.match(vocal, /2:12 elapsed/);
    assert.match(vocal, /has not stopped/i);
    const beat = quickMixLongRunningHeartbeat("preparing_instrumental", 5);
    assert.ok(beat);
    assert.match(beat, /instrumental/i);
    assert.equal(quickMixLongRunningHeartbeat("creating_wav_export", 5), null);
  });

  it("discloses the 180-second cap for real files longer than the MVP limit", () => {
    assert.equal(QUICK_MIX_DURATION_CAP_SECONDS, 180);
    const notice = buildQuickMixDurationCapNotice(291.6, 205.1);
    assert.ok(notice);
    assert.match(notice, /180/);
    assert.equal(buildQuickMixDurationCapNotice(120, 90), null);
  });
});

describe("Quick Mix listening-test polish (Phase 39)", async () => {
  const {
    QUICK_MIX_DEFAULT_MIX_SETTINGS,
    QUICK_MIX_EXPORT_ACTIVE_HINT,
    QUICK_MIX_STEM_ACTIVE_HINT,
    quickMixProgressStepHint,
  } = await importSrc("src/domain/quickMix.ts");
  const {
    QUICK_MIX_RC2_BASELINE_MIX_SETTINGS,
    buildQuickMixListeningComparisonNotes,
    buildQuickMixMixProfileSummary,
    formatQuickMixLoudnessTechnicalLine,
  } = await importSrc("src/domain/quickMixListening.ts");
  const { mixSettingsToRequestFields } = await importSrc("src/domain/mixControls.ts");

  it("documents RC2 baseline vs Phase 39 listening profile", () => {
    const notes = buildQuickMixListeningComparisonNotes(
      QUICK_MIX_RC2_BASELINE_MIX_SETTINGS,
      QUICK_MIX_DEFAULT_MIX_SETTINGS
    );
    assert.equal(notes.length, 2);
    assert.match(notes[0], /RC2 baseline/);
    assert.match(notes[1], /Phase 40 safety profile/);
    assert.match(notes[1], /bed duck on/);
  });

  it("serializes duck-under-vocal for export API", () => {
    const fields = mixSettingsToRequestFields(QUICK_MIX_DEFAULT_MIX_SETTINGS);
    assert.equal(fields.instrumental_duck_under_vocal, true);
    assert.equal(fields.vocal_gain_db, 1.5);
    assert.equal(fields.instrumental_gain_db, -3);
  });

  it("surfaces export-step patience hints", () => {
    assert.match(QUICK_MIX_STEM_ACTIVE_HINT, /several minutes/i);
    assert.match(QUICK_MIX_EXPORT_ACTIVE_HINT, /Creating your local mix export/i);
    assert.ok(quickMixProgressStepHint("creating_wav_export", "active"));
  });

  it("formats loudness technical line when measured", () => {
    const line = formatQuickMixLoudnessTechnicalLine({
      integratedLufs: -12.3,
      truePeakDbtp: -1.2,
      peakLevelDb: -1.2,
      status: "available",
      message: "Measured.",
    });
    assert.ok(line);
    assert.match(line!, /-12\.3 LUFS/);
    assert.match(line!, /-1\.2 dBTP/);
  });

  it("summarizes listening profile for output panel", () => {
    const summary = buildQuickMixMixProfileSummary(QUICK_MIX_DEFAULT_MIX_SETTINGS);
    assert.match(summary, /vocal \+1\.5 dB/);
    assert.match(summary, /bed -3\.0 dB/);
    assert.match(summary, /bed duck on/);
  });
});

describe("Quick Mix true-peak safety (Phase 40)", async () => {
  const { QUICK_MIX_DEFAULT_MIX_SETTINGS } = await importSrc("src/domain/quickMix.ts");
  const { mixSettingsToRequestFields } = await importSrc("src/domain/mixControls.ts");
  const { evaluateLoudnessGateDisplay, GENERAL_TRUE_PEAK_TARGET_DBTP } = await importSrc(
    "src/domain/fullLengthExport.ts"
  );
  const { readFile } = await import("node:fs/promises");

  it("uses safer master trim with safety guards enabled", () => {
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.masterGainDb, -1);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.limiterSafety, true);
    assert.equal(QUICK_MIX_DEFAULT_MIX_SETTINGS.clippingGuard, true);
  });

  it("warns when true peak exceeds general prototype target", () => {
    const gate = evaluateLoudnessGateDisplay({
      integratedLufs: -12,
      truePeakDbtp: 0.8,
      peakLevelDb: 0.8,
      status: "available",
      message: "Measured.",
    });
    assert.equal(gate.status, "warn");
    assert.match(gate.message, /true peak/i);
    assert.match(gate.message, /informational gate only/i);
  });

  it("does not claim professional mastering in loudness pass copy", () => {
    const gate = evaluateLoudnessGateDisplay({
      integratedLufs: -14,
      truePeakDbtp: -1.2,
      peakLevelDb: -1.2,
      status: "available",
      message: "Measured.",
    });
    assert.equal(gate.status, "pass");
    assert.match(gate.message, /Informational only/i);
    assert.doesNotMatch(gate.message, /mastered|club-ready release/i);
  });

  it("serializes staged safety profile for export API", () => {
    const fields = mixSettingsToRequestFields(QUICK_MIX_DEFAULT_MIX_SETTINGS);
    assert.equal(fields.master_gain_db, -1);
    assert.equal(fields.limiter_safety, true);
    assert.equal(fields.clipping_guard, true);
  });

  it("stages soft limiter before clipping guard in FFmpeg chain", async () => {
    const source = await readFile(
      new URL("../local-engine/service/mix_settings.py", import.meta.url),
      "utf8"
    );
    assert.match(source, /LIMITER_SAFETY_LEVEL = 0\.88/);
    assert.match(source, /CLIPPING_GUARD_LIMIT = 0\.794/);
    assert.match(source, /EXPORT_PEAK_CEILING = 0\.794/);
    assert.match(source, /level=disabled/);
    assert.match(source, /build_peak_ceiling_ffmpeg_command/);
    assert.equal(GENERAL_TRUE_PEAK_TARGET_DBTP, -1);
  });
});

describe("Quick Mix section picker (Phase 41)", async () => {
  const {
    buildQuickMixSectionOutputLine,
    buildQuickMixSectionSummaryLines,
    createDefaultQuickMixSectionSelection,
    resolveQuickMixSectionSelection,
    shouldPrepareQuickMixSourceForSection,
    validateQuickMixSectionAgainstDuration,
  } = await importSrc("src/domain/quickMixSection.ts");
  const {
    buildQuickMixStemFormData,
    buildQuickMixStemRequestParams,
    listQuickMixStemFormFieldNames,
    quickMixStageTriggersProcessing,
  } = await importSrc("src/domain/quickMixPipeline.ts");
  const {
    QUICK_MIX_DURATION_CAP_NOTICE,
    QUICK_MIX_DURATION_CAP_SECONDS,
    QUICK_MIX_LOCAL_ONLY_NOTICE,
    quickMixPipelineShowsDone,
    failQuickMixProgress,
    createInitialQuickMixProgress,
    includesNoPublicSharingInQuickMixCopy,
  } = await importSrc("src/domain/quickMix.ts");
  const { requiredRightsNotice } = await importSrc("src/lib/legal.ts");

  it("defaults to first 180 seconds unchanged", () => {
    const selection = createDefaultQuickMixSectionSelection();
    assert.equal(selection.startOffsetSeconds, 0);
    assert.equal(selection.windowSeconds, 180);
    assert.deepEqual(validateQuickMixSectionAgainstDuration(selection, 300), []);
    assert.equal(shouldPrepareQuickMixSourceForSection(selection, 300), true);
    assert.equal(shouldPrepareQuickMixSourceForSection(selection, 120), false);
  });

  it("resolves custom vocal and instrumental start offsets", () => {
    const vocal = resolveQuickMixSectionSelection({
      mode: "custom_start",
      customMinutes: "1",
      customSeconds: "5",
    });
    const instrumental = resolveQuickMixSectionSelection({
      mode: "custom_start",
      customMinutes: "0",
      customSeconds: "42",
    });
    assert.equal(vocal.selection?.startOffsetSeconds, 65);
    assert.equal(instrumental.selection?.startOffsetSeconds, 42);
  });

  it("rejects invalid start times with clear errors", () => {
    const invalid = resolveQuickMixSectionSelection({
      mode: "custom_start",
      customMinutes: "-1",
      customSeconds: "0",
    });
    assert.ok(invalid.errors.length > 0);

    const selection = createDefaultQuickMixSectionSelection();
    selection.startOffsetSeconds = 200;
    selection.mode = "custom_start";
    assert.deepEqual(validateQuickMixSectionAgainstDuration(selection, 180), [
      "Start time is past the end of this file.",
    ]);

    const unknownDuration = resolveQuickMixSectionSelection({
      mode: "custom_start",
      customMinutes: "1",
      customSeconds: "0",
    }).selection!;
    assert.deepEqual(validateQuickMixSectionAgainstDuration(unknownDuration, null), [
      "Could not read duration. Try First 3:00.",
    ]);
  });

  it("includes offsets and duration in stem request payload", () => {
    const file = new File(["a"], "vocal.wav", { type: "audio/wav" });
    const section = {
      mode: "custom_start" as const,
      startOffsetSeconds: 65,
      windowSeconds: 180,
    };
    const params = buildQuickMixStemRequestParams("vocal", file, section, false);
    assert.equal(params.previewStartSeconds, 65);
    assert.equal(params.maxPreviewSeconds, 180);
    const formData = buildQuickMixStemFormData(file, "vocal", section, false);
    assert.equal(formData.get("preview_start_seconds"), "65");
    assert.equal(formData.get("max_preview_seconds"), "180");
    assert.deepEqual(listQuickMixStemFormFieldNames(formData).sort(), [
      "file",
      "max_preview_seconds",
      "preview_start_seconds",
      "split_mode",
    ]);
  });

  it("uses zero stem offset when source was prepared at mix time", () => {
    const file = new File(["a"], "prepared.wav", { type: "audio/wav" });
    const section = {
      mode: "custom_start" as const,
      startOffsetSeconds: 65,
      windowSeconds: 180,
    };
    const params = buildQuickMixStemRequestParams("vocal", file, section, true);
    assert.equal(params.previewStartSeconds, 0);
  });

  it("formats selected section lines for output panel", () => {
    const lines = buildQuickMixSectionSummaryLines([
      {
        slot: "vocal",
        selection: { mode: "custom_start", startOffsetSeconds: 65, windowSeconds: 180 },
        sourceDurationSeconds: 300,
        outputDurationSeconds: 180,
      },
      {
        slot: "instrumental",
        selection: { mode: "custom_start", startOffsetSeconds: 42, windowSeconds: 180 },
        sourceDurationSeconds: 300,
        outputDurationSeconds: 180,
      },
    ]);
    assert.match(lines[0] ?? "", /Vocal section: 1:05/i);
    assert.match(lines[1] ?? "", /Instrumental section: 0:42/i);
    assert.match(lines[2] ?? "", /3:00 MVP cap/i);
    assert.match(buildQuickMixSectionOutputLine({
      slot: "vocal",
      selection: { mode: "custom_start", startOffsetSeconds: 65, windowSeconds: 180 },
      sourceDurationSeconds: 300,
      outputDurationSeconds: 180,
    }), /1:05.*4:05/);
  });

  it("does not trigger processing before validate_uploads", () => {
    assert.equal(quickMixStageTriggersProcessing("validate_uploads"), false);
  });

  it("does not mark Done complete after failure", () => {
    const failed = failQuickMixProgress(createInitialQuickMixProgress(), "checking_files");
    assert.equal(quickMixPipelineShowsDone(failed), false);
  });


  it("requires source duration before enabling custom-start mix", async () => {
    const { readFile } = await import("node:fs/promises");
    const appSource = await readFile(new URL("../src/components/QuickMixApp.tsx", import.meta.url), "utf8");
    assert.match(appSource, /sectionNeedsDuration/);
    assert.match(appSource, /sectionDurationsReady/);
  });  it("keeps 180-second cap disclosure and local-only copy", () => {
    assert.match(QUICK_MIX_DURATION_CAP_NOTICE, /180 seconds|3:00/i);
    const copy = [QUICK_MIX_DURATION_CAP_NOTICE, QUICK_MIX_LOCAL_ONLY_NOTICE, requiredRightsNotice].join("\n");
    assert.ok(includesNoPublicSharingInQuickMixCopy(copy));
    assert.equal(QUICK_MIX_DURATION_CAP_SECONDS, 180);
  });
});

describe("Quick Mix Arrangement Brain (Phase 43)", async () => {
  const {
    DEFAULT_ARRANGEMENT_STYLE,
    ARRANGEMENT_STYLE_OPTIONS,
    buildQuickMixArrangementCard,
    arrangementStyleLabel,
  } = await importSrc("src/domain/arrangementBrain.ts");
  const { quickMixPipelineShowsDone, failQuickMixProgress, createInitialQuickMixProgress } =
    await importSrc("src/domain/quickMix.ts");
  const { readFile } = await import("node:fs/promises");

  it("defaults style selector to Clean Blend", () => {
    assert.equal(DEFAULT_ARRANGEMENT_STYLE, "clean_blend");
    assert.equal(ARRANGEMENT_STYLE_OPTIONS[0]?.id, "clean_blend");
    assert.equal(arrangementStyleLabel("clean_blend"), "Clean Blend");
  });

  it("builds arrangement summary card for Hook Remix and DJ Edit", () => {
    const hookCard = buildQuickMixArrangementCard(
      {
        mode: "hook_remix",
        mode_label: "Hook Remix",
        summary_line: "Intro → Hook → Outro",
        score: 72,
        confidence_tier: "medium",
        warnings: [],
        score_breakdown: {},
        total_duration_seconds: 48,
        tempo_label: "hook @ 120 BPM",
        key_label: "compatible",
        sync_label: "phrase aligned",
      },
      {
        sections: [
          { label: "hook", source: "mix", start_seconds: 8, duration_seconds: 32, bar_length: 16 },
        ],
      }
    );
    assert.ok(hookCard);
    assert.match(hookCard!.summaryLine, /Hook/);

    const djCard = buildQuickMixArrangementCard(
      {
        mode: "dj_edit",
        mode_label: "DJ Edit",
        summary_line: "Intro → Hook → Break → Hook → Outro",
        score: 81,
        confidence_tier: "high",
        warnings: [],
        score_breakdown: {},
        total_duration_seconds: 56,
        tempo_label: "DJ edit @ 120 BPM",
        key_label: "compatible",
        sync_label: "bar-aligned",
      },
      {
        sections: [
          { label: "intro", bar_length: 8 },
          { label: "hook", bar_length: 16 },
          { label: "break", bar_length: 8 },
          { label: "hook", bar_length: 16 },
          { label: "outro", bar_length: 8 },
        ],
      }
    );
    assert.ok(djCard);
    assert.match(djCard!.summaryLine, /Break/);
  });

  it("uses bar-aligned section lengths in arrangement card sections", () => {
    const card = buildQuickMixArrangementCard(
      {
        mode: "dj_edit",
        mode_label: "DJ Edit",
        summary_line: "Intro → Hook → Break → Hook → Outro",
        score: 70,
        confidence_tier: "medium",
        warnings: [],
        score_breakdown: {},
        total_duration_seconds: 56,
        tempo_label: "120 BPM",
        key_label: "compatible",
        sync_label: "aligned",
      },
      {
        sections: [
          { label: "intro", bar_length: 8, duration_seconds: 16 },
          { label: "hook", bar_length: 16, duration_seconds: 32 },
        ],
      }
    );
    assert.ok(card?.sections.every((s) => [4, 8, 16, 32].includes(s.bar_length)));
  });

  it("surfaces low-confidence warnings instead of hiding them", () => {
    const card = buildQuickMixArrangementCard(
      {
        mode: "hook_remix",
        mode_label: "Hook Remix",
        summary_line: "Hook",
        score: 58,
        confidence_tier: "low",
        warnings: ["Low arrangement confidence (58/100) — review before sharing."],
        score_breakdown: {},
        total_duration_seconds: 32,
        tempo_label: "120 BPM",
        key_label: "clash",
        sync_label: "weak",
      },
      { sections: [{ label: "hook", bar_length: 16 }] }
    );
    assert.equal(card?.confidenceTier, "low");
    assert.ok(card?.warnings.some((w) => /low arrangement confidence/i.test(w)));
  });

  it("does not mark Done complete after failure", () => {
    const failed = failQuickMixProgress(createInitialQuickMixProgress(), "checking_files");
    assert.equal(quickMixPipelineShowsDone(failed), false);
  });

  it("wires style picker and arrangement card in Quick Mix UI", async () => {
    const appSource = await readFile(new URL("../src/components/QuickMixApp.tsx", import.meta.url), "utf8");
    const panelSource = await readFile(
      new URL("../src/components/quickMix/QuickMixOutputPanel.tsx", import.meta.url),
      "utf8"
    );
    assert.match(appSource, /QuickMixStylePicker/);
    assert.match(appSource, /DEFAULT_ARRANGEMENT_STYLE/);
    assert.match(appSource, /arrangementStyle/);
    assert.match(panelSource, /arrangementCard/);
  });

  it("avoids cloud/downloader/public-sharing language in arrangement copy", () => {
    const copy = ARRANGEMENT_STYLE_OPTIONS.map((o) => `${o.label} ${o.description}`).join("\n");
    assert.ok(!/cloud upload|downloader|public sharing|streaming import/i.test(copy));
  });
});

describe("Sidecar responsiveness under load (Phase 38)", async () => {
  const { readFile } = await import("node:fs/promises");
  const mainSource = await readFile(
    new URL("../local-engine/service/main.py", import.meta.url),
    "utf8"
  );

  it("imports run_in_threadpool to keep the event loop responsive during heavy work", () => {
    assert.match(mainSource, /from fastapi\.concurrency import run_in_threadpool/);
  });

  it("offloads blocking stem/analysis work off the async event loop", () => {
    const normalized = mainSource.replace(/\r\n/g, "\n");
    for (const call of [
      "run_in_threadpool(\n            process_stem_preview",
      "run_in_threadpool(analyze_beat_file",
      "run_in_threadpool(analyze_key_file",
      "run_in_threadpool(analyze_metadata_file",
    ]) {
      assert.ok(
        normalized.includes(call),
        `expected main.py to offload via ${call}`
      );
    }
  });
});

describe("Windows desktop packaging (Phase 44)", async () => {
  const { readFile } = await import("node:fs/promises");
  const {
    DESKTOP_PACKAGING_APPROACH,
    DESKTOP_UI_PORT,
    DESKTOP_UI_URL,
    buildDesktopLaunchBanner,
    buildDesktopSetupSteps,
    evaluateDesktopRuntimeChecks,
    formatDesktopRuntimeCheckLine,
    includesDesktopLocalOnlyLanguage,
    resolveDesktopVenvPython,
    resolvePackagedAppRoot,
  } = await importSrc("src/domain/desktopPackaging.ts");
  const configSource = await readFile(
    new URL("../local-engine/service/config.py", import.meta.url),
    "utf8"
  );

  it("selects electron portable as the packaging approach", () => {
    assert.equal(DESKTOP_PACKAGING_APPROACH, "electron-portable");
    assert.equal(DESKTOP_UI_PORT, 47830);
    assert.match(DESKTOP_UI_URL, /127\.0\.0\.1:47830/);
  });

  it("allows the desktop UI port in sidecar CORS", () => {
    assert.match(configSource, /47830/);
  });

  it("evaluates desktop runtime checks with blocking venv and ffmpeg tiers", () => {
    const ready = evaluateDesktopRuntimeChecks({
      venvPythonExists: true,
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      rubberBandAvailable: true,
      sidecarHealthy: true,
      torchAvailable: true,
      demucsAvailable: true,
    });
    assert.equal(ready.canLaunchUi, true);
    assert.equal(ready.canProcessAudio, true);
    assert.ok(ready.checks.every((check) => check.pass));

    const blocked = evaluateDesktopRuntimeChecks({
      venvPythonExists: false,
      ffmpegAvailable: false,
      ffprobeAvailable: false,
      rubberBandAvailable: false,
      sidecarHealthy: false,
      torchAvailable: false,
      demucsAvailable: false,
    });
    assert.equal(blocked.canLaunchUi, true);
    assert.equal(blocked.canProcessAudio, false);
    assert.ok(blocked.checks.some((check) => check.id === "venv" && check.blocking && !check.pass));
    assert.match(formatDesktopRuntimeCheckLine(blocked.checks[1]!), /BLOCKED/);
  });

  it("resolves packaged app root beside the executable", () => {
    const root = resolvePackagedAppRoot({
      execPath: "C:/Apps/MashLab/MashLab AI.exe",
      resourcesPath: "C:/Apps/MashLab/resources",
      isPackaged: true,
      devRoot: "C:/repo",
    });
    assert.equal(root, "C:/Apps/MashLab/mashlab-app");
    assert.match(resolveDesktopVenvPython("C:/Apps/MashLab/mashlab-app"), /local-engine\/service\/\.venv/);
  });

  it("includes local-only language in desktop setup copy", () => {
    const text = [...buildDesktopSetupSteps(), ...buildDesktopLaunchBanner(DESKTOP_UI_URL)].join("\n");
    assert.ok(includesDesktopLocalOnlyLanguage(text));
    assert.match(text, /no cloud upload/i);
    assert.match(text, /Quick Mix/i);
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

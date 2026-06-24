import type { AudioInspection, SlotId } from "../domain/types.ts";
import {
  createTrackJob,
  deriveJobState,
  type JobPhase,
  type MashJobStep,
  type MashTrackJob,
} from "../domain/jobs.ts";
import type { EngineJobResult } from "../engines/contracts.ts";
import { engineRegistry, type EngineRegistry } from "../engines/engineRegistry.ts";

type EngineAdapterKey = Exclude<keyof EngineRegistry, "capabilities">;

const PHASE_TO_ENGINE: Record<JobPhase, EngineAdapterKey> = {
  metadata: "metadata",
  beat: "beat",
  key: "key",
  stems: "stems",
  "pitch-time": "pitchTime",
  "vocal-cleanup": "vocalCleanup",
  arrangement: "arrangement",
  export: "exportMastering",
};

export async function runTrackJob(params: {
  sessionId: string;
  slotId: SlotId;
  inspection: AudioInspection;
  registry?: EngineRegistry;
}): Promise<MashTrackJob> {
  const registry = params.registry ?? engineRegistry;
  let job = createTrackJob({
    sessionId: params.sessionId,
    slotId: params.slotId,
    inspectionId: params.inspection.id,
  });

  for (const phase of job.steps.map((step) => step.id)) {
    job = markStep(job, phase, { state: "running", startedAt: new Date().toISOString() });

    const engineKey = PHASE_TO_ENGINE[phase];
    const engine = registry[engineKey];
    const result = await settleEngineResult<unknown>(
      engine.analyze(params.inspection),
      engine.status,
      engine.name
    );

    job = applyEngineResult(job, phase, result);
    job = { ...job, state: deriveJobState(job.steps), updatedAt: new Date().toISOString() };

    if (result.state === "failed") {
      break;
    }
  }

  return job;
}

function applyEngineResult(
  job: MashTrackJob,
  phase: JobPhase,
  result: EngineJobResult<unknown>
): MashTrackJob {
  const nextState =
    result.state === "complete"
      ? "complete"
      : result.state === "failed"
        ? "failed"
        : result.state === "running"
          ? "running"
          : "idle";

  return markStep(job, phase, {
    state: nextState,
    status: result.status,
    message: result.message,
    completedAt: nextState === "complete" || nextState === "failed" ? new Date().toISOString() : null,
  });
}

function markStep(
  job: MashTrackJob,
  phase: JobPhase,
  patch: Partial<MashJobStep>
): MashTrackJob {
  return {
    ...job,
    steps: job.steps.map((step) => (step.id === phase ? { ...step, ...patch } : step)),
    updatedAt: new Date().toISOString(),
  };
}

async function settleEngineResult<T>(
  result: Promise<EngineJobResult<T>>,
  status: EngineJobResult<T>["status"],
  engineName: string
): Promise<EngineJobResult<T>> {
  try {
    return await result;
  } catch {
    return {
      state: "failed",
      data: null,
      status,
      message: `${engineName} adapter failed before returning a result.`,
    };
  }
}

export function summarizeTrackJob(job: MashTrackJob): {
  completedSteps: number;
  totalSteps: number;
  nextPendingLabel: string | null;
} {
  const completedSteps = job.steps.filter((step) => step.state === "complete").length;

  const nextPending = job.steps.find(
    (step) => step.state !== "complete" && step.state !== "failed"
  );

  return {
    completedSteps,
    totalSteps: job.steps.length,
    nextPendingLabel: nextPending?.label ?? null,
  };
}

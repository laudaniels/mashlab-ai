import { useEffect, useState } from "react";
import type { AudioInspection, SlotId } from "../domain/types.ts";
import type { MashTrackJob } from "../domain/jobs.ts";
import { createEngineRegistry } from "../engines/engineRegistry.ts";
import { runTrackJob } from "../lib/jobRunner.ts";
import { isLibrosaAvailable } from "../lib/localEngine/analysis.ts";
import type { LocalEngineConnectionStatus } from "../lib/localEngine/types.ts";

export function useTrackJob(params: {
  sessionId: string;
  slotId: SlotId;
  inspection: AudioInspection | null;
  file: File | null;
  localStatus: LocalEngineConnectionStatus | null;
  onJobUpdate?: (job: MashTrackJob | null) => void;
}) {
  const [job, setJob] = useState<MashTrackJob | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!params.inspection) {
      setJob(null);
      setIsRunning(false);
      params.onJobUpdate?.(null);
      return;
    }

    let cancelled = false;
    setIsRunning(true);

    const registry = createEngineRegistry({
      file: params.file,
      localStatus: params.localStatus,
    });

    void runTrackJob({
      sessionId: params.sessionId,
      slotId: params.slotId,
      inspection: params.inspection,
      registry,
      onProgress: (nextJob) => {
        if (!cancelled) {
          setJob(nextJob);
          params.onJobUpdate?.(nextJob);
        }
      },
    }).then((result) => {
      if (!cancelled) {
        setJob(result);
        setIsRunning(false);
        params.onJobUpdate?.(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    params.file,
    params.inspection?.id,
    params.localStatus?.online,
    params.localStatus ? isLibrosaAvailable(params.localStatus.capabilities) : false,
    params.sessionId,
    params.slotId,
  ]);

  return { job, isRunning };
}

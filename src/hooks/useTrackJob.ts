import { useEffect, useState } from "react";
import type { AudioInspection, SlotId } from "../domain/types.ts";
import type { MashTrackJob } from "../domain/jobs.ts";
import { runTrackJob } from "../lib/jobRunner.ts";

export function useTrackJob(params: {
  sessionId: string;
  slotId: SlotId;
  inspection: AudioInspection | null;
}) {
  const [job, setJob] = useState<MashTrackJob | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!params.inspection) {
      setJob(null);
      setIsRunning(false);
      return;
    }

    let cancelled = false;
    setIsRunning(true);

    void runTrackJob({
      sessionId: params.sessionId,
      slotId: params.slotId,
      inspection: params.inspection,
    }).then((result) => {
      if (!cancelled) {
        setJob(result);
        setIsRunning(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [params.inspection?.id, params.sessionId, params.slotId]);

  return { job, isRunning };
}

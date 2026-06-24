import { useEffect, useState } from "react";
import type { AudioInspection } from "../domain/types.ts";
import type { MashAnalysisSnapshot } from "../engines/contracts.ts";
import { runMashAnalysis } from "../lib/analysisPipeline.ts";

export function useMashAnalysis(inspection: AudioInspection | null) {
  const [snapshot, setSnapshot] = useState<MashAnalysisSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!inspection) {
      setSnapshot(null);
      setIsRunning(false);
      return;
    }

    let cancelled = false;
    setIsRunning(true);

    void runMashAnalysis(inspection).then((result) => {
      if (!cancelled) {
        setSnapshot(result);
        setIsRunning(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [inspection?.id]);

  return { snapshot, isRunning };
}

import type { AudioInspection } from "../domain/types.ts";
import type { EngineJobResult, MashAnalysisSnapshot } from "../engines/contracts.ts";
import { engineRegistry, type EngineRegistry } from "../engines/engineRegistry.ts";

export async function runMashAnalysis(
  inspection: AudioInspection,
  registry: EngineRegistry = engineRegistry
): Promise<MashAnalysisSnapshot> {
  const [beat, key, stems] = await Promise.all([
    settleEngineResult(registry.beat.analyze(inspection), registry.beat.status, registry.beat.name),
    settleEngineResult(registry.key.analyze(inspection), registry.key.status, registry.key.name),
    settleEngineResult(registry.stems.analyze(inspection), registry.stems.status, registry.stems.name),
  ]);

  return { beat, key, stems };
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
      message: `${engineName} adapter failed before returning a result. This lane remains unavailable until the engine integration is repaired.`,
    };
  }
}

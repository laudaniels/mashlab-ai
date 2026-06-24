import { engineCapabilities } from "../domain/enginePlan.ts";
import type { EngineCapability } from "../domain/types.ts";
import type {
  ArrangementEngine,
  BeatEngine,
  ExportMasteringEngine,
  KeyEngine,
  MetadataEngine,
  PitchTimeEngine,
  StemEngine,
  VocalCleanupEngine,
} from "./contracts.ts";
import { browserMetadataEngine } from "./metadataAdapter.ts";
import {
  stubArrangementEngine,
  stubBeatEngine,
  stubExportMasteringEngine,
  stubKeyEngine,
  stubPitchTimeEngine,
  stubStemEngine,
  stubVocalCleanupEngine,
} from "./stubEngines.ts";

export interface EngineRegistry {
  metadata: MetadataEngine;
  beat: BeatEngine;
  key: KeyEngine;
  stems: StemEngine;
  pitchTime: PitchTimeEngine;
  vocalCleanup: VocalCleanupEngine;
  arrangement: ArrangementEngine;
  exportMastering: ExportMasteringEngine;
  capabilities: EngineCapability[];
}

export function createEngineRegistry(): EngineRegistry {
  return {
    metadata: browserMetadataEngine,
    beat: stubBeatEngine,
    key: stubKeyEngine,
    stems: stubStemEngine,
    pitchTime: stubPitchTimeEngine,
    vocalCleanup: stubVocalCleanupEngine,
    arrangement: stubArrangementEngine,
    exportMastering: stubExportMasteringEngine,
    capabilities: engineCapabilities,
  };
}

export const engineRegistry = createEngineRegistry();

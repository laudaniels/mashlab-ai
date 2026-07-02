import type { TrackInfo } from "./types";

export interface AlignmentInputs {
  targetBpm: number;
  offsetMs: number;
  downbeatShift: number;
  acapellaTempoMult: number;
  instrumentalTempoMult: number;
}

/** Mirror backend manual_grid_shift + anchor math for live preview. */
export function computeAlignment(
  acap: TrackInfo,
  instr: TrackInfo,
  c: AlignmentInputs
) {
  const gridAcapBpm =
    (acap.grid_bpm_clean || acap.bpm || 120) * c.acapellaTempoMult;
  const gridInstrBpm =
    (instr.grid_bpm_clean || instr.bpm || 120) * c.instrumentalTempoMult;
  const targetBpm = c.targetBpm > 0 ? c.targetBpm : gridInstrBpm;
  const rate =
    gridAcapBpm > 0
      ? Math.max(0.5, Math.min(2, targetBpm / gridAcapBpm))
      : 1;
  const nominal = 1 / rate;
  const beatPeriod = targetBpm > 0 ? 60 / targetBpm : 0.5;
  const vBar = acap.bar_phase_sec ?? acap.first_downbeat_sec ?? 0;
  const iBar = instr.bar_phase_sec ?? instr.first_downbeat_sec ?? 0;
  const baseShift = iBar - vBar * nominal;
  const shiftS =
    baseShift + c.offsetMs / 1000 + c.downbeatShift * beatPeriod;
  const anchorSec = shiftS + vBar * nominal;
  return {
    shiftS,
    anchorSec,
    rate,
    beatPeriod,
    baseShift,
    targetBpm,
    gridAcapBpm,
    gridInstrBpm,
  };
}

export function barDurationMs(bpm: number, beatsPerBar: number): number {
  if (bpm <= 0) return 2000;
  return (60000 / bpm) * beatsPerBar;
}

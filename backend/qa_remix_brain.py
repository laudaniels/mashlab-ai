"""Real-audio Remix Brain QA (local operator machine only).

Optional env (redacted labels in output):
  DJ_REMIX_QA_VOCAL  — Track A vocal stem path
  DJ_REMIX_QA_BEAT   — Track B instrumental stem path

Otherwise scans backend/tmp/tracks for any vocal + beat stem pair.
Never commit audio or commercial filenames.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from app.audio import remix_brain
from app.audio.io_utils import SAMPLE_RATE, load_audio, to_mono
from app.audio.pipeline import build_mashup
from app.audio.remix_brain import UserOverrides

CASES: list[tuple[str, UserOverrides, dict]] = [
    ("easy_default", UserOverrides(), {"label": "Track A × Track B"}),
    ("custom_section", UserOverrides(), {"label": "Track A × Track B", "section_start": 16.0, "section_duration": 32.0}),
    ("plus_4_bars", UserOverrides(downbeat_shift=4), {"label": "Track A × Track B"}),
    ("half_time", UserOverrides(acapella_tempo_mult=0.5), {"label": "Track A × Track B"}),
    ("manual_nudge", UserOverrides(offset_ms=250.0), {"label": "Track A × Track B"}),
]


def _find_stems() -> tuple[str, str] | None:
    env_v = os.environ.get("DJ_REMIX_QA_VOCAL", "").strip()
    env_b = os.environ.get("DJ_REMIX_QA_BEAT", "").strip()
    if env_v and env_b and Path(env_v).exists() and Path(env_b).exists():
        return env_v, env_b

    tracks = ROOT / "tmp" / "tracks"
    if not tracks.is_dir():
        return None
    vocal_path = beat_path = None
    for d in sorted(tracks.iterdir()):
        if not d.is_dir():
            continue
        v = d / "stems" / "vocals.wav"
        i = d / "stems" / "instrumental.wav"
        if v.exists() and vocal_path is None:
            vocal_path = str(v)
        if i.exists() and beat_path is None and vocal_path and str(v.parent.parent) != str(d):
            beat_path = str(i)
    if vocal_path and beat_path:
        return vocal_path, beat_path
    return None


def main() -> None:
    found = _find_stems()
    if found is None:
        print("QA skipped: set DJ_REMIX_QA_VOCAL + DJ_REMIX_QA_BEAT or add stems under tmp/tracks/")
        return

    vocal_path, beat_path = found
    from app.audio import analysis

    acap_an = analysis.analyze_file(vocal_path).to_dict()
    instr_an = analysis.analyze_file(beat_path).to_dict()
    out_root = ROOT / "tmp" / "qa_remix_brain"
    out_root.mkdir(parents=True, exist_ok=True)
    report: list[dict] = []

    print("Remix Brain QA — redacted local pairs only")
    for name, overrides, meta in CASES:
        t0 = time.perf_counter()
        ov = UserOverrides(
            target_bpm=overrides.target_bpm,
            semitones=overrides.semitones,
            offset_ms=overrides.offset_ms,
            downbeat_shift=overrides.downbeat_shift,
            snap=overrides.snap,
            acapella_tempo_mult=overrides.acapella_tempo_mult,
            instrumental_tempo_mult=overrides.instrumental_tempo_mult,
            section_start_sec=meta.get("section_start"),
            section_duration_sec=meta.get("section_duration"),
        )
        best, _, _, _ = remix_brain.pick_best_plan(
            acap_an,
            instr_an,
            ov,
            vocal_mono=to_mono(load_audio(vocal_path, sr=SAMPLE_RATE)[0]),
        )
        case_dir = out_root / name
        result = build_mashup(
            vocal_path,
            beat_path,
            str(case_dir),
            target_bpm=ov.target_bpm,
            semitones=ov.semitones,
            offset_ms=ov.offset_ms,
            downbeat_shift=ov.downbeat_shift,
            snap=ov.snap,
            acapella_tempo_mult=ov.acapella_tempo_mult,
            section_start_sec=meta.get("section_start"),
            section_duration_sec=meta.get("section_duration"),
            acap_analysis=acap_an,
            instr_analysis=instr_an,
            make_mp3=True,
        )
        dt = time.perf_counter() - t0
        val = result.params.get("validation", {})
        stretch = (result.params.get("stretch_rate", 1) - 1) * 100
        row = {
            "case": name,
            "pair": meta["label"],
            "section_start_sec": meta.get("section_start"),
            "section_duration_sec": meta.get("section_duration"),
            "vocal_bpm": acap_an.get("bpm"),
            "beat_bpm": instr_an.get("bpm"),
            "vocal_key": acap_an.get("key"),
            "beat_key": instr_an.get("key"),
            "vocal_camelot": acap_an.get("camelot"),
            "beat_camelot": instr_an.get("camelot"),
            "vocal_anchor_sec": best.vocal_anchor_sec,
            "beat_anchor_sec": best.instrumental_anchor_sec,
            "tempo_ratio": best.tempo_ratio,
            "pitch_shift_st": best.vocal_pitch_shift_semitones,
            "plan_score": best.score,
            "confidence_tier": result.params.get("confidence_tier"),
            "anchor_offset_ms": val.get("anchor_offset_ms"),
            "stretch_pct": round(stretch, 2),
            "warnings": (best.warnings or []) + (val.get("warnings") or []),
            "wav_artifact": str(result.wav_path.name),
            "mp3_artifact": str(result.mp3_path.name),
            "elapsed_s": round(dt, 1),
        }
        report.append(row)
        print(
            f"  [{name}] score={best.score:.0f} offset={val.get('anchor_offset_ms', '?')}ms "
            f"tier={result.params.get('confidence_tier')} stretch={stretch:+.1f}% time={dt:.1f}s"
        )

    report_path = out_root / "qa_report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Report -> {report_path}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Linux/WSL rhythm validation — synthetic fixture only, no user audio."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import config
from phrase_analysis import analyze_phrase_file
from rhythm_fixtures import cleanup_validation_fixture, generate_validation_fixture
from rhythm_selftest import run_rhythm_selftest


def main() -> int:
    print("=== MashLab rhythm validation (synthetic fixture only) ===")
    print("No user audio is processed.")

    selftest = run_rhythm_selftest()
    print("\n--- Self-test summary ---")
    print(f"platform: {selftest.platform}")
    print(f"heuristic_fallback: {selftest.heuristic_fallback_available}")
    print(f"verified_downbeat: {selftest.verified_downbeat_available}")
    print(f"verified_phrase: {selftest.verified_phrase_available}")
    for item in selftest.results:
        print(
            f"  {item.engine_id}: {item.smoke_test_status} · {item.basis_label} · "
            f"beats={item.beat_marker_count} downbeats={item.downbeat_marker_count} "
            f"phrases={item.phrase_marker_count}"
        )

    config.TEMP_DIR.mkdir(parents=True, exist_ok=True)
    fixture_path, _beat_times = generate_validation_fixture(config.TEMP_DIR, accented=True, keep_file=True)

    try:
        print("\n--- Phrase analysis (auto, synthetic fixture) ---")
        auto_result = analyze_phrase_file(
            fixture_path,
            "synthetic-validation.wav",
            method="auto",
            phrase_length_bars=8,
        )
        print(json.dumps(auto_result.model_dump(), indent=2))

        print("\n--- Phrase analysis (heuristic, beat_times from fixture) ---")
        heuristic_result = analyze_phrase_file(
            None,
            "synthetic-validation.wav",
            beat_times_raw=json.dumps(_beat_times),
            bpm=120.0,
            method="heuristic",
            phrase_length_bars=8,
        )
        if heuristic_result.result:
            print(
                f"heuristic basis={heuristic_result.result.phrase_basis} "
                f"method={heuristic_result.result.method_used}"
            )

        from rhythm_engines.registry import engine_status

        madmom_status = engine_status("madmom")
        if madmom_status.importable:
            print("\n--- Phrase analysis (madmom, explicit) ---")
            madmom_result = analyze_phrase_file(
                fixture_path,
                "synthetic-validation.wav",
                method="madmom",
                phrase_length_bars=8,
            )
            print(f"ok={madmom_result.ok} status={madmom_result.status}")
            if madmom_result.result:
                print(
                    f"madmom basis={madmom_result.result.phrase_basis} "
                    f"downbeats={len(madmom_result.result.downbeat_times)}"
                )
        else:
            print("\n--- madmom not installed — skipping explicit madmom phrase test ---")

    finally:
        cleanup_validation_fixture(fixture_path)

    strict = "--strict" in sys.argv
    if strict and not selftest.heuristic_fallback_available:
        print("\nSTRICT: heuristic self-test did not pass.", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

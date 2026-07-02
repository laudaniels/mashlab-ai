"""Beat grid + alignment tests using synthetic audio.

Run from the backend/ directory:
    .\\venv\\Scripts\\python.exe -m tests.beatgrid_test
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from app.audio import align, analysis, beatgrid
from app.audio.io_utils import SAMPLE_RATE, load_audio, to_mono
from tests.gen_audio import make_acapella, make_instrumental


def _check_grid_fields(d: dict) -> None:
    for key in (
        "bpm",
        "bpm_confidence",
        "beats_per_bar",
        "beat_times",
        "downbeat_times",
        "first_downbeat_sec",
        "tempo_stability",
        "grid_type",
    ):
        assert key in d, f"missing grid field: {key}"
    # BeatGrid exposes "source"; TrackAnalysis exposes "grid_source".
    assert "source" in d or "grid_source" in d, "missing grid source field"
    assert isinstance(d["beat_times"], list)
    assert isinstance(d["downbeat_times"], list)
    assert d["beats_per_bar"] >= 2
    assert 0.0 <= d["tempo_stability"] <= 1.0
    assert d["grid_type"] in ("static", "dynamic")


def main() -> None:
    print("beat_this available:", beatgrid.beat_this_available())

    with tempfile.TemporaryDirectory() as tmp:
        tmp_p = Path(tmp)
        instr_path = tmp_p / "instrumental.wav"
        acap_path = tmp_p / "acapella.wav"
        make_instrumental(instr_path, bpm=120.0, seconds=10.0)
        make_acapella(acap_path, bpm=100.0, seconds=10.0)

        # 1) Direct grid detection on the instrumental.
        y, sr = load_audio(str(instr_path), sr=SAMPLE_RATE)
        grid = beatgrid.detect_grid(to_mono(y), sr)
        print(
            f"instrumental grid: bpm={grid.bpm} conf={grid.bpm_confidence} "
            f"bpb={grid.beats_per_bar} beats={len(grid.beat_times)} "
            f"downbeats={len(grid.downbeat_times)} stab={grid.tempo_stability} "
            f"type={grid.grid_type} src={grid.source}"
        )
        _check_grid_fields(grid.to_dict())
        assert grid.beat_times, "no beats detected on instrumental"
        assert 100.0 <= grid.bpm <= 140.0, f"instrumental bpm off: {grid.bpm}"

        # 2) Full analysis exposes grid fields.
        instr_an = analysis.analyze_file(str(instr_path)).to_dict()
        acap_an = analysis.analyze_file(str(acap_path)).to_dict()
        _check_grid_fields(instr_an)
        _check_grid_fields(acap_an)
        assert instr_an["first_downbeat_sec"] == instr_an["downbeat_sec"]

        # 3) Alignment structure + phrase candidates.
        res = align.align_tracks(str(acap_path), str(instr_path), acap_an, instr_an)
        d = res.to_dict()
        print("align (acap vs instr):", d)
        assert 0.0 <= d["offset_confidence"] <= 1.0
        assert d["tempo_ratio"] > 0
        assert isinstance(d["phrase_candidates"], list) and d["phrase_candidates"]
        assert any(c["bars"] == 0 for c in d["phrase_candidates"])
        assert d["snapped_to"] in ("beat", "bar", "grid")

        # 4) Self-alignment invariant: aligning the instrumental to itself
        #    should recommend ~0 offset with strong confidence.
        self_res = align.align_tracks(
            str(instr_path), str(instr_path), instr_an, instr_an
        ).to_dict()
        print("align (instr vs instr):", self_res)
        assert abs(self_res["recommended_offset_ms"]) < 350, self_res
        assert self_res["offset_confidence"] > 0.3, self_res

        print("\nBEATGRID TEST PASSED")


if __name__ == "__main__":
    main()

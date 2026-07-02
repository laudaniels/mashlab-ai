"""Phrase grid tests."""

from __future__ import annotations

from app.audio import phrase


def test_phrase_starts_from_grid() -> None:
    downs = [0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0, 16.0]
    starts = phrase.phrase_starts_from_grid(downs, 4, duration=20.0)
    assert 0.0 in starts
    assert 8.0 in starts or 16.0 in starts
    assert starts == sorted(starts)


def test_estimate_phrase_length_bars() -> None:
    import numpy as np

    bar_samples = 50
    pattern = np.tile([1.0, 0.2] * (bar_samples * 4), 8)
    bars = phrase.estimate_phrase_length_bars(pattern, 50.0, 120.0, 4)
    assert bars in (4, 8, 16, 32)


def main() -> None:
    test_phrase_starts_from_grid()
    test_estimate_phrase_length_bars()
    print("phrase_test OK")


if __name__ == "__main__":
    main()

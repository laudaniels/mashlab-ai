"""Stem separation using Demucs.

Given a full song, extract the vocals (for an acapella) or the accompaniment
(for an instrumental). We drive Demucs through its Python API and save stems
ourselves with soundfile, which avoids torchaudio's newer torchcodec-based
saving path (torchcodec is awkward to install on Windows).
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from .io_utils import write_wav

# Model can be overridden with the DEMUCS_MODEL env var.
#   htdemucs      - default, best quality (slower on CPU)
#   mdx_extra_q   - quantized, faster
DEMUCS_MODEL = os.environ.get("DEMUCS_MODEL", "htdemucs")


def is_available() -> bool:
    try:
        import demucs  # noqa: F401
        import torch  # noqa: F401

        return True
    except Exception:
        return False


@lru_cache(maxsize=2)
def _get_model(name: str):
    from demucs.pretrained import get_model

    model = get_model(name)
    model.eval()
    return model


def separate_stem(input_path: str | Path, out_dir: str | Path, want: str) -> Path:
    """Separate ``input_path`` and return the requested stem's wav path.

    ``want`` is either ``"vocals"`` (the acapella) or ``"instrumental"``
    (the accompaniment = full mix minus vocals).
    """
    if want not in ("vocals", "instrumental"):
        raise ValueError("want must be 'vocals' or 'instrumental'")

    import torch
    from demucs.apply import apply_model

    from .io_utils import load_audio

    model = _get_model(DEMUCS_MODEL)
    sr = int(model.samplerate)

    y, _ = load_audio(input_path, sr=sr)  # (channels, n) float32
    wav = torch.from_numpy(y)

    # Standard Demucs normalization around the mono reference.
    ref = wav.mean(0)
    mean = ref.mean()
    std = ref.std() + 1e-8
    wav = (wav - mean) / std

    # overlap=0.1 (vs the 0.25 default) roughly halves CPU separation time with
    # only a minor quality cost — a good tradeoff on CPU-only machines.
    overlap = float(os.environ.get("DEMUCS_OVERLAP", "0.1"))
    with torch.no_grad():
        sources = apply_model(
            model,
            wav[None],
            device="cpu",
            split=True,
            overlap=overlap,
            progress=False,
        )[0]
    sources = sources * std + mean

    names = list(model.sources)
    vidx = names.index("vocals")
    vocals = sources[vidx].cpu().numpy()
    no_vocals = (sources.sum(0) - sources[vidx]).cpu().numpy()

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    target = vocals if want == "vocals" else no_vocals
    out_path = out_dir / f"{want}.wav"
    write_wav(out_path, target, sr)
    return out_path

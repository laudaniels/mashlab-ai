# WSL / Linux Rhythm Engine Setup (Phase 26–27)

Optional advanced rhythm engines (Essentia, madmom) are **not required** for MashLab AI. The Windows browser MVP and heuristic phrase planning work without them. Use this guide to validate verified downbeat/phrase analysis on Linux or WSL.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Windows default path (no WSL required)

```powershell
npm install
npm run dev
# Optional Windows sidecar (heuristic phrase planning when librosa installed):
cd local-engine\service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-analysis.txt
python -m uvicorn main:app --host 127.0.0.1 --port 47831
```

Windows MVP works without madmom/Essentia. Heuristic phrase planning remains the default fallback.

Check optional WSL profile:

```powershell
npm run sidecar:wsl:check
npm run setup:windows:check   # browser MVP works without WSL
```

## WSL optional path (verified rhythm engines)

### npm scripts

| Command | Purpose |
|---------|---------|
| `npm run sidecar:wsl:check` | Detect WSL; print Windows fallback guidance |
| `npm run sidecar:wsl:setup` | Bootstrap `.venv-rhythm` inside WSL |
| `npm run sidecar:wsl` | Start sidecar in WSL on port 47831 |
| `npm run sidecar:wsl:selftest` | Call rhythm self-test (non-strict by default) |

Strict mode (Linux CI / WSL when sidecar running):

```bash
node --experimental-strip-types scripts/rhythm-selftest-harness.mts --strict
```

### Bash scripts (Linux / WSL direct)

| Script | Purpose |
|--------|---------|
| `scripts/setup-rhythm-linux.sh` | Create `.venv-rhythm`, install base + optional madmom/Essentia/Demucs, and auto-patch madmom's Python 3.10+/numpy 2.x incompatibilities |
| `scripts/run-sidecar-linux.sh` | Start uvicorn with `.venv-rhythm` |
| `scripts/rhythm-selftest-linux.sh` | curl self-test + synthetic phrase validation |

PowerShell WSL wrappers:

- `scripts/setup-wsl-rhythm.ps1`
- `scripts/run-wsl-sidecar.ps1`

## Known Windows Python 3.12 limitations

| Package | Windows py3.12 | Linux/WSL |
|---------|----------------|-----------|
| Essentia | Build failed | Often installable |
| madmom | Build failed | Installable with Cython + build tools |

**Windows MVP is unaffected.**

## Bootstrap behavior (`setup-rhythm-linux.sh`)

1. Creates `.venv-rhythm` at repo root
2. Pins `setuptools<81` (madmom still imports `pkg_resources` at module load time; newer setuptools removed it)
3. Installs `requirements.txt` + `requirements-analysis.txt`
4. Attempts `requirements-rhythm-linux.txt` (madmom stack) — **does not fail repo if this fails**
5. If madmom installed, auto-patches it in place for three known incompatibilities with modern Python/numpy (madmom's last real release was 2018):
   - Bulk-replaces removed numpy aliases (`np.float`, `np.int`, `np.bool`, `np.object`, `np.str`, `np.complex`) with their builtin equivalents across every `.py` file in the package (numpy>=1.24 removed these; they always meant the builtin anyway)
   - `processors.py`: `from collections import MutableSequence` → `from collections.abc import MutableSequence` (moved in Python 3.10)
   - `features/downbeats.py`: rewrites the ragged-array `np.asarray(results)[:, 1]` HMM-selection line to a plain list comprehension (numpy now rejects inhomogeneous `np.asarray` input instead of silently building an object array)
   - These patches are idempotent — safe to run again on an already-patched venv. They touch pip-installed files under `.venv-rhythm/lib/.../site-packages/madmom/`, not anything tracked in git, so they must run again (i.e. re-run this script) after recreating the venv on any machine.
   - A fourth, related issue — madmom's *compiled* Cython extensions also look up `np.int`/`np.float` at runtime and can't be sed-patched (no `.pyx` source ships in the wheel) — is instead handled at the application layer: `local-engine/service/rhythm_engines/madmom_engine.py`'s `_ensure_legacy_numpy_aliases()` monkeypatches numpy before constructing `DBNDownBeatTrackingProcessor`. This one *is* tracked in git and needs no action on a new machine.
6. Optionally attempts `pip install essentia` — **does not fail repo if this fails**
7. Optionally attempts Demucs/PyTorch (`torch`/`torchaudio` CPU wheels + `requirements-stems.txt`) into the same `.venv-rhythm` — **does not fail repo if this fails**. This means a sidecar started via `run-sidecar-linux.sh` / `npm run sidecar:wsl` gets stem preview *and* verified rhythm engines together, without also needing the default `local-engine/service/.venv`.
8. Prints summary: `madmom: installed | install_failed`, `essentia: installed | install_failed`, `demucs/torch: installed | install_failed`

## Rhythm self-test (no user audio)

**Endpoint:** `GET /v1/capabilities/rhythm-selftest`

Or:

```bash
npm run sidecar:wsl:selftest
curl -s http://127.0.0.1:47831/v1/capabilities/rhythm-selftest | python3 -m json.tool
```

The self-test generates a synthetic 120 BPM click track in `.work/temp`, tests each engine, deletes the temp file. **No user uploads are processed.**

### Status meanings

| Status | Meaning |
|--------|---------|
| `pass` | Engine ran on synthetic signal and returned usable markers |
| `missing_dependency` | Required package missing (e.g. librosa for heuristic) |
| `not_configured` | Optional engine not installed — normal on Windows |
| `failed` | Importable but no valid markers on synthetic signal |
| `not_implemented` | Stub only (BeatNet+) |
| `skipped` | Not tested this run |

Verified labels (`Verified phrase`, `Verified downbeat`) appear **only** when real markers are returned — never from heuristic output.

## Phrase validation fixture (synthetic, no copyright)

`local-engine/service/rhythm_fixtures.py` generates:

- 120 BPM click track
- Optional accented downbeats (louder click every bar 1)
- Runtime-only in `.work/temp` — not committed

Linux validation script:

```bash
cd local-engine/service
source ../../.venv-rhythm/bin/activate
python validate_rhythm_linux.py
python validate_rhythm_linux.py --strict   # exit 1 if heuristic self-test fails
```

Tests: self-test endpoint, phrase analysis `auto`, explicit `madmom` when installed.

## GitHub Actions (optional)

Manual workflow: `.github/workflows/rhythm-linux-validation.yml`

- Trigger: `workflow_dispatch` only
- `continue-on-error: true` — does not block PRs
- Runs bootstrap, sidecar, self-test, synthetic phrase validation on Ubuntu

## Troubleshooting

| Issue | Action |
|-------|--------|
| WSL not installed | Use Windows path; run `npm run sidecar:wsl:check` |
| Sidecar unreachable (e.g. after `wsl --shutdown` or a reboot) | Nothing auto-starts the sidecar across a WSL restart — start it again with `npm run sidecar:start` (auto-picks `.venv-rhythm` when present), `npm run sidecar:wsl`, or `run-sidecar-linux.sh` |
| madmom install fails | Heuristic fallback still works; check build-essential, Cython |
| heuristic `missing_dependency` | `pip install -r requirements-analysis.txt` in venv |
| Verified label missing | Expected without madmom — install on Linux/WSL |

## Setting up a new machine (WSL2, full capability)

Clone into the WSL distro's Linux home directory (e.g. `~/mashlab-ai`), **not** under `/mnt/c/...` — keeping the repo on the Linux filesystem avoids WSL's cross-filesystem performance and permission quirks.

```bash
git clone <your-fork-or-repo-url>
cd mashlab-ai
npm install

# system packages (adjust for your distro)
sudo apt-get update
sudo apt-get install -y ffmpeg rubberband-cli build-essential python3-venv python3-pip

# default sidecar venv — browser MVP, FFmpeg/Rubber Band lanes, heuristic phrase planning
cd local-engine/service
python3 -m venv .venv
.venv/bin/pip install -U pip wheel
.venv/bin/pip install -r requirements.txt -r requirements-analysis.txt
cd ../..

# optional: verified rhythm engines (madmom/Essentia) + Demucs stem preview, in one go
bash scripts/setup-rhythm-linux.sh
```

`npm run sidecar:start` (`scripts/sidecar-lifecycle.mts`, via `findSidecarLaunchPython` in `src/domain/pythonRuntime.ts`) prefers `.venv-rhythm` whenever it exists, falling back to the default `local-engine/service/.venv` otherwise. So once `scripts/setup-rhythm-linux.sh` has been run, the ordinary `npm run sidecar:start` — the same command you'd run after any WSL restart — picks up verified madmom/Essentia and stem preview automatically; no need to remember a WSL-specific launcher. The WSL-specific scripts below still work and are equivalent:

```bash
bash scripts/run-sidecar-linux.sh
# or: npm run sidecar:wsl
```

Verify:

```bash
curl -s http://127.0.0.1:47831/v1/capabilities | python3 -m json.tool
curl -s http://127.0.0.1:47831/v1/capabilities/rhythm-selftest | python3 -m json.tool
```

## Manual validation log

| Field | Value |
|-------|-------|
| OS | Windows 11 — WSL **not installed** |
| WSL validation | **Not run** |
| Windows checks | All standard npm/python checks pass |
| Self-test harness | Non-strict exits 0 when sidecar offline |

| Field | Value |
|-------|-------|
| OS | Windows 11 + WSL2 (Ubuntu, `6.18.33.2-microsoft-standard-WSL2`) |
| WSL validation | **Run** — `bash scripts/setup-rhythm-linux.sh` then `bash scripts/run-sidecar-linux.sh` |
| Essentia | `pass` — `RhythmExtractor2013` beats detected, confidence normalized to 0-1 |
| madmom | `pass · Verified phrase` — `DBNDownBeatTrackingProcessor` downbeats detected on synthetic click track |
| Demucs/PyTorch | `available` — installed into `.venv-rhythm` alongside madmom/Essentia |
| Self-test harness | `curl http://127.0.0.1:47831/v1/capabilities/rhythm-selftest` confirms all three |

## Related docs

- `local-engine/service/requirements-rhythm-linux.txt`
- `docs/PHRASE_DOWNBEAT_ANALYSIS.md`
- `docs/LOCAL_ENGINE_SERVICE.md`

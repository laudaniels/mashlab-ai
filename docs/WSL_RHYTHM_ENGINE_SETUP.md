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
| `scripts/setup-rhythm-linux.sh` | Create `.venv-rhythm`, install base + optional madmom/Essentia |
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
2. Installs `requirements.txt` + `requirements-analysis.txt`
3. Attempts `requirements-rhythm-linux.txt` (madmom stack) — **does not fail repo if this fails**
4. Optionally attempts `pip install essentia` — **does not fail repo if this fails**
5. Prints summary: `madmom: installed | install_failed`, `essentia: installed | install_failed`

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
| Sidecar unreachable | Start with `npm run sidecar:wsl` or `run-sidecar-linux.sh` |
| madmom install fails | Heuristic fallback still works; check build-essential, Cython |
| heuristic `missing_dependency` | `pip install -r requirements-analysis.txt` in venv |
| Verified label missing | Expected without madmom — install on Linux/WSL |

## Manual validation log (this host: Phase 27)

| Field | Value |
|-------|-------|
| OS | Windows 11 — WSL **not installed** |
| WSL validation | **Not run** |
| Windows checks | All standard npm/python checks pass |
| Self-test harness | Non-strict exits 0 when sidecar offline |

## Related docs

- `local-engine/service/requirements-rhythm-linux.txt`
- `docs/PHRASE_DOWNBEAT_ANALYSIS.md`
- `docs/LOCAL_ENGINE_SERVICE.md`

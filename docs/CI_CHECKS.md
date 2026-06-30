# CI and local check matrix

MashLab CI is intentionally conservative: Node checks run on every push/PR; optional rhythm validation is manual; Windows-specific runtime checks remain local.

## GitHub Actions workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `.github/workflows/mvp-checks.yml` | push/PR to `master` | lint, typecheck, test, build, Python compile/test |
| `.github/workflows/rhythm-linux-validation.yml` | `workflow_dispatch` | Optional Linux rhythm lane (`continue-on-error: true`) |

No secrets required. No cloud upload or public sharing steps.

## `mvp-checks.yml` (every PR)

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `npm run check:python-service` — compile with system Python 3
7. `npm run check:python-service:test` — unittest discover

**Not run in CI (local Windows only):**

- `setup:windows:check:strict` — needs sidecar venv + FFmpeg PATH
- `check:local-engine` — needs ffmpeg/ffprobe on runner (optional locally)
- `sidecar:start` / full API workflow — long-running, machine-specific
- `validate:analysis-lane` — needs sidecar + librosa venv
- `capture:release-screenshots` — needs local Vite + sidecar

## Local release verification (Windows MVP)

Run before tagging a release candidate:

```powershell
npm run setup:windows:check:strict
npm run check:local-engine
npm run check:python-service:test:venv
npm run sidecar:status
npm run smoke:quick-mix
npm run validate:analysis-lane
npm run collect:release-versions
```

**Quick Mix MVP RC1 tag:** `mashlab-quick-mix-mvp-rc1` (base `1d6bb44`; includes `smoke:quick-mix` + optional `smoke:quick-mix:browser`).

## Artifacts and cache exclusions

Never commit or upload in CI:

| Path | Reason |
|------|--------|
| `local-engine/service/.venv/` | Python virtualenv |
| `local-engine/service/.work/` | Local artifacts |
| `local-engine/service/.cache/` | Service cache |
| `node_modules/` | Node deps |
| `dist/` | Vite build output |
| `%USERPROFILE%\.cache\torch\hub` | Demucs model weights |
| `*.tsbuildinfo` | TS cache |

QA evidence (logs, PNGs, small demo zip) may be committed intentionally under `qa/full-local-workflow/`.

## Optional WSL rhythm validation

Manual dispatch only. Job may fail when madmom/Essentia unavailable — expected on optional lane.

```yaml
continue-on-error: true
```

Strict mode: set workflow input `strict: true` when rhythm venv is fully bootstrapped.

## Adding CI safely

- Avoid assuming Windows PATH for FFmpeg/Rubber Band on ubuntu-latest
- Keep rhythm validation optional / allowed-to-fail
- Prefer `npm run check:python-service` over venv-only checks in CI
- Document local-only checks in this file rather than failing PRs

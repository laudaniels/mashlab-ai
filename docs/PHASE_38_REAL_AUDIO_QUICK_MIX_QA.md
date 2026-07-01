# Phase 38 — Real-audio Quick Mix QA

**Product:** MashLab AI / CyphaBlend AI
**Scope:** Diagnose and fix "Quick Mix stops during processing" with **real local audio**, then validate end-to-end from the browser.
**Legal:** Neutral private local audio-processing tool. User supplies audio and holds rights. No public sharing, cloud upload, downloader, or streaming integrations. Commercial source filenames are **redacted** below as Track A / Track B and are not committed.

> Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

---

## 1. Environment

| Item | Value |
|------|-------|
| OS | Windows (10.0.26200) |
| Sidecar Python | 3.12.10 (sidecar venv) |
| App | Vite dev server (fell back to `http://127.0.0.1:5175/` because 5173/5174 were occupied) |
| Sidecar bind | `http://127.0.0.1:47831` |

### Dependency versions

| Dependency | Status | Version |
|------------|--------|---------|
| FFmpeg / ffprobe | available | ffmpeg master GPL build (N-125365) |
| Rubber Band CLI | available | 4.0.0 |
| librosa | available | 0.11.0 |
| Demucs | available | 4.0.1 |
| PyTorch (CPU) | available | 2.5.1+cpu (validated stack) |

Runtime check: 6/7 (WSL advanced rhythm optional-missing, expected).

---

## 2. Test files (redacted)

Two real local files from the operator's library (names withheld; not committed):

| Label | Role | Format | Duration | Sample rate | Channels | Bitrate | Size |
|-------|------|--------|----------|-------------|----------|---------|------|
| Track A | Vocal / acapella source | MP3 | 205.09 s | 44.1 kHz | 2 | ~128 kbps | ~3.2 MB |
| Track B | Instrumental / beat source | MP3 | 291.64 s | 44.1 kHz | 2 | ~128 kbps | ~4.5 MB |

Both exceed the **180-second MVP cap**, so the cap-disclosure path was exercised.

---

## 3. Root cause(s)

### 3.1 Primary — sidecar froze its async event loop during heavy processing

Every heavy endpoint (`/v1/process/stem-preview`, `/v1/analyze/beat`, `/v1/analyze/key`, `/v1/analyze/metadata`, `/v1/process/pitch-time-preview`, `/v1/analyze/phrases`) was declared `async def` but called **blocking** work (Demucs `subprocess.run`, librosa) **directly on the single uvicorn event loop**. While Demucs ran, the entire sidecar could not answer any other request — including `/health` and `/v1/capabilities`.

**Empirical proof (before fix):** while a real 180 s stem separation was running, three `/health` probes all **timed out at 3 s** (0/3 responded). With 15 s synthetic files the block lasted ~2 s, so it was invisible — which is why the synthetic smoke passed but real audio "stopped."

Downstream effect: the app's Local Engine status poll (`useLocalEngineStatus`, every 15 s, 2.5 s timeout) timed out during processing and flipped Quick Mix to "engine offline," while the progress panel showed a static spinner with no heartbeat — the app **appeared stopped** even though Demucs was still working.

### 3.2 Secondary — CORS allowlist did not cover Vite fallback ports

`config.ALLOWED_ORIGINS` allowed only `5173`/`4173`. When 5173 is occupied, Vite serves on `5174`/`5175`/…, and the browser could not reach the sidecar **at all** (CORS-blocked). Quick Mix then showed "Local engine running: needed" and the **Mix button stayed disabled**. This is a real, silent failure for any user whose 5173 is busy.

### 3.3 Tertiary — `sidecar:stop` could not stop an externally-started sidecar

When the sidecar was started outside the lifecycle script (no recorded pid), `sidecar:stop` refused to act ("no pid recorded"), leaving no clean recovery path even though `/health` clearly identified MashLab.

---

## 4. Fixes made

| Area | Fix |
|------|-----|
| `local-engine/service/main.py` | Offload blocking work to a worker thread via `run_in_threadpool(...)` for stem-preview, metadata, beat, key, phrases, and pitch-time-preview. The event loop stays responsive during Demucs/librosa. (Synchronous export routes are already threadpooled by FastAPI.) |
| `local-engine/service/config.py` | Widen the localhost-only CORS allowlist to Vite/preview fallback ranges (`5173–5183`, `4173–4183`, both `127.0.0.1` and `localhost`). Loopback origins only. |
| `scripts/sidecar-lifecycle.mts` | `sidecar:stop` now safely stops a health-confirmed MashLab sidecar via its LISTENING pid when no pid was recorded, and verifies the port frees. |
| `src/components/quickMix/QuickMixProgressPanel.tsx` + `src/domain/quickMix.ts` | Long-running heartbeat: for stem steps, show elapsed time and "CPU stem separation can take several minutes — this has not stopped." Keeps the UI alive; no false failure. |
| `local-engine/service/tests/test_cors_origins.py`, `scripts/verify-core.mts` | Regression tests: CORS fallback ports + loopback-only; threadpool offload present; heartbeat / elapsed formatting; 180 s cap disclosure. |

### Verification of the primary fix

**After fix**, during a live real 180 s Demucs run, five `/health` probes responded in **~0.01–0.07 s** (5/5 OK) — the sidecar stayed fully responsive.

---

## 5. Real-file Quick Mix — browser end-to-end

Ran the full browser pipeline (headless Edge via Playwright harness `npm run smoke:quick-mix:browser` with real files supplied by env var; filenames redacted in all output).

**Result: PASS — completed end-to-end.**

| Field | Value |
|-------|-------|
| Outcome | completed |
| WAV download shown | yes |
| MP3 download shown | yes |
| Total time | 104 s |
| Heartbeat observed | "Still separating the instrumental… 0:38 elapsed. CPU stem separation can take several minutes — this has not stopped." |
| Sidecar health after run | healthy |

### Per-step timing (redacted evidence log)

| Step | Completed at |
|------|--------------|
| Checking files | 5 s |
| Separating vocal (Demucs, 180 s clip) | 45 s |
| Preparing instrumental (Demucs, 180 s clip) | 84 s |
| Matching timing/key | 92 s |
| Mixing track | 92 s |
| Creating WAV export | 98 s |
| MP3 reference + done | ~104 s |

### Output artifacts (real-file run)

| Export | Artifact id |
|--------|-------------|
| WAV | `b37e631743d54b40a049db88c9e79188` |
| MP3 | `5346b7ed47d1487fa5acb003c6e017b6` |

Evidence (redacted, no filenames/metadata): `qa/full-local-workflow/phase-38/quick-mix-real-audio-browser-log.json` and `quick-mix-real-audio-browser.png`.

---

## 6. Pass/fail table

| Check | Result |
|-------|--------|
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` (216 tests) | PASS |
| `npm run build` | PASS |
| `npm run check:local-engine` | PASS |
| `npm run setup:windows:check` | PASS (6/7) |
| `npm run setup:windows:check:strict` | PASS (6/7) |
| `npm run check:python-service` | PASS |
| `npm run check:python-service:test` | PASS (incl. new CORS test) |
| `npm run sidecar:status` | healthy |
| `npm run smoke:quick-mix` (synthetic API) | PASS (WAV `3cd0b8cace4648e3970e6eba6caf8064`, MP3 `433c001500524743ac0c8515a7c3571d`) |
| `/health` responsive during Demucs (after fix) | PASS (5/5, ~0.01–0.07 s) |
| **Real-file browser Quick Mix** | **PASS (WAV + MP3, 104 s)** |

---

## 7. Real-file duration policy

- Both sources exceeded 180 s; Quick Mix processed the first 180 s of each and **discloses the cap** in the output ("processes up to the first 180 seconds … not a full-length song export").
- The sidecar trims to the cap before Demucs; no duration-mismatch rejection.
- Output is a completed capped-segment mix, not labeled a full-song export.

---

## 8. Remaining limitations / notes

- Demucs on CPU is the dominant cost (~40 s per 180 s clip on this machine). The heartbeat keeps the UI honest; total real-file Quick Mix ≈ 1.5–3 min here and can be longer on slower CPUs.
- Stem separation remains preview-quality; DJ review required. No mastering/publish claims.
- WSL advanced rhythm (madmom/Essentia) remains optional-missing; heuristic timing is the default.
- Quick Mix requires the local sidecar to be reachable from the browser origin; the CORS range now covers Vite's common fallback ports. If a user runs the dev server outside `5173–5183`, add that origin to `config.ALLOWED_ORIGINS`.
- No user audio is committed. Commercial filenames are redacted throughout.

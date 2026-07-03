# AGENTS.md

## Cursor Cloud specific instructions

MashLab AI — a DJ-assistant mashup engine. The web UI is Vite + React (TypeScript). It also ships an Electron desktop shell (`desktop/`) and a Python local audio engine (`local-engine/`, Demucs/PyTorch/FFmpeg/Rubber Band).

- Dependencies for the web app are installed by the Cursor Cloud update script (`npm install`).
- Run web dev: `npm run dev` (Vite, bound to `127.0.0.1`; pass `-- --port <n>` if needed).
- Standard checks live in `package.json`: `npm run lint` (ESLint), `npm run typecheck`, `npm run build`, and `npm test` (Node's built-in test runner over `scripts/verify-core.mts`, ~248 tests).

Non-obvious notes:
- The Electron desktop (`npm run desktop:dev`) and the Python local-engine (stem separation / rendering) are NOT required for web UI development and are NOT installed in Cloud. With the engine absent, the browser UI intentionally shows a "local engine not detected / setup" panel — that is expected, not a broken environment.
- The many `sidecar:*`, `setup:windows:*`, and `desktop:*` scripts target Windows/desktop packaging and are out of scope for headless Linux web dev.

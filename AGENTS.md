# AGENTS.md

## Cursor Cloud specific instructions

Vite + React app (AI music mashup/mixing UI). Node deps are installed automatically on VM startup.

- Dev server: `npm run dev` (binds `127.0.0.1:5173` via the dev script; pass `-- --port <n>` to change). Build: `npm run build`. Lint: `npm run lint`. Typecheck: `npm run typecheck`.
- Tests: `npm test` (runs `node --test` over `scripts/verify-core.mts`). Many additional `scripts/*.mts` helpers use `node --experimental-strip-types`.
- The web UI runs standalone. Heavy audio/stem processing relies on an optional local Python "sidecar"/`local-engine` (see `scripts/sidecar-*` and `README.md`); it is not needed just to run and interact with the UI.

# Session Artifacts — Phase 7

MashLab AI stores **session-only planning artifacts** in browser memory for each uploaded track. There is no cloud persistence, user account storage, or permanent library in this phase.

## What Is Stored Per Track

Each `TrackSessionArtifact` includes:

| Field | Description |
|-------|-------------|
| `fileIdentity` | File name, size, lastModified for deduplication |
| `inspectionId` | Browser metadata inspection UUID |
| `browserMetadata` | Duration, sample rate, channels, waveform peaks |
| `serviceMetadata` | Optional sidecar metadata step result |
| `beatAnalysis` | Raw beat/BPM result from analysis lane |
| `keyAnalysis` | Raw key/Camelot result from analysis lane |
| `beatGrid` | Derived beat grid from analysis |
| `effectiveBeatGrid` | Grid after DJ overrides applied |
| `effectiveKeyProfile` | Key profile after DJ overrides applied |
| `overrides` | User-supplied DJ override values |
| `version` / timestamps | Session artifact schema version and update times |

## Session Scope

- Artifacts live in React state for the current browser session.
- **Phase 8:** override summaries, mash intent, and file identity are also saved to **sessionStorage** (local-only).
- Raw audio is never persisted.
- Clearing a track slot removes its artifact and clears session snapshot.
- Closing the browser tab clears sessionStorage; re-uploading the same file restores overrides when file identity matches.

## Phase 8 Persistence

`src/lib/sessionPersistence.ts` stores:

- `mashIntent` (vocal A/B planning assumption)
- Per-track `overrides`
- File identity for restore matching
- Beat/key summary snapshots (not full beat arrays)

No IndexedDB, cloud sync, or account storage.

## Override Precedence

Planning uses **effective** values in this order:

1. **DJ override** — user-supplied BPM, key, mode, Camelot, alignment offset, phrase length
2. **Detected analysis** — sidecar/browser beat/key results when available
3. **Unavailable** — honest empty state, no fake values

When an override is active, UI labels show **DJ override** or **user-supplied**. Overrides are never presented as AI-detected results.

## Sync Flow

1. Upload completes → artifact created with browser metadata
2. Track job progresses → beat/key results synced into artifact
3. User edits override panel → artifact rebuilt with effective grid/profile
4. Mashup Planning + Timeline + Pitch/Time Plan read from artifact store

## Pitch/Time Planning (Phase 8)

Effective artifacts feed the pitch/time planner. See `docs/PITCH_TIME_PLANNING.md`.

## Privacy

Artifacts remain local to the user's browser session. MashLab does not upload artifacts to cloud services in this phase.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

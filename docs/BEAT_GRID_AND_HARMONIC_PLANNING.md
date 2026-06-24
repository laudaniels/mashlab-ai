# Beat Grid and Harmonic Planning — Phase 6

Phase 6 adds **planning-only** beat-grid refinement and harmonic compatibility tooling. No pitch/time processing, stem separation, or export rendering is performed in this phase.

## Beat Grid Model

The typed beat grid (`src/domain/beatGrid.ts`) represents:

| Field | Description |
|-------|-------------|
| `bpm` | Estimated tempo when beat analysis succeeded |
| `beatTimes` | Detected beat timestamps (seconds) |
| `beatCount` | Number of detected beats |
| `estimatedFirstDownbeat` | Only when true downbeat detection exists |
| `downbeatTimes` | Only when true downbeat detection exists |
| `phraseMarkers` | Heuristic or detected phrase windows |
| `confidence` | BPM confidence when provided |
| `estimateStatus` | `available`, `heuristic`, `not_implemented`, or `unavailable` |
| `method` | Analysis method string from the sidecar |
| `limitations` | Honest caveats for DJ review |

### Downbeats

Downbeats are **not implemented** in the current prototype. The grid sets:

- `downbeatStatus: not_implemented`
- `estimatedFirstDownbeat: null`
- `downbeatTimes: []`

Do not treat the first detected beat as a verified downbeat unless a future BeatNet+ / Essentia integration provides real downbeat detection.

## Heuristic Phrase Planning

When at least **32 detected beats** and a finite BPM exist, MashLab can mark rough **8-bar / 32-beat** phrase windows starting from beat 1.

This planner is explicitly labeled:

- `method: heuristic_from_detected_beats`
- `status: heuristic`
- **Not true downbeat detection**
- **DJ review required**

If beats are missing or insufficient, phrase planning returns `null` and the UI shows **Phrase planning unavailable**. No fake phrase markers are generated.

### Future upgrades

| Current | Planned |
|---------|---------|
| Heuristic 8-bar windows from beat 1 | BeatNet+ / Essentia downbeat-aware grids |
| No phrase confidence | Phrase confidence + manual edit tools |

## Harmonic Compatibility Planner

The harmonic planner (`src/domain/harmonicPlanning.ts`) compares Track A and Track B key results using Camelot-style logic:

| Relationship | Label |
|--------------|-------|
| Same Camelot code | `strong` |
| Adjacent number, same mode | `compatible` |
| Same number, different mode (relative key) | `compatible` |
| Other combinations | `risky` |
| Missing or uncertain key data | `unknown` |

### Pitch-shift suggestions (planning only)

When both keys are available, the planner may suggest:

- `suggested_instrumental_shift_semitones` — shortest semitone path toward Track A
- `suggested_vocal_shift_semitones` — advisory vocal alignment (0 when keys already match)

Warnings appear when suggested shifts exceed comfort thresholds (4 / 6 semitones). **No audio is processed.**

### Experimental key handling

Key estimates from the Phase 5 prototype are **experimental**. Results with confidence below `0.55`, or missing key/Camelot data, are flagged as uncertain and return `unknown` or advisory warnings.

## Mashup Planning UI

When both tracks are loaded on the Analysis screen, the **Mashup Planning** panel shows:

- Track A / Track B BPM, key, Camelot, beat count
- BPM difference and tempo adjustment plan (text only)
- Harmonic compatibility label and reason
- Pitch-shift planning suggestions
- Phrase readiness (heuristic vs unavailable)
- Limitations and **DJ review required**

## Analysis Reuse (No Duplicate Uploads)

The frontend keeps an in-memory cache keyed by file identity (`name`, `size`, `lastModified`, inspection id) so beat and key sidecar calls do not re-upload the same file during a session.

**Limitation:** Cache is session-only and cleared when a track slot is cleared. There is no filesystem artifact store yet.

## Sidecar vs Frontend Planner

Harmonic and phrase planning run **entirely in the frontend** for stability. The optional FastAPI sidecar continues to provide beat/key analysis only. A future `/v1/analyze/plan` endpoint is not required for Phase 6.

## DJ Review Required

All Phase 6 output is advisory:

- Phrase windows assume beat 1 equals bar 1
- Key detection can misidentify mode or root
- Tempo doubling/halving is not resolved here
- Pitch-shift values are suggestions for later processing lanes

## Phase 7 Integration

- Session artifacts (`src/domain/sessionArtifacts.ts`) hold beat/key results and DJ overrides per track.
- Effective beat grid and key profile merge overrides before planning.
- Mashup Planning panel reads effective values and shows source labels.
- Timeline alignment UI visualizes beats and heuristic phrase windows (read-only).

Override precedence: **DJ override > detected analysis > unavailable** (never faked).

See `docs/SESSION_ARTIFACTS.md` and `docs/TIMELINE_ALIGNMENT.md`.

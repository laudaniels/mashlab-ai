# Phrase and Downbeat Analysis Upgrade Path (Phase 24)

Phase 24 adds an optional **phrase/downbeat analysis upgrade path** while preserving the existing **heuristic phrase planner** as fallback. This improves phrase evidence quality for arrangement drafts — it does **not** add new export surfaces or claim song-structure detection.

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Evidence Types

| Label | Meaning |
|-------|---------|
| **Heuristic** | Phrase windows derived from detected beat times — not verified downbeats |
| **Verified downbeat** | Downbeat times from an optional advanced rhythm engine (when installed and integrated) |
| **Verified phrase** | Phrase start markers from advanced engine or verified pipeline |
| **DJ override** | User phrase length or alignment offset |
| **Unavailable** | Insufficient beat/phrase data |

Phrase basis API values: `heuristic_from_beats`, `verified_downbeat`, `verified_phrase`, `unavailable`.

## Endpoint

### `POST /v1/analyze/phrases`

Multipart form fields:

| Field | Description |
|-------|-------------|
| `file` | Optional audio upload |
| `bpm` | Optional known BPM |
| `beat_times` | Optional JSON array of beat times from prior beat analysis |
| `phrase_length_bars` | `4`, `8`, or `16` (default 8) |
| `method` | `auto`, `heuristic`, `essentia`, `beatnet`, `madmom` |

Response includes:

- `method_used`
- `phrase_basis`
- `beat_times`, `downbeat_times`, `phrase_start_times`
- `confidence` (only when actually computed)
- `limitations`
- `dj_review_required: true`

If Essentia/BeatNet+/madmom are missing, the service returns `missing_dependency` for explicit advanced methods, or **Auto** falls back to heuristic from beat times.

**Never** labels heuristic output as verified. **Never** fabricates downbeats.

## Capabilities

The sidecar reports analysis lanes:

- `beat_bpm_analysis` — librosa beat/BPM
- `key_analysis_experimental` — experimental key lane
- `heuristic_phrase_planning` — heuristic phrase windows
- `verified_downbeat_analysis` / `verified_phrase_markers` — planned until advanced deps integrated
- `essentia`, `beatnet`, `madmom` — optional, `not_configured` when missing

Statuses: `available`, `missing`, `planned`, `not_configured`, `experimental`.

Service startup does **not** fail when advanced libraries are missing.

## Frontend

- **Phrase Analysis** panel on Timeline — user-initiated only (consistent with existing analysis behavior)
- Beat grid stores heuristic vs verified evidence, method, confidence, limitations
- Timeline and arrangement drafts show evidence labels honestly
- Arrangement draft phrase basis priority: DJ override → verified phrase → verified downbeat → heuristic → unavailable

## Traceability

Arrangement context and export metadata may include:

- `phrase_evidence_method`
- `phrase_evidence_verified`
- `phrase_confidence`
- `phrase_basis`

Package manifest and technical report carry this when present.

## Not Included

- No verse/chorus/drop detection claims
- No auto-run on upload (user clicks Run phrase analysis)
- No public sharing, cloud upload, downloader, or streaming
- No distribution rights granted

See also: `docs/BEAT_GRID_AND_HARMONIC_PLANNING.md`, `docs/ARRANGEMENT_DRAFTS.md`, `docs/LOCAL_ENGINE_SERVICE.md`.

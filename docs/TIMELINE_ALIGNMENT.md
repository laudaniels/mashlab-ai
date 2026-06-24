# Timeline Alignment — Phase 7

The Timeline screen provides a **read-only planning view** for beat alignment and heuristic phrase windows. No audio processing, stem separation, or export occurs in this phase.

## What the Timeline Shows

For each loaded track:

| Element | Source | Notes |
|---------|--------|-------|
| Waveform preview | Browser metadata | When Web Audio decode succeeded |
| Beat markers | Detected beat times | Vertical ticks on the lane |
| Phrase regions | Heuristic planner | Green shaded windows, 4/8/16 bars |
| BPM label | Effective value | Detected or DJ override |
| Alignment offset | DJ override only | When user sets first-beat anchor |

## What Is Not Shown (Honest Placeholders)

- **Intro / verse / drop structure** — `not_implemented`
- **True downbeat detection** — `not_implemented`
- **Stem lanes** — future phase
- **Editable regions** — read-only in Phase 7

## Heuristic Phrase Windows

Phrase regions assume beat 1 equals bar 1 unless a DJ alignment offset is set. Default phrase length is **8 bars** (32 beats). Users can override to **4** or **16** bars in the DJ Override panel.

All phrase windows are labeled **heuristic · DJ review required**.

## Alignment Offset

The **First beat offset (s)** override lets a DJ anchor planning to a specific timestamp (seconds) where bar 1 should start. This is a manual planning aid, not AI downbeat detection.

Beat markers and phrase regions are recomputed from the anchor when set.

## Missing Data Behavior

If beat analysis is unavailable:

- No beat markers are drawn
- No phrase regions are faked
- Lane footer shows what is needed (analyze track or set overrides)

## Related Screens

- **Analysis** — override panels + mashup planning summary
- **Timeline** — visual alignment + overrides + planning recap

DJ review is required before any future pitch/time processing or export phase.

# Quick Mix Mode

## User flow

1. Upload **Track A** — vocal source (full song or isolated acapella)
2. Upload **Track B** — beat source (full song or isolated instrumental)
3. Click **Quick Mix**

Quick Mix runs Remix Brain automatically:

```
Remix Brain plan → stretch/pitch vocal → anchor placement → mix/master → WAV/MP3
```

There is no separate prototype route. The main page button posts to `POST /api/remix`, which calls `build_mashup` with `pick_best_plan`.

## Optional overrides (advanced)

Collapsed under **Advanced alignment (optional nudge)**:

- Offset ms / bar shift
- Snap beat/bar
- Target BPM, pitch, gains
- Section start/duration (API: `sectionStartSec`, `sectionDurationSec`)

Manual nudge applies on top of the brain plan on the next render.

## Output card

Main screen shows:

- Remix plan: Clean Blend
- Sync confidence: High / Medium / Low
- Tempo: vocal BPM → beat BPM
- Key: compatible / shifted / no shift (low confidence)
- Warnings when present
- WAV + MP3 download
- Local rights notice

Technical score breakdown and anchor offset ms are collapsed under **Technical**.

## Preview vs render

Browser preview uses `playbackRate` (approximate). Render uses Rubber Band R3 when available.

## Plan preview API

`GET /api/plan?acapellaId=&instrumentalId=` returns the top plan without rendering.

## Scope

Local-only. No streaming downloader, cloud upload, public sharing, or publishing-rights automation.

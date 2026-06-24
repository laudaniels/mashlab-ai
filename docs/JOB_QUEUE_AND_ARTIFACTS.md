# Job Queue and Artifact Storage

## Job Model

The frontend job model lives in `src/domain/jobs.ts`.

Each track job contains ordered phases:

1. metadata
2. beat
3. key
4. stems
5. pitch-time
6. vocal-cleanup
7. arrangement
8. export

`src/lib/jobRunner.ts` executes phases sequentially through typed engine adapters. A failing required phase stops the queue for that track.

## Queue Rules

- One track job per uploaded file per session.
- Jobs are local and ephemeral in the browser MVP.
- Future local service jobs should be resumable and cancellable.
- Never mark a phase complete unless real output exists.

## Artifact Strategy

Recommended local workspace layout:

```text
artifacts/
  sessions/
    {sessionId}/
      tracks/
        trackA/
          source/              # approved copy of user file
          metadata.json
          analysis/
            beat.json
            key.json
          stems/
          previews/
          exports/
        trackB/
          ...
      mashup/
        drafts/
        timeline.json
        export/
```

### Retention

- Browser MVP: object URLs and in-memory inspection only.
- Local service: write artifacts to disk under a user workspace directory.
- Provide a clear “clear session workspace” action in a later settings panel.

### Formats

- Analysis JSON for beat/key/phrase structures
- WAV stems and preview renders
- Final WAV master plus optional MP3 reference
- Sidecar JSON describing loudness, true peak, and export settings

## Cancellation

Future service jobs should support:

- cancel queued jobs before execution
- stop long-running stem/export jobs safely
- preserve partial artifacts with explicit “partial result” status

## Frontend Integration

- `useTrackJob` runs the browser-side sequential queue today.
- When the local service exists, the same job shape should map to HTTP job polling without changing UI labels.

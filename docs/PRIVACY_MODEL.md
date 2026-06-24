# Privacy Model

MashLab AI / CyphaBlend AI is a neutral private audio-processing tool.

## Principles

1. The user supplies audio and is responsible for rights.
2. The app does not provide music, downloaders, streaming imports, or a public sharing hub in the MVP.
3. User uploads are not used for training.
4. Processing should remain local-first unless a future cloud mode is explicitly designed and disclosed.

## Current Browser MVP

- Files are selected locally through the browser file picker.
- Metadata inspection happens in the browser using Web Audio and media metadata APIs.
- No network upload path exists in the current app.
- No analytics ingestion of audio content is implemented.

## Future Local Service

When a local engine service is added:

- File copies must happen only after explicit user action.
- The UI must state when audio leaves the browser context.
- Artifacts remain in a local workspace under user control.
- Optional cloud processing, if ever added, requires separate consent and product copy.

## Required User Notice

Upload audio you own or are authorized to use. MashLab AI helps process and arrange it. Rights to publish or distribute are separate and remain the user's responsibility.

## Data We Should Not Collect in MVP

- Streaming account identifiers
- Public share links
- Copyrighted-song catalogs
- Training datasets derived from user uploads

## Engineering Guardrails

- Keep legal constants centralized in `src/lib/legal.ts`.
- Do not add URL import fields or streaming OAuth flows.
- Label unimplemented intelligence honestly in UI and docs.

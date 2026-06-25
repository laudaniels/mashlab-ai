# MashLab AI / CyphaBlend AI — Product Constitution

## Product name
**MashLab AI** (also referenced as **CyphaBlend AI**)

## One-sentence identity
Private, local-first AI-assisted DJ mashup workstation—two user-supplied tracks in, analyzed and planned locally, with honest placeholders until full stem/export engines ship.

## Core audience
DJs and producers who own or are authorized to use the source audio and want mashup planning, beat/key alignment, and timeline review on their own machine.

## Core offering
- **Dual-track upload** — browser-local validation, metadata, waveform when decodable
- **Analysis pipeline** — BPM/key lanes, beat grid, harmonic compatibility planning (planning only)
- **Local Python sidecar** — optional localhost engine for ffprobe/librosa endpoints
- **Session artifacts** — in-memory browser session store; no cloud hub in MVP
- **Future engine adapters** — Demucs, BeatNet+, Essentia, Rubber Band behind stable boundaries (not all implemented)

## What this project is NOT
- Not a music downloader or streaming ripper
- Not a public sharing hub or royalty-free music library
- Not DJ Cypha booking website or event production site
- Not TradeLab / MarketOps trading cockpit
- Not financial or investment advice product

## Locked tone
Professional pro-audio tool UI—focused, honest about what is implemented vs placeholder, no fake “AI mastered your track” claims.

## Trust / safety rules (hard)
- User must upload audio they own or are authorized to use
- No bundled copyrighted music; no streaming service integration in MVP
- Label heuristic analysis (phrase planning, Camelot suggestions) as DJ review required
- Do not imply cloud processing or export quality that engines do not yet provide
- Keep local-first posture unless explicit approval for hosted processing

## No-drift rules
- Do not add public upload/sharing without rights and legal review
- Do not add auto-publish to DJ pools or social platforms without approval
- Do not merge into TradeLab or Ask My Investor AI codebases without explicit split/approval
- Do not expose fake stem separation or export when adapters are stubs

## Codex/Cursor may improve freely
- Engine adapter implementation behind documented boundaries
- Timeline UI, beat grid accuracy upgrades, sidecar reliability
- Tests, lint, typecheck, build, local-engine check scripts
- Docs for BPM/key, session artifacts, timeline alignment

## Requires explicit approval before changing
- Product name split (MashLab vs CyphaBlend primary)
- Cloud upload, accounts, billing, or multi-user collaboration
- Export formats/licensing claims for commercial distribution
- Integration with DJ Cypha brand site beyond cross-link copy

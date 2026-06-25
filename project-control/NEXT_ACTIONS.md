# MashLab AI / CyphaBlend AI — Next Actions

## Immediate cleanup
1. Add a GitHub remote and push `master` (human decision) — currently local-only git.
2. Rename or symlink checkout to `mashlab-ai` for discoverability (optional, human approval).
3. Run full quality commands from README after any engine work.

## Next 3 highest-leverage actions
1. **Beat grid upgrade path** — implement or wire BeatNet+/Essentia adapter per `docs/` without faking results.
2. **Export boundary** — define minimum viable offline export before marketing “DJ-ready mashup out.”
3. **Sidecar packaging** — document one-command local-engine startup for Windows (PowerShell script exists in README).

## Blocked / needs human review
- Whether primary brand is MashLab AI or CyphaBlend AI in public-facing copy
- GitHub repo creation and license for audio tooling
- Any cloud processing or account system

## Do-not-start-yet
- Public sharing hub, streaming integrations, or downloader features
- Merging with DJ Cypha website repo
- Claiming stem separation quality before Demucs (or chosen engine) is integrated

## Recommended next Codex prompt
```
On MashLab AI (C:\Users\dimit\Documents\Codex\2026-06-23\files-mentioned-by-the-user-you-4):
Read project-control/PRODUCT_CONSTITUTION.md first.
Run npm run lint, typecheck, build, test, and check:local-engine.
Report gap between documented engine plan and implemented adapters. No cloud upload features.
```

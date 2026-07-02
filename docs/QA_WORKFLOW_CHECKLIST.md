# QA Workflow Checklist

## Redaction rules

- Log **Track A / Track B / Track C / Track D** only
- Never commit `.mp3`, `.wav`, `.flac`, `.aiff`, `.m4a`
- Never commit user filesystem paths or commercial song/artist names
- QA artifacts stay under `backend/tmp/` (gitignored)

## Automated

```bash
npm test
npm run smoke:quick-mix
npm run smoke:quick-mix:remix-brain
```

## Real-audio cases (local operator)

| # | Case | Expect |
|---|------|--------|
| 1 | Easy pair (similar BPM) | High/medium confidence, stretch ≤ 3% |
| 2 | Custom section window | Section + brain cooperate |
| 3 | Medium BPM difference | Tempo warning if stretch > 6% |
| 4 | Weak pair | Low tier + warnings, not false “great” |
| 5 | Manual nudge | Override reflected in next render plan/validation |

Record per case:

- Redacted pair label
- Section starts (if any)
- BPM estimates, key/Camelot
- Selected anchors, tempo ratio, pitch shift
- Plan score, confidence tier, anchor offset ms
- Warnings
- WAV/MP3 artifact filenames (not paths)
- Listening note: in time / not in time / questionable

## Env vars for local smoke

```powershell
$env:DJ_REMIX_QA_VOCAL = "path\to\track_a_vocal.wav"
$env:DJ_REMIX_QA_BEAT  = "path\to\track_b_beat.wav"
npm run smoke:quick-mix:remix-brain
```

## Acceptance

- Anchor offset < 70 ms on constant-tempo easy pair
- Warnings visible when sync or score is weak
- Job completes with validation block (no false silent Done)

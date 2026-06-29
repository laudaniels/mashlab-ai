# Local Project Package Export (Phase 17)

MashLab AI / CyphaBlend AI supports **local project package export** — a user-initiated bundle of selected local artifacts into a DJ/project folder or optional ZIP archive.

This is **local organization only**. It is **not public sharing**, **not cloud upload**, and **does not grant distribution rights**.

## Legal / Product Doctrine

- The user supplied all source audio.
- MashLab does not provide music or clearances.
- Packages are local and user-generated.
- No public distribution or publishing rights are granted.
- Raw uploads are **excluded** from packages in this phase.

## Endpoint

### `POST /v1/export/package`

Request body:

```json
{
  "package_label": "My mashup project",
  "selected_artifact_ids": ["stemA", "wavExport", "mp3Export"],
  "package_type": "folder",
  "include_technical_report": false
}
```

| Field | Notes |
|-------|-------|
| `package_label` | Required, max 120 chars; sanitized for folder name |
| `selected_artifact_ids` | Existing local artifact ids only |
| `package_type` | `folder` (default) or `zip` |
| `include_technical_report` | Optional JSON + Markdown reports |

Response includes:

- `package_artifact_id`
- `local_folder_path`
- `download_url` (ZIP only)
- `manifest_path`, `rights_notice_path`, optional `technical_report_path`
- `included_files`, `included_artifact_ids`
- `publicShare: false`, `packageOnly: true`
- `rights_notice`, `warnings`, `limitations`

## Packageable Artifacts

Only existing local artifacts:

| Type | Files bundled |
|------|---------------|
| Stem preview | `vocals.wav`, `no_vocals.wav` → `stems/track-{a,b}-*.wav` |
| Combined preview | `preview.wav` → `previews/combined-preview.wav` |
| WAV export | `export.wav` → `exports/export.wav` or `exports/export-full.wav` |
| Section window export (Phase 23) | `section-export.wav` → `exports/export-section.wav` |
| MP3 export | `export.mp3` → `exports/export.mp3` |
| Master (when audio exists) | `master.wav` → `exports/master.wav` |

**Not included:** raw uploads, pitch-time preview artifacts, measurement-only masters without audio.

## Storage

```
.work/artifacts/packages/{uuid}/
  package.meta.json
  MashLab_Project_{safe_label}/
    exports/
    stems/
    previews/
    reports/          (optional)
    manifest.json
    RIGHTS_NOTICE.txt
    README.txt
  mashlab-package.zip   (when package_type=zip)
```

ZIP download: `GET /v1/artifacts/packages/{id}/download`

## Manifest

`manifest.json` includes:

- `package_id`, `created_at`, `package_label`, `package_type`
- `selected_artifact_ids`, artifact entries with readouts when available
- `mix_settings` on combined preview and full export entries when present (Phase 18)
- `arrangement_context` on preview, full, and **section window** exports when present (Phase 22–23), including `binding_freshness_status` at export time for section exports
- `arrangement_context` per artifact entry when present (Phase 22) — advisory section traceability
- `arrangement_contexts[]` top-level array when any selected artifact carries context
- `included_files` with safe relative paths only
- `public_share: false`, `rights_granted: false`, `user_responsible_for_rights: true`
- `raw_uploads_included: false`

Raw local upload paths are never written to the manifest.

## Rights Notice

`RIGHTS_NOTICE.txt` states:

- User supplied all source audio
- MashLab does not provide music
- Package is local/user-generated
- No public distribution rights granted
- User is responsible for rights, clearances, and lawful use

## Technical Report

When requested:

- `reports/technical-report.json`
- `reports/technical-report.md`

Phase 22: when selected artifacts include arrangement context, the technical report lists advisory traceability lines per artifact and a summary section stating sections do not grant rights and are not detected song structure.

Includes available artifact loudness/readout summaries. Missing BPM/key/planning values are reported as `not_available` — not fabricated.

## UI

Export screen **Project package / stem package** section:

- Checkbox list of eligible artifacts
- Smart defaults (latest full WAV, MP3, master, stems, combined preview)
- Package label, type selector, technical report toggle
- Explicit **Create local project package** button
- Result summary with included files and rights warning

## Cleanup

Package artifacts appear in the artifact browser as `package / folder` or `package / zip`.

Delete and **Clear all session artifacts** remove package directories under `.work/artifacts/packages/` only — nothing outside `.work/artifacts`.

## What This Is Not

- Not public sharing or a download hub
- Not cloud storage or sync
- Not proof of publishing rights
- Not auto-packaging — user must explicitly create each package

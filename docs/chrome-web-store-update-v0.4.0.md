# Chrome Web Store update preparation — 0.4.0

Status: package and metadata prepared for the existing Store item; refreshed screenshots still require an unlocked-Mac capture session. No Dashboard upload, submission,
publication, account or permission change is performed by this preparation. The last repository-recorded
Store production version is 0.3.2; live Dashboard state must be checked by the release owner.

## Existing publication path

Use the existing item `kidgoemedakjcnbhpccponmpaibfhekj` and the exact ZIP attached to GitHub Release
`v0.4.0`. Preserve its Store identity (no local stable-ID key). Do not create a second Store item.
Follow the existing submission checklist with the updated version-specific record; historical
0.1–0.3 checkboxes do not establish the current update's state.

1. Confirm the currently published/reviewed package in Developer Dashboard.
2. Compare the GitHub asset SHA-256 with `docs/releases/v0.4.0-release-record.md` before upload.
3. Upload `smart-proxy-route-helper-v0.4.0.zip`; inspect parsed version and unchanged permissions.
4. Use the prepared EN/RU listing additions, privacy summaries, permission justifications and
   `store-assets/listing/release-notes-v0.4.0.md`. Replace version-specific “New in 0.3.0” headings
   with “Recent updates”. Keep screenshots honest: show simultaneous lists and distinguish
   configured intent from verified browser state; do not use personal profiles or signed-in pages.
5. Review screenshots/source captures documented in the release record. Do not present simulated
   connectivity/TLS outcomes as production measurements. Preserve valid unchanged assets only
   where they still match the shipped UI.
6. Confirm privacy disclosures against PRIVACY.md and docs/named-routes.md. Local endpoints remain
   excluded from backup exports by default; one local recovery copy is retained. Route names sync.
7. Review unpublished limitations with the owner, then separately authorize Submit for review.
   Approval and production publication must be recorded from the actual Dashboard result.

## Reviewer notes

The purpose remains user-controlled per-domain proxy routing. Work/Life are simultaneous destinations,
not a browser-wide VPN switch. The extension neither provides a VPN nor integrates with certificate
installation. DIRECT bypasses Chrome proxies and can coexist with an OS-level VPN; it does not select
an OS HTTP proxy per host.

`proxy` reads/applies/verifies a local PAC and ChromeSetting control. `storage` stores synced rule
chunks/names and local connections/pause/language/recovery. `activeTab` grants temporary current-site
access after the toolbar click. `scripting` supports existing optional related-domain workflows and
a new one-time, credentials-free current-origin fetch after **Test selected route**. No broad host
access is requested. Only during the check are Chrome proxy error codes observed in memory; there
is no passive diagnostic history, URL upload, certificate installation or TLS bypass.

Chrome may redact precise fetch failures and proxy errors do not identify a tab. The UI discloses
these limitations rather than declaring a route fully healthy or prescribing CA changes as a proven
fix. The user is directed to Corporate VPN Router's wizard for Work's CA verification.

Review risks remain proxy control, script injection and consistency of disclosures. Unchanged
permissions do not guarantee Store approval. GitHub Actions are not a publication prerequisite for
this explicitly local-verified release and must not be started for this task.

## Capture handoff

The isolated Chrome 156.0.8078.80 session loaded the real dist/0.4.0 extension and passed the
browser smoke described in the release record. Initial native captures did not pass final image
quality checks, then Computer Use reported a locked Mac with automatic unlock paused after physical
input. They are drafts, not Store assets, and are excluded from the release/source commit. No screenshot
claim is used as evidence for untested corporate connectivity.

After the owner unlocks the Mac, use the project isolated launcher and the existing named-route
composition option: `swift scripts/compose-store-screenshots.swift --named-routes`. Capture clean
English Options and toolbar Popup sources in `store-assets/screenshots/v0.4.0/source/` using the
filenames in that script. Verify sharp, unobscured UI and 1280×800 final canvases. Keep Sync signed
out and use only sanitized demo domains/endpoints. Screenshot completion and the remaining
Dashboard steps are required before Store submission; the ZIP and metadata are ready for that handoff.

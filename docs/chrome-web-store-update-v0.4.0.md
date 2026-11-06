# Chrome Web Store update preparation — 0.4.0

Status: package, EN/RU metadata and four verified 1280×800 screenshots prepared for the existing Store item. No Dashboard upload, submission,
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

## Completed capture preparation

On 2026-11-06 the owner unlocked the Mac and the screenshot preparation resumed. The previous
failed/locked-session drafts were excluded. The final [four-image set](../store-assets/screenshots/v0.4.0/README.md)
contains route management, Work SOCKS5, Life DIRECT and the genuine toolbar Popup. It was captured
from dist/0.4.0 in isolated Chrome 156.0.8078.80 with Sync signed out and sanitized demo data.

Every final image is a sharp RGB PNG without alpha at 1280×800. Native JPEGs, simple crops,
fixture data and reproduction instructions are included beside the assets. No page account,
production proxy, credential, private domain or real corporate test result is shown. The capture
script now supports the four-image set with `--named-routes`.

Only Dashboard upload, final owner review, submission and Store approval/publication remain.
Use the exact ZIP recorded above; runtime, release tag and GitHub ZIP were not changed by
screenshot preparation. No GitHub Actions were started.

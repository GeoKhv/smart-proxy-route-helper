# Chrome Web Store update — 0.4.2

Date: 2026-11-09. Existing item: `kidgoemedakjcnbhpccponmpaibfhekj`.
Submission is authorized with **deferred/manual publication only**. The published 0.3.2
must remain available until the owner separately decides to release 0.4.2.

## Immutable package

- [GitHub Release v0.4.2](https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.4.2).
- Asset: `smart-proxy-route-helper-v0.4.2.zip`, downloaded directly from that release.
- SHA-256: `ab596f7dd4e6858651e6673ae5284cc0d681c01a5603e4ddea10b7fea325c890` (verified after download).
- ZIP contains 15 files; manifest version 0.4.2; permissions exactly proxy, storage, activeTab, scripting.
- No broad host permissions, persistent content scripts, webRequest or webNavigation.
- Source, ZIP and tag are unchanged. The downloaded archive was extracted to ignored dist/ for isolated UI comparison, without rebuilding or repackaging.

## Current materials

- EN/RU detailed descriptions, privacy summaries, single purpose and permission explanations: [listing directory](../store-assets/listing/).
- [EN/RU Store release notes](../store-assets/listing/release-notes-v0.4.2.md).
- [Privacy policy](../PRIVACY.md), [privacy declarations](chrome-web-store-privacy-disclosure.md).
- [Sync compatibility](sync-compatibility.md), [acceptance evidence](releases/v0.4.2-release-record.md).
- Four existing English 1280×800 RGB screenshots, shared across locales: [original capture record](../store-assets/screenshots/v0.4.0/README.md). Keep the original paths and checksums to preserve provenance.

The update adds simultaneous Work/Life routes relative to Store 0.3.2 and fixes two
mixed-version/offline reconciliation regressions from the unpublished 0.4.x candidates.
Work can interoperate with 0.3.2. Life needs 0.4.2+ on participating devices; 0.4.0/0.4.1
named writers must be upgraded. Same-list concurrent snapshots retain last-writer behavior.
Do not present this as general lossless synchronization or verified signed Store delivery.

## Review and privacy risks

Proxy control and temporary script injection remain Store review risks even with unchanged
permissions. Declare local data processing conservatively: Browsing history, User activity,
Website content. No remote code. No developer collection, advertising, profiling or resale.
Route settings and reconciliation metadata may synchronize through Google; local connections,
Pause, language and one pre-upgrade recovery copy remain device-local. A manual route test
makes a credentials-free current-origin request and holds bounded error codes in memory;
there is no certificate installation, TLS bypass or uploaded diagnostic history.

Official requirements checked on 2026-11-09:

- [Deferred publication](https://developer.chrome.com/docs/webstore/publish): uncheck automatic publication in the submission dialog. After approval a staged submission has up to 30 days for manual release, then returns to draft.
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq): local processing also requires disclosure.

## Submission procedure

1. Inspect live Dashboard status and the existing package.
2. Upload only the verified 0.4.2 release ZIP through the existing item's Package page.
3. Confirm parsed 0.4.2, update EN/RU listing descriptions and replace screenshots with the four verified originals.
4. Save privacy purpose/permission explanations; retain correct conservative data categories and no-remote-code declaration. Review test instructions.
5. Save draft, choose Submit for review, **uncheck automatic publication after approval**, and submit.
6. Verify live pending review status, 0.4.2 package and deferred publication. Published 0.3.2 must remain available.

Never call Chrome Web Store API publish. Do not choose a final production Publish action.

## Observed Dashboard state

Initial live overview: Smart Proxy Route Helper version 0.3.2, Published to everyone.
The main Chrome profile is used only for the authorized Dashboard workflow. Capture/UI
comparison uses the signed-out disposable profile from the project launcher.

Upload, review submission and deferred-publication result: pending completion; this record
must be finalized from the actual Dashboard outcome, not inferred from prepared files.

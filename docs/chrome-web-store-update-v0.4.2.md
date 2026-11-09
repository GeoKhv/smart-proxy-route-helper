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

## Confirmed result — 2026-11-09, approximately 12:29 MSK

**Submitted / awaiting review, with deferred publication.** No owner action remains
for submission. Approval has not yet been granted.

- The Package page initially showed draft 0.4.0 and published 0.3.2.
- The exact verified ZIP replaced that draft; parsed version 0.4.2 and unchanged permissions were checked before submission.
- EN description saved at 5,022 characters; RU description at 5,233. Both are below the 16,000-character limit.
- The four global screenshots already in the draft were visually identified as the prepared Work/Life set and retained in order. No localized screenshot overrides were present. The original bytes were not edited.
- Single purpose and all four permission explanations were updated and saved. Existing Browsing history, User activity and Website content categories, the three limited-use certifications, and No remote code were verified and retained.
- Privacy URL was changed to the immutable [0.4.2 policy](https://github.com/GeoKhv/smart-proxy-route-helper/blob/be2fe24ef08523c32ffc1985ca41917fe490defe/PRIVACY.md), so moderation does not depend on merging product code to main.
- Reviewer instructions were saved (485/500 characters); no login/password is needed or supplied. EN/RU release notes are in the repository; the consumer descriptions include the 0.4.2 fix and compatibility limits.
- In the final submission dialog, **Automatically publish after review** was changed from checked to **unchecked**; AX value 0 and the screenshot both confirmed the unchecked state before Submit.
- Submit completed with the success dialog: item sent for review. It explicitly stated that deferred publication expires 30 days after review.
- Afterwards the header read **Awaiting review** (Ожидает рассмотрения), Status read **Draft awaiting review** (Черновик ожидает рассмотрения), and Package showed **0.4.2** under draft/review plus **0.3.2** under Published.
- The submitted package CRX reference is revision **00006**. Upload is disabled while review is pending.

[Dashboard status](https://chrome.google.com/webstore/devconsole/386aa294-1d32-4825-8150-c7f6f92b199e/kidgoemedakjcnbhpccponmpaibfhekj/edit/status)
· [Package](https://chrome.google.com/webstore/devconsole/386aa294-1d32-4825-8150-c7f6f92b199e/kidgoemedakjcnbhpccponmpaibfhekj/edit/package)
· [Public Store item](https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj).

No production Publish action or Chrome Web Store API publish was called. Published
0.3.2 remains the user-facing package. The release ZIP, tag and product source were
not modified. GitHub documentation was pushed to codex/fix-independent-sync-042;
main was not merged or changed. The 0.4.2 executable source was already in that
release branch before this task. Documentation commits use skip-ci messages.

## Remaining limits

Store approval and signed Store update delivery remain unverified. Publishing
0.4.2 requires a separate owner decision after approval. Under Google's deferred
publication rules, an approved staged item returns to draft if it is not manually
published within 30 days; this does not automatically publish it or replace 0.3.2.
The fourth original screenshot omits the newer Life compatibility helper sentence;
its shown route and controls remain representative, with the requirement disclosed
in both listing descriptions and the screenshot reuse record. No pixel-identical
0.4.2 provenance is claimed for the original 0.4.0 assets.

## Subsequent repository alignment — 2026-11-09

After the Store submission, the default `main` branch was aligned to the exact
`v0.4.2` tagged runtime, manifests, locales, and regression-test blobs while retaining
the updated documentation in `main`. This source-only GitHub change does not alter
the submitted ZIP, GitHub Release, Dashboard revision 00006 or deferred publication.
The earlier submission observations above remain the historical record.

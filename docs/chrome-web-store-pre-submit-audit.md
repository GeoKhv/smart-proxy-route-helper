# Chrome Web Store Pre-Submit Audit

Audit date: 2026-06-26; refreshed 2026-06-28 after the clean popup screenshot and small promotional image readiness pass.

Asset updates: 2026-06-28 added the mandatory small promotional image draft asset and replaced popup screenshots `04` and `05` from clean manually captured Chrome sources. These updates do not publish the extension, modify Chrome Web Store Developer Dashboard fields, change runtime code, change manifest permissions, or bump the version.

Post-publication update: `v0.1.0` is now published in Chrome Web Store at https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj. This report remains the pre-submit audit record and a future Store update reference.

This report reviewed Smart Proxy Route Helper for Chrome Web Store submission readiness before publication. It is a review artifact only. It did not publish the extension, modify Chrome Web Store Developer Dashboard fields, create a release, create a tag, change runtime code, change manifest permissions, or bump the version.

## Baseline

| Item | Result |
| --- | --- |
| Branch | `main` |
| Remote | `origin git@github.com:GeoKhv/smart-proxy-route-helper.git` |
| Pull result | `git pull --ff-only origin main` was already up to date |
| Refresh starting commit | `b43d40fc586a26edd623cc9dac1f98ab293c50c9` (`b43d40f Replace popup Store screenshots with clean captures`) |
| Current readiness baseline | Clean popup screenshot replacements and small promotional image draft are present in the repository |
| `manifest.json` version | `0.1.0` |
| `package.json` version | `0.1.0` |
| Chrome Web Store listing | Published `v0.1.0`: https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj |
| GitHub release | `v0.1.0`, release, not draft, published 2026-06-25 |
| GitHub release target | `696bf08f847cf0952a938c2d06456f38e4d25e9e` |
| Release asset | `smart-proxy-route-helper-v0.1.0.zip` exists on GitHub release and in local `release/` after packaging |

## Official References Checked

- Chrome Web Store listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store image requirements: https://developer.chrome.com/docs/webstore/images
- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- Chrome Web Store privacy policy requirements: https://developer.chrome.com/docs/webstore/program-policies/privacy
- Chrome Web Store program policies: https://developer.chrome.com/docs/webstore/program-policies/policies

Key official constraints applied in this audit:

- Store listings need complete listing fields, including a clear description, category, language, graphic assets, privacy practices, and distribution settings.
- Store image assets require a 128x128 icon, a 440x280 small promotional image, and at least one 1280x800 or 640x400 screenshot.
- Manifest permissions should be requested only when needed and should stay understandable to reviewers and users.
- Manifest V3 submissions must not rely on remotely hosted executable logic. Extension behavior must be reviewable from the submitted package.
- Privacy disclosures must explain extension data usage accurately and must not understate synced or local data.

## Checks Run

| Check | Result |
| --- | --- |
| `git status --short --branch` | Clean before refresh edits; `## main...origin/main` |
| `git pull --ff-only origin main` | Passed, already up to date |
| Branch and remote check | Passed, branch `main`, remote `origin` points to `git@github.com:GeoKhv/smart-proxy-route-helper.git` |
| Version check | Passed, manifest and package versions are both `0.1.0` |
| `npm test` | Passed, 15 test files and 172 tests |
| `npm run build` | Passed |
| `npm run typecheck --if-present` | Passed |
| `git diff --check` | Passed |
| `npm audit` | Reported 1 low severity `esbuild` advisory, `GHSA-g7r4-m6w7-qqqr` |
| `npm run package` | Previous package audit passed, packaged 13 files into `release/smart-proxy-route-helper-v0.1.0.zip`; not rerun during this docs/assets refresh because runtime code, manifest permissions, and package version did not change |
| Zip manifest inspection | Previous package audit passed, submitted manifest inside zip matches expected permissions and version |
| GitHub release lookup | Passed through `gh release view v0.1.0` |
| Release asset content comparison | Previous package audit passed, downloaded GitHub asset and locally rebuilt zip extract to identical file contents |
| Screenshot dimension check | Passed, all final screenshot PNGs are `1280x800` |
| Promotional image dimension check | Passed, `store-assets/promotional/small-promo-440x280.png` is `440x280` |
| Screenshot visual review | Passed for private-data safety; clean replacements for `04` and `05` show no visible cursor highlight |

`npm audit` exits non-zero because of the low severity advisory. This audit treats it as a warning, not a Store-submission blocker, because the affected package is a development build tool advisory and dependency maintenance was explicitly out of scope for this Store-preparation pass.

## Manifest And Permissions Audit

Manifest status: pass.

`manifest.json`, `dist/manifest.json`, and the manifest inside `release/smart-proxy-route-helper-v0.1.0.zip` all report:

```json
{
  "manifest_version": 3,
  "version": "0.1.0",
  "permissions": ["proxy", "storage", "activeTab", "scripting"]
}
```

Confirmed absent:

- `host_permissions`
- `<all_urls>`
- `webRequest`
- `webNavigation`
- persistent `content_scripts`
- remote PAC URL
- remote executable code references in the manifest

Permission explanations in `docs/chrome-web-store-listing.md`, `docs/chrome-web-store-privacy-disclosure.md`, `docs/permissions.md`, and `docs/chrome-web-store-submission-dry-run.md` are aligned with the current behavior:

- `proxy` applies locally generated PAC data.
- `storage` stores synced domain-level routing data and device-local proxy settings.
- `activeTab` is used after explicit user action on the active tab.
- `scripting` supports temporary user-invoked related-domain preview and diagnostic recording.

No manifest permission changes were made.

## Privacy Audit

Privacy status: pass with final-dashboard verification required.

`PRIVACY.md` and `docs/chrome-web-store-privacy-disclosure.md` clearly state:

- no telemetry;
- no analytics;
- no ads;
- no backend;
- no developer-operated data collection;
- no runtime remote list fetching;
- no remote executable code;
- no raw URLs stored, synced, or sent;
- no page text, form values, uploaded file contents, screenshots, cookies, authentication data, session data, proxy credentials, or local file contents collected;
- local proxy configuration stays in `chrome.storage.local`;
- domain routing rules, ignored/denylisted domains, and classification overrides are domain-level data in `chrome.storage.sync`;
- related-domain preview and diagnostic recording are explicit, user-invoked, transient, and do not automatically create rules.

The Store privacy reference also includes permission-specific disclosure text and a Limited Use certification reference. The privacy policy URL is present as:

```text
https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/PRIVACY.md
```

Before pressing Submit, verify in the Dashboard that the Store privacy field labels still map cleanly to this language and that the privacy URL opens publicly from a signed-out browser.

## Store Listing Audit

Listing status: pass for repository listing text; keep the live Store listing aligned with this reference during future updates.

`docs/chrome-web-store-listing.md` and `docs/chrome-web-store-submission-dry-run.md` include ready-to-copy reference fields:

- extension name: `Smart Proxy Route Helper`;
- short description: `Manage per-domain proxy routing through a user-configured local proxy.`;
- detailed description focused on local proxy routing, manual rules, Chrome Sync, local PAC generation, and user-invoked diagnostics;
- category suggestion: Developer Tools;
- support URL: `https://github.com/GeoKhv/smart-proxy-route-helper/issues`;
- homepage/repository URL: `https://github.com/GeoKhv/smart-proxy-route-helper`;
- privacy policy URL suggestion;
- release URL: `https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.1.0`.

The wording avoids risky positioning such as "bypass", "unblock", political framing, sanctions framing, or censorship framing. Known limitations are documented.

Manual Dashboard fields were not opened or modified during this audit. The extension has since been published through the Chrome Web Store flow.

## Screenshot And Image Audit

Screenshot status: pass for repository screenshot assets; small promotional image draft is present. Final Dashboard upload and review were outside this audit and should be repeated for future Store updates.

Final screenshot files exist:

- `store-assets/screenshots/final/01-options-local-proxy.png`
- `store-assets/screenshots/final/02-options-route-rules.png`
- `store-assets/screenshots/final/03-popup-current-site.png`
- `store-assets/screenshots/final/04-popup-related-domains.png`
- `store-assets/screenshots/final/05-popup-recording.png`
- `store-assets/screenshots/final/06-options-classification-overrides.png`

All six final screenshot PNGs are `1280x800`. Visual review found sanitized demo data only. No private profile data, credentials, account pages, proxy secrets, raw private URLs, Chrome Web Store Dashboard data, unrelated private tabs, or cursor highlights were visible in the recommended set.

Clean popup replacement:

- `store-assets/screenshots/source/04-popup-related-domains-clean.png` was saved from the clean manually captured related-domain preview popup source.
- `store-assets/screenshots/source/05-popup-recording-clean.png` was saved from the clean manually captured diagnostic recording popup source.
- `store-assets/screenshots/final/04-popup-related-domains.png` and `store-assets/screenshots/final/05-popup-recording.png` were regenerated from those clean sources without painting over, faking, or retouching the UI.

Recommended strongest five:

1. `01-options-local-proxy.png`
2. `03-popup-current-site.png`
3. `04-popup-related-domains.png`
4. `05-popup-recording.png`
5. `06-options-classification-overrides.png`

Keep `02-options-route-rules.png` as a fallback/supporting image in the repository. Before submission, still perform the normal final Dashboard upload review against the exact package.

Image asset update:

- The packaged extension includes the required `128x128` icon.
- At least one valid screenshot exists.
- `store-assets/promotional/small-promo-440x280.png` exists and is a `440x280` PNG draft.
- `store-assets/promotional/small-promo-440x280.svg` exists as the editable local source.
- The small promotional image uses neutral copy, sanitized example domains, local vector artwork, and no private data, external CDN assets, external fonts, backend references, telemetry claims, or publication claims.
- The small promotional image was not uploaded to the Chrome Web Store Developer Dashboard during this asset update.

## Package Audit

Package status: pass.

Local package path after `npm run package`:

```text
release/smart-proxy-route-helper-v0.1.0.zip
```

Local zip:

- size: `237117` bytes;
- SHA-256: `ee5cd6525522da31c39078405d44db7ffe1de6c5f5274b4b5633af2590e509bc`;
- contains 13 files.

GitHub release asset:

- name: `smart-proxy-route-helper-v0.1.0.zip`;
- content type: `application/zip`;
- size: `237117` bytes;
- GitHub digest: `sha256:8e5299895e7fb1cc983e3aeee319295f1f5f4dba611ff39b21685db473597bcc`.

The local zip hash differs from the GitHub asset hash because the zip metadata differs after rebuilding. The downloaded GitHub asset and the locally rebuilt zip were extracted and compared with `diff -rq`; file contents are identical.

Zip contents:

- `manifest.json`
- `background/service-worker.js`
- `popup/popup.html`
- `popup/popup.js`
- `options/options.html`
- `options/options.js`
- bundled chunks under `chunks/`
- extension icons under `icons/`

Confirmed excluded from the zip:

- `node_modules`
- `.env`
- tests
- source `.ts` files
- source maps
- repository docs
- local logs
- private data

The release zip path in docs is correct.

## GitHub Release Consistency

Release status: pass with provenance note.

`gh release view v0.1.0 --repo GeoKhv/smart-proxy-route-helper` confirmed:

- release URL: `https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.1.0`;
- release is not marked as a pre-release after Chrome Web Store publication;
- release is not a draft;
- asset `smart-proxy-route-helper-v0.1.0.zip` exists;
- release notes match the v0.1.0 capabilities and privacy/permission posture.

Provenance note:

- GitHub release target is `696bf08f847cf0952a938c2d06456f38e4d25e9e`.
- Refresh started from `origin/main` at `b43d40fc586a26edd623cc9dac1f98ab293c50c9`.
- The commits after the release target are Store-preparation docs/assets work, not runtime or manifest changes.
- The remote release asset content matches the locally rebuilt package content after extraction.

Post-publication metadata update: after Chrome Web Store publication, the existing GitHub release `v0.1.0` was changed from pre-release to a normal release. No release assets, tags, or package contents were edited.

## Functionality Readiness Audit

Automated regression tests passed and the current docs capture the manual smoke scenarios expected for v0.1.0:

- 2ip route behavior;
- wrong local proxy port fail-closed behavior;
- popup add/remove;
- related-domain preview;
- diagnostic recording;
- ChatGPT/OpenAI `oaiusercontent.com` route planning and upload-flow recording;
- LinkedIn `licdn.com` related-domain flow;
- classification override flow.

This audit did not rerun live browser smoke tests. The manual smoke coverage is documented in `docs/manual-smoke-test.md`, `docs/release-notes-v0.1.0.md`, and `docs/chrome-web-store-submission-dry-run.md`.

## Risk Classification

| Level | Item | Recommendation |
| --- | --- | --- |
| Ready in repository | Mandatory `440x280` small promotional image source asset exists at `store-assets/promotional/small-promo-440x280.png`. | Final-review it manually in the Dashboard before any future Store update. |
| Published | Chrome Web Store listing is live for `v0.1.0`. | Recheck Dashboard fields manually before any future Store package or listing update. |
| Ready in repository | `04` and `05` popup screenshot canvases use clean manually captured replacement sources and show no visible cursor highlights. | Final-review the uploaded images in the Dashboard before any future Store update. |
| Warning | `npm audit` reports low severity `esbuild` advisory `GHSA-g7r4-m6w7-qqqr`. | Track separately as dependency maintenance; do not fold into this Store audit unless policy or risk changes. |
| Warning | GitHub release target commit differs from current `origin/main`. | Treat the `v0.1.0` tag as the fixed published package baseline; if a new runtime build is required later, cut a fresh release intentionally. |
| Warning | Privacy policy URL should stay publicly reachable and aligned with the live Store privacy fields. | Verify before any future Store update. |
| Nice-to-have | Add a concise provenance note or checksum note to final submission records. | Helpful for future review, not required for Store upload. |
| Nice-to-have | Add optional marquee promotional image if final positioning benefits from it. | Optional Store polish after mandatory image assets are complete. |

## Final Recommendation

Published in Chrome Web Store as `v0.1.0`.

For any future Store package or listing update, repeat these manual gates before pressing Submit:

1. Open the Chrome Web Store Developer Dashboard manually and compare listing/privacy/distribution fields against the checked docs.
2. Final-review the recommended screenshot set and `store-assets/promotional/small-promo-440x280.png` in the Dashboard.
3. Verify the privacy policy URL from a signed-out browser immediately before upload.
4. Upload a package only after confirming the chosen zip is the intended build.

No runtime blockers, manifest blockers, permission blockers, telemetry/backend blockers, remote-code blockers, or package-content blockers were found.

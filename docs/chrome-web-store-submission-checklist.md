# Chrome Web Store Submission Readiness Checklist

This checklist was used to prepare Smart Proxy Route Helper for Chrome Web Store submission and remains the reference checklist for future Store package or listing updates. It is not submission automation and must not be used to modify the Chrome Web Store Developer Dashboard without an explicit release decision.

## Submission Boundary For Future Store Updates

- [ ] Do not publish or update Chrome Web Store entries in a preparation slice unless the current task explicitly includes that Dashboard action.
- [ ] Do not create or modify Chrome Web Store Developer Dashboard entries in a documentation-only preparation slice.
- [ ] Do not bump the extension version unless a separate release task explicitly requires it.
- [ ] Do not change runtime code unless a blocker is found, documented, and approved for implementation.
- [ ] Do not add manifest permissions.
- [ ] Do not add `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, backend calls, telemetry, or remote executable code.

## Version and Release Baseline

- [ ] Confirm `manifest.json` version is `0.1.0`.
- [ ] Confirm `package.json` version is `0.1.0`.
- [ ] Confirm GitHub release `v0.1.0` exists and is not marked as a pre-release after Chrome Web Store publication.
- [ ] Confirm release asset `smart-proxy-route-helper-v0.1.0.zip` exists.
- [ ] Confirm the release asset corresponds to the intended release commit before submission.
- [ ] Confirm the GitHub release URL is public: https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.1.0
- [ ] Confirm the Chrome Web Store listing URL is public: https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj

## Build and Package Commands

Run from the repository root:

```sh
npm test
npm run build
npm run typecheck --if-present
git diff --check
npm audit
```

Package for Store upload only after the build passes:

```sh
npm run package
```

Expected package path:

```text
release/smart-proxy-route-helper-v0.1.0.zip
```

Do not perform dependency upgrades in the Store-preparation slice. If `npm audit` reports findings, record them here and handle dependency maintenance separately.

## Zip Inspection

Inspect the package before upload:

```sh
unzip -l release/smart-proxy-route-helper-v0.1.0.zip
```

Check that the zip contains only extension package files needed by Chrome:

- [ ] `manifest.json`.
- [ ] Built background service worker.
- [ ] Built popup files.
- [ ] Built options files.
- [ ] Icons.
- [ ] No source maps unless intentionally included.
- [ ] No tests.
- [ ] No local development files.
- [ ] No `.env`, secrets, private logs, or personal files.
- [ ] No `node_modules`.

## Manifest Permission Inspection

Check the submitted manifest:

- [ ] `permissions` are exactly `proxy`, `storage`, `activeTab`, and `scripting`.
- [ ] `host_permissions` is absent.
- [ ] `<all_urls>` is absent.
- [ ] `webRequest` is absent.
- [ ] `webNavigation` is absent.
- [ ] No persistent content scripts are declared.
- [ ] Background service worker is Manifest V3-compatible.
- [ ] No externally hosted executable resources are referenced.

Suggested command:

```sh
node -e "const m=require('./manifest.json'); console.log(JSON.stringify({version:m.version, permissions:m.permissions, host_permissions:m.host_permissions, content_scripts:m.content_scripts}, null, 2))"
```

## Privacy Policy Link Check

- [ ] Privacy policy URL is public and stable.
- [ ] Privacy policy matches the exact submitted behavior.
- [ ] Store privacy fields match `PRIVACY.md`.
- [ ] Store privacy fields match `docs/chrome-web-store-privacy-disclosure.md`.
- [ ] Permissions justifications explain `proxy`, `storage`, `activeTab`, and `scripting`.
- [ ] Remote code field states that no remote code is used.
- [ ] Data usage disclosures do not understate synced domain-level data.
- [ ] Data usage disclosures do not imply developer collection.

## Screenshots Checklist

- [ ] At least one `1280x800` screenshot prepared.
- [ ] No more than five Store screenshots selected.
- [ ] Store icon is `128x128` px.
- [x] Six repository final screenshot canvases exist under `store-assets/screenshots/final/` and are `1280x800` px.
- [x] Small promo tile draft exists at `store-assets/promotional/small-promo-440x280.png` and is `440x280` px PNG.
- [ ] Upload and final-review the small promo tile manually in the Chrome Web Store Developer Dashboard.
- [ ] Optional marquee promo tile is `1400x560` px PNG or JPEG.
- [ ] Screenshots use a clean test profile or equivalent private-data-safe setup.
- [ ] Screenshots contain no private user data, credentials, proxy secrets, account pages, or sensitive tabs.
- [ ] Screenshots match the submitted version.
- [ ] Screenshot set covers local proxy configuration, synced rules, current-site popup controls, manual diagnostics, and related-domain preview.

See `docs/chrome-web-store-screenshots.md`.

Recommended first Store screenshot set:

1. `store-assets/screenshots/final/01-options-local-proxy.png`
2. `store-assets/screenshots/final/03-popup-current-site.png`
3. `store-assets/screenshots/final/04-popup-related-domains.png`
4. `store-assets/screenshots/final/05-popup-recording.png`
5. `store-assets/screenshots/final/06-options-classification-overrides.png`

Keep `store-assets/screenshots/final/02-options-route-rules.png` as a fallback/supporting screenshot.

## Manual Smoke Checklist

Use a clean Chrome profile where feasible.

- [ ] Load `dist/` as an unpacked extension.
- [ ] Open Options.
- [ ] Configure a safe local proxy placeholder or a real non-secret local test proxy.
- [ ] Add a sample domain rule manually.
- [ ] Confirm the rule appears in synced rules.
- [ ] Open a neutral HTTP or HTTPS sample site.
- [ ] Open the popup from the extension toolbar.
- [ ] Confirm current-site controls show only hostname-level information.
- [ ] Run "Check via proxy" only on a safe test page.
- [ ] Run related-domain preview on a safe test page.
- [ ] Confirm candidates are not saved until explicitly selected and added.
- [ ] Start, stop, preview, and cancel diagnostic recording on a safe test page.
- [ ] Confirm Options classification overrides can be added and removed.
- [ ] Confirm clearing all active rules clears extension-controlled proxy settings.

## Chrome Web Store Listing Checklist

- [ ] Extension name matches `manifest.json`.
- [ ] Short description is accurate and neutral.
- [ ] Detailed description starts with a concise statement of the extension purpose.
- [ ] Category selected, with Developer Tools as the primary suggestion.
- [ ] Locale selected, with English as the primary suggestion.
- [ ] Homepage/support/privacy URLs are public and correct.
- [ ] Listing does not overpromise privacy beyond the implementation.
- [ ] Listing availability language matches the current publication state.
- [ ] Listing avoids policy-sensitive positioning and stays focused on local proxy routing.
- [ ] Known limitations are disclosed where useful.

See `docs/chrome-web-store-listing.md`.

## Release Asset Consistency

- [ ] `npm run build` was run from the intended release commit.
- [ ] `npm run package` was run from the intended release commit.
- [ ] Zip contents match `dist/`.
- [ ] Zip filename version matches `manifest.json` and `package.json`.
- [ ] GitHub release asset matches the package intended for Store upload.
- [ ] Release notes match the submitted feature set.

## npm Audit Note

Latest preparation run on 2026-06-28:

```text
npm audit reported 1 low severity vulnerability:
esbuild 0.27.3 - 0.28.0, GHSA-g7r4-m6w7-qqqr.
```

If findings appear, do not upgrade dependencies inside a Store-preparation slice unless a separate dependency-maintenance task is approved.

## Publication Status And Future Manual Gates

Current status: `v0.1.0` is published in Chrome Web Store at https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj.

Repository asset blockers closed before publication:

- Small promotional image exists as a repository draft asset at `store-assets/promotional/small-promo-440x280.png`.
- Popup screenshots `04` and `05` were regenerated from clean manually captured source screenshots and no longer contain cursor highlights.

Manual gates to repeat before any future Store package or listing update:

- Final Dashboard upload and review for the recommended screenshot set and small promotional image.
- Chrome Web Store Developer Dashboard field review.
- Privacy policy URL public-access check.
- Release asset verification against the exact submitted build.
- `npm audit` review from the final pre-submission run.

Recommendation for future updates: perform a manual Chrome Web Store Dashboard dry-run / final human review before pressing Submit.

## Official References

- Complete listing information: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Fill out privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Supplying images: https://developer.chrome.com/docs/webstore/images
- Set up distribution: https://developer.chrome.com/docs/webstore/cws-dashboard-distribution
- Chrome Web Store program policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

# Chrome Web Store Submission Dry-Run Pack

This document was a manual dry-run pack for the Chrome Web Store submission and remains a reference checklist for future Store package or listing updates. It is not submission automation and does not modify the Chrome Web Store Developer Dashboard.

Dry-run date: 2026-06-26; refreshed 2026-06-28 after clean screenshot and promotional image updates.

Post-publication update: `v0.1.0` is now published in Chrome Web Store at https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj. This dry-run pack remains a preparation record and a reference checklist for future Store package or listing updates.

Repository baseline checked:

- Current branch: `main`
- `origin/main`: already up to date during dry-run preflight
- Refresh starting commit: `b43d40fc586a26edd623cc9dac1f98ab293c50c9`
- `manifest.json` version: `0.1.0`
- `package.json` version: `0.1.0`
- Manifest permissions: `proxy`, `storage`, `activeTab`, `scripting`
- Confirmed absent from the manifest: `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, and persistent content scripts

Preflight checks run:

- `npm test`: passed, 15 test files and 172 tests
- `npm run build`: passed
- `npm run typecheck --if-present`: passed
- `git diff --check`: passed
- `npm audit`: reported 1 low severity advisory in `esbuild` (`GHSA-g7r4-m6w7-qqqr`); dependency maintenance is intentionally out of scope for this Store dry-run
- Store screenshot size check: passed, all final screenshot PNGs are `1280x800`
- Promotional image size check: passed, `store-assets/promotional/small-promo-440x280.png` is `440x280`

## 1. Submission Status

Current status: published in Chrome Web Store as `v0.1.0`.

Publication reference state:

- Chrome Web Store listing exists at https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj.
- GitHub release `v0.1.0` exists.
- Release asset exists at `release/smart-proxy-route-helper-v0.1.0.zip`.
- Store-readiness docs exist in `docs/`.
- Store listing assets are maintained as repository source assets.
- Small promotional image exists at `store-assets/promotional/small-promo-440x280.png`.
- Popup screenshots `04` and `05` were replaced on 2026-06-28 from clean manually captured Chrome sources and no longer show cursor highlights.

For any future Store package or listing update, repeat the final Dashboard review against the exact package before pressing Submit.

## 2. Package To Upload

Upload this package:

```text
release/smart-proxy-route-helper-v0.1.0.zip
```

Package version:

```text
0.1.0
```

Do not upload a GitHub source archive or repository zip. Upload only the built extension package.

Expected zip contents summary:

- `manifest.json`
- `background/service-worker.js`
- `popup/popup.html`
- `popup/popup.js`
- `options/options.html`
- `options/options.js`
- bundled extension chunks under `chunks/`
- extension icons under `icons/`

Expected exclusions:

- no tests
- no source repository files
- no `.env` files
- no local logs
- no `node_modules`
- no private data

## 3. Store Listing Fields

### Extension Name

```text
Smart Proxy Route Helper
```

### Short Description

```text
Manage per-domain proxy routing through a user-configured local proxy.
```

### Detailed Description

```text
Smart Proxy Route Helper is a local-first Manifest V3 Chrome extension for managing per-domain proxy routing.

It lets you keep a manual list of domains that should use a proxy route while keeping the local proxy configuration specific to each device. Domain routing rules can sync through Chrome Sync, and the local proxy host, port, and scheme stay on the current device.

Key features:

- Manual domain rule management.
- Synced domain rules through Chrome Sync.
- Device-specific local proxy configuration.
- Locally generated PAC configuration applied through Chrome's proxy API.
- Popup controls for the current site.
- User-invoked diagnostics for the active site.
- User-invoked related-domain preview for the active tab.
- Temporary diagnostic recording for action-specific resource hosts.
- Domain-level classification overrides.

Privacy and control:

- No telemetry, analytics, ads, or backend service.
- No developer-operated data collection.
- No remote executable code.
- No runtime remote list fetching.
- No raw URLs stored, synced, or sent by the extension.
- Related-domain preview and diagnostic recording are transient and user-invoked.
- Domain suggestions become routing rules only after explicit user selection and confirmation.

Smart Proxy Route Helper is intended for users who already have a local proxy available and want a small, explicit, permission-minimal PAC manager for Chrome.
```

### Category Suggestion

```text
Developer Tools
```

Reason: the extension manages browser networking configuration and local PAC routing for technical users.

Alternative if the final positioning changes:

```text
Productivity
```

### Language / Locale Suggestion

```text
English / en
```

Do not add localized Store listings until the UI, screenshots, privacy text, and support materials are consistently localized.

### Support / Contact Suggestion

Suggested support URL:

```text
https://github.com/GeoKhv/smart-proxy-route-helper/issues
```

Suggested support copy:

```text
For support, bug reports, and feature requests, open a GitHub issue. Do not include private browsing data, credentials, proxy secrets, or sensitive site details in public reports.
```

### Website / Homepage URL

```text
https://github.com/GeoKhv/smart-proxy-route-helper
```

### Privacy Policy URL Suggestion

```text
https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/PRIVACY.md
```

Before submission, confirm that this URL is public, stable, and aligned with the exact submitted build.

### GitHub Repository URL

```text
https://github.com/GeoKhv/smart-proxy-route-helper
```

### GitHub Release URL

```text
https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.1.0
```

## 4. Permissions Justification

Use dashboard-friendly wording like this.

### `proxy`

```text
Required to apply the locally generated PAC configuration in Chrome. The extension uses this permission to route only user-configured domains through the user's local proxy settings.
```

Limitation:

```text
The extension does not fetch remote PAC files or remote routing logic. Routing behavior is generated locally from the user's saved settings.
```

### `storage`

```text
Required to save extension settings. Domain routing rules and domain-level classification overrides are stored as synced settings. The local proxy configuration is stored only on the current device.
```

Limitation:

```text
The extension stores domain-level settings, not raw URLs, page text, credentials, cookies, or browsing history.
```

### `activeTab`

```text
Required for explicit user-invoked actions on the active tab, including current-site routing controls, manual diagnostics, related-domain preview, and diagnostic recording.
```

Limitation:

```text
The extension uses active tab access only after the user invokes the extension action. It does not request broad host permissions.
```

### `scripting`

```text
Required to run temporary, user-invoked current-page scripts for related-domain preview and diagnostic recording.
```

Limitation:

```text
The extension does not declare persistent content scripts. Script injection is temporary, tied to explicit user actions, and used to collect sanitized hostname-level candidates.
```

### Absent Permissions And APIs

Clearly state this in review notes if needed:

```text
The extension does not request host permissions, <all_urls>, webRequest, webNavigation, or persistent content scripts. It does not include a backend, telemetry, remote executable code, or runtime remote list fetching.
```

## 5. Privacy Disclosure Answers

Use these concise answers as Dashboard field source text, then review against the final Store form wording.

### Data Collection / Use

```text
The extension does not collect or transmit user data to the developer. It stores only user-provided settings needed for local proxy routing and user-controlled domain classification preferences.
```

### Domain-Level Route Rules

```text
Domain routing rules are stored as domain-level settings in Chrome synced storage when Chrome Sync is available. The extension does not store raw URLs, paths, query strings, fragments, or browsing history.
```

### Domain-Level Classification Overrides

```text
Classification overrides are stored as normalized domain-level preferences. They are used locally to tune related-domain suggestions and do not create proxy routing rules by themselves.
```

### Local Proxy Config

```text
The local proxy scheme, host, port, and enabled state are stored on the current device only. The local proxy configuration is not synced by the extension and is not sent to the developer.
```

### Related-Domain Preview

```text
Related-domain preview runs only after the user clicks the preview action. It uses sanitized hostname-level candidates from the active tab and does not save candidates automatically. Candidates become routing rules only after explicit user selection and confirmation.
```

### Diagnostic Recording

```text
Diagnostic recording is user-invoked and transient. It may temporarily observe bounded resource-like signals in the active tab to help identify action-specific resource hosts, then shows sanitized hostname-level candidates locally. Cancelling a recording saves nothing.
```

### No Telemetry

```text
The extension has no telemetry, analytics, ads, usage tracking, or developer-operated data collection.
```

### No Backend

```text
The extension has no backend service and does not send extension data to a developer server.
```

### No Raw URLs Stored, Synced, Or Sent

```text
The extension does not store, sync, or send raw URLs, URL paths, query strings, fragments, credentials, or full resource URL lists.
```

### No Page Text, File Contents, Cookies, Or Credentials Collected

```text
The extension does not collect page text, form values, uploaded file contents, local file contents, screenshots, cookies, authentication data, session data, or proxy credentials.
```

## 6. Screenshots To Upload

Recommended strongest five-screenshot set for the first Store listing:

1. `store-assets/screenshots/final/01-options-local-proxy.png`
2. `store-assets/screenshots/final/03-popup-current-site.png`
3. `store-assets/screenshots/final/04-popup-related-domains.png`
4. `store-assets/screenshots/final/05-popup-recording.png`
5. `store-assets/screenshots/final/06-options-classification-overrides.png`

Important notes:

- `04-popup-related-domains.png` and `05-popup-recording.png` were regenerated from clean full-window popup sources saved under `store-assets/screenshots/source/`.
- `02-options-route-rules.png` remains available as a fallback/supporting screenshot if the final Dashboard upload review needs a different set.
- Do not retouch or fake screenshots.
- Do not recapture from the user's main Chrome profile.
- Before final public submission, use a clean Chrome profile and verify that screenshots contain no private account state, private domains, proxy secrets, credentials, browser notifications, or unrelated tabs.

## 7. Known Limitations To Disclose Or Keep In Docs

Use these where useful in listing copy, support docs, or release notes:

- Users must provide their own local proxy client.
- The extension routes only Chrome traffic covered by the configured Chrome proxy rules.
- Related-domain suggestions are best-effort and may require user review.
- Diagnostic recording is user-invoked, temporary, and action-specific.
- Mobile and Android Chrome are not supported.

## 8. Future Store Update Checklist Before Pressing Submit

Complete this checklist manually in any future Store package or listing update pass:

- [ ] Verify clean screenshots from a private-data-safe profile.
- [ ] Verify no accidental private data appears in screenshots.
- [ ] Verify the uploaded zip path is `release/smart-proxy-route-helper-v0.1.0.zip`.
- [ ] Verify the uploaded zip version is `0.1.0`.
- [ ] Verify the privacy policy URL opens publicly.
- [ ] Verify the Store privacy fields match `PRIVACY.md`.
- [ ] Verify manifest permissions are exactly `proxy`, `storage`, `activeTab`, and `scripting`.
- [ ] Verify `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, and persistent content scripts remain absent.
- [ ] Verify the listing copy stays focused on local proxy routing, synced domain rules, user-invoked diagnostics, and privacy-first behavior.
- [ ] Run the local smoke checks below.
- [ ] Decide whether the first submission should be public or unlisted, if that choice is available and appropriate.

Local smoke checks:

- [ ] Confirm the `2ip` route scenario with the intended local proxy.
- [ ] Confirm fail-closed behavior with a known-wrong local proxy port.
- [ ] Confirm popup add/remove for the current site.
- [ ] Confirm related-domain preview runs only after user action and saves nothing until explicit confirmation.
- [ ] Confirm diagnostic recording start, stop-and-preview, and cancel behavior.
- [ ] Confirm classification override add/remove behavior.

## 9. Post-Publication Maintenance Plan

After publication:

- Monitor Chrome Web Store review feedback.
- If rejected, capture the exact review reason and map it to a repo issue or follow-up task.
- Keep `README.md`, release notes, and Store reference docs aligned with the Chrome Web Store listing URL.
- If Store-specific changes are needed, create a follow-up release note and keep the GitHub release asset, Store package, privacy policy, and listing copy aligned.

## Official References Checked

- Chrome Web Store listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store image requirements: https://developer.chrome.com/docs/webstore/images
- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

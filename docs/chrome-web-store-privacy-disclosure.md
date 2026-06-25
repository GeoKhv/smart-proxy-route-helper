# Chrome Web Store Privacy Disclosure Draft

This draft prepares Store privacy-field language for a future Chrome Web Store submission. It must be reviewed against the exact submitted build before upload.

## Single Purpose

Smart Proxy Route Helper lets users manually manage per-domain proxy routing through a user-configured local proxy.

The extension stores domain-level routing rules and local proxy settings, generates a PAC configuration locally, and applies that configuration through Chrome's proxy API. Current-site diagnostics, related-domain preview, and diagnostic recording run only after explicit user action.

## Data Collection Summary

The extension does not collect or transmit user data to the developer.

The extension does not include:

- Telemetry.
- Analytics.
- Ads.
- Backend service.
- User accounts.
- Developer-operated data collection.
- Runtime remote list fetching.
- Remote executable code.

## Stored Data

Synced storage with `chrome.storage.sync`:

- Domain routing rules.
- Domain-level classification overrides.
- Ignored domains and denylist entries.
- Safe rule metadata such as rule source and creation timestamp.

Local storage with `chrome.storage.local`:

- Local proxy scheme.
- Local proxy host.
- Local proxy port.
- Device enabled/disabled state.
- Local diagnostics preference.

Temporary session storage with `chrome.storage.session`:

- Diagnostic recording metadata while a recording is active, such as tab ID, current domain, start time, expiry time, and status.

## Data Not Stored, Synced, or Sent

The extension does not store, sync, or send:

- Raw URLs.
- URL paths.
- Query strings.
- Fragments.
- Credentials.
- Browsing history.
- Page text.
- Form values.
- Uploaded file contents.
- Local file contents.
- Screenshots.
- Cookies.
- Authentication or session data.
- Full resource URL lists.
- Diagnostic history.
- Related-domain preview host lists.
- Diagnostic recording host lists.
- Proxy credentials.

## Hostname Sanitization

Current-site controls, related-domain preview, and diagnostic recording sanitize host data to domain or hostname level where possible.

The extension drops paths, query strings, fragments, and credentials before presenting related-domain candidates. It rejects unsupported schemes and local/private/internal hosts where those hosts are not valid routing candidates.

## Related-Domain Preview

Related-domain preview is user-invoked and transient.

After the user clicks the preview action, the extension may inspect bounded resource references on the current active tab through a temporary active-tab script. The output is a local preview of sanitized domain-level candidates.

Preview candidates are not stored automatically. They become routing rules only when the user selects candidates and clicks the separate add action.

## Diagnostic Recording

Diagnostic recording is user-invoked and transient.

After the user clicks the recording action, the extension may temporarily observe bounded resource-like signals in the active tab to help identify action-specific resource hosts. The user can stop and preview or cancel the recording.

Recorded hostnames are not stored in synced storage or local storage. Cancelling a recording returns no candidates and saves nothing.

Diagnostic recording does not read uploaded file contents, page text, cookies, credentials, screenshots, or local files.

## Current-Site Diagnostics

Manual current-site diagnostics run only after the user clicks "Check via proxy".

The check may make a best-effort request from the extension context to the current tab origin while temporarily routing the current normalized domain through the configured local proxy. The result is shown locally and is not sent to the developer.

Diagnostics do not store diagnostic history, do not sync temporary probe state, and do not add domain rules without explicit confirmation.

## Permission-Specific Disclosure

`proxy`

Used to apply the locally generated PAC configuration in Chrome. The extension uses this only for user-configured proxy routing.

`storage`

Used to save extension settings. Domain-level routing rules and classification overrides are synced with Chrome Sync when available. Local proxy settings stay on the current device.

`activeTab`

Used only after the user invokes the extension on the active tab. It supports current-site controls, manual diagnostics, related-domain preview, and diagnostic recording.

`scripting`

Used for temporary user-invoked current-page scripts that collect sanitized resource hostnames for related-domain preview and diagnostic recording. The extension does not declare persistent content scripts.

## Remote Code Disclosure

The extension does not execute remote code.

All executable code is packaged with the extension. The extension does not load remote scripts, remote WebAssembly, or remote logic at runtime.

## Limited Use Certification Draft

Information received from Chrome extension APIs is used only to provide the extension's single purpose: local proxy routing management and user-invoked diagnostics.

The extension does not use or transfer user data for advertising, profiling, resale, creditworthiness, lending, unrelated product analytics, or any unrelated purpose.

## Privacy Policy URL

Suggested URL:

- https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/PRIVACY.md

Before submission, confirm that the Store privacy fields and this privacy policy are consistent.

## Official References

- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store privacy policies: https://developer.chrome.com/docs/webstore/program-policies/privacy
- Chrome Web Store program policies: https://developer.chrome.com/docs/webstore/program-policies/policies
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

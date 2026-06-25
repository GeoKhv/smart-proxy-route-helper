# Chrome Web Store Listing Draft

This draft prepares public listing text for a future Chrome Web Store submission. The extension is not yet published on Chrome Web Store, and this document is not a submission record.

## Extension Name

Smart Proxy Route Helper

## Short Description

Manage per-domain proxy routing through a user-configured local proxy.

## Detailed Description

Smart Proxy Route Helper is a local-first Manifest V3 Chrome extension for managing per-domain proxy routing.

It lets you keep a manual list of domains that should use a proxy route while keeping the local proxy configuration specific to each device. Domain routing rules can sync through Chrome Sync, and the local proxy host, port, and scheme stay on the current device.

Key features:

- Manual domain rule management.
- Synced proxy route rules through `chrome.storage.sync`.
- Device-specific local proxy configuration through `chrome.storage.local`.
- Locally generated PAC configuration applied through Chrome's proxy API.
- Popup controls for the current site.
- Manual "Check via proxy" diagnostics after user action.
- User-invoked related-domain preview for the active tab.
- User-invoked diagnostic recording for action-specific resource hosts.
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

## Category Suggestion

Primary suggestion: Developer Tools.

Reason: the extension manages a browser networking configuration and is most likely to be used by technical users who understand local proxy settings.

Alternative: Productivity, if the final store positioning emphasizes everyday route management rather than technical configuration.

## Language and Locale Suggestion

Primary listing locale: English.

Suggested locale code: `en`.

Do not add localized Store listings until the extension UI, screenshots, privacy text, and support materials are consistently localized.

## Support and Contact Suggestion

Suggested support URL:

- https://github.com/GeoKhv/smart-proxy-route-helper/issues

Suggested support copy:

For support, bug reports, and feature requests, open a GitHub issue. Do not include private browsing data, credentials, proxy secrets, or sensitive site details in public reports.

## Website and GitHub Links

Project repository:

- https://github.com/GeoKhv/smart-proxy-route-helper

Current GitHub pre-release:

- https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.1.0

Current release asset:

- `smart-proxy-route-helper-v0.1.0.zip`

Documentation:

- README: https://github.com/GeoKhv/smart-proxy-route-helper#readme
- Privacy policy: https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/PRIVACY.md
- Permissions strategy: https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/docs/permissions.md

## Privacy Policy Link Suggestion

Use the repository privacy policy once the document is reviewed against the exact submitted build:

- https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/PRIVACY.md

Before submission, confirm that the privacy policy URL is public, stable, and matches the Chrome Web Store privacy disclosure fields.

## Permissions Explanation

Use these permission explanations in the Chrome Web Store privacy fields and review notes.

`proxy`

Required to apply the locally generated PAC configuration in Chrome. The extension uses this permission to route only user-configured domains through the user's local proxy settings.

`storage`

Required to store extension settings. Domain routing rules and classification overrides are stored as domain-level data in synced storage. The local proxy configuration is stored only on the current device.

`activeTab`

Required for explicit user-initiated actions on the current active tab, such as current-site routing controls, manual current-site diagnostics, related-domain preview, and diagnostic recording.

`scripting`

Required to run temporary, user-invoked current-page resource host collection for related-domain preview and diagnostic recording. The extension does not declare persistent content scripts or broad host permissions.

Host permissions:

None. The MVP does not request host permissions, `<all_urls>`, `webRequest`, or `webNavigation`.

## Known Limitations

- The extension is not yet published on Chrome Web Store.
- A local proxy must be configured outside the extension.
- Chrome proxy settings may be controlled by enterprise policy, another extension, or user settings.
- Related-domain preview and diagnostic recording can surface noisy suggestions because they are based on resource hosts visible to the active page.
- The built-in classification data is intentionally small and curated.
- Proxy authentication management is not included in version `0.1.0`.
- Store review has not yet been completed.

## Submission Status

Current status: not yet published on Chrome Web Store.

Preparation status:

- GitHub pre-release `v0.1.0` exists.
- Release asset `smart-proxy-route-helper-v0.1.0.zip` exists.
- Store listing draft prepared in this document.
- Store privacy disclosure draft prepared in `docs/chrome-web-store-privacy-disclosure.md`.
- Screenshot plan prepared in `docs/chrome-web-store-screenshots.md`.
- Submission readiness checklist prepared in `docs/chrome-web-store-submission-checklist.md`.

## Official References

- Chrome Web Store listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome Web Store privacy fields: https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome Web Store image requirements: https://developer.chrome.com/docs/webstore/images
- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

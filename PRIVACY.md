# Privacy Policy

This document describes the privacy posture of current `main` at development version `0.3.1`.
Version `v0.3.0` is the latest immutable public GitHub Release and has been submitted to Chrome Web
Store for review; Store publication of `v0.3.0` is not claimed here. The post-release fixes on
`main` have not been published as a new GitHub Release or Store update.

The repository contains a Manifest V3 extension runtime. The statements below must be kept aligned with the actual extension behavior before any public release.

## Summary

Smart Proxy Route Helper is local-first:

- No telemetry.
- No analytics.
- No ads.
- No backend.
- No user accounts.
- No developer-operated data collection.
- No sale or transfer of user data.
- No remote executable code.
- No runtime remote list fetching.
- No raw URLs stored, synced, or sent by the project.
- No settings backup upload or remote settings sync.

## Data the Extension Stores

The MVP stores only user-provided settings needed for proxy routing and personal domain classification preferences.

Synced with `chrome.storage.sync`:

- Domain routing rules.
- Ignored domains and denylist entries.
- Personal classification overrides for related-domain preview, stored as normalized global or site-scoped domain preferences.
- Safe rule metadata, such as source and creation timestamps.

Stored only on the local device with `chrome.storage.local`:

- Local proxy host.
- Local proxy port.
- Local proxy scheme.
- Device enabled/disabled state.
- Local diagnostics preference.
- Interface language preference: `Auto (Chrome)`, `English`, or `Русский`.

The interface language preference is an ordinary local UI setting. It is not sensitive data, is
not synced through `chrome.storage.sync`, and is not collected or received by the developer.

Stored temporarily with `chrome.storage.session` while diagnostic recording is active or awaiting explicit handling after expiry:

- Recorded tab ID.
- Recorded current domain.
- Recording start and expiry timestamps.
- Recording status.
- A random session nonce and recorded-document identifier used only to bind and expire the temporary recorder.

`chrome.storage.session` is used only for session-scoped recording lifecycle metadata. It is not used as persistent or synced settings storage and does not contain collected host lists.

The project does not store secrets, local proxy configuration, browsing history, raw URLs, raw diagnostic history, page resource lists, or temporary probe state in synced storage.

User-controlled settings exports:

- Exported settings JSON is generated locally only after the user clicks "Export settings".
- The export contains synced route rules with route actions, ignored domains, denylist entries, and personal classification overrides as normalized domain-level data.
- Local proxy configuration is excluded by default because it is device-specific.
- If the user explicitly selects "Include local proxy config for this device", the export may include the sanitized local proxy scheme, host, port, and enabled state.
- Exports do not include raw URLs, page paths, query strings, fragments, credentials, collected resource host lists, diagnostic session metadata, page text, cookies, screenshots, file contents, telemetry, backend data, or remote executable code.

Settings imports are parsed locally, validated for the supported format/version, sanitized, previewed, and applied only after an explicit user click. Import rejects malformed rules and protected/internal/private imported domains. The extension does not upload import files or backup contents.

The interface language preference is not included in settings exports or imports. Changing it only
changes which bundled English or Russian message catalog is rendered on the current device.

User-invoked related-domain preview and diagnostic recording may collect sanitized resource hostnames from bounded signals visible to the current page in memory. During recording, bundled temporary MAIN-world hooks observe page-level `fetch`, XMLHttpRequest, and `sendBeacon` initiation, including attempts that later fail. A continuous resource timing observer and a capturing resource-element error listener provide additional hostname signals. Only `src`, `currentSrc`, `href`, and `poster` are read from failed resource elements; arbitrary page text and error messages are not read. Request values are reduced immediately to hostnames before crossing the session-bound bridge. These collected hosts and transient diagnostic summary counts are not stored in synced storage or local storage. Raw URLs, paths, query strings, signatures, expiry values, fragments, credentials, headers, bodies, cookies, response contents, form values, uploaded file contents, screenshots, and page text are not retained, logged, rendered, exported, synced, or persisted. If the user selects related-domain candidates and clicks the separate add button, only the selected candidate domains are stored as synced proxy rules. Direct exceptions are created only through explicit route-rule actions, not through related-domain preview. If the user clicks a classification override action, only normalized domain-level override preferences are stored in synced storage.

## Chrome Sync

If the user has Chrome Sync enabled, Chrome may sync the domain rule list and personal classification overrides through the user's Chrome profile because the MVP uses `chrome.storage.sync` for those domain-level settings.

The local proxy configuration is intentionally device-specific and should remain in `chrome.storage.local`.

Local proxy configuration is also excluded from settings exports unless the user explicitly includes it in the generated backup JSON.

## Data the Developer Does Not Receive

The project must not send the developer:

- Domain rules.
- Local proxy settings.
- Browsing activity.
- Diagnostic results.
- Related-domain preview resource hosts.
- Diagnostic recording resource hosts.
- Classification overrides.
- Interface language preference.
- Settings backup files.
- IP addresses.
- Error logs.
- Usage events.

## Network Requests

The extension must not contact a project backend because no backend exists.

Settings export/import does not contact a project backend, upload backup files, fetch remote backup data, or synchronize backups through any developer-operated service.

Manual current-site diagnostics may make a user-initiated best-effort request from the extension context to the current tab origin after the user clicks "Check via proxy". The check temporarily routes the current normalized domain through the configured local proxy, then restores normal proxy routing.

Diagnostics do not upload results to the developer, do not store diagnostic history, do not sync temporary probe state, and do not add a rule without explicit confirmation. The current site and the user's configured local proxy provider may observe the diagnostic request in the same way they can observe ordinary network requests routed to that site.

The related-domain preview does not make project backend requests. After the user clicks "Preview related domains", it may inspect bounded current-page resource references through a one-time active-tab script and use sanitized hostnames locally to preview related-domain candidates. The preview drops paths, query strings, fragments, and credentials as early as possible, rejects local/private/internal hosts, and does not store, sync, or send collected hosts anywhere. It may show compact transient counts and a small sample of sanitized hostnames when no saveable candidates remain, but it does not display or retain raw full URLs. It also uses local-only filters for obvious analytics, adtech, shared-infrastructure, and local/adblock helper hosts so those hosts are not offered as normal saveable candidates. If the loaded page appears to be an error or protection page, the popup shows a neutral warning instead of normal related-domain results. Preview candidates do not become routing rules unless the user selects candidates and clicks the separate add button. Classification override actions are separate explicit actions; they store normalized domain preferences only and do not submit community votes, create GitHub issues, or upload data.

Diagnostic recording does not make project backend requests. After the user clicks "Start recording", it injects temporary bundled code into the MAIN world of all frames that Chrome allows through the existing `activeTab` grant; it does not register a persistent content script. A random nonce binds MAIN-world hostname events to a temporary isolated-world listener. The isolated side treats every page event as untrusted, validates the nonce and payload, accepts hostname strings only, normalizes again, caps length and count, and deduplicates. On "Stop and preview", sanitized hostnames are passed to the same local related-domain candidate engine used by preview. Cancelling returns no candidates and saves nothing. Stop and Cancel remove hooks/listeners and delete page recorder state. Timeout stops collection and removes hooks/listeners; the bounded hostname set may remain only in the recorded page's isolated-world memory so the user can explicitly preview an expired session. Stop, Cancel, navigation, or tab teardown removes that set. Some worker, service-worker, extension, or browser-level requests may not be visible to this page-level recorder; the extension does not ask the user to inspect DevTools or paste a failed URL. Recording lifecycle metadata is temporary and stored in `chrome.storage.session`; recorded hostnames are not stored in `chrome.storage.sync`, `chrome.storage.local`, or `chrome.storage.session`.

## Limited Use Statement

Information received from Chrome extension APIs must be used only to provide and improve the extension's single purpose: local proxy routing management and user-initiated diagnostics.

The project must not use or transfer user data for advertising, profiling, resale, or unrelated purposes.

## Data Deletion

Users should be able to delete stored extension data by:

- Removing domain rules in the extension UI.
- Removing classification overrides in the extension UI.
- Clearing local proxy settings in the extension UI.
- Removing the extension from Chrome.
- Deleting any settings export files they saved outside the extension.

## Changes

This privacy document must be reviewed before every Chrome Web Store submission. Any implementation change that affects stored data, permissions, diagnostics, or external communication must update this document before release.

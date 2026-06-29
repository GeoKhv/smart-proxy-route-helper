# Privacy Policy

This document describes the privacy posture for Smart Proxy Route Helper v0.1.0.

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

## Data the Extension Is Expected to Store

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

Stored temporarily with `chrome.storage.session` only while diagnostic recording is active:

- Recorded tab ID.
- Recorded current domain.
- Recording start and expiry timestamps.
- Recording status.

`chrome.storage.session` is used only for short-lived recording metadata. It is not used as persistent storage, is not synced by the extension, and does not contain collected host lists.

The project does not store secrets, local proxy configuration, browsing history, raw URLs, raw diagnostic history, page resource lists, or temporary probe state in synced storage.

User-controlled settings exports:

- Exported settings JSON is generated locally only after the user clicks "Export settings".
- The export contains synced route rules with route actions, ignored domains, denylist entries, and personal classification overrides as normalized domain-level data.
- Local proxy configuration is excluded by default because it is device-specific.
- If the user explicitly selects "Include local proxy config for this device", the export may include the sanitized local proxy scheme, host, port, and enabled state.
- Exports do not include raw URLs, page paths, query strings, fragments, credentials, collected resource host lists, diagnostic session metadata, page text, cookies, screenshots, file contents, telemetry, backend data, or remote executable code.

Settings imports are parsed locally, validated for the supported format/version, sanitized, previewed, and applied only after an explicit user click. Import rejects malformed rules and protected/internal/private imported domains. The extension does not upload import files or backup contents.

User-invoked related-domain preview and diagnostic recording may collect sanitized resource hostnames from bounded resource references on the current page in memory. Recording keeps collected hostnames in the temporary injected page recorder until stop, cancel, page unload, or expiry. These collected hosts and transient diagnostic summary counts are not stored in synced storage or local storage. Paths, query strings, fragments, and credentials are dropped before preview output. The extension does not collect page text, form values, uploaded file contents, screenshots, cookies, auth/session data, or full resource URL lists. If the user selects related-domain candidates and clicks the separate add button, only the selected candidate domains are stored as synced proxy rules. Direct exceptions are created only through explicit route-rule actions, not through related-domain preview. If the user clicks a classification override action, only normalized domain-level override preferences are stored in synced storage.

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

Diagnostic recording does not make project backend requests. After the user clicks "Start recording", it may temporarily observe bounded resource-like signals in the active tab, such as resource timing entries and selected resource URL attributes. On "Stop and preview", it returns sanitized hostnames to the same local related-domain candidate engine used by preview. It may help identify action-specific resource hosts, for example resources loaded during a file upload flow, but it does not read uploaded file contents or send uploaded files anywhere. Cancelling a recording returns no candidates and saves nothing. Recording metadata is temporary and stored in `chrome.storage.session`; recorded hostnames are not stored in `chrome.storage.sync` or `chrome.storage.local`.

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

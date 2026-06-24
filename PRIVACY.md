# Privacy Policy

This document describes the privacy posture for Smart Proxy Route Helper.

The repository currently contains the initial Manifest V3 extension runtime. The statements below must be kept aligned with the actual extension behavior before any public release.

## Summary

Smart Proxy Route Helper is designed to be local-first:

- No telemetry.
- No analytics.
- No ads.
- No backend.
- No user accounts.
- No developer-operated data collection.
- No sale or transfer of user data.

## Data the Extension Is Expected to Store

The MVP stores only user-provided settings needed for proxy routing.

Synced with `chrome.storage.sync`:

- Domain routing rules.
- Ignored domains and denylist entries.
- Safe rule metadata, such as source and creation timestamps.

Stored only on the local device with `chrome.storage.local`:

- Local proxy host.
- Local proxy port.
- Local proxy scheme.
- Device enabled/disabled state.
- Local diagnostics preference.

The project does not store secrets, local proxy configuration, browsing history, raw diagnostic history, or temporary probe state in synced storage.

User-invoked related-domain preview may collect sanitized resource hostnames from the current page in memory. These collected hosts are not stored in synced storage or local storage. If the user selects related-domain candidates and clicks the separate add button, only the selected candidate domains are stored as synced proxy rules.

## Chrome Sync

If the user has Chrome Sync enabled, Chrome may sync the domain rule list through the user's Chrome profile because the MVP plans to use `chrome.storage.sync` for rules.

The local proxy configuration is intentionally device-specific and should remain in `chrome.storage.local`.

## Data the Developer Does Not Receive

The project must not send the developer:

- Domain rules.
- Local proxy settings.
- Browsing activity.
- Diagnostic results.
- Related-domain preview resource hosts.
- IP addresses.
- Error logs.
- Usage events.

## Network Requests

The extension must not contact a project backend because no backend exists.

Manual current-site diagnostics may make a user-initiated best-effort request from the extension context to the current tab origin after the user clicks "Check via proxy". The check temporarily routes the current normalized domain through the configured local proxy, then restores normal proxy routing.

Diagnostics do not upload results to the developer, do not store diagnostic history, do not sync temporary probe state, and do not add a rule without explicit confirmation. The current site and the user's configured local proxy provider may observe the diagnostic request in the same way they can observe ordinary network requests routed to that site.

The related-domain preview does not make project backend requests. After the user clicks "Preview related domains", it may inspect current-page resource hostnames through a one-time active-tab script and use them locally to preview related-domain candidates. The preview drops paths, query strings, fragments, and credentials, rejects local/private/internal hosts, and does not store, sync, or send collected hosts anywhere. Preview candidates do not become routing rules unless the user selects candidates and clicks the separate add button.

## Limited Use Statement

Information received from Chrome extension APIs must be used only to provide and improve the extension's single purpose: local proxy routing management and user-initiated diagnostics.

The project must not use or transfer user data for advertising, profiling, resale, or unrelated purposes.

## Data Deletion

Users should be able to delete stored extension data by:

- Removing domain rules in the extension UI.
- Clearing local proxy settings in the extension UI.
- Removing the extension from Chrome.

## Changes

This privacy document must be reviewed before every Chrome Web Store submission. Any implementation change that affects stored data, permissions, diagnostics, or external communication must update this document before release.

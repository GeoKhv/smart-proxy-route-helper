# Privacy Policy

This document describes the intended privacy posture for Smart Proxy Route Helper.

The repository currently contains documentation only. The statements below are requirements for future implementation work and must be kept aligned with the actual extension behavior before any public release.

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

The MVP is expected to store only user-provided settings needed for proxy routing.

Synced with `chrome.storage.sync`:

- Domain routing rules.
- Whether each rule is enabled.
- Safe rule metadata, such as schema version and timestamps.

Stored only on the local device with `chrome.storage.local`:

- Local proxy host.
- Local proxy port.
- Local proxy scheme.
- Device enabled/disabled state.
- Last local apply/status details.

The project should not store secrets in synced storage.

## Chrome Sync

If the user has Chrome Sync enabled, Chrome may sync the domain rule list through the user's Chrome profile because the MVP plans to use `chrome.storage.sync` for rules.

The local proxy configuration is intentionally device-specific and should remain in `chrome.storage.local`.

## Data the Developer Does Not Receive

The project must not send the developer:

- Domain rules.
- Local proxy settings.
- Browsing activity.
- Diagnostic results.
- IP addresses.
- Error logs.
- Usage events.

## Network Requests

The MVP must not contact a project backend because no backend exists.

Future optional diagnostics may make user-initiated network checks from the extension context only after the user turns diagnostics on and requests a check. Diagnostics must not upload results to the developer and must not add a rule without explicit confirmation.

## Limited Use Statement

Information received from Chrome extension APIs must be used only to provide and improve the extension's single purpose: local proxy routing management and, if enabled in a future release, user-initiated diagnostics.

The project must not use or transfer user data for advertising, profiling, resale, or unrelated purposes.

## Data Deletion

Users should be able to delete stored extension data by:

- Removing domain rules in the extension UI once implemented.
- Clearing local proxy settings in the extension UI once implemented.
- Removing the extension from Chrome.

## Changes

This privacy document must be reviewed before every Chrome Web Store submission. Any implementation change that affects stored data, permissions, diagnostics, or external communication must update this document before release.

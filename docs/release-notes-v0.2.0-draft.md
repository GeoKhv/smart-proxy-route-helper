# Smart Proxy Route Helper v0.2.0 Release Notes — Draft

Draft only. Do not publish these notes until the version bump, final smoke, verified package build, tag, and release are explicitly approved and completed.

Smart Proxy Route Helper v0.2.0 is a compatibility-focused update to the published v0.1.0 local proxy routing extension.

## Highlights

- Added explicit proxy and direct route actions.
- Added deterministic routing precedence: exact rules beat parent rules, and the most-specific parent rule wins.
- Added redundant same-action rule suggestions with no automatic deletion.
- Added versioned local settings backup and restore with preview before apply.
- Added optional device proxy export; it remains excluded by default.
- Added a local stable-ID build workflow for unpacked installations.
- Improved action-specific diagnostic recording so page-level failed or generated request hostnames can be detected automatically without DevTools or manual URL entry.

## Compatibility

- Existing v0.1.0 rules without an `action` continue as proxy rules.
- Earlier settings exports with rules that omit `action` import as proxy rules.
- Synced route rules and classification overrides remain domain-level Chrome Sync data.
- Local proxy configuration remains device-local and is not synced.
- The manifest permission list is unchanged: `proxy`, `storage`, `activeTab`, and `scripting`.
- No host permissions, `<all_urls>`, `webRequest`, `webNavigation`, `debugger`, or persistent content scripts were added.

## Backup and Restore

- Export includes normalized synced rules, route actions, ignored domains, denylist entries, and classification overrides.
- Local proxy host, port, scheme, and enabled state are excluded unless the user explicitly includes them.
- Import validates the format, sanitizes values, rejects protected/internal/private domains, reports duplicates, previews changes, and writes only after explicit confirmation.
- Backups do not contain raw URLs, paths, queries, signatures, credentials, collected resource hosts, or recording sessions.

## Diagnostic Recording

- Recording remains user-invoked, temporary, bounded, and local.
- Temporary page hooks observe page-level request initiations and resource signals only during an active session.
- URL-like values are reduced to hostnames before they cross into the extension context.
- Closing the Popup does not stop the session; Stop, Cancel, timeout, reload, and navigation have explicit lifecycle handling.
- Recording never creates route rules automatically. Candidates still require separate selection and confirmation.

## Privacy and Security

- No telemetry, analytics, ads, backend, user account, runtime remote list, or remote executable code.
- No raw request URL, page content, upload content, cookie, header, body, or authentication data is retained by the recorder.
- Settings export/import runs locally and does not upload backup data.

## Known Limitations

- A working local proxy is still required and is configured outside the extension.
- Chrome proxy settings may be controlled by policy or another extension.
- The page recorder may not see worker, service-worker, extension, or browser-level requests.
- Proxy authentication management is not included.

## Upgrade Notes

The update is intended to preserve existing settings in place. Do not uninstall v0.1.0 before updating, because uninstalling an extension can remove device-local extension storage.

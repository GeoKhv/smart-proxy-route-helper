# Smart Proxy Route Helper v0.1.0 Release Notes Draft

Smart Proxy Route Helper v0.1.0 is the first MVP release candidate for local, per-domain proxy routing in Chrome.

This release is not yet published on Chrome Web Store unless a separate publishing step has completed.

## Features

- Manifest V3 Chrome extension runtime.
- Options UI for device-specific local proxy configuration.
- Options UI for synced domain route rule management.
- Popup UI for current-site route add/remove actions.
- Background PAC manager that applies locally generated PAC data through `chrome.proxy`.
- Fail-closed matched proxy routing: matched proxy-route domains do not use a direct fallback when the configured local proxy is unavailable.
- Manual "Check via proxy" diagnostics after an explicit user click.
- User-invoked related-domain preview using current loaded page resource hostnames.
- Selectable related-domain suggestions with separate explicit save action.
- Personal classification overrides for related-domain preview.
- Bundled local built-in domain classification foundation.
- Simple bundled PNG extension icons.

## Permissions

Required permissions:

- `proxy`: applies the locally generated PAC configuration.
- `storage`: stores synced route rules and classification overrides, plus local proxy settings.
- `activeTab`: supports explicit current-tab popup actions and manual diagnostics after user invocation.
- `scripting`: runs a one-time current-page resource hostname collector for related-domain preview after user invocation.

The MVP does not request host permissions, `<all_urls>`, `webRequest`, `webNavigation`, notifications, debugger capabilities, or persistent content scripts.

## Privacy Notes

- No telemetry.
- No analytics.
- No ads.
- No backend.
- No user accounts.
- No remote executable code.
- No runtime remote list fetching.
- Route rules and classification overrides are stored as domain-level data in `chrome.storage.sync`.
- Local proxy scheme, host, port, and enabled state stay in `chrome.storage.local`.
- Related-domain preview is transient and user-invoked.
- Collected resource hosts, raw URLs, paths, query strings, fragments, credentials, browsing history, diagnostic history, and temporary probe state are not stored or synced.

## Known Limitations

- Not yet published on Chrome Web Store.
- Local proxy availability depends on user-configured software outside the extension.
- Chrome proxy settings may be controlled by enterprise policy, another extension, or user settings.
- Related-domain preview can be noisy because it depends on resources present on the currently loaded page.
- Built-in classification data is intentionally small and curated.
- Proxy authentication management is not included.
- Community-list fetching and managed remote lists are not included.

## Manual Install for Local Testing

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm run build`.
4. Open `chrome://extensions`.
5. Enable Developer mode.
6. Click "Load unpacked".
7. Select the generated `dist/` directory.
8. Configure a local proxy in Options before adding proxy-route rules.

For zip-based local testing, run `npm run package` after a successful build and use `release/smart-proxy-route-helper-v0.1.0.zip`.

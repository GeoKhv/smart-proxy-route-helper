# Smart Proxy Route Helper v0.1.0 Release Notes

Smart Proxy Route Helper v0.1.0 is the first MVP release for local, per-domain proxy routing in Chrome.

Published Chrome Web Store listing:

- https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj

GitHub release:

- https://github.com/GeoKhv/smart-proxy-route-helper/releases/tag/v0.1.0

## Features

- Manifest V3 Chrome extension runtime.
- Options UI for device-specific local proxy configuration.
- Options UI for synced domain route rule management.
- Popup UI for current-site route add/remove actions.
- Background PAC manager that applies locally generated PAC data through `chrome.proxy`.
- Fail-closed matched proxy routing: matched proxy-route domains do not use a direct fallback when the configured local proxy is unavailable.
- Manual "Check via proxy" diagnostics after an explicit user click.
- User-invoked related-domain preview using current loaded page resource hostnames.
- User-invoked diagnostic recording for action-specific resource hostnames.
- Selectable related-domain suggestions with separate explicit save action.
- Personal classification overrides for related-domain preview.
- Bundled local built-in domain classification foundation.
- Public-suffix-aware route target planning through bundled `tldts` data, with no runtime suffix-list fetching.
- Conservative route target planning that keeps observed hostnames separate from the rule domain that would be saved.
- Built-in ChatGPT/OpenAI related-domain handling for generated and file-related `*.oaiusercontent.com` hosts. Matching hosts can be suggested as `oaiusercontent.com` with subdomains included only through bundled site-scoped hints.
- Simple bundled PNG extension icons.

## Release Smoke Highlights

Recent local smoke coverage for this release included:

- 2ip.ru and 2ip.io routed through the configured local proxy and showed the expected proxy IP/city behavior.
- A wrong local proxy port did not produce false proxy success for matched proxy-route domains.
- Popup behavior correctly showed inherited parent-rule coverage.
- LinkedIn related-domain preview showed useful candidates such as `licdn.com` media/static resources while keeping ignored candidates separated.
- Classification override actions updated domain-level preferences without creating proxy routing rules.
- ChatGPT/OpenAI route planning covered generated `*.oaiusercontent.com` hosts through an `oaiusercontent.com` include-subdomains rule.
- ChatGPT file upload testing did not require adding `files.oaiusercontent.com` separately when broader OpenAI rules already covered it.
- Diagnostic recording captured action-specific ChatGPT upload hosts, previewed them without automatic rule creation, and canceling a recording did not change rules.

## Permissions

Required permissions:

- `proxy`: applies the locally generated PAC configuration.
- `storage`: stores synced route rules and classification overrides, plus local proxy settings.
- `activeTab`: supports explicit current-tab popup actions, manual diagnostics, related-domain preview, and diagnostic recording after user invocation.
- `scripting`: runs user-invoked current-page resource hostname collection for related-domain preview and diagnostic recording after user invocation.

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
- Diagnostic recording is transient, bounded, and user-invoked.
- Diagnostic recording metadata may use `chrome.storage.session` while active; that metadata is short-lived and is not synced or treated as persistent user settings.
- Collected resource hosts, raw URLs, paths, query strings, fragments, credentials, browsing history, diagnostic history, and temporary probe state are not stored or synced.

## Known Limitations

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

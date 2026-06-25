# Smart Proxy Route Helper

Smart Proxy Route Helper is an open-source Manifest V3 Chrome extension for managing per-domain proxy routing through a user-configured local proxy.

The extension lets a user maintain a synced list of domains that should use a proxy route, while keeping local proxy settings device-specific. It is local-first, permission-minimal, and designed to be publishable to Chrome Web Store.

## MVP Release Candidate Status

Version `0.1.0` is the first MVP release candidate. The runtime includes:

- Options UI for device-specific local proxy configuration and synced route rules.
- Popup UI for current-site route management.
- Background PAC runtime application through `chrome.proxy`.
- Fail-closed matched proxy routing.
- Manual "Check via proxy" diagnostics.
- User-invoked related-domain preview through `activeTab` plus `scripting`.
- User-invoked diagnostic recording for action-specific resource hosts.
- Selectable related-domain suggestions.
- User classification overrides stored as domain-level preferences.
- Built-in local domain classification foundation.
- Public-suffix-aware registrable-domain planning for related-domain route targets.

It does not include telemetry, backend calls, host permissions, persistent content scripts, `webRequest`, `webNavigation`, runtime remote list fetching, or remote executable code.

## Quick Start

Install dependencies:

```sh
npm install
```

Build the unpacked extension:

```sh
npm run build
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select the generated `dist/` directory.

Configure and use the MVP:

1. Open Options.
2. Configure the local proxy scheme, host, and port for this device.
3. Open a supported `http` or `https` site.
4. Open the extension popup.
5. Add the current site as a synced proxy route, or run "Check via proxy" first.
6. Click "Preview related domains" after the page is loaded to inspect transient related-domain suggestions, or click "Start recording" before a page action and "Stop and preview" afterward.
7. Select only the related domains you want and click the separate add action.

## Development Commands

Run tests:

```sh
npm test
```

Run type checking:

```sh
npm run typecheck --if-present
```

Build:

```sh
npm run build
```

Package the current build for local release testing:

```sh
npm run package
```

The package script reads `dist/` and writes `release/smart-proxy-route-helper-v0.1.0.zip`. Run `npm run build` first.

## Dependency Notes

Runtime domain parsing uses `tldts` for public-suffix-aware registrable-domain decisions. The package is bundled into the extension build, has no runtime network access, does not fetch remote suffix lists, and is used only by pure route-planning/classification logic.

## What It Does

The MVP runtime provides a small manual PAC manager:

- Add, edit, disable, and remove domain rules manually.
- Sync domain rules with `chrome.storage.sync`.
- Store local proxy configuration with `chrome.storage.local`.
- Generate a PAC script locally from the user's rules and local proxy settings.
- Apply the generated PAC script through `chrome.proxy`.
- Provide simple popup/options HTML and TypeScript UI.
- Provide manual current-site diagnostics only after explicit user action.
- Provide current-page related-domain preview only after explicit user action.
- Provide diagnostic recording only after explicit start/stop/cancel actions.
- Classify related-domain candidates through bundled local data and conservative pure heuristics.
- Use public-suffix-aware registrable-domain parsing so route planning does not rely on unsafe "last two labels" assumptions.
- Save related-domain candidates only after explicit user selection and confirmation.
- Keep domain parsing, validation, storage mapping, and PAC generation in pure modules with focused tests.

## What It Does Not Do

The MVP does not include:

- Telemetry, analytics, ads, or usage reporting.
- Backend services or user accounts.
- Remote executable code.
- Remotely controlled business logic.
- Required `<all_urls>`.
- Required broad host permissions.
- `webRequest` or `webNavigation`.
- Persistent content scripts.
- Automatic domain rule creation.
- Default-on or automatic diagnostics.
- Managed remote domain lists.
- Runtime fetching of GitHub/raw classification lists.
- Automatic upload or reporting of collected domains.
- Proxy authentication management.
- Chrome Web Store submission automation.

## Permissions Summary

Required permissions:

- `storage` for extension settings.
- `proxy` to apply the locally generated PAC configuration.
- `activeTab` for explicit user-initiated current-site popup actions and diagnostics.
- `scripting` for explicit user-initiated current-page related-domain preview and diagnostic recording.

Host permissions: none.

The MVP avoids broad page access. Current-site actions rely on the user invoking the extension on the active tab. Related-domain preview and diagnostic recording use the temporary `activeTab` grant plus `scripting` after explicit popup clicks, collect only sanitized resource hostnames, and do not store, sync, or send those collected hosts. Related-domain candidates become synced rules only after explicit user selection and a separate add click.

See [docs/permissions.md](docs/permissions.md) for the detailed strategy.

## Storage Strategy

Synced across the user's Chrome profile:

- Domain routing rules.
- Domain-level classification overrides for related-domain preview.
- Domain-level ignored domains and denylist entries.
- Rule metadata such as source and creation timestamps.

Device-specific:

- Local proxy host, port, and scheme.
- Extension enabled state for the current device.
- Local diagnostics preference.

The project does not store raw URLs, page paths, query strings, fragments, credentials, browsing history, local proxy configuration, or diagnostics history in synced storage.

See [docs/architecture.md](docs/architecture.md) for the planned data boundaries.

## Privacy Posture

The project is designed around a simple privacy promise:

- No telemetry.
- No backend.
- No ads.
- No sale or transfer of user data.
- No developer access to user domain rules or local proxy settings.
- Chrome Sync may sync domain rules if the user has sync enabled in Chrome.
- Related-domain preview is user-invoked and transient.
- Diagnostic recording is user-invoked, bounded, and transient.
- Local proxy configuration stays on the local device.

See [PRIVACY.md](PRIVACY.md).

## Known Limitations

- The extension is not yet published on Chrome Web Store.
- Local proxy availability depends on software configured outside this extension.
- Chrome proxy settings may be controlled by enterprise policy, another extension, or user settings.
- Related-domain preview and recording can be noisy because they are based on resource references visible to the loaded page.
- The built-in classification data is intentionally small and curated.
- Proxy authentication management is not included in the MVP.

## Chrome Web Store Review Risks

Known review-sensitive areas:

- The `proxy` permission affects browser network configuration and must be clearly tied to the single purpose.
- Any future host permissions must be narrow, optional where feasible, and explained before use.
- The MVP must not require `<all_urls>`.
- Remote executable code is not allowed for Manifest V3 Chrome Web Store submissions.
- Diagnostics must not look like hidden browsing activity collection.
- Store listing, UI, and privacy disclosures must match actual behavior.

See [docs/release-checklist.md](docs/release-checklist.md), [docs/release-plan.md](docs/release-plan.md), and [SECURITY.md](SECURITY.md).

## Documentation Map

- [docs/product-brief.md](docs/product-brief.md): product goals, non-goals, vocabulary, and user flows.
- [docs/architecture.md](docs/architecture.md): planned extension architecture and storage boundaries.
- [docs/domain-classification.md](docs/domain-classification.md): local candidate classification model, precedence, and contribution workflow.
- [docs/permissions.md](docs/permissions.md): MVP and future permission strategy.
- [docs/release-checklist.md](docs/release-checklist.md): release candidate verification checklist.
- [docs/release-notes-v0.1.0.md](docs/release-notes-v0.1.0.md): draft release notes for v0.1.0.
- [docs/release-plan.md](docs/release-plan.md): staged v0.1, v0.2, and v0.3 plan.
- [docs/manual-smoke-test.md](docs/manual-smoke-test.md): manual checks for future runtime releases.
- [PRIVACY.md](PRIVACY.md): privacy posture and data handling.
- [SECURITY.md](SECURITY.md): security posture and vulnerability reporting.

## References

- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome proxy API: https://developer.chrome.com/docs/extensions/reference/api/proxy
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

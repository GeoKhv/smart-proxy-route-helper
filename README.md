# Smart Proxy Route Helper

Smart Proxy Route Helper is an open-source Manifest V3 Chrome extension for managing per-domain proxy routing through a user-configured local proxy.

The extension lets a user maintain a synced list of domains that should use a proxy route, while keeping local proxy settings device-specific. It is intended to be local-first, permission-minimal, and publishable to Chrome Web Store.

## Repository Status

This repository currently contains initial documentation, project guidance, and an initial Manifest V3 TypeScript runtime.

The runtime includes popup/options pages, domain rule helpers, PAC generation, typed storage helpers, background proxy application, and manual current-site diagnostics. It does not include telemetry, backend calls, host permissions, content scripts, `webRequest`, `webNavigation`, or remote executable code.

## Local Development

Install dependencies:

```sh
npm install
```

Run unit tests:

```sh
npm test
```

Build the unpacked extension:

```sh
npm run build
```

The build output is written to `dist/`. Load that directory from `chrome://extensions` with Developer mode enabled.

## MVP Scope

The current MVP runtime provides a small manual PAC manager:

- Add, edit, disable, and remove domain rules manually.
- Sync domain rules with `chrome.storage.sync`.
- Store local proxy configuration with `chrome.storage.local`.
- Generate a PAC script locally from the user's rules and local proxy settings.
- Apply the generated PAC script through `chrome.proxy`.
- Provide simple popup/options HTML and TypeScript UI.
- Provide manual current-site diagnostics only after explicit user action.
- Keep domain parsing, validation, storage mapping, and PAC generation in pure modules with focused tests.

## Out of Scope for MVP

The MVP will not include:

- Telemetry, analytics, ads, or usage reporting.
- Backend services or user accounts.
- Remote executable code.
- Remotely controlled business logic.
- Required `<all_urls>`.
- Required broad host permissions.
- `webRequest` or `webNavigation`.
- Content scripts.
- Automatic domain rule creation.
- Default-on or automatic diagnostics.
- Managed remote domain lists.
- Proxy authentication management.

## Permission Strategy

MVP permissions:

- `storage` for extension settings.
- `proxy` to apply the locally generated PAC configuration.
- `activeTab` for explicit user-initiated current-site popup actions and diagnostics.

Planned MVP host permissions:

- None.

The MVP avoids broad page access. Current-site actions rely on the user invoking the extension on the active tab, and future features that need more page context must use optional permissions where possible, explain the reason in the UI, and remain opt-in.

See [docs/permissions.md](docs/permissions.md) for the detailed strategy.

## Storage Strategy

Synced across the user's Chrome profile:

- Domain routing rules.
- Ignored domains and denylist entries.
- Rule metadata that is safe to sync, such as source and creation timestamps.

Device-specific:

- Local proxy host, port, and scheme.
- Extension enabled state for the current device.
- Local diagnostics preference.

The project should not store secrets in synced storage.

See [docs/architecture.md](docs/architecture.md) for the planned data boundaries.

## Privacy Posture

The project is designed around a simple privacy promise:

- No telemetry.
- No backend.
- No ads.
- No sale or transfer of user data.
- No developer access to user domain rules or local proxy settings.
- Chrome Sync may sync domain rules if the user has sync enabled in Chrome.

See [PRIVACY.md](PRIVACY.md).

## Chrome Web Store Review Risks

Known review-sensitive areas:

- The `proxy` permission affects browser network configuration and must be clearly tied to the single purpose.
- Any future host permissions must be narrow, optional where feasible, and explained before use.
- The MVP must not require `<all_urls>`.
- Remote executable code is not allowed for Manifest V3 Chrome Web Store submissions.
- Diagnostics must not look like hidden browsing activity collection.
- Store listing, UI, and privacy disclosures must match actual behavior.

See [docs/release-plan.md](docs/release-plan.md) and [SECURITY.md](SECURITY.md).

## Documentation Map

- [docs/product-brief.md](docs/product-brief.md): product goals, non-goals, vocabulary, and user flows.
- [docs/architecture.md](docs/architecture.md): planned extension architecture and storage boundaries.
- [docs/permissions.md](docs/permissions.md): MVP and future permission strategy.
- [docs/release-plan.md](docs/release-plan.md): staged v0.1, v0.2, and v0.3 plan.
- [docs/manual-smoke-test.md](docs/manual-smoke-test.md): manual checks for future runtime releases.
- [PRIVACY.md](PRIVACY.md): privacy posture and data handling.
- [SECURITY.md](SECURITY.md): security posture and vulnerability reporting.

## References

- Chrome extension permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome proxy API: https://developer.chrome.com/docs/extensions/reference/api/proxy
- Manifest V3 remote code requirements: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

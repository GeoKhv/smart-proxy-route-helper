# Project Guidance for Agents

Prefer Russian when talking with the repository owner. Public project documents should stay in English unless the user asks otherwise.

## Project Charter

This repository is for an open-source Manifest V3 Chrome extension that manages per-domain proxy routing through a user-configured local proxy.

The product must remain:

- Publishable to Chrome Web Store.
- Local-first, with no telemetry and no backend.
- Free of remote executable code.
- Explicit-consent based: never add domain rules automatically.
- Permission-minimal: no required broad host access in the MVP.
- Neutral in wording: use terms like proxy routing, local proxy, PAC manager, diagnostics, direct route, and proxy route.

## Current Phase

The repository currently contains initial documentation and project guidance only.

Do not add runtime source code, build setup, manifest files, package metadata, generated files, or extension assets unless the user explicitly asks for implementation work.

## MVP Boundaries

The MVP is planned to include:

- Manual domain rule management.
- Synced domain rules via `chrome.storage.sync`.
- Device-specific local proxy configuration via `chrome.storage.local`.
- Locally generated PAC configuration applied through `chrome.proxy`.
- Simple popup/options HTML and TypeScript.
- Pure, testable business logic modules once runtime work begins.

The MVP must not include:

- Telemetry, analytics, ads, or a backend service.
- Remote executable code or remotely controlled extension logic.
- Automatic domain rule creation.
- Required broad host permissions.
- Required `<all_urls>`.
- `webRequest` or `webNavigation`.
- Default-on diagnostics.

## Future Diagnostics Guardrails

Diagnostics are a future feature and must remain optional and opt-in. They may only run after an explicit user action, may only make a recommendation, and must require explicit confirmation before adding a rule.

Diagnostics must not collect browsing activity, upload diagnostic data, or silently change routing.

## Documentation Style

- Use clear, neutral, user-facing language.
- Separate MVP scope from later work.
- Call out Chrome Web Store review risks whenever permissions, diagnostics, or remote resources are discussed.
- Keep privacy and security claims aligned with the actual implementation state.
- If policy-sensitive claims are updated, check the current official Chrome extension and Chrome Web Store documentation.

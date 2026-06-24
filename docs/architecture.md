# Architecture

This document describes the planned architecture. The repository currently contains startup documentation, an initial MV3 TypeScript scaffold, and pure modules for domain rules and PAC generation.

## Design Principles

- Manifest V3 only.
- Plain Chrome extension APIs.
- Simple popup/options HTML and TypeScript for MVP.
- Local-first behavior with no backend.
- No telemetry.
- No remote executable code.
- Permission-minimal design.
- Pure business logic modules for validation, normalization, storage mapping, and PAC generation.

## Planned Runtime Parts

### Extension UI

Popup:

- Show current device status.
- Show whether extension-managed proxy routing is enabled.
- Provide quick access to domain rules and options.

Options page:

- Configure local proxy settings.
- Manage domain rules.
- Show storage and permission status.
- Provide reset/export affordances only after implementation design is settled.

### Extension Service Worker

The service worker is expected to coordinate:

- Reading synced domain rules.
- Reading local proxy configuration.
- Generating PAC data locally.
- Applying proxy settings through `chrome.proxy`.
- Reacting to relevant storage changes.
- Reporting current apply status to the UI.

### Pure Modules

Once implementation begins, core logic should be isolated from Chrome APIs:

- Domain normalization and validation.
- Proxy configuration validation.
- Domain rule model and migrations.
- PAC generation.
- Storage serialization and migration helpers.
- Diagnostic decision helpers once diagnostics are implemented.

These modules should be unit-tested without Chrome.

## Data Boundaries

### Synced Storage

Use `chrome.storage.sync` for domain routing rules because users should be able to keep the same domain list across Chrome profiles.

Expected synced data:

- Schema version.
- Domain rules.
- Rule enabled/disabled state.
- Safe rule metadata.

Do not store local proxy host, port, credentials, device state, or diagnostics history in synced storage.

### Local Storage

Use `chrome.storage.local` for settings that are specific to one Chrome installation.

Expected local data:

- Local proxy scheme.
- Local proxy host.
- Local proxy port.
- Device enabled/disabled state.
- Last apply status.
- Local diagnostics preference once diagnostics exist.

## Planned Domain Rule Semantics

The MVP should keep rule semantics simple:

- User enters a domain, not a full URL.
- The extension normalizes hostnames before storage and PAC generation.
- A domain rule stores whether subdomains are included. Exact matches always apply; subdomain matches apply only when `includeSubdomains` is true.
- Invalid input should be rejected before storage.

Examples of invalid input:

- Empty values.
- Values with paths or query strings.
- Values with unsupported characters.
- IP ranges or arbitrary PAC expressions.

## PAC Generation

PAC data must be generated locally from trusted extension code and user settings.

The generated PAC configuration should:

- Route matching domain rules through the configured local proxy.
- Route everything else directly.
- Avoid including unsanitized user input.
- Match exact domains and dot-boundary subdomains only, without unsafe substring matching.
- Be deterministic for the same input.
- Be small enough for straightforward review.

The pure PAC generation module does not apply proxy settings by itself. Runtime application through `chrome.proxy` is a later integration step.

Chrome proxy API reference: https://developer.chrome.com/docs/extensions/reference/api/proxy

## Proxy State and Conflicts

Chrome proxy settings may also be controlled by another extension, enterprise policy, or user configuration.

The extension should:

- Detect when its settings are not controllable, if the API exposes that state.
- Show a clear status instead of silently failing.
- Avoid overwriting user intent outside the extension's enabled/disabled controls.
- Restore a predictable state when extension-managed routing is turned off.

## Diagnostics Architecture

Diagnostics are a future feature and must not be part of the MVP runtime.

Future diagnostics should be isolated behind:

- An explicit opt-in preference.
- A user action for each check.
- A narrow permission request, if a permission is needed.
- A pure recommendation model that never mutates rules by itself.

Diagnostic results should be short-lived unless the user explicitly saves something.

## Test Strategy

Pure modules:

- Domain normalization.
- Proxy config validation.
- Storage migrations.
- PAC generation.
- Diagnostics recommendation logic once added.

Extension integration:

- Storage sync/local split.
- Proxy apply lifecycle.
- Permission behavior.
- UI state transitions.

Manual checks:

- See [manual-smoke-test.md](manual-smoke-test.md).

## Current Runtime Boundary

Do not add storage wiring, `chrome.proxy.settings.set`, diagnostics, host permissions, `webRequest`, or `webNavigation` until the project explicitly moves to those implementation slices.

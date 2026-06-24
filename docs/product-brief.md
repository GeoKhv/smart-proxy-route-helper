# Product Brief

## Product

Smart Proxy Route Helper is a Manifest V3 Chrome extension for managing per-domain proxy routing through a user-configured local proxy.

The user owns both important pieces of configuration:

- Which domains should use the proxy route.
- Which local proxy endpoint should be used on the current device.

Domain rules are intended to sync across Chrome profiles. Local proxy settings are intentionally device-specific.

## Single Purpose

Help a user manage local PAC-based proxy routing for specific domains in Chrome.

## Target Users

- Users who run a trusted local proxy on one or more devices.
- Users who want their domain routing list to follow them through Chrome Sync.
- Users who need device-specific local proxy settings because proxy ports or hosts differ by machine.

## MVP User Problem

Chrome can use PAC scripts, but manually maintaining per-domain PAC configuration is inconvenient and error-prone.

The MVP provides a small, transparent UI for maintaining the domain list, configuring the local proxy on each device, applying the resulting PAC configuration through Chrome's extension APIs, and manually checking whether the current site appears reachable through the configured local proxy.

## MVP Goals

- Manual domain rule management.
- Synced rules across Chrome profiles.
- Device-local proxy settings.
- Locally generated PAC configuration.
- Clear current status in the extension UI.
- Manual current-site diagnostics after explicit user action.
- Minimal permissions.
- No backend and no telemetry.

## Non-Goals

- No backend service.
- No account system.
- No telemetry, analytics, or ads.
- No remote executable code.
- No required broad host access.
- No automatic rule creation.
- No page monitoring.
- No traffic inspection.
- No proxy service bundled with the extension.
- No proxy credential management in the MVP.

## Neutral Vocabulary

Use:

- Proxy routing.
- Local proxy.
- PAC manager.
- Direct route.
- Proxy route.
- Diagnostics.
- Domain rule.
- Reachability check.

Avoid non-neutral access-control framing. Product copy should stay factual, technical, and Chrome Web Store friendly.

## MVP User Flows

### Configure Local Proxy

1. User opens options.
2. User enters local proxy scheme, host, and port.
3. Extension validates the values.
4. Extension stores settings locally on the device.
5. Extension can apply the generated PAC configuration.

### Manage Domain Rules

1. User opens popup or options.
2. User manually adds a domain.
3. Extension normalizes and validates the domain.
4. Extension saves the rule to synced storage.
5. Extension regenerates and applies PAC configuration when enabled.

### Disable or Remove a Rule

1. User disables or removes a domain rule.
2. Extension updates synced storage.
3. Extension regenerates and applies PAC configuration when enabled.
4. UI reports the updated state.

### Pause Extension Routing on This Device

1. User turns off extension-managed proxy routing on the current device.
2. Extension stores the device state locally.
3. Extension returns Chrome proxy settings to the intended direct or system state according to the implementation design.
4. Synced domain rules remain unchanged.

## Manual Diagnostics

Diagnostics are manual and best-effort. They help a user check whether the current site appears reachable through the configured local proxy before saving a permanent synced rule.

This feature must be:

- Optional.
- Opt-in per check.
- User-initiated.
- Transparent about what is checked.
- Limited in stored data.
- Non-automatic: it may suggest a rule, but must never add one without explicit confirmation.

## Success Criteria

The MVP is successful when:

- A user can configure a local proxy on one device.
- A user can manage a synced list of domain rules.
- The extension can apply local PAC-based proxy routing from those settings.
- A user can run a manual current-site check without automatic rule creation.
- The extension uses only the permissions needed for shipped functionality.
- The project can present a clear privacy story for Chrome Web Store review.
- Manual smoke tests cover install, configuration, rule changes, storage split, and permission expectations.

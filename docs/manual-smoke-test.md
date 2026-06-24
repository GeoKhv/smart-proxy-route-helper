# Manual Smoke Test

This checklist is for future runtime releases. The repository currently has no extension runtime to test.

## Test Environment

Use a clean Chrome profile when possible.

Record:

- Chrome version.
- Operating system.
- Extension version.
- Whether Chrome Sync is enabled.
- Local proxy type, host, and port used for the test.

## Pre-Release Checks

1. Confirm the extension loads as an unpacked Manifest V3 extension.
2. Confirm requested permissions match the current release plan.
3. Confirm no required host permissions appear in the MVP.
4. Confirm the extension has no telemetry or backend requests.
5. Confirm diagnostics are absent in v0.1 or disabled by default in later releases.

## MVP Configuration Checks

1. Open options.
2. Enter an invalid local proxy host and confirm validation blocks saving.
3. Enter an invalid port and confirm validation blocks saving.
4. Enter a valid local proxy configuration.
5. Confirm the local proxy configuration is stored only on the current device.
6. Enable extension-managed proxy routing.
7. Confirm the UI shows the enabled state.

## Domain Rule Checks

1. Add a valid domain rule.
2. Confirm the domain is normalized before display or storage.
3. Add an invalid value with a path or query string and confirm validation blocks saving.
4. Disable the valid rule and confirm it remains in the list but no longer participates in generated PAC data.
5. Remove the rule and confirm it is removed from synced storage.
6. Reload the extension and confirm stored rules are restored.

## PAC Apply Checks

1. Start with no enabled rules and apply settings.
2. Confirm ordinary sites use the direct route.
3. Add a test domain rule and apply settings.
4. Confirm matching traffic uses the configured local proxy.
5. Confirm non-matching traffic uses the direct route.
6. Disable extension-managed proxy routing.
7. Confirm Chrome returns to the intended non-extension-managed state.

## Storage Split Checks

With Chrome Sync enabled on two Chrome profiles or devices:

1. Add a domain rule on device A.
2. Confirm the domain rule appears on device B after sync.
3. Configure a local proxy on device A.
4. Confirm the local proxy configuration does not appear on device B.
5. Configure a different local proxy on device B.
6. Confirm domain rules remain shared while local proxy settings differ.

## Conflict and Error Checks

1. Test behavior when local proxy settings are incomplete.
2. Test behavior when the local proxy is not running.
3. Test behavior when another extension or policy controls Chrome proxy settings, if practical.
4. Confirm the UI reports failures without exposing raw internal traces as normal user copy.

## Privacy Checks

1. Inspect extension network activity during normal MVP use.
2. Confirm no project backend is contacted.
3. Confirm domain rules are not transmitted to the developer.
4. Confirm local proxy settings are not transmitted to the developer.
5. Confirm uninstalling the extension removes extension-managed local data.

## Diagnostics Checks for v0.3 or Later

Run only when diagnostics exist:

1. Confirm diagnostics are disabled by default.
2. Enable diagnostics explicitly.
3. Trigger a check manually.
4. Confirm the check explains what it is doing.
5. Confirm no rule is added automatically.
6. Confirm accepting a suggestion requires explicit confirmation.
7. Disable diagnostics and confirm checks no longer run.

## Release Result

For each release candidate, record:

- Pass/fail status.
- Tester.
- Date.
- Chrome version.
- Notes for any failed check.

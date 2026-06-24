# Manual Smoke Test

This checklist covers the current Manifest V3 extension scaffold, Options configuration UI, and runtime PAC application. The popup current-site workflow and diagnostics are not implemented.

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

## Current Runtime Checks

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm run build`.
4. Load `dist/` as an unpacked extension in Chrome.
5. Open the popup and confirm the placeholder UI renders.
6. Open the options page and confirm local proxy settings, synced domain rules, and read-only denylist/ignored-domain sections render.
7. Inspect the service worker and confirm it starts without uncaught errors.
8. Confirm no diagnostics, backend calls, telemetry, content scripts, or host permissions are present.
9. Confirm manifest permissions remain unchanged: `proxy`, `storage`, and `activeTab`.

## Runtime PAC Apply Checks

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Open the loaded extension's Options page.
4. Configure local proxy settings:

- Enable proxy routing on this device.
- Scheme: `socks5`.
- Host: `127.0.0.1`.
- Port: `10808`.

5. Add a synced domain rule for `example.com` with subdomains included.
6. Open the loaded extension's service worker inspection link.
7. Confirm the service worker logs say PAC proxy routing was applied.
8. Inspect Chrome's current proxy setting:

```js
await chrome.proxy.settings.get({ incognito: false });
```

9. Confirm the value uses `mode: "pac_script"` and contains inline PAC `data`, not a PAC `url`.
10. If a local test proxy is running on the configured host/port, visit the test domain and confirm matching traffic reaches that local proxy.
11. Visit a non-matching domain and confirm it uses the direct route.

## Options Configuration Checks

1. Open Options.
2. Enter an invalid local proxy host, save, and confirm inline validation blocks saving.
3. Enter an invalid port, save, and confirm inline validation blocks saving.
4. Save `socks5`, `127.0.0.1`, `10808` with proxy routing enabled.
5. Confirm the local proxy configuration is stored only in `chrome.storage.local`:

```js
await chrome.storage.local.get(["deviceProxy"]);
await chrome.storage.sync.get(["deviceProxy"]);
```

6. Confirm `deviceProxy` is present in local storage and absent from sync storage.
7. Add `letterboxd.com` with subdomains included.
8. Add `ltrbxd.com` with subdomains included.
9. Confirm both rules appear in the Options list with mode/source metadata.
10. Confirm the rules are stored in `chrome.storage.sync`:

```js
await chrome.storage.sync.get(["rules"]);
```

11. Try to add `localhost`, `192.168.1.1`, and `chrome://extensions`; confirm inline validation rejects them.
12. Remove one rule and confirm it is removed from the Options list and synced storage.
13. Confirm the Options page does not call `chrome.proxy.settings` directly; proxy application should happen through the background storage listener.

## Empty Rules and Missing Config Checks

1. Keep the valid local proxy config and clear synced rules:

```js
await chrome.storage.sync.set({
  rules: [],
  ignoredDomains: [],
  denylist: []
});
await chrome.proxy.settings.get({ incognito: false });
```

2. Confirm the extension clears its proxy setting instead of applying a direct-only PAC. The resulting Chrome value may show the user's system proxy state; it should not remain an extension-applied PAC.
3. Disable local proxy routing:

```js
await chrome.storage.local.set({
  deviceProxy: {
    enabled: false,
    config: null
  },
  diagnostics: {
    enabled: false
  }
});
await chrome.proxy.settings.get({ incognito: false });
```

4. Confirm the extension clears its proxy setting. The resulting Chrome value may show the user's system proxy state; it should not remain an extension-applied PAC.
5. Store an invalid local proxy config, such as port `70000`, and confirm the service worker clears extension proxy routing instead of applying a PAC.
6. Confirm these checks do not add host permissions, `webRequest`, `webNavigation`, notifications, content scripts, diagnostics, backend calls, telemetry, or remote PAC URLs.

## PAC Apply Checks

1. Start with no enabled rules and apply settings.
2. Confirm Chrome returns to the intended non-extension-managed state instead of receiving a direct-only PAC.
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

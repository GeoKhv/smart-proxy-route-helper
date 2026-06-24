# Manual Smoke Test

This checklist covers the current Manifest V3 extension scaffold, Popup current-site rule management, manual current-site diagnostics, Options configuration UI, and runtime PAC application.

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
5. Confirm diagnostics are manual only and start only after the user clicks "Check via proxy".
6. Confirm related-domain preview starts only after the user clicks "Preview related domains".
7. Confirm related-domain preview does not store, sync, send, or automatically save collected hosts.
8. Confirm related-domain suggestions are saved only after the user selects candidates and clicks "Add selected domains".

## Current Runtime Checks

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm run build`.
4. Load `dist/` as an unpacked extension in Chrome.
5. Open the popup on a regular `http` or `https` site and confirm the current domain renders.
6. Open the options page and confirm local proxy settings, synced domain rules, and read-only denylist/ignored-domain sections render.
7. Inspect the service worker and confirm it starts without uncaught errors.
8. Confirm no automatic diagnostics, backend calls, telemetry, persistent content scripts, or host permissions are present.
9. Confirm manifest permissions are `proxy`, `storage`, `activeTab`, and `scripting`.
10. Confirm `host_permissions` remains absent.
11. Confirm current-page resource host collection runs only from the explicit related-domain preview action.

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
10. Confirm the PAC entry for matching rules returns a strict proxy string such as `SOCKS5 127.0.0.1:10808`, without `; DIRECT`.
11. If a local test proxy is running on the configured host/port, visit the test domain and confirm matching traffic reaches that local proxy.
12. Stop the local proxy or change the local proxy port to a known-wrong value, reload the matching test domain, and confirm it fails closed instead of silently using the direct route.
13. Visit a non-matching domain and confirm it uses the direct route.

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

## Popup Current-Site Checks

1. Open `https://letterboxd.com/`.
2. Open the extension popup and confirm it shows `letterboxd.com`.
3. Confirm the popup reports the direct route when no matching rule exists.
4. Click "Route this site through proxy".
5. Confirm a success message appears and the rule is stored in `chrome.storage.sync` with:

- `domain: "letterboxd.com"`.
- `includeSubdomains: true`.
- `mode: "proxy"`.
- `source: "manual"`.

6. Reopen the popup and confirm it reports an exact synced rule.
7. Click "Remove current site rule".
8. Confirm the exact `letterboxd.com` rule is removed from `chrome.storage.sync`.
9. Add a parent rule such as `example.com` with subdomains included, then open a subdomain like `https://www.example.com/`.
10. Confirm the popup explains that routing is inherited from the parent rule and does not remove the parent rule silently.
11. Open `chrome://extensions`, `chrome-extension://...`, `file:///...`, `about:blank`, `http://localhost:3000`, and a private or internal host if practical. Confirm the popup shows a clear unsupported/protected-page message and does not offer to add a rule.
12. Confirm the popup can open Options through the "Open Options" button.
13. Confirm the popup shows a "Check via proxy" button on supported sites.
14. Confirm the popup shows a "Preview related domains" button on supported sites.
15. Confirm the popup does not call `chrome.proxy.settings` directly; proxy application should happen through the background service worker.

## Manual Current-Site Diagnostics Checks

1. Start with a supported `http` or `https` site and no matching synced rule.
2. Confirm no diagnostic check runs when the popup opens.
3. Configure a working local proxy in Options.
4. Click "Check via proxy".
5. Confirm the popup shows cautious wording:

- "This site appears reachable through your local proxy.", or
- "This site did not appear reachable through your local proxy."

6. If the check appears reachable, confirm the popup offers a separate "Add checked site as rule" action and does not add a rule automatically.
7. Click "Add checked site as rule" and confirm the rule is stored in `chrome.storage.sync` with:

- `includeSubdomains: true`.
- `mode: "proxy"`.
- `source: "diagnostic"`.

8. Remove the diagnostic rule before the next scenario.
9. Disable or clear local proxy settings in Options, then click "Check via proxy" again.
10. Confirm the popup shows "Configure local proxy in Options first." and does not add or change synced rules.
11. Open unsupported or protected pages such as `chrome://extensions`, `file:///...`, `about:blank`, `http://localhost:3000`, and a private/internal host if practical. Confirm the diagnostic action is unavailable or returns a clear unsupported/protected-page message.
12. With no permanent active rules, run a failed or timed-out check and then inspect Chrome's proxy setting:

```js
await chrome.proxy.settings.get({ incognito: false });
```

13. Confirm the extension restores normal proxy routing after success, failure, and timeout. If no permanent active rules exist, the extension should clear its proxy setting rather than leaving a temporary probe PAC.
14. Confirm temporary probe state is not written to `chrome.storage.sync` or `chrome.storage.local`.
15. Confirm diagnostics do not add host permissions, `<all_urls>`, `webRequest`, `webNavigation`, notifications, persistent content scripts, telemetry, backend calls, remote PAC URLs, or remote executable code.
16. Add or keep an exact synced rule for the current site, then intentionally set the local proxy port to a wrong or unavailable port.
17. Click "Check via proxy" and confirm the popup does not report "appears reachable"; it should say the site did not appear reachable through the local proxy, with a warning that the existing synced rule is covered but local proxy settings may need attention.
18. Confirm no duplicate synced rule is created by this failed diagnostic check.

## Related-Domain Preview Checks

1. Open a supported `http` or `https` page with visible third-party resources, such as images, scripts, or stylesheets.
2. Confirm no related-domain preview runs when the popup opens.
3. Click "Preview related domains".
4. Confirm the popup shows categorized strong, manually reviewable, or ignored domains when candidates are found.
5. Confirm saveable candidates show a checkbox, domain, short reason, include-subdomains default, and whether an exact or parent rule already covers them.
6. Confirm a checked candidate row is visually obvious, and that already-covered rows are visually distinct from checked rows.
7. Confirm strong candidates are selected only when the engine marks them default-selected.
8. Confirm medium candidates are not selected by default.
9. Confirm ignored analytics/adtech/shared-infrastructure/local-helper candidates are not selected and are not saveable.
10. Confirm obvious noisy hosts such as `stickyadstv.com`, `3lift.com`, `33across.com`, `teads.tv`, `rubiconproject.com`, `demdex.net`, `doubleclick.net`, `google-analytics.com`, `googletagmanager.com`, `facebook.net`, and `hotjar.com` are ignored rather than shown as normal reviewable candidates.
11. Confirm `local.adguard.org` is ignored or absent from the saveable candidate list.
12. Confirm already-covered candidates are marked as covered, are not selected by default, and do not create duplicates.
13. Confirm preview completion uses neutral/info styling and wording such as "No rules were saved yet", not green save-success styling.
14. Confirm the preview lists hostnames only, not full resource URLs with paths, query strings, fragments, or credentials.
15. Confirm collected hosts are not written to `chrome.storage.sync`:

```js
await chrome.storage.sync.get(null);
```

16. Confirm collected hosts are not written to `chrome.storage.local`:

```js
await chrome.storage.local.get(null);
```

17. Confirm no domain rule is added after preview alone.
18. Select one or more saveable candidates and click "Add selected domains".
19. Confirm the save completion uses green success styling and clearly says synced proxy routes were added.
20. Confirm only selected candidates are added to `chrome.storage.sync` as rules with:

- `includeSubdomains` matching the candidate suggestion.
- `mode: "proxy"`.
- `source: "diagnostic"`.

21. Confirm local proxy settings in `chrome.storage.local` are unchanged.
22. Confirm PAC re-application happens through the background storage listener, not through popup calls to `chrome.proxy.settings`.
23. Confirm the preview action alone does not create or modify proxy settings:

```js
await chrome.proxy.settings.get({ incognito: false });
```

24. Open unsupported or protected pages such as `chrome://extensions`, `file:///...`, `about:blank`, `http://localhost:3000`, and a private/internal host if practical. Confirm the preview action is unavailable or returns a clear unsupported/protected-page message.
25. If Chrome reports that the active tab is an error page, or the loaded page visibly shows a server/protection error such as "Error 403 Forbidden" or "Varnish cache server", confirm the popup shows friendly warning copy rather than raw Chrome error text or normal related-domain candidates.
26. Confirm the manifest still has no `host_permissions`, no `<all_urls>`, no `webRequest`, no `webNavigation`, no notifications, and no persistent content scripts.
27. Confirm the preview and save flow does not contact a backend, load remote executable code, or fetch remote PAC data.

## LinkedIn-Like Related-Domain Save Check

1. Configure a working local proxy in Options.
2. Open `https://www.linkedin.com/` or another page that loads `licdn.com` media/static resources.
3. Add or keep a synced rule for `linkedin.com` if needed, route or check the page through proxy, then reload the page so resources load.
4. Open the popup and click "Preview related domains".
5. Confirm `media.licdn.com` and `static.licdn.com`, when observed, appear as manually reviewable medium candidates and are not selected by default.
6. Confirm adtech/tracking hosts such as `demdex.net`, `stickyadstv.com`, `3lift.com`, `33across.com`, `teads.tv`, and `rubiconproject.com`, when observed, do not crowd the normal saveable list.
7. Select `media.licdn.com` and `static.licdn.com`, then click "Add selected domains".
8. Confirm the two selected domains are added as synced proxy rules and that no ignored or unselected candidates are saved.

## Real-World Visible Route Checks

A manual real-world check was performed with `2ip.ru` and `2ip.io` to compare visible IP and city before and after adding a domain route through a configured local proxy.

To repeat this neutral route check:

1. Configure a working local proxy in Options.
2. Visit `https://2ip.ru/` with no matching synced rule and record the visible IP and city.
3. Add a synced domain rule for `2ip.ru` with subdomains included.
4. Reload `https://2ip.ru/` and confirm the visible IP or city reflects the configured local proxy route.
5. Remove the `2ip.ru` rule when finished.
6. Repeat the same check with `https://2ip.io/` if a second route visibility site is useful.
7. Record any proxy-provider, cache, or site availability caveats in the release notes.

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
6. Confirm these checks do not add host permissions, `webRequest`, `webNavigation`, notifications, persistent content scripts, automatic diagnostics, backend calls, telemetry, or remote PAC URLs.

## PAC Apply Checks

1. Start with no enabled rules and apply settings.
2. Confirm Chrome returns to the intended non-extension-managed state instead of receiving a direct-only PAC.
3. Add a test domain rule and apply settings.
4. Confirm matching traffic uses the configured local proxy.
5. Confirm matched PAC entries are fail-closed and do not include a `DIRECT` fallback.
6. Confirm non-matching traffic uses the direct route.
7. Disable extension-managed proxy routing.
8. Confirm Chrome returns to the intended non-extension-managed state.

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

## Release Result

For each release candidate, record:

- Pass/fail status.
- Tester.
- Date.
- Chrome version.
- Notes for any failed check.

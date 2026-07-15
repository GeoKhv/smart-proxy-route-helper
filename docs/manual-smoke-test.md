# Manual Smoke Test

This checklist covers the current Manifest V3 extension scaffold, English/Russian Chrome i18n UI, Popup current-site proxy/direct rule management, manual current-site diagnostics, Options configuration UI, redundant-rule cleanup, Backup and restore, and runtime PAC application.

## v0.2.0 Release Gate Summary

This concise gate was completed before the explicit `0.2.0` version bump. It is designed for a disposable clean Chrome profile or a disposable copy of test data; the owner's main Chrome profile must not be used for destructive update, import, or storage tests.

Release gate result (2026-07-15): **PASS**, as explicitly confirmed by the release owner after the full v0.2.0 must-pass smoke. The supplied confirmation includes final conflict detection and explicit repair, opposite-action duplicate blocking, in-place action editing, a single surviving rule, legitimate parent/child overrides, automatic recording behavior, and the remaining must-pass items below. Chrome version, operating system, build commit, and test-profile name were not supplied with that confirmation and are not inferred here.

### Must Pass Before Version Bump

- [x] Clean install: build `dist/`, load it unpacked in a clean profile, open Popup and Options, and confirm the service worker has no uncaught startup errors.
- [x] Update from v0.1.0 data: in a disposable profile, start with representative `v0.1.0` synced rules that have no `action`, then load the candidate build and confirm every old rule remains present and behaves as a proxy rule.
- [x] Existing proxy rule: confirm an existing proxy rule still routes through the configured local proxy and remains fail-closed when that proxy is unavailable.
- [x] Direct exception: add an exact direct rule below a broader proxy parent and confirm the exact host returns `DIRECT` while the parent domain still uses the proxy.
- [x] Rule precedence: confirm an exact rule wins over a parent rule, the most-specific matching parent wins, and an unmatched host remains `DIRECT`.
- [x] Popup route status: confirm Proxy exact/parent, Direct exact/parent, unconfigured default Direct, and unavailable-proxy warning states are textually distinct and have accessible labels.
- [x] Atomic rule editing: edit action and scope without delete/re-add, confirm broader coverage is previewed, conflicts are handled, child exceptions remain, and one confirmed edit causes one storage change/proxy apply.
- [x] Route-target uniqueness: add `routing-test.test` Proxy with subdomains, then attempt the same target as Direct; confirm Save is blocked and the existing rule is shown for editing.
- [x] Legacy conflict repair: load an isolated fixture with both actions for one target, confirm Options and Popup warn, then verify `Keep Proxy` and `Keep Direct` each leave exactly one selected rule after one storage write.
- [x] Redundant-rule cleanup: run the scan, confirm it only suggests same-action covered rules, confirm the scan removes nothing, then remove one suggestion explicitly.
- [x] Export without proxy config: confirm the default JSON excludes `localSettings`, proxy host/port, recording metadata, collected hosts, and raw URL components.
- [x] Export with proxy config: explicitly enable the option and confirm only the sanitized device proxy configuration is additionally present.
- [x] Import preview/apply: confirm preview makes no storage writes, malformed/internal/private entries are skipped, old rules without `action` preview as proxy, duplicates are not added, and writes occur only after `Apply import`.
- [x] Recording across popup closure: start recording, close the popup, trigger a harmless page action, reopen the popup, and confirm the same session can be stopped or cancelled.
- [x] Automatic failed-request detection: confirm at least one page-level failed or rejected `fetch`, XMLHttpRequest, beacon, resource timing, or failed-resource signal is detected automatically without DevTools or manual URL entry.
- [x] Navigation expiry: reload or navigate the recorded tab and confirm the session becomes expired rather than returning stale candidates or a false empty success.
- [x] Recorder privacy and cleanup: confirm Stop, Cancel, and timeout restore temporary page hooks/listeners; only hostnames appear in preview; no path, query, signature, credential, header, body, file content, or session nonce is exposed or stored.
- [x] Local stable-ID build: using only a disposable public manifest key, run `npm run build:local-stable-id`, confirm `key` exists only in `dist-local/manifest.json`, and confirm source `manifest.json` and normal `dist/manifest.json` remain unkeyed.
- [x] Store-installed update expectations: confirm the planned update targets the existing Store item, keeps the same four permissions, preserves synced rules and device-local proxy settings, and does not require uninstall/reinstall. Actual Store delivery remains a post-review verification step.
- [x] Permission/privacy surface: confirm permissions are exactly `proxy`, `storage`, `activeTab`, and `scripting`; confirm no `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, `debugger`, persistent content scripts, telemetry, backend, or remote executable code.

### Useful but Optional Before Version Bump

- [ ] Repeat the clean-install and routing checks on a second Chrome/Chromium version or operating system.
- [ ] Exercise the recorder on additional sites and frame layouts beyond the confirmed ChatGPT upload scenario.
- [ ] Let a recorder reach its full two-minute timeout and inspect the expired-session UI before stopping or cancelling it.
- [ ] Import a larger sanitized backup with mixed proxy/direct rules and classification overrides to review summary readability and Chrome Sync quota behavior.
- [ ] Test Chrome proxy-control conflicts caused by enterprise policy or another proxy extension.
- [ ] Verify keyboard navigation, focus order, zoom, and screen-reader labels across the new Options sections.
- [ ] Recapture Store screenshots from a sanitized clean profile after the candidate UI is frozen.

The detailed checks below remain the evidence guide for these gates.

## Test Environment

Use a clean Chrome profile when possible.

Record:

- Chrome version.
- Operating system.
- Extension version.
- Whether Chrome Sync is enabled.
- Local proxy type, host, and port used for the test.

## English and Russian Localization Checks

Use two separate disposable temporary profiles: one with English Chrome UI and one with Russian Chrome UI. Keep Chrome Sync signed out. Load the real unpacked build from `dist/`, then interact with it through the visible toolbar popup. Do not use the owner's personal profile, a direct `chrome-extension://` URL, or direct `chrome://extensions` navigation as a substitute for the UI checks below.

### English Profile

1. Open a safe public demo page and open Smart Proxy Route Helper from the toolbar.
2. Confirm the manifest name is `Smart Proxy Route Helper` and no empty text or `__MSG_*__` token is visible.
3. Confirm the current site, route state, explanation, loading/status messages, and accessible status label are in English.
4. Open Related domains through the popup and confirm the heading, empty/result states, candidate reasons, `More actions`, classification actions, and `Back to site status` are in English.
5. Confirm an exact candidate uses `Add <hostname>` and a parent candidate uses `Add <domain> and subdomains`; ordinary subdomains remain unchanged, while a standard `www.` candidate is shown as its canonical registrable domain.
6. Select one and then two safe candidates when available. Confirm the sticky action says `Add 1 selected domain` and `Add 2 selected domains`, remains fully visible, and does not cover the final candidate row.
7. Expand `More actions`, verify its buttons, then use `Back to site status` and confirm the main view is restored.
8. Open Options from the popup and confirm the local proxy, route rules, conflict repair, classification overrides, cleanup, and Backup and restore sections are in English.
9. Trigger safe validation and preview-only conflict/import paths. Confirm dynamic hostnames remain intact and the validation, warning, and preview summaries are in English.
10. Start action-specific recording and confirm the starting and active statuses are in English. Reopen the Popup while recording and confirm the restored active status is still English.
11. Cancel one recording, then start another and stop it after a safe page action. Confirm cancel, completed/preview, no-hosts, expired/reload, and any reachable error states use English text with intact hostnames and no raw message keys.

### Russian Profile

1. Open the same safe public demo page in the separate Russian temporary profile and open the extension from the toolbar.
2. Confirm the Popup, route state, explanations, loading/error states, recording controls, and Related domains UI are in Russian; the manifest name may remain the product name.
3. Confirm the standard labels use consistent product terms, including `Через прокси`, `Напрямую`, `Не настроено`, `Прокси недоступен`, `Конфликт правил`, `Связанные домены`, `Другие действия`, `Вернуться к статусу сайта`, and `Добавлено` where those states are available.
4. Confirm exact and parent candidate actions preserve ordinary subdomains, for example `Добавить status.openai.com` and `Добавить wikipedia.org и поддомены`; a standard `www.` candidate is shown as its canonical registrable domain.
5. Verify the selected-domain action for fixture counts 1, 2, 5, 11, 21, 22, 25, 111, and 112. Expected endings are respectively `домен`, `домена`, `доменов`, `доменов`, `домен`, `домена`, `доменов`, `доменов`, and `доменов`.
6. Confirm `Другие действия` expands, `Вернуться к статусу сайта` works, the sticky action is not clipped, long labels wrap without leaving button boundaries, and no control overlaps another control.
7. Open Options from the popup and confirm every main section, label, action, validation message, conflict repair action, export/import summary, and empty state is in Russian.
8. Check keyboard focus and the accessibility tree for the primary route status, candidate selection, added state, More actions disclosure, Back button, and conflict-repair controls. Confirm localized labels are present and hostname substitutions are unchanged.
9. Start action-specific recording and confirm the starting and active statuses are in Russian. Close and reopen the Popup while recording and confirm the restored active status remains Russian.
10. Cancel one recording, then start another and stop it after a safe page action. Confirm cancel, completed/preview, no-hosts, expired/reload, and any reachable error states are in Russian, preserve every displayed hostname, contain no English recording sentence, and show no raw message keys or empty text.

### Locale Fallback and Build

1. Confirm source `manifest.json` has `default_locale: "en"` and uses `__MSG_extensionName__` / `__MSG_extensionDescription__`.
2. Confirm `dist/_locales/en/messages.json` and `dist/_locales/ru/messages.json` exist after the production build and have matching key sets.
3. Start Chrome with an unsupported UI locale in a disposable profile if practical and confirm the extension falls back to English.
4. Confirm changing the browser locale, rather than extension storage, controls the language. No language selector or language storage key should exist.
5. Confirm localization causes no translation network request and adds no permission, host permission, persistent content script, backend, telemetry, or remote executable code.

## WWW Canonicalization Checks

Use a clean temporary Chrome profile with Sync signed out and the real unpacked build from `dist/`. Interact through the visible toolbar popup; do not use the owner's personal profile or direct `chrome-extension://` navigation.

1. Open `https://www.wikipedia.org` and open Smart Proxy Route Helper from the toolbar.
2. Confirm the prospective exact rule is shown as `wikipedia.org`, then add it and confirm the Popup shows an exact match for the canonical rule.
3. Open `https://wikipedia.org`, reopen the Popup, and confirm the same exact rule is effective.
4. Open Options and confirm there is exactly one `wikipedia.org` rule and no separate `www.wikipedia.org` entry.
5. Enter `www.wikipedia.org` manually for a new Proxy or Direct exact rule and confirm the saved/duplicate/conflict result uses `wikipedia.org` after normal validation.
6. Edit a safe rule to `www.wikipedia.org`, preview the change, and confirm the proposed/saved hostname is `wikipedia.org` while ID, source, and creation time are preserved.
7. Preview related domains from sanitized public data containing both `example.com` and `www.example.com`. Confirm one `example.com` candidate is shown, both observed hostnames remain in the evidence/count, and individual or batch add creates only `example.com`.
8. Preview an import containing `example.com` plus `www.example.com` with the same action and scope. Confirm Preview reports one canonical importable rule plus a duplicate, Apply writes only `example.com`, and export format/version remain unchanged.
9. Confirm exact `example.com` matches `example.com` and `www.example.com`, but not `www1.example.com`, `www2.example.com`, `api.example.com`, `deep.www.example.com`, or `www.status.example.com` when the rule is for `status.example.com`.
10. Repeat the touched Popup and Options states with English and Russian browser UI. Confirm the canonical hostname is unchanged by translation and no empty or hardcoded user-facing string appears.
11. Do not test real external proxy traffic unless the disposable profile has a known-safe local proxy configuration. Automated PAC/TypeScript parity tests are the required fallback for route application.

No old-rule migration is expected in this check. Previously stored `www.` data is not repaired or merged automatically; this feature applies to future operations.

## Pre-Release Checks

1. Confirm the extension loads as an unpacked Manifest V3 extension.
2. Confirm requested permissions match the current release plan.
3. Confirm no required host permissions appear in the MVP.
4. Confirm the extension has no telemetry or backend requests.
5. Confirm diagnostics are manual only and start only after the user clicks "Check via proxy".
6. Confirm related-domain preview starts only after the user clicks "Preview related domains".
7. Confirm diagnostic recording starts only after the user clicks "Start recording".
8. Confirm recording can be stopped with "Stop and preview" or cancelled with "Cancel recording".
9. Confirm related-domain preview and recording do not store, sync, send, or automatically save collected hosts or diagnostic summary counts.
10. Confirm related-domain suggestions are saved only after the user clicks a scope-specific candidate add action or selects candidates and confirms the sticky batch action.
11. Confirm classification overrides are saved only after explicit candidate-row actions and do not create proxy routing rules.
12. Confirm settings export/import is local and user-controlled, with preview before apply and no cloud upload.
13. Confirm direct exceptions and redundant-rule cleanup require explicit user action and do not delete or add rules automatically.

## Current Runtime Checks

1. Run `npm install`.
2. Run `npm test`.
3. Run `npm run build`.
4. Load `dist/` as an unpacked extension in Chrome.
5. Open the popup on a regular `http` or `https` site and confirm the current domain renders.
6. Open the options page and confirm local proxy settings, synced domain rules, classification overrides, read-only denylist/ignored-domain sections, and Backup and restore render.
7. Inspect the service worker and confirm it starts without uncaught errors.
8. Confirm no automatic diagnostics, backend calls, telemetry, persistent content scripts, or host permissions are present.
9. Confirm manifest permissions are `proxy`, `storage`, `activeTab`, and `scripting`.
10. Confirm `host_permissions` remains absent.
11. Confirm current-page resource host collection runs only from explicit related-domain preview or diagnostic recording actions.

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
10. Confirm the PAC entry for matching proxy rules returns a strict proxy string such as `SOCKS5 127.0.0.1:10808`, without `; DIRECT`.
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
9. Confirm both rules appear in the Options list with Proxy route action, source metadata, and subdomain scope.
10. Confirm the rules are stored in `chrome.storage.sync`:

```js
await chrome.storage.sync.get(["rules"]);
```

11. Try to add `localhost`, `192.168.1.1`, and `chrome://extensions`; confirm inline validation rejects them.
12. Add `www.example.com` as an exact Direct exception. Confirm it is saved and displayed as canonical `example.com` exact and can coexist with a broader `example.com` Proxy include-subdomains rule.
13. Add a redundant same-action child such as `media.linkedin.com` with subdomains included while `linkedin.com` Proxy with subdomains already exists.
14. Click "Find redundant rules" and confirm a cleanup suggestion appears.
15. Confirm no rule is removed by the scan alone.
16. Click the suggestion's remove button and confirm only that suggested redundant rule is removed after the explicit click.
17. Confirm a direct child under a proxy parent and a proxy child under a direct parent are not suggested as redundant.
18. Click Edit on an exact rule and confirm hostname/domain, Proxy/Direct action, and explicit scope choices are editable without removing the stored rule first.
19. Confirm the scope list offers Exact hostname only and This hostname and its subdomains, plus Parent domain and all subdomains only for a safe PSL-aware child target.
20. Preview an exact `child.example.com` Proxy rule as `example.com` plus subdomains. Confirm Current rule, Proposed rule, coverage examples, and "This rule will apply to more hostnames" appear before Save changes is enabled.
21. Keep a Direct child exception under the proposed broader Proxy rule. Confirm the preview says the Direct exception will continue to win and does not offer to delete it.
22. Create a same-target duplicate or opposite-action conflict in disposable data and confirm Save is blocked. Confirm same-action children that would become redundant are previewed but not removed.
23. Save a valid edit and confirm the rule keeps its source and creation timestamp, remains one rule at the same list position, and the UI refreshes without a page reload.
24. Confirm the Options page does not call `chrome.proxy.settings` directly; one synced storage update should cause one background proxy application.
25. If classification overrides exist, confirm they appear in the "Classification overrides" section.
26. Remove one classification override and confirm it is removed from `chrome.storage.sync.classificationOverrides` without changing synced routing rules.

## Route-Target Uniqueness and Legacy Repair — Must Pass

Use only a disposable Chrome profile or isolated fixture data. Do not inject a contradictory pair into real synced settings.

### A. Existing Target

1. In Options, add `routing-test.test` as Proxy with `This hostname and its subdomains`.
2. Attempt to add `routing-test.test` as Direct with the same scope.
3. Confirm Save is blocked with `A Proxy rule already exists for this hostname and scope.` and an `Edit existing rule` path.
4. Confirm exactly one `routing-test.test` include-subdomains rule remains.

### B. Edit in Place

1. Click Edit on the existing Proxy rule.
2. Change only its action to Direct, preview, and Save.
3. Confirm the same rule is updated in place: one rule remains, its stable ID/source/createdAt are preserved, and action is Direct.
4. Reopen the Popup for `child.routing-test.test` and confirm it shows `Direct` through the parent rule.
5. Repeat Direct to Proxy and confirm the same one-rule invariant.

### C. Legacy Conflict Repair

1. In an isolated fixture, load both Proxy and Direct rules for `routing-test.test` with `includeSubdomains: true`.
2. Confirm Options shows `Conflicting route rules`, both actions, the temporary effective action, and explicit `Keep Proxy` / `Keep Direct` buttons instead of two healthy independent list entries.
3. Confirm the Popup shows `Conflicting rules`, states the currently effective action, and does not present it as a healthy Proxy/Direct state.
4. Click `Keep Proxy`. Confirm one Proxy rule remains, the Direct sibling is removed in one sync write, and normal Popup state returns.
5. Restore the isolated fixture, click `Keep Direct`, and confirm the symmetric one-write result.
6. Confirm neither sanitization nor load deleted either action before explicit resolution.
7. Confirm a parent Proxy plus child Direct and a parent Direct plus child Proxy remain valid and are not reported as same-target conflicts.

## Backup and Restore Checks

Use a clean Chrome profile or sanitized demo data for import apply checks. Do not overwrite real user settings. If a clean profile or safe demo state is unavailable, stop before applying import and record the blocker.

1. Open Options and confirm the "Backup and restore" section renders.
2. Confirm the "Include local proxy config for this device" checkbox is unchecked by default.
3. Configure a local proxy such as `socks5`, `127.0.0.1`, `10808`, and add a safe route rule such as `example.com`.
4. Click "Export settings" with the local proxy checkbox unchecked.
5. Confirm the generated JSON contains:

- `format: "smart-proxy-route-helper-settings"`.
- `version: 1`.
- `data.syncSettings.rules`.
- No `localSettings`.
- No local proxy host or port.

6. Check the local proxy checkbox and click "Export settings" again.
7. Confirm the generated JSON includes `data.localSettings.deviceProxy` and that the local proxy host/port appear only in this explicit export.
8. Confirm exported synced data is domain-level only and does not include raw URLs, paths, query strings, fragments, collected resource hosts, diagnostic session data, page text, cookies, screenshots, file contents, telemetry, backend data, or remote executable code.
9. Paste malformed JSON into Import JSON and click "Preview import"; confirm an error appears and "Apply import" remains disabled.
10. Paste a wrong-format JSON document and click "Preview import"; confirm an unsupported format/version error appears and nothing is written.
11. Paste a small safe demo import JSON, for example:

```json
{
  "format": "smart-proxy-route-helper-settings",
  "version": 1,
  "exportedAt": "2026-06-29T00:00:00.000Z",
  "data": {
    "syncSettings": {
      "rules": [
        {
          "domain": "https://Example.com/path?token=secret",
          "includeSubdomains": true,
          "action": "proxy",
          "mode": "proxy"
        },
        {
          "domain": "www.example.com",
          "includeSubdomains": false,
          "action": "direct",
          "mode": "proxy"
        },
        {
          "domain": "192.168.1.1",
          "includeSubdomains": true,
          "mode": "proxy"
        }
      ],
      "ignoredDomains": [],
      "denylist": [],
      "classificationOverrides": {
        "global": {
          "https://Track.Example/path?secret=1": "ignored"
        },
        "site": {}
      }
    }
  }
}
```

12. Click "Preview import" and confirm the preview appears before apply.
13. Confirm the preview summarizes route rules, classification overrides, local proxy inclusion, skipped protected domains, and warnings/errors.
14. Confirm `example.com` and `track.example` are normalized and that path/query data such as `token=secret` is not written to storage.
15. Confirm protected/internal/private domains such as `192.168.1.1`, `localhost`, and `chrome://extensions` are skipped.
16. Confirm `chrome.storage.sync` and `chrome.storage.local` are unchanged after preview alone.
17. In a clean profile or safe demo state only, click "Apply import".
18. Confirm imported route rules and classification overrides are written to `chrome.storage.sync` only after apply.
19. Confirm old imports without `action` are treated as proxy rules, direct imports keep `action: "direct"`, invalid action values are skipped, and same-action duplicate targets are reported without being added twice.
20. Preview a file containing Proxy and Direct for the same normalized domain/scope; confirm both actions are listed as a conflict and Apply remains disabled.
21. Preview a rule whose target has the opposite action in current storage; confirm the conflict is listed and Apply remains disabled.
22. Change synced rules after a valid preview, then attempt Apply; confirm stale final validation blocks the write and requires a new preview.
23. Confirm local proxy config is not changed unless the import JSON contains `data.localSettings.deviceProxy` and the user explicitly applies that preview.
24. Confirm Options still does not call `chrome.proxy.settings` directly; proxy re-application should happen through the background storage listener after storage changes.
25. Confirm export is blocked with an explicit warning while a legacy route-target conflict remains unresolved.
26. Confirm export/import does not add permissions, host permissions, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, backend calls, telemetry, remote list fetching, or remote executable code.

## Popup Current-Site Checks

Use a clean profile or disposable test rules. Do not modify unrelated real rules.

1. Open `https://child.routing-test.test/` and open the extension popup.
2. With no matching rule, confirm the primary state is "Not configured" and the explanation is "No matching rule. Default route is direct."
3. Confirm the exact-host quick-action text is "Proxy this hostname" / "Route this hostname directly" and the microcopy says "Applies to this exact hostname only."
4. Click "Proxy this hostname".
5. Confirm the primary state updates immediately to "Through proxy" with "Exact rule for child.routing-test.test" and the rule is stored with:

- `domain: "child.routing-test.test"`.
- `includeSubdomains: false`.
- `action: "proxy"`.
- `mode: "proxy"`.
- `source: "manual"`.

6. Click "Change scope", choose Parent domain and all subdomains, and confirm the preview proposes `routing-test.test` plus subdomains while preserving Proxy.
7. Confirm the change. Verify no duplicate `child.routing-test.test` rule remains and the popup immediately shows "Through proxy" with "Covered by parent rule routing-test.test".
8. Open Options and edit that same rule to Direct. Preview and Save; confirm the popup then shows "Direct" with "Direct through parent rule routing-test.test".
9. Edit the parent back to Proxy.
10. On `child.routing-test.test`, use "Route this hostname directly" to add an exact Direct exception. Confirm "Direct" / "Exact direct rule for child.routing-test.test" wins.
11. Click "Remove exact rule" and confirm the status immediately returns to "Through proxy" / "Covered by parent rule routing-test.test".
12. Disable or invalidate the local proxy while the Proxy parent still matches. Confirm the popup shows a warning state such as "Proxy unavailable", not a healthy "Through proxy" state.
13. In a clean-profile/demo context, open `https://www.linkedin.com/`, use a Popup quick action, and confirm the stored rule remains exact `www.linkedin.com` with `includeSubdomains: false` until Change scope is explicitly confirmed.
14. Confirm the popup status uses visible text as well as the colored/outlined indicator and exposes an accessible status label.
15. Remove only the disposable `routing-test.test` rules created by this smoke.
16. Open unsupported pages such as `chrome://extensions`, `chrome-extension://...`, `file:///...`, `about:blank`, `http://localhost:3000`, and a private or internal host if practical. Confirm the popup shows a clear unsupported/protected-page message and does not offer to add a rule.
17. Confirm the popup can open Options through the "Open Options" button.
18. Confirm the popup shows a "Check via proxy" button on supported sites.
19. Confirm the popup shows a "Preview related domains" button on supported sites.
20. Confirm the popup shows "Start recording" on supported sites when no recording is active.
21. Confirm the popup shows "Stop and preview" and "Cancel recording" when a recording is active for the current tab.
22. Confirm the popup explains when a recording belongs to another tab and does not offer stop-and-preview from the wrong tab.
23. Confirm the popup does not call `chrome.proxy.settings` directly; proxy application should happen through the background service worker.

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

- `domain` equal to the current hostname, including the `www.*` label when present.
- `includeSubdomains: false` for every current hostname unless scope is changed later through the separate preview-and-confirm flow.
- `action: "proxy"`.
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
4. Confirm the popup separates saveable strong candidates, saveable manually reviewable candidates, already-covered candidates, and ignored candidates when those groups are present.
5. Confirm saveable candidates show a checkbox, the suggested rule domain that will be saved, short reason, include-subdomains default, and sanitized observed hostnames.
6. Confirm already-covered candidates are read-only, show whether an exact or parent rule covers them, and do not show active checkboxes.
7. Confirm strong candidates are selected only when the engine marks them default-selected.
8. Confirm medium candidates are not selected by default.
9. Confirm ignored analytics/adtech/shared-infrastructure/local-helper candidates are not selected and are not saveable.
10. Confirm obvious noisy hosts such as `stickyadstv.com`, `3lift.com`, `33across.com`, `teads.tv`, `rubiconproject.com`, `demdex.net`, `doubleclick.net`, `google-analytics.com`, `googletagmanager.com`, `facebook.net`, and `hotjar.com` are ignored rather than shown as normal reviewable candidates.
11. Confirm `local.adguard.org` is ignored or absent from the saveable candidate list.
12. Confirm schema/helper hosts such as `www.w3.org` and `w3.org` are ignored or absent from the saveable candidate list.
13. Confirm already-covered candidates are marked as covered, are not selected by default, and do not create duplicates.
14. Confirm preview completion uses neutral/info styling and wording such as "No rules were saved yet", not green save-success styling.
15. Confirm candidate-row classification override actions, such as "Ignore globally", "Ignore for site", "Review globally", or "Suggest for site", are visually secondary inside a keyboard-accessible "More actions" disclosure with correct expanded-state semantics.
16. Expand "More actions", click an override action, and confirm the preview refreshes with a success status.
17. Confirm the override is stored in `chrome.storage.sync.classificationOverrides` as normalized domains only:

```js
await chrome.storage.sync.get(["classificationOverrides"]);
```

18. Confirm saving the override does not add or change entries in `chrome.storage.sync.rules`.
19. Confirm the preview lists hostnames only, not full resource URLs with paths, query strings, fragments, or credentials.
20. Confirm collected hosts are not written to `chrome.storage.sync`:

```js
await chrome.storage.sync.get(null);
```

21. Confirm collected hosts are not written to `chrome.storage.local`:

```js
await chrome.storage.local.get(null);
```

22. Confirm no domain rule is added after preview alone.
23. Confirm every saveable row has a primary add action that names the actual saved target and scope: exact hostname actions name that hostname, while parent rules explicitly say "and subdomains".
24. Click one candidate's add action without selecting its checkbox. Confirm only that candidate is added, the row becomes `Added` and cannot be selected or added again, the preview remains open, and checkbox state on every other candidate is preserved.
25. Select one candidate. Confirm a sticky footer appears at the bottom of the scrolling candidate view with `Add 1 selected domain` and remains visible while scrolling a long list.
26. Select another candidate and then clear one selection. Confirm the footer count immediately changes between singular and plural and the footer does not cover the final candidate row.
27. Use the sticky batch action. Confirm submitted checkboxes clear after success, the footer disappears, successfully added rows cannot be selected or added again, and unselected candidates remain available.
28. Confirm the save completion uses green success styling and clearly says synced proxy routes were added.
29. Confirm only explicitly added or batch-selected candidates are added to `chrome.storage.sync` as rules with:

- `domain` matching the candidate's suggested rule domain, not necessarily the exact observed host.
- `includeSubdomains` matching the candidate suggestion.
- `action: "proxy"`.
- `mode: "proxy"`.
- `source: "diagnostic"`.

30. Confirm local proxy settings in `chrome.storage.local` are unchanged.
31. Confirm PAC re-application happens through the background storage listener, not through popup calls to `chrome.proxy.settings`.
32. Confirm the preview action alone and classification override actions do not create or modify proxy settings:

```js
await chrome.proxy.settings.get({ incognito: false });
```

33. Click "Back to site status" and confirm the related-domain view closes and the ordinary current-site route status and actions remain available.
34. Open unsupported or protected pages such as `chrome://extensions`, `file:///...`, `about:blank`, `http://localhost:3000`, and a private/internal host if practical. Confirm the preview action is unavailable or returns a clear unsupported/protected-page message.
35. If Chrome reports that the active tab is an error page, or the loaded page visibly shows a server/protection error such as "Error 403 Forbidden" or "Varnish cache server", confirm the popup shows friendly warning copy rather than raw Chrome error text or normal related-domain candidates.
36. If preview finds no page resource hosts, confirm the popup says to reload the page and preview again and shows compact diagnostic counts such as inspected performance entries, inspected DOM attributes, URL-like values, sanitized hosts, and saveable candidates.
37. If resource hosts were found but all are analytics/adtech/local helper/schema domains, confirm the popup says those hosts were filtered and no rules were saved.
38. If resource hosts were found but all reviewable candidates are already covered by existing rules, confirm the popup says the hosts are already covered and no duplicate rules are saved.
39. Confirm the manifest still has no `host_permissions`, no `<all_urls>`, no `webRequest`, no `webNavigation`, no notifications, and no persistent content scripts.
40. Confirm the preview, override, and save flow does not contact a backend, load remote executable code, or fetch remote PAC data.

## Related-Domain Recording Checks

1. Open a supported `http` or `https` page.
2. Confirm no diagnostic recording starts when the popup opens.
3. Click "Start recording".
4. Confirm the popup says the recording is active for the current domain and that no data is saved until selected domains are added.
5. Close the popup, perform a page action that may load extra resources, then reopen the popup on the same tab.
6. Confirm the popup shows "Stop and preview" and "Cancel recording".
7. Click "Stop and preview".
8. Confirm recorded candidates render in the existing related-domain preview UI and the status says they were recorded during this session.
9. Confirm an ordinary page-level `fetch`, XMLHttpRequest, or beacon attempt can be captured even when it later rejects, fails, or returns false.
10. Confirm new resource timing entries that occur after Start are observed without relying only on a Stop-time snapshot.
11. If Chrome reports dropped resource timing entries, confirm the transient preview details report the count.
12. Confirm stopping the recording alone does not add or change entries in `chrome.storage.sync.rules`.
13. Confirm candidates are saved only after a scope-specific individual add click or the sticky selected-candidate batch action and that new route actions default to proxy.
14. Start another recording, reopen the popup on a different tab, and confirm the popup says the recording belongs to another tab.
15. From the different tab, click "Cancel recording" and confirm no candidates are returned, original page request functions are restored, and no rules are saved.
16. Start another recording and wait past the duration cap. Reopen the popup on the recorded tab and confirm the recording can be stopped and previewed or cancelled and that temporary hooks/listeners are no longer active.
17. Reload or navigate the recorded tab during recording, then try to stop. Confirm the popup reports an expired/reloaded recording rather than claiming that no related domains exist.
18. Confirm recorded host output contains hostnames only, not full URLs with paths, query strings, signatures (`sig`, `se`, or `sp`), fragments, credentials, headers, bodies, cookies, response contents, page text, form values, uploaded file contents, screenshots, or auth/session data.
19. If nothing is captured, confirm the popup explains that some worker, service-worker, extension, or browser-level requests may be outside the privacy-preserving recorder. It must not recommend DevTools inspection or manual URL entry.
20. Confirm recorded hosts are not written to `chrome.storage.sync`:

```js
await chrome.storage.sync.get(null);
```

21. Confirm recorded hosts are not written to `chrome.storage.local`:

```js
await chrome.storage.local.get(null);
```

22. Confirm only transient metadata appears in `chrome.storage.session` while recording is active:

```js
await chrome.storage.session.get(null);
```

23. Confirm metadata is cleared or expired in `chrome.storage.session` after stop, cancel, navigation, timeout, or tab close.
24. Confirm recording uses no `host_permissions`, no `<all_urls>`, no `webRequest`, no `webNavigation`, no `chrome.debugger`, no persistent content scripts, no backend calls, no telemetry, no remote PAC URLs, no remote executable code, and no remote list fetching.
25. Confirm the popup and Options contain no field for pasting a failed URL or hostname.

## ChatGPT/OpenAI Diagnostic Recording Upload Check

1. Use a separate clean Chrome profile or isolated sanitized demo profile where `oaiusercontent.com` is not already covered. Do not alter the user's normal profile for this smoke.
2. Configure a working local proxy in Options only if the isolated profile needs it.
3. Open `https://chatgpt.com/` through the normal toolbar flow.
4. If ChatGPT is not logged in, blocked by captcha, inaccessible, or shows private data that cannot be kept out of the smoke, stop and record the blocker.
5. Create a temporary harmless text file such as `sprh-recording-smoke.txt` containing no private data.
6. Open the extension from the Chrome toolbar and click "Start recording".
7. Attach the temporary text file in ChatGPT.
8. Wait for the upload attempt or visible upload failure.
9. Do not send the chat message.
10. Reopen the extension from the Chrome toolbar and click "Stop and preview".
11. Confirm a generated host such as `sdmntpritalynorth.oaiusercontent.com` was captured automatically without DevTools, console inspection, Network-panel inspection, URL copying, or manual hostname entry.
12. Confirm the suggested route target is `oaiusercontent.com` with subdomains included, not an exact generated-host rule.
13. Confirm no raw URL, file path, query, `sig`, `se`, `sp`, credentials, headers, body, cookie, response content, page text, or file content appears in the popup, storage, logs, or export.
14. Confirm no route rule was saved automatically before an explicit individual or batch add action.
15. Do not save the rule unless this is isolated demo data and saving is explicitly part of the smoke.
16. Delete the temporary text file.
17. If the request is still not captured, record whether it appears to originate from a worker, service worker, extension, or browser context outside the standard page recorder. Do not add or recommend a manual paste field; treat broader opt-in deep diagnostics as a separate future design.

## ChatGPT/OpenAI Related-Domain Save Check

1. Configure a working local proxy in Options.
2. Open `https://chatgpt.com/` and use a feature that loads generated or file-related resource hosts if practical.
3. Open the popup and click "Preview related domains".
4. If a generated host such as `sdmntpritalynorth.oaiusercontent.com` or `files.oaiusercontent.com` is observed, confirm the saveable candidate is `oaiusercontent.com`, not only the exact generated host.
5. Confirm the candidate says subdomains will be included and lists the observed hostnames.
6. Click `Add oaiusercontent.com and subdomains` on the candidate row.
7. Confirm `chrome.storage.sync.rules` contains one diagnostic-sourced rule for `oaiusercontent.com` with `includeSubdomains: true`.
8. Confirm an exact rule for a generated host such as `sdmntpritalynorth.oaiusercontent.com` does not cause the popup to treat `files.oaiusercontent.com` as covered.
9. Confirm a rule for `oaiusercontent.com` with subdomains included covers sibling hosts such as `files.oaiusercontent.com`.
10. Confirm the preview action alone does not save rules and no remote list or backend request is made.

## LinkedIn-Like Related-Domain Save Check

1. Configure a working local proxy in Options.
2. Add or keep synced proxy rules for `linkedin.com` or `www.linkedin.com`, then route or check the site through proxy.
3. Open `https://www.linkedin.com/feed/` or another loaded LinkedIn feed page that includes `licdn.com` media/static resources, then reload the loaded feed page so DOM resource attributes and performance entries are available.
4. Open the popup and click "Preview related domains".
5. Confirm observed hosts such as `media.licdn.com`, `static.licdn.com`, and `dms.licdn.com` are grouped under a `licdn.com` known related-domain candidate with subdomains included.
6. Confirm `linkedin.com` with subdomains included covers `www.linkedin.com`, but does not cover `media.licdn.com`, `static.licdn.com`, or the suggested `licdn.com` route target.
7. If a synced rule for `licdn.com` with subdomains included exists, confirm the `licdn.com` candidate is marked already covered and is not saveable.
8. Confirm `licdn.com` with subdomains included covers `media.licdn.com`, `static.licdn.com`, and `dms.licdn.com`.
9. Confirm the popup does not show "No page resource hosts were found" when valid `licdn.com` resource hosts are present in resource timing, `img`/`source` `srcset`, lazy-loading `data-*` attributes, inline or computed style `url(...)`, link preload/preconnect, script resources, or accessible open shadow roots.
10. If every collected reviewable host is already covered, confirm the popup says resource hosts were found but are already covered.
11. If every collected host is filtered noise, confirm the popup says resource hosts were found but look like analytics/adtech/local or schema helper domains.
12. Confirm adtech/tracking/local/schema helper hosts such as `demdex.net`, `stickyadstv.com`, `3lift.com`, `33across.com`, `teads.tv`, `rubiconproject.com`, `local.adguard.org`, and `www.w3.org`, when observed, do not crowd the normal saveable list.
13. If no saveable candidates appear, confirm the preview details show counts and only sanitized hostnames, never full URLs with paths, query strings, fragments, or credentials.
14. Select `licdn.com`, then use the sticky selected-domain batch action.
15. Confirm one synced proxy rule is added for `licdn.com` with `includeSubdomains: true` and that no ignored, already-covered, or unselected candidates are saved.

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
  denylist: [],
  classificationOverrides: {
    global: {},
    site: {}
  }
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

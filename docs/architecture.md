# Architecture

This document describes the v0.1.0 MVP architecture. The repository contains an MV3 TypeScript runtime, pure modules for domain rules, PAC generation, related-domain classification, typed storage helpers, an Options UI for local proxy settings, synced manual rules, and classification override management, a Popup UI for current-site rule management, manual diagnostics, related-domain preview, and explicit classification override actions, and a background runtime layer that applies extension-managed PAC settings.

## Design Principles

- Manifest V3 only.
- Plain Chrome extension APIs.
- Simple popup/options HTML and TypeScript for MVP.
- Local-first behavior with no backend.
- No telemetry.
- No backend.
- No remote executable code.
- No runtime remote list fetching.
- Permission-minimal design.
- Pure business logic modules for validation, normalization, storage mapping, and PAC generation.

## Planned Runtime Parts

### Extension UI

Popup:

- Detect the active tab URL after the user opens the popup.
- Show the normalized current domain for supported `http` and `https` pages.
- Show whether the current domain is routed by an exact rule, inherited from a parent `includeSubdomains` rule, blocked by internal protection or synced denylist, or currently direct.
- Add a manual synced rule for the current domain only after an explicit user click.
- Remove exact current-domain rules only; parent inherited rules must be edited from Options.
- Start a current-site diagnostic only after the user clicks "Check via proxy".
- Offer to save a diagnostic-sourced synced rule only after a successful check, and only after a second explicit confirmation.
- Preview related-domain candidates from current-page resource hosts only after the user clicks "Preview related domains".
- Let the user explicitly select previewed related-domain candidates and save only those selected candidates as synced diagnostic-sourced rules.
- Let the user explicitly save personal classification overrides for preview candidates without creating proxy routing rules.
- Provide quick access to Options.

The popup does not inspect page content on open, add rules automatically, request host permissions, or call `chrome.proxy.settings` directly.

Options page:

- Configure local proxy settings.
- Manage domain rules.
- Show and remove synced personal classification overrides.
- Show which settings are local to this device and which domain rules are synced.
- Show storage status for saves, additions, and removals.
- Provide reset/export affordances only after implementation design is settled.

### Extension Service Worker

The service worker currently coordinates:

- Reading synced domain rules.
- Reading local proxy configuration.
- Generating PAC data locally.
- Applying proxy settings through `chrome.proxy`.
- Reacting to relevant storage changes.
- Handling current-site diagnostic messages from the popup.
- Handling current-page related-domain preview messages from the popup.
- Reading synced classification overrides for explicit related-domain preview classification.

It does not yet report current apply status to the UI.

### Pure Modules

Core logic is isolated from Chrome APIs where practical:

- Domain normalization and validation.
- Proxy configuration validation.
- Domain rule model and migrations.
- PAC generation.
- Storage serialization and migration helpers.
- Diagnostic decision helpers for current-site target validation, temporary probe planning, and conservative result mapping.
- Related-domain candidate suggestions from caller-provided observed hosts or URLs.
- Domain candidate classification from local built-in data, caller-provided user override inputs, and conservative heuristics.
- Current-page resource host sanitization and preview planning.

These modules should be unit-tested without Chrome.

## Data Boundaries

### Synced Storage

Use `chrome.storage.sync` for domain routing rules because users should be able to keep the same domain list across Chrome profiles.

Current synced data:

- Domain rules.
- Ignored domains.
- Denylist entries.
- Personal classification overrides for related-domain preview, stored as normalized domain-level global and site-scoped preferences.
- Safe rule metadata such as manual/import/diagnostic source and creation time.

Do not store local proxy host, port, credentials, device state, raw URLs, page resource lists, browsing history, diagnostics history, temporary preview/probe state, or local proxy availability results in synced storage.

### Local Storage

Use `chrome.storage.local` for settings that are specific to one Chrome installation.

Current local data:

- Local proxy scheme.
- Local proxy host.
- Local proxy port.
- Device proxy enabled/disabled state.
- Local diagnostics preference.

Do not store telemetry, browsing history, raw URLs, raw diagnostic history, secrets, synced proxy host/port values, collected page resource hosts, or temporary probe state.

## Planned Domain Rule Semantics

The MVP keeps rule semantics simple:

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

- Route matching domain rules through the configured local proxy without a `DIRECT` fallback.
- Route everything else directly.
- Avoid including unsanitized user input.
- Match exact domains and dot-boundary subdomains only, without unsafe substring matching.
- Be deterministic for the same input.
- Be small enough for straightforward review.

The pure PAC generation module does not apply proxy settings by itself. Runtime application is isolated in the background service worker layer, behind a small adapter for `chrome.proxy.settings`.

The runtime uses inline PAC `data` generated by the extension. It does not use remote PAC URLs, fetch remote configuration, or execute remotely supplied code.

Chrome proxy API reference: https://developer.chrome.com/docs/extensions/reference/api/proxy

## Proxy State and Conflicts

Chrome proxy settings may also be controlled by another extension, enterprise policy, or user configuration.

The extension should:

- Detect when its settings are not controllable, if the API exposes that state.
- Show a clear status instead of silently failing.
- Avoid overwriting user intent outside the extension's enabled/disabled controls.
- Restore a predictable state when extension-managed routing is turned off.

Current runtime behavior:

- If local device proxy settings are enabled, contain a valid local proxy config, and at least one synced rule remains after sanitization, the service worker builds a PAC script from the sanitized rules and applies it with `chrome.proxy.settings.set`.
- Matching proxy rules are fail-closed by default: if the configured local proxy is unavailable, Chrome should fail the matched request instead of silently falling back to the direct route.
- If the sanitized rule list is empty, the service worker calls `chrome.proxy.settings.clear` for the regular profile instead of applying a direct-only PAC.
- If the local proxy config is missing, disabled, or sanitized as invalid, the service worker calls `chrome.proxy.settings.clear` for the regular profile.
- Clearing is intentional: it releases this extension's proxy setting and lets Chrome return to the user's/system proxy state. Setting Chrome to `direct` would keep the extension controlling all traffic and could override user or system proxy intent.
- Proxy API errors are caught and logged; they must not produce uncaught service worker exceptions.

## Diagnostics Architecture

Current-site diagnostics are manual and best-effort. They are designed to help the user decide whether the current site appears reachable through the configured local proxy before saving a permanent synced rule.

The current diagnostic flow:

- Requires the user to open the popup on a supported `http` or `https` page and click "Check via proxy".
- Uses the existing `activeTab` permission for temporary current-tab URL/origin access after that user gesture.
- Rejects browser/internal pages, local/private/internal hosts, invalid domains, and synced denylist matches.
- Requires a valid enabled local proxy configuration. If it is missing, the popup shows "Configure local proxy in Options first."
- Sends a runtime message to the background service worker with the current URL.
- Builds a temporary strict PAC from permanent synced rules plus a diagnostic probe rule for the current normalized domain when no existing synced proxy rule already covers it.
- Applies the temporary PAC through the background proxy adapter.
- Makes a short best-effort fetch to the current tab origin from the extension context.
- Restores normal proxy routing afterward, including clearing extension-controlled proxy settings when there are no permanent active rules.
- Returns cautious results such as "appears reachable" or "did not appear reachable"; it does not claim absolute site availability.
- Does not treat direct-route fallback as proxy success. A failed local proxy path should return an unreachable result even when a synced rule already covers the site.

Diagnostic probe state is not written to sync or local storage. A permanent synced rule is created only if the user explicitly clicks the follow-up add button after a successful check. That saved rule uses `source: "diagnostic"`.

Current-site diagnostics do not use `webRequest`, `webNavigation`, content scripts, notifications, host permissions, `<all_urls>`, telemetry, backend services, remote PAC URLs, or remote executable code. Chrome Web Store review risk should be reconsidered before adding broader diagnostic permissions or any remote resource.

### Current-Page Related-Domain Preview

The current-page related-domain preview is an explicit, user-invoked diagnostics helper. Preview and saving are separate actions: the extension may collect current-page resource hostnames only after the user clicks "Preview related domains", and it may save related-domain rules only after the user selects candidates and clicks the follow-up add button.

The preview flow:

- Requires the user to open the popup on a supported `http` or `https` page and click "Preview related domains".
- Uses `activeTab` plus `chrome.scripting.executeScript` to run a one-time function in the active tab after that user action.
- Runs in Chrome's default isolated execution world; it does not expose extension internals to the page's main JavaScript world.
- Collects only resource hostnames where possible, not full resource URLs.
- Looks at bounded current-page resource references such as resource/navigation performance entries, images (`src`, `currentSrc`, and `srcset`), scripts, stylesheet/preload/preconnect/dns-prefetch/icon links, iframe/media/source URLs, object/embed resources, selected lazy-loading `data-*` URL attributes, inline style `url(...)` values, conservative computed `background-image`/`list-style-image` values, and accessible open shadow roots.
- Caps inspected elements, attributes, URL-like values, style URL matches, shadow roots, and returned hostnames to avoid heavy full-page crawling.
- Immediately normalizes collected values to hostnames, drops paths, query strings, fragments, and credentials, rejects unsupported schemes, rejects localhost/private/internal/IP hosts, deduplicates, and caps the host list.
- Feeds sanitized hostnames into the pure related-domain candidate engine.
- Shows categorized strong, medium, and ignored candidates in the popup.
- Shows a compact transient diagnostic summary when no saveable candidates remain. The summary contains counts and a small sample of sanitized hostnames only; it is not stored, synced, or sent.
- Uses neutral preview status for discovered candidates because preview is not a save action.
- Shows whether saveable candidates include subdomains by default and whether an existing exact or parent `includeSubdomains` rule already covers them.
- Selects only engine-defaulted strong candidates by default. Medium candidates and ignored candidates are not selected by default.
- Saves only selected, saveable candidates after the user clicks "Add selected domains".
- Offers explicit classification override actions on candidate rows where appropriate. Overrides are saved as personal domain-level preferences in `chrome.storage.sync`, not as proxy routing rules.
- Refreshes the preview after an override is saved so the user sees the updated classification.

The preview does not store collected hosts, sync collected hosts, send collected hosts to a backend, create domain rules automatically, or apply proxy settings. Selected candidates are saved through the existing synced storage helpers with `source: "diagnostic"`, and the background storage listener performs any PAC re-application. Classification overrides are separate synced preferences and do not trigger PAC re-application. The popup still does not call `chrome.proxy.settings` directly.

Because the preview inspects resources from the currently loaded page, results can be noisy. The engine uses a small, local-only classification layer for obvious analytics, adtech, shared-infrastructure, schema-helper, local-helper, and site-scoped related hosts so high-confidence noise is not offered as a normal saveable related domain. Unknown and suspicious hosts stay visible for manual review instead of being hidden aggressively. The classifier does not fetch remote blocklists or use remotely controlled candidate logic.

If the active tab appears to be a browser error page, server error page, protection page, or interstitial, the popup shows a neutral warning and does not present collected helper hosts as normal related-domain candidates. The user should route or check the target site through proxy, reload the real target page, and preview related domains again.

The MVP includes the `scripting` permission because Chrome requires it for programmatic `chrome.scripting.executeScript`; it does not add host permissions, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, telemetry, backend services, remote PAC URLs, or remote executable code.

### Related-Domain Candidate Engine

The related-domain candidate engine is pure logic only. It accepts a current site domain plus caller-provided observed URLs or hostnames, normalizes public hosts through the existing domain helpers, rejects private/internal/localhost targets through the denylist guard, and returns categorized suggestions.

The engine now delegates candidate governance to the domain classification layer. Classification precedence is:

1. Caller-provided user override input, when present.
2. Built-in site-scoped related or ignored classification.
3. Built-in global ignored classification.
4. Existing local heuristics.
5. Unknown fallback.

The engine can mark conservative same-site or explicitly known related domains as strong candidates, unknown or suspicious third-party resource hosts as medium candidates for manual review, and known tracking/analytics, local/adblock helper, schema-helper, or huge shared infrastructure domains as ignored candidates. Medium and ignored candidates are not selected by default, and ignored candidates are not saveable from the popup.

Built-in classification data is bundled locally in the extension source. It includes a small set of high-confidence ignored domains and site-scoped related hints such as `linkedin.com` to `licdn.com` and `letterboxd.com` to `ltrbxd.com`. It does not fetch GitHub raw files, remote lists, remote PAC data, or remotely controlled classification logic at runtime.

The user override model supports personal choices such as always ignoring a domain globally, always reviewing a domain globally, always suggesting a domain for a site, or always ignoring a domain for a site. Overrides are stored in `chrome.storage.sync` as normalized domain-level data. Malformed, internal, local, private, or unsupported override domains are dropped during sanitization, and missing override data defaults to an empty model for migration safety.

The pure engine does not collect browser resources, inspect page content, request permissions, read or write Chrome storage, apply proxy settings, make network calls, or add rules. Current-page resource host collection is isolated in a separate explicit preview flow, and popup saving requires explicit user selection and confirmation before any suggested rule is written. The background preview handler reads synced overrides and passes them into the pure engine as caller-provided input.

See [domain-classification.md](domain-classification.md) for the classification model, precedence, and contribution workflow.

## Test Strategy

Pure modules:

- Domain normalization.
- Proxy config validation.
- Storage migrations.
- Classification override defaults and sanitization.
- PAC generation.
- Diagnostics recommendation logic once added.
- Related-domain candidate categorization.

Extension integration:

- Storage sync/local split.
- Proxy apply lifecycle.
- Permission behavior.
- UI state transitions.
- Manual diagnostic planning, timeout/error handling, and restore behavior.

Manual checks:

- See [manual-smoke-test.md](manual-smoke-test.md).

## Current Runtime Boundary

Typed storage helpers exist for `chrome.storage.sync` and `chrome.storage.local`. The background service worker now uses those helpers to apply local PAC proxy routing on startup and on relevant storage changes.

The runtime boundary remains narrow:

- The Options UI updates storage only. It does not call `chrome.proxy.settings` directly.
- The Popup UI reads the active tab URL after the popup opens, updates synced domain rules only after explicit user clicks, requests current-site diagnostics only after an explicit user click, and does not call `chrome.proxy.settings` directly.
- Manual current-site diagnostics are implemented in the background service worker with temporary PAC state and forced restore.
- Current-page related-domain preview is implemented as a user-invoked `activeTab` + `scripting` flow. Preview does not write storage or create rules; selected candidates are saved only after a separate explicit popup click.
- Popup classification override actions write only the synced `classificationOverrides` data and then refresh preview; they do not create proxy routing rules.
- Options classification override removal updates storage only and does not call `chrome.proxy.settings`.
- No host permissions are required.
- No `webRequest` or `webNavigation` APIs are used.
- No backend, telemetry, remote PAC URL, or remote executable code is used.

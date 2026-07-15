# Architecture

This document describes the current `main` architecture, which continues beyond the immutable published release baseline. The repository contains an MV3 TypeScript runtime, pure modules for domain rules, PAC generation, related-domain classification, typed storage helpers, English and Russian Chrome i18n catalogs, an Options UI for local proxy settings, synced manual rules, and classification override management, a Popup UI for current-site rule management, manual diagnostics, related-domain preview, diagnostic recording sessions, and explicit classification override actions, and a background runtime layer that applies extension-managed PAC settings.

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
- Show a prominent text-and-icon state for exact Proxy, parent Proxy, exact Direct, parent Direct, blocked, or unconfigured default Direct.
- Show a warning instead of a healthy Proxy state when a matching proxy rule exists but the local proxy is disabled or invalid.
- Show `Conflicting rules` when legacy synced data contains both actions for the effective hostname/scope target, state which deterministic action is temporarily effective, and direct the user to Options for repair.
- Add a manual synced proxy rule or direct exception for the current domain only after an explicit user click.
- Keep every Popup quick action exact-scope. A standard `www.` directly before the registrable domain is canonicalized to that registrable domain; `www1`, `www2`, nested `www`, and arbitrary subdomains remain distinct hostnames.
- Offer `Change scope` for an exact rule, preserve its action, show safe PSL-aware scope choices and a coverage/conflict preview, and require confirmation before one atomic update.
- Remove exact current-domain rules only; parent inherited rules must be edited from Options.
- Start a current-site diagnostic only after the user clicks "Check via proxy".
- Offer to save a diagnostic-sourced synced rule only after a successful check, and only after a second explicit confirmation.
- Preview related-domain candidates from current-page resource hosts only after the user clicks "Preview related domains".
- Start, stop, preview, or cancel a diagnostic recording session only after explicit popup clicks.
- Let the user add one previewed related-domain candidate directly from its row or explicitly select several candidates and save them from a sticky batch action as synced diagnostic-sourced rules.
- Let the user explicitly save personal classification overrides for preview candidates without creating proxy routing rules.
- Provide quick access to Options.

The popup does not inspect page content on open, add rules automatically, request host permissions, or call `chrome.proxy.settings` directly.

Options page:

- Configure local proxy settings.
- Add, edit, and remove proxy rules and direct exceptions.
- Edit hostname/domain, proxy/direct action, and explicit scope without delete/re-add.
- Offer exact-host, hostname-plus-subdomains, and safe PSL-aware registrable-parent scope choices; omit the parent option for unsafe shared infrastructure.
- Preview broader coverage, duplicate/conflict blockers, preserved opposite-action child exceptions, and same-action redundancy before Save.
- Scan for redundant same-action child rules and show cleanup suggestions without deleting anything automatically.
- Separate legacy same-target Proxy/Direct pairs from the normal rule list, show each affected target prominently, and require `Keep Proxy` or `Keep Direct` before removing a contradictory sibling.
- Show and remove synced personal classification overrides.
- Show which settings are local to this device and which domain rules are synced.
- Show storage status for saves, additions, removals, exports, import previews, and import apply actions.
- Provide Backup and restore controls for versioned local settings export/import.
- Keep import preview separate from import apply; no imported settings are written until the user explicitly confirms.

### Localization

- Chrome selects the UI locale from the browser language. The extension does not expose a language selector or store a language preference.
- `_locales/en/messages.json` is the default and test fallback catalog; `_locales/ru/messages.json` provides the Russian UI.
- Manifest name, description, and action title use standard `__MSG_*__` references. The production build copies both bundled locale directories into `dist/`.
- Popup and Options static markup uses `data-i18n*` attributes. Their TypeScript modules call one shared typed helper for dynamic text, placeholders, title attributes, and accessibility labels.
- User-visible messages produced by pure modules and the service worker use the same DOM-independent helper. Internal log text, storage keys, protocol values, message types, enum values, CSS classes, and DOM IDs remain technical constants.
- The helper delegates to `chrome.i18n.getMessage` in Chrome. In tests it accepts an injected adapter and otherwise falls back to the bundled English catalog. Missing locale entries warn and fall back to English; unknown keys warn and render a visible development marker instead of silently creating an empty UI.
- Hostnames and other dynamic values are passed as Chrome i18n substitutions and assigned as text, never inserted through `innerHTML`.
- English selected-domain counts use `one` and `other`. Russian counts use explicit `one`, `few`, and `many` selection with the 11–14 exception and values such as 21, 22, 25, 111, and 112 covered by unit tests.
- Locale files are bundled extension resources. Localization adds no runtime translation requests, backend dependency, storage state, or permissions.

### Extension Service Worker

The service worker currently coordinates:

- Reading synced domain rules.
- Reading local proxy configuration.
- Generating PAC data locally.
- Applying proxy settings through `chrome.proxy`.
- Reacting to relevant storage changes.
- Handling current-site diagnostic messages from the popup.
- Handling current-page related-domain preview messages from the popup.
- Handling user-invoked diagnostic recording session messages from the popup.
- Keeping only diagnostic recording metadata in `chrome.storage.session`: tab ID, current domain, start time, expiry time, duration cap, and status.
- Reading synced classification overrides for explicit related-domain preview classification.

It does not yet report current apply status to the UI.

### Pure Modules

Core logic is isolated from Chrome APIs where practical:

- Locale lookup, English fallback formatting, and English/Russian plural-form selection.
- Domain normalization, validation, and standard-WWW canonicalization.
- Proxy configuration validation.
- Domain rule model and migrations.
- Canonical normalized route-target identity and stored-conflict detection/resolution.
- PAC generation.
- Storage serialization and migration helpers.
- Diagnostic decision helpers for current-site target validation, temporary probe planning, and conservative result mapping.
- Related-domain candidate suggestions from caller-provided observed hosts or URLs.
- Domain candidate classification from local built-in data, caller-provided user override inputs, and conservative heuristics.
- Current-page resource host sanitization and preview planning.
- Diagnostic recording target validation, transient recorder state handling, bounded page-local host collection, and recorded-host preview planning.
- Settings backup export/import formatting, validation, sanitization, merge preview, and explicit apply helpers.

These modules should be unit-tested without Chrome.

## Data Boundaries

### Synced Storage

Use `chrome.storage.sync` for domain routing rules because users should be able to keep the same domain list across Chrome profiles.

Current synced data:

- Domain rules with `action: "proxy" | "direct"`.
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

### Settings Export and Import

The Options page includes a user-controlled Backup and restore section for local/unpacked installation workflows.

Export behavior:

- Produces versioned JSON with `format: "smart-proxy-route-helper-settings"` and `version: 1`.
- Exports synced route rules, ignored domains, denylist entries, and personal classification overrides by default.
- Stores only normalized domain-level data in the export.
- Excludes local proxy configuration by default because local proxy host and port are device-specific.
- Includes local proxy scheme, host, port, and enabled state only when the user explicitly selects "Include local proxy config for this device".
- Does not export raw URLs, paths, query strings, fragments, credentials, diagnostic session metadata, collected resource host lists, page text, cookies, screenshots, file contents, telemetry, backend state, or remote code.

Import behavior:

- Parses JSON locally and validates the export format/version before preview.
- Sanitizes imported domains with the same domain normalization, standard-WWW canonicalization, and protected-host guards used elsewhere.
- Rejects malformed rules, invalid domains, localhost, private/internal IPs, browser/internal pages, and internal local suffixes; reports same-action duplicates without retaining both.
- Shows a preview summary before applying changes, including route rule counts, classification override counts, local proxy inclusion, warnings, and errors.
- Merges imported synced settings with existing settings by default. Route-target identity is canonical domain plus subdomain scope; action is not part of identity. `example.com` and standard `www.example.com` therefore preview as one target for the same scope. Same-action duplicates are skipped, while opposite-action pairs inside the file or against stored rules block Apply until the input is resolved.
- Re-reads current synced settings at Apply time and rejects a stale preview if intervening changes would alter the reviewed result or create a route-target conflict.
- Writes to `chrome.storage.sync` and, only when local proxy config is present in the import, `chrome.storage.local` after the user clicks "Apply import".
- Does not call `chrome.proxy.settings` from Options; the background storage listener remains responsible for proxy re-application.
- Ignores unknown extra JSON fields and never evaluates imported data as executable logic.

### Session Storage

Use `chrome.storage.session` only for transient diagnostic recording metadata that needs to survive popup close/reopen during a short recording session.

Current session data:

- Recorded tab ID.
- Recorded current domain.
- Start time.
- Expiry time.
- Duration cap.
- Recording status.
- Random session nonce.
- Main-frame document identifier for reload/navigation detection.

Do not store raw URLs, page text, form values, uploaded file contents, screenshots, cookies, auth/session data, collected host lists, candidate lists, diagnostic history, local proxy credentials, synced route rules, or permanent user preferences in session storage.

## Planned Domain Rule Semantics

The MVP keeps rule semantics simple:

- User enters a domain, not a full URL.
- The extension normalizes hostnames before storage and PAC generation. It then removes an exact ASCII `www.` prefix only when the remainder equals the PSL-derived registrable domain: `www.example.com` becomes `example.com`, while `www1.example.com`, `www2.example.com`, `api.example.com`, `www.status.example.com`, and `deep.www.example.com` do not change.
- A domain rule stores `action: "proxy" | "direct"` and whether subdomains are included. Older stored rules without `action` migrate as `action: "proxy"`.
- A route target is uniquely identified by canonical domain plus exact/include-subdomains scope. Action is a mutable property of that target, so a healthy settings array contains at most one rule per route target.
- Proxy rules route matching hosts through the configured local proxy. Direct rules are explicit direct exceptions.
- Exact host rules have the highest precedence.
- An exact rule for a registrable domain matches both its apex and its standard `www.` alias, but not `www1`, `www2`, arbitrary subdomains, nested `www`, or a `www.` label above a non-registrable child.
- If no exact host rule exists, the most specific matching parent `includeSubdomains` rule wins.
- If multiple rules have the same specificity, the most recently created rule wins; if timestamps tie, the later stored entry wins.
- Legacy contradictory same-target pairs are preserved during sanitization and use the same newest-`createdAt`, then later-position tie-breaker until the user resolves them. Popup and PAC use this same temporary winner; detection alone never changes routing.
- No match means the default direct route.
- Same-action child rules already covered by broader same-action parents can be suggested for cleanup. Different-action children are not redundant because they override broader parents.
- Rule edits preserve source and creation time plus an existing stable ID. Legacy rules without an explicit ID receive a deterministic stable identity when first edited.
- A rule edit replaces exactly one stored array entry and performs one synced-settings write. It never deletes first, creates a temporary duplicate, or silently removes other rules.
- Identical edited targets and same-target opposite-action conflicts block Save. Broader parents, preserved child exceptions, and newly redundant child rules are shown as preview warnings.
- Adding rules from Options, Popup quick actions, related-domain confirmation, diagnostic confirmation, or import uses the same route-target identity and validates again against the latest synced array immediately before writing.
- Exact and include-subdomains scopes on the same domain remain distinct targets. Parent Proxy/child Direct and parent Direct/child Proxy overrides remain valid because their normalized domain/scope targets differ.
- Invalid input should be rejected before storage.

This slice intentionally has no migration or background cleanup for previously stored `www.` rules, no storage-schema change, and no conflict-repair compatibility layer for old apex/WWW pairs. The canonicalization applies to future create, edit, import, candidate-add, diagnostic-target, and classification-override operations. Existing storage sanitization remains non-migrating.

Examples of invalid input:

- Empty values.
- Values with paths or query strings.
- Values with unsupported characters.
- IP ranges or arbitrary PAC expressions.

## PAC Generation

PAC data must be generated locally from trusted extension code and user settings.

The generated PAC configuration should:

- Route matching proxy rules through the configured local proxy without a `DIRECT` fallback.
- Route matching direct rules directly.
- Route everything else directly.
- Avoid including unsanitized user input.
- Match exact domains and dot-boundary subdomains only, without unsafe substring matching.
- Treat the standard `www.` alias as an exact match only for a serialized registrable-domain rule. The generator derives this marker with the same PSL logic used by TypeScript canonicalization, and parity tests compare PAC results with the TypeScript effective-route evaluator.
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
- Builds a temporary strict PAC from permanent synced rules plus a diagnostic probe rule for the current canonical domain when no existing synced proxy rule already covers it.
- Applies the temporary PAC through the background proxy adapter.
- Makes a short best-effort fetch to the current tab origin from the extension context.
- Restores normal proxy routing afterward, including clearing extension-controlled proxy settings when there are no permanent active rules.
- Returns cautious results such as "appears reachable" or "did not appear reachable"; it does not claim absolute site availability.
- Does not treat direct-route fallback as proxy success. A failed local proxy path should return an unreachable result even when a synced rule already covers the site.

Diagnostic probe state is not written to sync or local storage. A permanent synced rule is created only if the user explicitly clicks the follow-up add button after a successful check. That saved rule uses `source: "diagnostic"`.

Current-site diagnostics do not use `webRequest`, `webNavigation`, content scripts, notifications, host permissions, `<all_urls>`, telemetry, backend services, remote PAC URLs, or remote executable code. Chrome Web Store review risk should be reconsidered before adding broader diagnostic permissions or any remote resource.

### Current-Page Related-Domain Preview

The current-page related-domain preview is an explicit, user-invoked diagnostics helper. Preview and saving are separate actions: the extension may collect current-page resource hostnames only after the user clicks "Preview related domains", and it may save a related-domain rule only after the user clicks that candidate's scope-specific add action or saves explicitly selected candidates from the sticky batch action.

The preview flow:

- Requires the user to open the popup on a supported `http` or `https` page and click "Preview related domains".
- Uses `activeTab` plus `chrome.scripting.executeScript` to run a one-time function in the active tab after that user action.
- Runs in Chrome's default isolated execution world; it does not expose extension internals to the page's main JavaScript world.
- Collects only resource hostnames where possible, not full resource URLs.
- Looks at bounded current-page resource references such as resource/navigation performance entries, images (`src`, `currentSrc`, and `srcset`), scripts, stylesheet/preload/preconnect/dns-prefetch/icon links, iframe/media/source URLs, object/embed resources, selected lazy-loading `data-*` URL attributes, inline style `url(...)` values, conservative computed `background-image`/`list-style-image` values, and accessible open shadow roots.
- Caps inspected elements, attributes, URL-like values, style URL matches, shadow roots, and returned hostnames to avoid heavy full-page crawling.
- Immediately normalizes collected values to hostnames, drops paths, query strings, fragments, and credentials, rejects unsupported schemes, rejects localhost/private/internal/IP hosts, deduplicates, and caps the host list.
- Feeds sanitized hostnames into the pure related-domain candidate engine.
- Uses the canonical hostname as the candidate and suggested-rule key, while retaining the distinct normalized observed hostnames in `sourceHosts`. Apex and standard WWW observations therefore produce one candidate without losing source-host aggregation.
- Shows categorized strong, medium, and ignored candidates in the popup.
- Shows the suggested rule domain that would be saved, whether subdomains would be included, and the sanitized observed hostnames that led to the suggestion.
- Shows a compact transient diagnostic summary when no saveable candidates remain. The summary contains counts and a small sample of sanitized hostnames only; it is not stored, synced, or sent.
- Uses neutral preview status for discovered candidates because preview is not a save action.
- Shows whether saveable candidates include subdomains by default and whether an existing exact or parent proxy `includeSubdomains` rule already covers the suggested route target.
- Selects only engine-defaulted strong candidates by default. Medium candidates and ignored candidates are not selected by default.
- Shows a scope-specific primary action on each saveable row, such as `Add image.tmdb.org` for an exact hostname or `Add oaiusercontent.com and subdomains` for a registrable parent rule.
- Keeps checkbox selection for batch operations and shows a sticky `Add N selected domain(s)` action only while at least one saveable candidate is selected.
- Marks successfully added candidates as added without closing the preview or clearing unrelated checkbox selections; successful batch saves clear the submitted selections.
- Keeps classification override actions in a keyboard-accessible `More actions` disclosure. Overrides are saved as personal domain-level preferences in `chrome.storage.sync`, not as proxy routing rules.
- Provides `Back to site status` in the related-domain header without changing preview, recording, or navigation-expiry semantics.
- Refreshes the preview after an override is saved so the user sees the updated classification.

The preview does not store collected hosts, sync collected hosts, send collected hosts to a backend, create domain rules automatically, create direct rules, or apply proxy settings. Selected candidates are saved as proxy rules through the existing synced storage helpers with `source: "diagnostic"`, and the background storage listener performs any PAC re-application. Classification overrides are separate synced preferences and do not trigger PAC re-application. The popup still does not call `chrome.proxy.settings` directly.

Because the preview inspects resources from the currently loaded page, results can be noisy. The engine uses a small, local-only classification layer for obvious analytics, adtech, shared-infrastructure, schema-helper, local-helper, and site-scoped related hosts so high-confidence noise is not offered as a normal saveable related domain. Unknown and suspicious hosts stay visible for manual review instead of being hidden aggressively. The classifier does not fetch remote blocklists or use remotely controlled candidate logic.

The route target planner separates the observed host from the saved rule. It uses a public-suffix-aware registrable-domain helper backed by bundled `tldts` data, so it does not rely on naive "last two labels" parsing and does not fetch suffix or classification lists at runtime. Known related generated-host families such as ChatGPT/OpenAI `*.oaiusercontent.com` can be suggested as a base route target with subdomains included only when a site-scoped related hint explicitly allows that target. Unknown single third-party hosts remain exact by default. Multiple sibling hosts can be widened only on safe registrable domains, while broad shared-infrastructure bases such as `cloudfront.net`, `googleusercontent.com`, `github.io`, `appspot.com`, `auth0.com`, `pages.dev`, `vercel.app`, and `netlify.app` are not widened automatically.

If the active tab appears to be a browser error page, server error page, protection page, or interstitial, the popup shows a neutral warning and does not present collected helper hosts as normal related-domain candidates. The user should route or check the target site through proxy, reload the real target page, and preview related domains again.

The MVP includes the `scripting` permission because Chrome requires it for programmatic `chrome.scripting.executeScript`; it does not add host permissions, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, telemetry, backend services, remote PAC URLs, or remote executable code.

### Diagnostic Recording Sessions

Diagnostic recording is an explicit, user-invoked related-domain helper for action-specific resources that may appear only after a page interaction, such as file upload, media playback, opening a modal, clicking a feature, or loading a panel.

The recording flow:

- Requires the user to open the popup on a supported `http` or `https` page and click "Start recording".
- Uses `activeTab` plus `chrome.scripting.executeScript` after that click to inject bundled temporary code into all frames accessible through the existing grant. No script is registered persistently.
- Installs the request hooks with `world: "MAIN"`, because page `fetch`, XMLHttpRequest, and `sendBeacon` live in the page's execution world rather than the extension's default isolated world.
- Wraps `window.fetch`, `XMLHttpRequest.prototype.open`, and `navigator.sendBeacon` and captures the request hostname synchronously when the request is initiated. A later rejection, network failure, or `sendBeacon` false result does not discard that hostname.
- Runs a continuous `PerformanceObserver` for resource entries, requests buffered entries where supported, and inspects existing resource entries as a fallback. It bounds its own capture instead of depending on an unbounded Stop-time resource timing snapshot, and reports dropped-entry counts when Chrome exposes them.
- Adds a capturing resource error listener and reads only `src`, `currentSrc`, `href`, and `poster` from failed resource elements. It does not read arbitrary DOM attributes, page text, or error messages during recording.
- Sends only hostname strings across a session-bound MAIN-to-ISOLATED `CustomEvent` bridge. The bridge uses a random nonce, treats every event as untrusted, validates and normalizes hostname-only payloads again, caps count and length, and deduplicates.
- Keeps the collected hostnames only inside the temporary isolated-world bridge until the user stops the session, cancels it, the page unloads, or the duration cap expires.
- Stores only transient session metadata in `chrome.storage.session`; collected hosts are not written to synced or local storage.
- Converts a signed URL to its hostname before bridge dispatch. Schemes, paths, queries, signatures, expiry values, fragments, credentials, headers, bodies, cookies, and response contents are not retained, logged, rendered, exported, synced, or persisted.
- Does not inspect page text, form values, uploaded file contents, screenshots, cookies, auth/session data, or browser history.
- Auto-expires after a short duration cap and restores original request functions, disconnects observers, removes listeners, and expires bridge state.
- Allows "Stop and preview" only from the recorded tab; opening the popup on another tab shows that the recording belongs to another tab and allows cancellation.
- On stop, feeds recorded sanitized hostnames into the same related-domain candidate engine used by current-page preview.
- Shows the resulting candidates in the existing related-domain preview UI with "Recorded during this session" status copy.
- Saves no rules automatically. The user must still use an explicit per-candidate add action or the sticky selected-candidate batch action.
- Stop and Cancel restore original request functions, disconnect observers, remove listeners, clear the bridge, and expire session metadata. Navigation/reload is detected through document identity and reported honestly instead of as an empty result; tab close destroys page hooks and clears metadata.
- If nothing is observed, the popup says that no request hostnames were captured and explains that some worker, service-worker, extension, or browser-level requests may be outside this privacy-preserving recorder. It does not direct the user to DevTools or a manual URL field.

Recording does not use automatic/background traffic monitoring, `webRequest`, `webNavigation`, `chrome.debugger`, host permissions, `<all_urls>`, persistent content scripts, backend services, telemetry, remote PAC URLs, remote executable code, remote list fetching, manual failed-URL input, or automatic rule creation.

### Related-Domain Candidate Engine

The related-domain candidate engine is pure logic only. It accepts a current site domain plus caller-provided observed URLs or hostnames, normalizes public hosts through the existing domain helpers, rejects private/internal/localhost targets through the denylist guard, and returns categorized suggestions.

The engine now delegates candidate governance to the domain classification layer. Classification precedence is:

1. Caller-provided user override input, when present.
2. Built-in site-scoped related or ignored classification.
3. Built-in global ignored classification.
4. Existing local heuristics.
5. Unknown fallback.

The engine can mark conservative same-site or explicitly known related domains as strong candidates, unknown or suspicious third-party resource hosts as medium candidates for manual review, and known tracking/analytics, local/adblock helper, schema-helper, or huge shared infrastructure domains as ignored candidates. Medium and ignored candidates are not selected by default, and ignored candidates are not saveable from the popup.

The engine returns both the sanitized observed hosts and the suggested route target. Route target planning can suggest a known related base domain with subdomains included, keep a normal single unknown host exact, widen multiple safe sibling hosts, or widen a strongly generated-looking subdomain to its public-suffix-aware registrable domain. Generic widening is disabled for known shared infrastructure. Coverage and duplicate checks use the suggested route target and its subdomain scope, so an exact generated-host rule does not incorrectly cover sibling generated hosts.

Built-in classification data is bundled locally in the extension source. Public suffix data comes from the bundled `tldts` package in the extension build. The runtime does not fetch GitHub raw files, remote lists, remote PAC data, suffix updates, or remotely controlled classification logic. The bundled classification data includes a small set of high-confidence ignored domains and site-scoped related hints such as `chatgpt.com` to `oaiusercontent.com`, `chatgpt.com` to `oaistatic.com`, `openai.com` to OpenAI asset domains, `linkedin.com` to `licdn.com`, and `letterboxd.com` to `ltrbxd.com`.

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
- Popup and Options rule edits use the shared pure scope/conflict planner and the storage-level atomic update helper. One `chrome.storage.sync.set` triggers the existing background listener, so proxy settings are applied once per confirmed edit.
- Popup and Options additions use a shared final-write helper that re-reads current sync state, rejects same-target opposite actions, skips same-action duplicates, and performs one storage write. Chrome storage does not provide a cross-view transaction, so this narrows stale-view races without claiming transactional guarantees.
- Explicit legacy-conflict resolution re-reads current sync state, preserves the chosen rule and its metadata, removes only contradictory siblings for that target, and performs one storage write; other conflict groups are not silently changed.
- Manual current-site diagnostics are implemented in the background service worker with temporary PAC state and forced restore.
- Current-page related-domain preview is implemented as a user-invoked `activeTab` + `scripting` flow. Preview does not write storage or create rules; individual or selected candidates are saved only after a separate explicit popup click through the shared route-add service.
- Diagnostic recording is implemented as a user-invoked `activeTab` + `scripting` flow with transient metadata in `chrome.storage.session`, a temporary MAIN-world request recorder, and a nonce-bound isolated bridge. Recorded hostnames stay in the injected bridge until stop/cancel/expiry and are not written to sync or local storage.
- Popup classification override actions write only the synced `classificationOverrides` data and then refresh preview; they do not create proxy routing rules.
- Options classification override removal updates storage only and does not call `chrome.proxy.settings`.
- Options Backup and restore export/import reads and writes only through storage helpers. Import preview does not write storage, and import apply requires an explicit button click.
- No host permissions are required.
- No `webRequest` or `webNavigation` APIs are used.
- No backend, telemetry, remote PAC URL, or remote executable code is used.

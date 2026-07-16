# Smart Proxy Route Helper — Product Roadmap

Last updated: 2026-07-16

This is the living product plan for Smart Proxy Route Helper. It records the product thesis, release priorities, competitor lessons, explicit non-goals, and the intended scope of the next meaningful release.

## Release decision

- The latest public release remains `v0.3.0`.
- Development version `0.3.1` is not intended to be published as a separate GitHub Release or Chrome Web Store update.
- The next planned public release is `v0.4.0`, after it contains meaningful user-facing improvements.
- Documentation-only planning changes do not change this release boundary.

## Product thesis

Smart Proxy Route Helper should not become another general-purpose proxy profile manager.

Its primary job is:

> Help a user understand why a site is only partially working, identify the additional hostnames required for a specific action, safely add the necessary proxy routes, and explain the resulting effective route without requiring DevTools.

The core differentiation is explainable, privacy-preserving proxy troubleshooting rather than maximum rule-language or profile complexity.

## Current strengths to preserve

- Local-first architecture with no backend, telemetry, ads, or remotely controlled logic.
- No required host permissions, `<all_urls>`, `webRequest`, `webNavigation`, or persistent content scripts.
- Exact-host quick actions by default.
- Explicit, PSL-aware scope expansion with coverage and conflict preview.
- Fail-closed behavior for matched proxy rules.
- Clear separation between synced domain rules and device-specific local proxy settings.
- Manual `Check via proxy` diagnostics.
- User-invoked related-domain preview and bounded action-specific recording.
- Explicit user selection before any discovered hostname becomes a rule.
- Versioned backup and restore with validation and preview.

## Competitor lessons

The roadmap is informed by recurring strengths and complaints around the main alternatives.

### SwitchyOmega

Strengths:

- Familiar profile model and Auto Switch workflow.
- Rich condition and PAC capabilities.
- Strong historical recognition.

Lessons:

- It remains the category's UX reference, but full compatibility would pull this project toward a large legacy configuration surface.
- Smart Proxy Route Helper should borrow understandable terminology where useful without copying the entire profile architecture.

### ZeroOmega

Strengths:

- Modern Manifest V3 continuation of the SwitchyOmega model.
- Multiple profiles, PAC, Auto Switch, and multi-browser availability.

Recurring pains:

- Failures are often opaque to the user.
- Authentication prompts can reappear.
- Browser startup, state restoration, and sync-related failures are reported.
- Sites can remain partially broken because asset, API, preview, or upload hostnames are missing from the rules.

Product implication:

- Diagnostics, state visibility, and dependent-host discovery are more valuable differentiators than additional profile types.

### SmartProxy

Strengths:

- Lower-friction site activation.
- Page request inspection, multiple proxy servers, subscriptions, and backup.

Recurring pains:

- Rule subscriptions can become stale or ineffective.
- Rules or state can be lost after changes or updates.
- Early browser requests may use a direct route before the extension is ready.
- Users may incorrectly expect the extension to provide a proxy service itself.

Product implication:

- Preserve simple actions, but avoid remote rule-list complexity until there is strong evidence that it is needed.
- Make onboarding and rollback first-class product capabilities.

### FoxyProxy

Strengths:

- Mature, feature-rich proxy and pattern management.
- Authentication, PAC, multiple browsers, and advanced controls.

Recurring pains:

- High onboarding and configuration complexity.
- Sync, migration, and import regressions have caused lost or changed settings.
- Users struggle to distinguish the extension from the proxy service itself.
- Early tab loading and repeated authentication prompts can undermine trust.

Product implication:

- Do not trade the current simple mental model for a broad but difficult-to-explain configuration system.

## Primary market pains

1. **“It does not work” without a useful explanation.**
   The user cannot distinguish an unavailable local proxy, an unapplied PAC, a competing extension or policy, a rule mismatch, a direct exception, or a missing related hostname.

2. **A site works only partially.**
   The main hostname is proxied while images, previews, APIs, uploads, WebSocket connections, or action-specific assets use other hostnames.

3. **The user cannot tell what route is effective.**
   Configured intent and actual browser control are easily confused.

4. **Rule changes and upgrades feel unsafe.**
   Imports, batch edits, sync, scope changes, and version migrations can cause hard-to-recover state changes.

5. **Onboarding assumes proxy knowledge.**
   Users may not understand that a local or remote proxy endpoint must already exist outside the extension.

6. **Raw request lists create noise rather than decisions.**
   Users need ranked, explained recommendations rather than an unstructured list of third-party hostnames.

## North-star outcome

The primary product outcome is:

> The share of partially broken sites that a user can restore in one guided diagnostic session without opening DevTools.

Supporting measures should remain local unless the product's no-telemetry decision is explicitly revisited. During development and manual testing, measure through reproducible fixtures and structured smoke scenarios rather than production analytics.

## Target release: v0.4.0

### Theme

**Explainable Proxy Troubleshooting**

### Desired user journey

1. A user notices that a site or a specific action is broken.
2. The popup explains the current effective route and whether the extension controls Chrome proxy settings.
3. The user starts a bounded diagnostic session and performs the broken action.
4. The extension ranks likely required hostnames and explains the evidence for each suggestion.
5. The user previews scope and conflicts, selects the necessary routes, and applies them.
6. The user can immediately retry the action and undo the change if it did not help.
7. If the issue persists, the user can copy a sanitized diagnostic report.

## v0.4.0 scope

### P0 — Route Health

Create one consolidated status view for the current tab and device.

It should distinguish:

- local proxy configuration present or missing;
- proxy connection not checked, reachable, unreachable, timed out, or requiring authentication;
- Chrome proxy `levelOfControl` state;
- PAC applied or not applied;
- extension enabled or disabled on the current device;
- current hostname effective route: Proxy, explicit Direct, or unconfigured default Direct;
- exact rule or parent rule that produced the route;
- diagnostic override currently active or inactive;
- last diagnostic result and timestamp;
- possible missing dependencies discovered for the current site.

Acceptance direction:

- A user should be able to identify the main failure class without opening Options or DevTools.
- Status must not claim that traffic was proxied when browser control or proxy reachability is unknown.
- Text and icons must not rely on color alone.

### P0 — Dependency Rescue

Upgrade related-domain preview and recording from a hostname list into ranked, explained recommendations.

Candidate groups:

- **Likely required**
- **Possibly required**
- **Probably third-party or optional**

Potential evidence signals:

- the request failed;
- the hostname appeared only after a specific user action;
- the request was initiated through fetch, XHR, beacon, resource loading, or a resource error;
- the hostname repeated during the action;
- it shares a registrable-domain or known site relationship;
- a bundled site-scoped hint exists;
- it resembles analytics, advertising, or unrelated third-party infrastructure;
- it is already covered by an existing Proxy or Direct rule.

Each recommendation should explain why it is shown, for example:

- appeared after file upload started;
- resource load failed;
- already known as an asset host for this site;
- already covered by a parent rule;
- conflicts with an explicit Direct child rule.

Route creation must remain explicit. The extension must not silently create a rule.

Acceptance direction:

- Recommendations are sorted by decision value rather than alphabetically.
- The user can inspect the proposed exact or include-subdomains target before saving.
- Existing denylist, ignored-domain, classification override, redundancy, and conflict behavior remains respected.
- Known fixtures should include at least ChatGPT file upload, YouTube previews, and an image or asset-host case such as Letterboxd.

### P0 — Undo and local snapshots

Make consequential rule changes recoverable.

Create a local snapshot before:

- settings import;
- multi-domain additions;
- mixed route batches;
- rule scope expansion;
- redundant-rule cleanup;
- other operations that modify multiple rules or replace route coverage.

Desired behavior:

- show a post-action summary such as “Added 4 rules, changed 1”;
- provide an immediate Undo action;
- retain a small bounded list of recent local snapshots;
- keep snapshots device-local;
- validate snapshot format before restore;
- never include credentials or unsanitized request data.

Acceptance direction:

- Every multi-rule operation can be reverted in one explicit action.
- Restore does not create duplicate rules or lose stable rule identity unnecessarily.
- Snapshot retention is bounded and documented.

### P1 — First-run proxy check

Replace assumption-heavy setup with a guided, factual check.

The first-run flow should state clearly:

- the extension does not provide a VPN or proxy server;
- the user must already have a compatible proxy endpoint;
- domain rules and local proxy settings have different sync behavior.

Suggested sequence:

1. Enter proxy scheme, host, and port.
2. Validate the values locally.
3. Check whether the proxy endpoint is reachable.
4. Distinguish common outcomes such as refused connection, timeout, authentication required, invalid configuration, or browser control blocked.
5. Create or test the first exact-host route.

Public-IP comparison may be considered only if it can be implemented without undermining the no-backend and privacy posture. It is not required for v0.4.0.

### P1 — Sanitized diagnostic report

Add a user-invoked “Copy diagnostic report” action for support and GitHub issues.

The report may include:

- extension version;
- browser and operating-system information available through safe extension APIs;
- proxy scheme and sanitized host/port representation, without credentials;
- extension enabled state;
- Chrome proxy control state;
- PAC application state;
- current effective route and matched rule scope;
- last diagnostic outcome;
- counts and categories of related-domain candidates;
- known visibility limitations for worker, service-worker, extension, or browser-level requests.

The report must not include:

- raw URLs;
- paths, query strings, fragments, signatures, or expiry values;
- credentials;
- cookies, headers, bodies, or response contents;
- browsing history;
- stored lists of recorded request hostnames unless the user explicitly chooses to include a reviewed hostname list.

### Research spike — early direct requests

Investigate what can realistically be detected or prevented when tabs, pinned tabs, service workers, browser features, or startup navigation issue requests before the extension runtime is fully ready.

Questions:

- Which cases can be made fail-closed without harming normal startup?
- Which cases are outside extension visibility or control?
- Can the UI communicate this limitation accurately?
- Are there Chrome-specific lifecycle regressions that require automated tests?

This research spike does not commit v0.4.0 to a broad startup-blocking mechanism. Ship only if behavior is reliable and explainable.

## Delivery sequence

### Phase 1 — Product and architecture specification

- Define Route Health states and precedence.
- Define candidate evidence model and confidence groups.
- Define snapshot schema, retention, and restore semantics.
- Define sanitized support-report schema.
- Review permission and Chrome Web Store implications before implementation.

### Phase 2 — Route Health foundation

- Add pure state-resolution logic and tests.
- Add proxy control and PAC status presentation.
- Add current rule/effective route explanation.
- Ensure existing popup quick actions remain exact-host-only.

### Phase 3 — Dependency Rescue

- Normalize recording evidence into structured candidate records.
- Add ranking and explanation logic as pure tested modules.
- Add site fixtures and smoke scenarios.
- Preserve explicit selection and confirmation.

### Phase 4 — Recovery and onboarding

- Add local snapshots and Undo.
- Add guided first-run proxy check.
- Add sanitized diagnostic report.

### Phase 5 — Hardening and release

- Regression testing for routing, diagnostics, import/export, language switching, duplicate prevention, mixed batches, and PAC restoration.
- Manual smoke for representative partially broken sites.
- Review permissions, privacy disclosure, store screenshots, and user-facing documentation.
- Publish only when the release has meaningful user-facing value and all required checks pass.

## Deferred backlog

These may be considered after v0.4.0, based on evidence and user demand.

### Multiple local proxy endpoints

Allow a small number of named device-local proxy endpoints without immediately introducing the full nested profile model of SwitchyOmega or FoxyProxy.

Questions to resolve:

- whether route rules select an endpoint or only Proxy versus Direct;
- how endpoint selection syncs without syncing device-specific addresses;
- how fail-closed semantics work when the selected endpoint is missing on another device.

### Proxy authentication

Investigate supported Chrome APIs, credential storage boundaries, permission impact, security risks, and browser-specific behavior before committing to implementation.

Credentials must never enter Chrome Sync, exported backups by default, diagnostic reports, logs, or telemetry.

### Cross-browser support

Evaluate Edge and Firefox only after the Chrome workflow is stable. Avoid abstracting browser behavior prematurely where proxy APIs or lifecycle semantics differ.

### Optional local knowledge packs

Consider user-imported or bundled classification hints that remain reviewable and local. Any update model must preserve the product's no-remote-control promise.

### Advanced startup protection

Revisit after the early-request research spike and only with clear browser-level guarantees and failure recovery.

## Explicit non-goals for v0.4.0

- Full SwitchyOmega or FoxyProxy profile compatibility.
- Arbitrary regular-expression URL rules.
- Remote executable code.
- Remotely controlled business logic.
- Default-on diagnostics or passive browsing-history collection.
- Automatic rule creation without explicit confirmation.
- Required broad host permissions or `<all_urls>`.
- Persistent content scripts.
- Telemetry, analytics, ads, or developer access to user rules.
- Remote rule subscriptions and automatic cloud rule-list updates.
- Built-in commercial proxy or VPN service.

## Product principles for roadmap decisions

1. **Explain before expanding.** Prefer better diagnosis over more configuration types.
2. **Exact before broad.** Default to the narrowest safe route and preview wider coverage.
3. **Explicit before automatic.** Discovery may be assisted; rule creation remains user-controlled.
4. **Recoverable before powerful.** Multi-rule operations require preview, summary, and rollback.
5. **Local before remote.** Keep decisions, classification, settings, and diagnostics local unless a future decision explicitly changes the privacy model.
6. **Evidence before parity.** Do not copy competitor features without a demonstrated user problem.
7. **Actual state before configured intent.** UI wording must distinguish what is configured from what Chrome currently controls and applies.

## Roadmap maintenance

Update this document when:

- a release scope is accepted or rejected;
- competitor research changes a priority;
- implementation reveals a browser limitation;
- a backlog item becomes an active specification;
- a release is published.

For active implementation, detailed engineering tasks may live in GitHub issues or a release-specific implementation plan. This document remains the product-level source of truth.
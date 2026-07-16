# Release Plan

This repository has moved beyond the documentation-only bootstrap phase. Versions `v0.1.0`,
`v0.2.0`, and `v0.3.0` are public GitHub releases. Version `v0.3.0` is the latest immutable release
and has been submitted to Chrome Web Store for review; Store publication of `v0.3.0` is not
claimed. Current `main` is development version `0.3.1`; its post-release fixes have not been
published as a new GitHub Release or Store update. The version sections below preserve the staged
product plan and its guardrails.

## v0.1: Manual PAC MVP

Goal: ship the smallest useful local PAC manager.

Scope:

- Manifest V3 extension.
- Simple popup/options UI.
- Manual domain rule add/edit/disable/remove.
- Current-site popup rule management.
- Domain rules stored in `chrome.storage.sync`.
- Local proxy configuration stored in `chrome.storage.local`.
- Local PAC generation from synced rules and local proxy settings.
- Apply PAC configuration through `chrome.proxy`.
- Unit tests for pure modules.
- Manual smoke test coverage.

Permissions:

- Required: `storage`, `proxy`.
- Required for current-site popup actions: `activeTab`.
- Required host permissions: none.

Out of scope:

- Automatic diagnostics.
- Content scripts.
- Required `<all_urls>`.
- `webRequest`.
- `webNavigation`.
- Telemetry or backend services.
- Remote executable code.
- Automatic rule creation.

Exit criteria:

- MVP scope works in an unpacked extension.
- Domain/proxy validation rejects malformed input.
- Storage split is verified manually.
- PAC output is deterministic and covered by tests.
- Chrome proxy conflicts produce a clear UI state.
- Privacy and permission docs match implementation.

## v0.2: Usability and Review Hardening

Goal: improve user confidence and release readiness without expanding the permission surface by default.

Release scope:

- Better status and error messages.
- Versioned settings export/import for local backups and unpacked/local installation migration.
- Local stable extension ID workflow for unpacked installs that need Chrome Sync continuity while Store publication is delayed or unavailable.
- Proxy rules and direct exceptions with deterministic exact/parent precedence.
- Redundant same-action route-rule cleanup suggestions with no automatic deletion.
- Export/import of synced route rules, route actions, ignored domains, denylist entries, and classification overrides as domain-level data.
- Optional explicit local proxy config export for this device, excluded by default.
- Safer migration path for stored schemas.
- More complete automated tests.
- Improved user-invoked action-specific request recorder with temporary MAIN-world hooks, continuous resource timing, a nonce-bound hostname-only bridge, navigation/session expiry, and explicit Stop/Cancel cleanup.
- Chrome Web Store update text, privacy disclosures, and refreshed screenshots that match the candidate UI.

Permissions:

- Keep `storage` and `proxy`.
- Do not add required host permissions.

Out of scope:

- Default-on diagnostics.
- Background page observation.
- Remote domain lists.
- Remote settings sync, cloud upload, or backend backup storage.
- WebDAV, Gist, backend, or remote-list sync for unpacked installs.
- Any feature that requires broad host access.

Exit criteria:

- v0.1 manual smoke tests still pass.
- Store listing claims match actual behavior.
- Privacy disclosures are reviewed.
- Settings import validates format/version, previews changes before apply, sanitizes domains, rejects protected/internal/private imported domains, rejects malformed route actions, and avoids duplicate route rules by domain, subdomain scope, and action.
- Diagnostic recording remains bounded, user-invoked, hostname-only across the page/extension bridge, and unable to add rules without a separate explicit confirmation.
- Release artifact is reproducible from repository source.

## v0.3: Optional Safe Diagnostics and Localization

Goal: keep the current manual diagnostics path carefully scoped, and expand it only if the design can satisfy privacy, permission, and Chrome Web Store constraints.

Released scope and continuing guardrails:

- Pure related-domain candidate engine that categorizes caller-provided observed hosts or URLs through a local bundled classification layer.
- Small built-in classification data for high-confidence noise and site-scoped related hints.
- Local user overrides for personal classification preferences.
- Future GitHub issue or pull-request workflow for sanitized domain-level community proposals.
- User-initiated reachability check for the current site or an explicitly selected domain.
- Optional future visibility into worker, service-worker, or browser-level requests only if a separate design preserves explicit consent, minimum permissions, and Chrome Web Store compliance.
- Clear explanation before any additional permission request, if a future design needs one.
- Recommendation UI that suggests a domain rule only when appropriate.
- Explicit confirmation before adding a suggested rule.
- Minimal local diagnostic status with no developer upload.
- Bundled English and Russian interface catalogs with a device-local language preference.

Permissions:

- Keep existing MVP permissions.
- Add optional permissions only if the chosen diagnostics design requires them.
- Avoid broad required host permissions.

Out of scope:

- Automatic rule creation.
- Persistent or background browser traffic monitoring.
- Manual failed-URL or hostname input as a fallback for automatic discovery.
- Worker/service-worker/browser-level deep diagnostics without a separate future opt-in design.
- Required host permissions, `<all_urls>`, `webRequest`, `webNavigation`, `chrome.debugger`, or persistent content scripts.
- Uploading diagnostic results.
- Remote diagnostic services.
- Required diagnostics permissions.
- Runtime fetching of GitHub/raw classification lists.
- Automatic upload or reporting of collected domains.
- Community data that changes extension behavior without a reviewed release.

Exit criteria:

- Diagnostics are manual and opt-in per check.
- Each check is user-initiated.
- No diagnostic path mutates rules without confirmation.
- Related-domain candidates remain suggestions only and are never saved without user confirmation.
- Unknown or suspicious related-domain candidates remain manual review by default.
- Classification data is bundled locally or provided explicitly by the user.
- Privacy and Chrome Web Store disclosures are updated before release.

Historical tags, releases, and packages remain immutable. Smart Proxy Route Helper `v0.3.0` is a
normal public GitHub Release from commit `ff2662af1658be0d3a80912dc8f5adf2afcecfca` and has been
submitted to Chrome Web Store for review. Review and publication remain external Store states;
the repository must not infer that `v0.3.0` is publicly available in Store until verified.

## Chrome Web Store Submission Checklist

Before any public submission:

- Confirm the extension has a single clear purpose.
- Confirm permissions are the narrowest needed for shipped features.
- Confirm no remote executable code exists in source or build output.
- Confirm no telemetry, analytics, ads, or backend calls are present.
- Confirm the privacy policy matches actual data behavior.
- Confirm screenshots and store description use neutral wording.
- Confirm diagnostics, if present, are optional and opt-in.
- Confirm manual smoke tests pass on a clean Chrome profile.

## Known Review Risks

- `proxy` is powerful and must be explained clearly.
- Any future host permissions must be narrow and justified.
- Diagnostics can be misunderstood if wording or behavior suggests background observation.
- Remote resources must never control extension logic.
- Documentation, UI, and store disclosures must stay consistent.

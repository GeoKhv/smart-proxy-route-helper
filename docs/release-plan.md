# Release Plan

This repository has moved beyond the documentation-only bootstrap phase. The versions below describe intended release slices; some runtime pieces are already implemented on `main`.

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

Candidate scope:

- Better status and error messages.
- Import/export of domain rules as local files, if needed.
- Rule search/filter for larger lists.
- Safer migration path for stored schemas.
- More complete automated tests.
- Chrome Web Store listing draft and screenshots.
- Accessibility pass for popup/options UI.

Permissions:

- Keep `storage` and `proxy`.
- Do not add required host permissions.

Out of scope:

- Default-on diagnostics.
- Background page observation.
- Remote domain lists.
- Any feature that requires broad host access.

Exit criteria:

- v0.1 manual smoke tests still pass.
- Store listing claims match actual behavior.
- Privacy disclosures are reviewed.
- Release artifact is reproducible from repository source.

## v0.3: Optional Safe Diagnostics

Goal: keep the current manual diagnostics path carefully scoped, and expand it only if the design can satisfy privacy, permission, and Chrome Web Store constraints.

Candidate scope:

- User-initiated reachability check for the current site or an explicitly selected domain.
- Clear explanation before any additional permission request, if a future design needs one.
- Recommendation UI that suggests a domain rule only when appropriate.
- Explicit confirmation before adding a suggested rule.
- Minimal local diagnostic status with no developer upload.

Permissions:

- Keep existing MVP permissions.
- Add optional permissions only if the chosen diagnostics design requires them.
- Avoid broad required host permissions.

Out of scope:

- Automatic rule creation.
- Continuous page monitoring.
- Uploading diagnostic results.
- Remote diagnostic services.
- Required diagnostics permissions.

Exit criteria:

- Diagnostics are manual and opt-in per check.
- Each check is user-initiated.
- No diagnostic path mutates rules without confirmation.
- Privacy and Chrome Web Store disclosures are updated before release.

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

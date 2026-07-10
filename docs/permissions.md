# Permissions Strategy

This project should request only permissions required by shipped features.

Chrome Web Store policy expects extensions to request the narrowest permissions necessary and avoid requesting permissions for future work.

References:

- Chrome permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Chrome Web Store policies: https://developer.chrome.com/docs/webstore/program-policies/policies

## MVP Permission Plan

Required extension permissions:

| Permission | Reason | MVP status |
| --- | --- | --- |
| `storage` | Store synced domain rules and classification overrides, plus local proxy configuration. | Required |
| `proxy` | Apply the locally generated PAC configuration in Chrome. | Required |
| `activeTab` | Read the current tab URL after the user invokes the popup and allow manual current-origin diagnostics, related-domain preview, and diagnostic recording for the active tab. | Required |
| `scripting` | Run one-time, user-invoked current-page resource host collection for related-domain preview and temporary diagnostic recording using the temporary `activeTab` grant. | Required |

Required host permissions:

| Permission | Reason | MVP status |
| --- | --- | --- |
| None | Manual domain entry avoids page access for the MVP. | Required strategy |

## Explicit MVP Exclusions

The MVP must not request:

- Required `<all_urls>`.
- Broad required host permissions.
- `webRequest`.
- `webNavigation`.
- `tabs` for reading browsing context.
- Persistent content scripts or content script matches.
- Remote code exemptions or debugger capabilities.

The MVP may read the active page URL only after the user invokes the extension popup. The related-domain preview may inspect bounded current-page resource references only after the user clicks "Preview related domains". Diagnostic recording may inject a temporary recorder only after the user clicks "Start recording", and it may return candidates only after the user clicks "Stop and preview". The extension must not observe navigation, collect page resources automatically, or request broad host access.

## Why No Broad Host Access in MVP

The MVP can provide its core value through manual domain entry. That means it does not need to observe navigation, run persistent content scripts, or request broad host access.

This keeps the install prompt simpler and makes the Chrome Web Store review story clearer.

## Future Optional Permissions

Future features may need additional permissions, but each one must be tied to a shipped user-facing feature.

Possible future candidates:

| Feature | Possible permission | Requirement |
| --- | --- | --- |
| Additional current-tab features | `activeTab` or a narrow optional permission | Must be user-initiated and clearly explained. |
| Broader diagnostics beyond the current-origin check | Optional host permissions for a specific site, if needed | Must be opt-in, narrow, and revocable. |

No future permission should be added just because it might be useful later.

## Diagnostics Permission Rules

Current-site diagnostics are part of the MVP and must follow these rules:

- Run only after the user clicks "Check via proxy".
- Request the narrowest feasible access.
- Avoid host permissions, `<all_urls>`, `webRequest`, `webNavigation`, and persistent content scripts unless a future design is explicitly approved.
- Store no diagnostic history or temporary probe state.
- Store no raw URLs in synced or local storage.
- Never add a domain rule without explicit confirmation.

## Related-Domain Preview and Recording Permission Rules

The current-page related-domain preview is allowed to use `scripting` only for a one-time `chrome.scripting.executeScript` call after the user clicks "Preview related domains" in the popup.

Diagnostic recording is allowed to use `scripting` only after explicit popup clicks for "Start recording", "Stop and preview", or "Cancel recording". The recorder must be temporary and must not be declared as a persistent content script.

On Start, the extension uses `chrome.scripting.executeScript` with `world: "MAIN"` and `allFrames: true` so bundled temporary hooks can observe page-level `fetch`, XMLHttpRequest, and beacon initiation in every frame allowed by the existing `activeTab` grant. Chrome's default script world is isolated, so MAIN world is required for these page-owned functions. Frames that Chrome does not make accessible are not bypassed, and no permission is added to reach them.

These flows must:

- Rely on `activeTab` for temporary access to the active tab.
- Avoid `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, notifications, backend calls, telemetry, and remote executable code.
- Collect only hostnames from page-level request initiation, continuous resource timing, and safe failed-resource attributes, not raw resource URLs or page text.
- Sanitize immediately in MAIN world by reducing each request value to a hostname before bridge dispatch, then validate and normalize again on the extension side. Drop schemes, paths, query strings, signatures, expiry values, fragments, credentials, headers, bodies, cookies, and response contents; reject unsupported schemes and local/private/internal hosts; deduplicate and cap results.
- Avoid collecting form values, uploaded file contents, screenshots, cookies, auth/session data, or page text.
- Treat obvious analytics/adtech/shared-infrastructure/local-helper hosts as ignored, non-saveable candidates through local logic only.
- Show a neutral warning instead of normal candidates when the active tab appears to be an error page, protection page, or interstitial.
- Store no collected hosts or transient diagnostic summary counts in `chrome.storage.sync` or `chrome.storage.local`.
- Store only short-lived diagnostic recording metadata in `chrome.storage.session` when a recording is active.
- Restore original request functions and remove temporary observers/listeners on stop, cancel, timeout, navigation, or tab close.
- Never create or save related-domain rules automatically.
- Save only user-selected candidates after a separate explicit "Add selected domains" action, through synced storage helpers.
- Store classification overrides as normalized domain-level preferences only.

Chrome documents `activeTab` as temporary access after the user invokes the extension, and documents `scripting` as required for programmatic script injection with either host permissions or `activeTab`. This project uses the `activeTab` path and does not add host permissions.

## Chrome Web Store Risks

### `proxy` Permission

The `proxy` permission is central to the product but sensitive because it changes Chrome proxy settings.

Mitigations:

- The store listing must clearly describe proxy routing and local PAC management.
- The UI must show when extension-managed proxy routing is enabled.
- The privacy policy must explain that routing rules and local proxy settings are not sent to the developer.

### Host Permissions

Host permissions can create stronger review and user-trust concerns.

Mitigations:

- Do not request host permissions in the MVP.
- Use optional permissions for later features where feasible.
- Keep permission prompts tied to immediate user actions.

### `scripting` Permission

The `scripting` permission can raise review questions if it appears to support broad page access.

Mitigations:

- Use it only for the explicit related-domain preview action.
- Use it only for explicit diagnostic recording start/stop/cancel actions.
- Pair it with `activeTab`, not required host permissions.
- Keep injected functions bundled in the extension package and narrowly limited to current-page resource host collection.
- Use MAIN-world hooks only during an explicit active recording and a nonce-bound isolated bridge that accepts hostname-only payloads.
- Do not persist the collected hosts or turn suggestions into rules without a separate explicit confirmation.

### Remote Executable Code

Manifest V3 Chrome Web Store submissions must not depend on executable logic loaded from outside the extension package.

Mitigations:

- Bundle all executable code.
- Do not load remote scripts or remote WebAssembly.
- Do not fetch remote logic as data and interpret it.
- Audit build output before release.

Reference: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

### Privacy Disclosure Drift

Chrome Web Store disclosures, README, privacy policy, and UI must match actual behavior.

Mitigations:

- Review disclosures before every release.
- Update documentation in the same change as permission or data behavior changes.
- Keep diagnostics clearly separated from MVP functionality.

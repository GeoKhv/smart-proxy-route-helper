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
| `storage` | Store synced domain rules and local proxy configuration. | Required |
| `proxy` | Apply the locally generated PAC configuration in Chrome. | Required |
| `activeTab` | Read the current tab URL after the user invokes the popup and allow a manual current-origin diagnostic check. | Required |
| `scripting` | Run a one-time, user-invoked current-page resource host collector for related-domain preview using the temporary `activeTab` grant. | Required |

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

The MVP may read the active page URL only after the user invokes the extension popup. The related-domain preview may inspect bounded current-page resource references only after the user clicks "Preview related domains". The extension must not observe navigation, collect page resources automatically, or request broad host access.

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
- Never add a domain rule without explicit confirmation.

## Related-Domain Preview Permission Rules

The current-page related-domain preview is allowed to use `scripting` only for a one-time `chrome.scripting.executeScript` call after the user clicks "Preview related domains" in the popup.

This flow must:

- Rely on `activeTab` for temporary access to the active tab.
- Avoid `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, notifications, backend calls, telemetry, and remote executable code.
- Collect only resource hostnames where possible from bounded current-page resource references, not raw resource URLs or page text.
- Sanitize hostnames immediately by dropping URL paths, query strings, fragments, and credentials, rejecting unsupported schemes and local/private/internal hosts, deduplicating, and capping results.
- Treat obvious analytics/adtech/shared-infrastructure/local-helper hosts as ignored, non-saveable candidates through local logic only.
- Show a neutral warning instead of normal candidates when the active tab appears to be an error page, protection page, or interstitial.
- Store no collected hosts or transient diagnostic summary counts in `chrome.storage.sync` or `chrome.storage.local`.
- Never create or save related-domain rules automatically.
- Save only user-selected candidates after a separate explicit "Add selected domains" action, through synced storage helpers.

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
- Pair it with `activeTab`, not required host permissions.
- Keep the injected function bundled in the extension package and narrowly limited to current-page resource host collection.
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

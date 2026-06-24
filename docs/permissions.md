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
- Content script matches.
- Remote code exemptions or debugger capabilities.

The MVP may read the active page URL only after the user invokes the extension popup. It must not observe navigation, inspect page content, or request broad host access.

## Why No Broad Host Access in MVP

The MVP can provide its core value through manual domain entry. That means it does not need to read pages, inject scripts, observe navigation, or request broad host access.

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
- Avoid host permissions, `<all_urls>`, `webRequest`, `webNavigation`, and content scripts unless a future design is explicitly approved.
- Store no diagnostic history or temporary probe state.
- Never add a domain rule without explicit confirmation.

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

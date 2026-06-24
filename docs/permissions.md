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
| `activeTab` | Reserved for explicit user-initiated page-context actions. The initial scaffold does not read tab data. | Required by current scaffold |

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

The MVP should not include a feature that depends on reading the active page URL. If quick-add-from-current-tab is added later, it should be designed as a separate permission review.

## Why No Broad Host Access in MVP

The MVP can provide its core value through manual domain entry. That means it does not need to read pages, inject scripts, observe navigation, or request broad host access.

This keeps the install prompt simpler and makes the Chrome Web Store review story clearer.

## Future Optional Permissions

Future features may need additional permissions, but each one must be tied to a shipped user-facing feature.

Possible future candidates:

| Feature | Possible permission | Requirement |
| --- | --- | --- |
| Add current tab domain after user action | `activeTab` or a narrow tab-related design | Must be user-initiated and clearly explained. |
| User-initiated diagnostics | Optional host permissions for a specific site, if needed | Must be opt-in, narrow, and revocable. |

No future permission should be added just because it might be useful later.

## Diagnostics Permission Rules

Diagnostics are not part of the MVP.

When diagnostics are designed, they must follow these rules:

- Disabled by default.
- Enabled only after explicit opt-in.
- Run only after a user action.
- Request the narrowest feasible access.
- Explain what is checked before requesting access.
- Store only minimal local status.
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

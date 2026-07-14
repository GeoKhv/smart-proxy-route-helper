# Chrome Web Store v0.2.0 Update — Draft

Draft only. This file is repository preparation, not Dashboard state. Do not upload, submit, or publish it until the later explicit v0.2.0 release task.

## Draft What's New

Version 0.2.0 adds prominent current-route status, exact-host Popup actions, editable proxy/direct rules with one rule per normalized hostname/scope target, explicit repair for legacy contradictory targets, confirmed PSL-aware scope expansion, deterministic precedence, safe redundant-rule cleanup suggestions, local settings backup and restore, a stable-ID local build workflow, and improved automatic action-specific hostname recording. Recording remains user-invoked, temporary, hostname-only, and unable to create rules automatically.

## Store Listing Changes Needed

Keep the current name and short description. Update the detailed description's feature and privacy bullets to include:

- Proxy and direct route rules.
- Prominent Proxy, explicit Direct, and unconfigured default-Direct Popup states with exact/parent explanations and accessible text labels.
- Exact-host-only Popup quick actions plus explicit Change scope confirmation.
- In-place rule editing and safe PSL-aware parent-domain expansion with coverage/conflict preview.
- Same-target Proxy/Direct creation blockers plus explicit `Keep Proxy` / `Keep Direct` repair for contradictory data created by an earlier candidate build.
- Exact-over-parent and most-specific-parent precedence.
- Explicit redundant-rule cleanup suggestions with no automatic removal.
- Versioned local settings export/import with preview before apply.
- Device proxy configuration excluded from backup by default.
- Improved automatic action-specific request hostname recording using temporary user-invoked page hooks.
- Hostname-only transient processing, bounded lifecycle, and explicit candidate save confirmation.
- The known limit that worker, service-worker, extension, and browser-level requests may not be visible.

Remove or replace wording that describes routing rules as proxy-only, treats recording as a Stop-time page snapshot, or implies that locally processed website resource domains are not handled as user data.

## Draft Detailed Description Addendum

New in version 0.2.0:

- Choose proxy or direct routing for each domain rule.
- Keep one rule per normalized hostname and scope; change an existing rule's action instead of creating a contradictory sibling.
- Repair legacy contradictory targets explicitly without silent deletion.
- See the effective route at a glance while keeping explicit Direct distinct from the unconfigured default direct route.
- Edit an existing rule or broaden its scope after reviewing exactly which hostnames will be covered.
- Use deterministic exact and parent-rule precedence for predictable exceptions.
- Find redundant same-action rules and remove them only after confirmation.
- Export a versioned local settings backup and preview sanitized changes before importing.
- Keep device proxy settings out of backups by default, with an explicit include option.
- Record action-specific page request hostnames after an explicit Start action, including selected failed or generated requests visible to the page.

Diagnostic recording is temporary and local. The extension observes bounded page-level request and resource signals only during a user-started session, reduces URL-like values to hostnames before they cross into the extension context, and restores temporary hooks on Stop, Cancel, or timeout. It does not retain paths, query strings, signatures, credentials, headers, bodies, cookies, page text, uploaded file contents, or screenshots. Recorded candidates never become rules without a separate explicit selection and save action.

## Permission Justification Updates

### `proxy`

No material change. Required to apply locally generated inline PAC configuration for user-configured proxy and direct route rules.

### `storage`

Update the explanation to include route actions and local backup/restore state boundaries. Synced domain rules and classification overrides remain in Chrome Sync; device proxy settings remain local; short-lived recorder metadata uses session storage.

### `activeTab`

Required after the user invokes the extension on the current tab. It enables current-site controls, manual diagnostics, related-domain preview, and explicit Start/Stop/Cancel diagnostic recording without broad host access.

### `scripting`

Required to inject temporary bundled scripts into the active tab after explicit user actions. Related-domain preview uses temporary page inspection. Diagnostic recording uses paired ISOLATED- and MAIN-world scripts in accessible frames to observe bounded page-level request/resource signals, reduce them to hostnames, and clean up on Stop, Cancel, or timeout. The extension declares no persistent content scripts or broad host permissions.

### Remote Code

Select `No, I am not using remote code` after verifying the final ZIP. All executed code and domain-classification logic must remain bundled with the extension.

## Privacy Practices and Data-Use Review

Do not copy the v0.1.0 checkbox state without review.

Chrome's user-data guidance says local-only processing still counts as handling user data and explicitly includes domains, URLs, website content/resources, and browsing activity. Before submission, review the current Dashboard category labels and select every applicable category, including the current equivalents of web browsing activity and website content/resources if the Dashboard definitions cover the recorder's hostname signals.

Use these facts consistently in the Dashboard and public privacy policy:

- Purpose: provide user-invoked proxy routing management and related-domain diagnostics.
- Data handled locally: current-site domains, user-entered rule domains, classification domains, and transient resource/request hostnames during explicit preview or recording.
- Data not retained by the recorder: raw URLs, paths, queries, fragments, signatures, credentials, headers, bodies, cookies, page text, form values, file contents, screenshots, and response contents.
- Retention: collection ends after the bounded recording window. The bounded hostname set may remain only in the recorded page's isolated-world memory so an expired session can still be explicitly previewed; Stop, Cancel, navigation, or tab teardown removes it. Only tab/domain/time/status/nonce/document metadata uses session storage for lifecycle recovery.
- Sharing/transmission: no developer backend or third-party transfer; Chrome Sync may sync user-configured domain rules and classification overrides as part of Chrome's storage service.
- Control: preview/recording starts only after user action; rules are created only after separate explicit confirmation.
- Limited use: data is used only for the extension's single user-facing proxy routing and diagnostic purpose, not advertising, profiling, resale, or unrelated analytics.

Official review references:

- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/
- https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- https://developer.chrome.com/docs/extensions/reference/api/scripting

## Screenshot Changes Needed

Recapture only after the candidate UI and copy are frozen, using the documented clean-profile and sanitized-demo workflow.

- Replace `02-options-route-rules`: show Edit controls and, if legible, a sanitized current/proposed scope preview with the confirmation button visible.
- Add or replace an Options image that shows `Optimize rules` and a safe suggestion state without implying automatic deletion.
- Add or replace an Options image that shows `Backup and restore`, with local proxy inclusion visibly off by default and no real proxy details.
- Replace `03-popup-current-site`: show the prominent text-and-icon route state, exact/parent explanation, exact-host microcopy, and Change scope action using sanitized demo data.
- Replace or refresh `05-popup-recording`: use final v0.2 copy and show the user-invoked automatic recording state without sensitive real domains or data.
- Keep every screenshot at `1280x800`, use only sanitized demo data, and do not capture the owner's main Chrome profile.

## Submission Notes for the Later Release Task

- Upload the new package to the existing Store item, not a new item.
- Verify the package version is greater than the published version and the permission list is unchanged.
- Update Store listing and Privacy practices metadata before submitting the new package for review.
- Existing users should remain on v0.1.0 until the update is reviewed and published.
- After publication, verify the Store displays v0.2.0 and an existing installation updates without losing synced rules or device-local proxy settings.

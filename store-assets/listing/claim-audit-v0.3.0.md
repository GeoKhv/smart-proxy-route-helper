# Chrome Web Store Claim Audit for the v0.3.0 Candidate

This audit compares the English Store reference material in the repository with the current `main` implementation and the prepared Russian listing. It does not assert that the live Chrome Web Store Dashboard has already been updated.

| English repository claim | Current implementation evidence | Russian listing treatment | Outdated wording or follow-up |
| --- | --- | --- | --- |
| Per-domain routing through a user-configured local proxy | `manifest.json`, PAC builder, local proxy settings, Popup and Options | Preserve as the first user benefit | Keep; do not call the extension a VPN or proxy provider |
| Proxy-route rules | Route rules now support `proxy` and `direct` actions | State both Proxy and Direct rules | Proxy-only wording in the published-v0.1.0 reference is outdated |
| Unmatched sites use the default direct route | PAC and Popup route status distinguish default Direct from explicit Direct | Explain that other sites use DIRECT by default | Keep explicit Direct distinct from default Direct |
| Exact hostname and include-subdomains scopes | Shared rule editor and scope planner implement both | Describe both scopes without promising automatic broadening | Older wording that implies proxy-only manual lists is incomplete |
| Current-site Popup controls and route status | Popup shows Proxy, Direct, proxy-unavailable, exact, and inherited states | Preserve in feature list and screenshot plan | Historical Popup screenshots predate the current status UI |
| User-invoked related-domain preview | Temporary `activeTab` + `scripting` flow produces sanitized candidates | Explain candidate review in plain language | Add current per-candidate Add and sticky batch confirmation UX |
| User-invoked action-specific recording | Temporary MAIN/ISOLATED scripts collect bounded hostname signals | Explain recording through a generic page action example | Do not describe recording as a Stop-time snapshot or as full traffic monitoring |
| Rules are added only after selection and confirmation | Individual Add and selected-candidate batch paths write through shared storage helpers | Repeat explicit confirmation guarantee | Keep; never claim automatic routing-rule creation |
| Synced domain settings; device-local proxy configuration | `chrome.storage.sync` for domain settings; `chrome.storage.local` for proxy settings | Preserve the sync/local boundary | Clarify that exported backup files are local and are not cloud sync |
| Backup and restore | Versioned export/import with preview and explicit apply | Include export/import and local-proxy exclusion by default | Missing from the published-v0.1.0 detailed description |
| No telemetry, backend, remote list fetching, or remote executable code | README, architecture, privacy policy, bundled runtime | Preserve in the privacy section after the feature explanation | Keep data-handling categories conservative; local processing still counts as handling |
| No raw URL or page/file content retention by the related-domain bridge | URL-like inputs are reduced to hostname; bridge payload validates hostname only | State exactly what is and is not passed or retained | Avoid the broader inaccurate claim that the extension never handles website resource data |
| English primary locale only | `default_locale` remains `en`, with 441 English and 441 Russian keys | Russian listing and real Russian UI screenshots are now prepared | Historical instruction not to localize the listing is now stale |
| Standard WWW remains a distinct exact hostname | Current `main` canonicalizes a standard `www.` directly before a registrable domain | Give the concrete `www.example.com` to `example.com` example | v0.2.0 notes and smoke wording that preserve `www.*` as distinct are outdated for future creates/edits/imports; existing stored rules are not migrated |

## Parity conclusion

The prepared Russian copy does not add a product capability beyond current `main`. It updates the feature set from the historical English v0.1.0 reference to the current v0.3.0 candidate behavior: Proxy/Direct routing, backup/import/export, clearer related-domain confirmation, English/Russian UI, and standard-WWW canonicalization.

Before a future Store package upload, the English live listing should be reviewed against the same matrix. This preparation slice does not open or modify the Dashboard.

## Screenshot and localization audit

The five Russian screenshots were captured from a clean temporary profile with the current production build and then checked at `1280x800`. They show the current Popup, Proxy/Direct rules, related-domain review, individual and batch Add actions, and backup/import preview. No personal profile data, bookmarks, browsing history, account identity, or user proxy address is visible.

During capture, the transient status shown after starting or cancelling action-specific recording appeared in English while the rest of the Popup was Russian. The recording state was therefore excluded from the Store screenshot set. This is a source localization follow-up for a separate code slice; the marketing-only commit does not conceal or fix it, and the release notes avoid claiming that every runtime string is already localized.

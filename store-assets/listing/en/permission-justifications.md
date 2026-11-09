# EN permission justifications — 0.4.2

## `proxy`

```text
Applies and verifies PAC routing generated locally from user-confirmed domain rules and device-specific named proxy/DIRECT connections. Reads Chrome Proxy control to explain overrides, supports local Pause/Resume, and temporarily tests a selected route only after a user action. No remote PAC or remote routing logic.
```

## `storage`

```text
Stores route names, domain rules, classification preferences, rule chunks and cross-list reconciliation records in chrome.storage.sync. Device connections, Pause, language and one original-settings recovery copy remain in local storage. Session storage holds temporary recording lifecycle metadata, not collected hostname lists. No page/file contents or proxy credentials are stored.
```

## `activeTab`

```text
Provides temporary current-page access after the user invokes the toolbar extension. Used for current-site route controls, optional manual selected-route checks, related-hostname preview and temporary recording. No persistent access to every site or broad host permission.
```

## `scripting`

```text
Runs packaged temporary current-page scripts only after explicit user actions. Related-domain preview and bounded recording reduce resource references to hostnames. Test selected route makes one credentials-free current-origin fetch, without reading DOM/response bodies or following redirects. No persistent content scripts, remote code, certificate installation or TLS bypass.
```

Manifest: proxy, storage, activeTab, scripting. No host_permissions, <all_urls>, webRequest, webNavigation or persistent content scripts. Review risks remain proxy control, script injection and disclosure consistency; unchanged permissions do not guarantee approval.

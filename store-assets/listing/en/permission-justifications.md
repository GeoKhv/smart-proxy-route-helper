# English Permission Justifications

These texts are reference material for a future Dashboard review. They do not change the manifest or existing Dashboard declarations.

## `proxy`

```text
Required to apply a PAC configuration generated locally by the extension. It supports user-created Proxy and Direct rules and uses the local proxy host and port configured by the user. No remote PAC file or remote routing logic is used.
```

## `storage`

```text
Required to store extension settings. Synced storage holds domain route rules and classification overrides. Local storage holds the device-specific proxy host, port, protocol, and enabled state. Short-lived recording session metadata may use session storage; collected hostnames are not stored there. Page or file contents are not stored.
```

## `activeTab`

```text
Used only after an explicit user action in the current active tab. It supports current-site routing controls, manual proxy diagnostics, related-domain preview, and starting, stopping, or cancelling action-specific recording. The extension does not request persistent access to all sites.
```

## `scripting`

```text
Required to run temporary scripts packaged with the extension on the current active page after an explicit user action. These scripts collect bounded hostname signals for related-domain preview and action-specific recording. The extension has no persistent content scripts and uses no remote code.
```

## Manifest cross-check

The current manifest permissions are exactly:

```text
proxy
storage
activeTab
scripting
```

There are no `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, or persistent content scripts.

# EN detailed description — 0.4.2

```text
Smart Proxy Route Helper manages per-site routing in Chrome through local proxy connections that you configure. Work, Life and additional named lists can run at the same time. Sites without a matching rule connect directly by default.

The extension does not provide a VPN, proxy server or proxy service. Start and configure your own compatible local proxy client before using a Proxy connection.

Routing controls

• Keep separate domain lists for Work, Life and other named routes.
• Choose a device-specific SOCKS5/HTTP proxy or DIRECT connection for each route.
• Add Proxy rules and explicit Direct exceptions manually.
• Match an exact hostname or include its subdomains; exact rules take priority over broader rules.
• See the current site's configured route, matching rule, connection details and Chrome Proxy control in the popup.
• Create and rename routes, preview rule moves and resolve conflicts explicitly in Options.
• Edit rules in place, preview scope changes and review redundant-rule suggestions.
• Pause and resume routing locally without deleting rules.
• Export and import versioned settings with Preview before Apply. Device connections are excluded from exports unless you choose to include them.
• Use the English or Russian interface, with a device-local language preference.

Configured routing is not a guarantee of connectivity. A matched Proxy route does not silently fall back to DIRECT when its proxy is unavailable. DIRECT bypasses Chrome proxy settings; it can still use an OS-level VPN and does not select the operating system's HTTP proxy per site.

Optional manual checks

Test selected route performs a short request to the current site's origin only after you click the test action. The request omits cookies and credentials, reads no page content or response body, and does not follow redirects. The check temporarily changes routing for the current hostname and then restores normal settings.

Results disclose Chrome's network and HTTPS/certificate limits. Proxy error events may not identify the affected tab. The extension does not install certificates or bypass HTTPS validation. Work's certificate guidance refers to the Corporate VPN Router setup wizard; the extension does not contact that tool automatically.

Related-domain discovery

After an explicit action, preview related resource hostnames from the active page, or start a temporary recording, perform a page action, then stop and review the hostnames. Recording may help find hosts used during file transfers, media playback or authentication steps. It does not read file contents or credentials.

Candidates never become rules automatically: select them and confirm the separate Add action. Recording hooks end on Stop, Cancel, timeout or navigation. Some worker and browser requests may not be visible.

Chrome Sync and compatibility

Route names, domain rules and classification preferences may sync through Chrome's extension settings synchronization. Connections, language, Pause and one original-settings recovery copy remain on the device.

Version 0.4.2 fixes independent offline Work and online Life changes that could finish syncing without activating the new rules. Work and named lists now reconcile independently; cross-list edits preserve conflicting records for explicit resolution. Incomplete Sync data keeps the previous PAC and reports an error; a newly added hostname is not promised to use its new route until complete delivery.

Existing 0.3.2 rules migrate to Work. Version 0.3.2 can share Work rules and preserves the protected Life data, but cannot route Life. Use 0.4.2 or later on devices that need named routes; upgrade 0.4.0/0.4.1 named-route writers before further editing. Concurrent changes to the same list retain last-writer behavior and are not a lossless merge of every edit.

Privacy and permissions

No developer backend, telemetry, analytics, advertising or remote executable code. The developer does not receive settings or diagnostic results. Selected domain settings can pass through Google Chrome Sync. Diagnostic requests are visible to the chosen site and configured proxy in the same way as normal requests.

Related-domain scripts reduce resource references to normalized hostnames before passing them into the extension. They do not retain full URL paths, query strings, headers, bodies, cookies, credentials, page text, file contents or screenshots. Temporary hostname candidates stay in memory; only explicitly confirmed domains become stored rules.

Required permissions: proxy applies and verifies locally generated PAC routing; storage saves synced domain settings and local connections; activeTab grants temporary access after a toolbar action; scripting runs packaged, user-invoked current-page checks and hostname discovery. There are no required broad host permissions, persistent content scripts, webRequest or webNavigation.

Smart Proxy Route Helper is open source. Review the privacy policy and compatibility contract in the linked repository for details.
```

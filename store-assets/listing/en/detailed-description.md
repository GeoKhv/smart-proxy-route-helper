# English Detailed Description

```text
Smart Proxy Route Helper routes selected sites through a local proxy that you configure, while unmatched sites connect directly by default.

What it does

Use clear, per-site routing rules in Chrome when you already have a compatible local proxy client running on your device. The extension does not provide the proxy itself.

How it works

Install and start a compatible local proxy client, such as V2Ray, V2RayN, V2RayU, or another client that exposes a local proxy endpoint. Then enter the local host and port in Smart Proxy Route Helper. Selected domains use Proxy rules; unmatched sites use DIRECT by default. You can also create explicit Direct rules for exceptions.

Main features

• Proxy and Direct rules for individual domains.
• Exact-hostname scope or a scope that includes subdomains.
• Current-site route status and quick actions in the popup.
• In-place rule editing with a preview when the scope would cover more hostnames.
• Standard www.example.com canonicalized to example.com for new route targets.
• Versioned settings export and import with Preview before Apply.

Related-domain discovery and recording

After an explicit user action, the extension can preview related resource hostnames from the current page. Each saveable candidate has its own Add action, and selected candidates can be added with a sticky batch action. If a hostname appears only during a particular action, such as loading a file, downloading, playing media, or opening part of a page, you can start temporary action-specific recording, perform the action, then stop and review the hostname candidates.

Preview and recording are review steps, not automatic rule creation. A route rule is never created without explicit user selection and confirmation.

Sync and local settings

Domain route rules and classification overrides can sync through Chrome Sync. The local proxy host, port, protocol, and enabled state remain device-local. Versioned export and import are local, user-controlled operations; Preview shows the proposed changes before Apply.

Privacy and local-first model

The extension has no backend, telemetry, advertising, or remote rule list. It uses no remote executable code. The related-domain bridge is hostname-only. It does not store or send raw URL paths, query parameters, headers, cookies, credentials, page contents, file contents, or response contents.

What you provide

You must provide and control a compatible local proxy client that is already running, including its local host and port. Smart Proxy Route Helper does not provide its own VPN, proxy server, or proxy infrastructure.
```

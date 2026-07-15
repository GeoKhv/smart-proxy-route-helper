# Chrome Web Store Claim Audit for the v0.3.0 Candidate

This audit compares the new English Store package with the preserved Russian listing, the current manifest, and the production build. It is repository collateral only; it does not assert that the live Dashboard has been updated.

| Claim area | Current English package | Russian listing | Audit result |
| --- | --- | --- | --- |
| Core purpose | Selected sites use a user-configured local proxy; unmatched sites use DIRECT by default | Same meaning | Aligned; no VPN or proxy-provider claim |
| Route actions | Proxy and Direct rules | Same meaning | Aligned with current rule model |
| Scope | Exact hostname or hostname plus subdomains | Same meaning | Aligned with Options and Popup |
| Related domains | Explicit preview, per-candidate Add, sticky batch Add | Same meaning | Aligned with current Popup flow |
| Action-specific recording | Explicit, temporary, hostname-only review flow | Same meaning | Aligned; no traffic-monitoring claim |
| WWW handling | Standard `www.example.com` becomes `example.com` for new route targets | Same example and meaning | Aligned with canonicalization module |
| Sync/local boundary | Rules and classification overrides may sync; proxy host/port/protocol/state remain device-local | Same meaning | Aligned with storage modules |
| Backup/import | Versioned local export/import with Preview before Apply | Same meaning | Aligned with settings backup module |
| Privacy | No backend, telemetry, ads, remote rule list, or remote executable code; hostname-only bridge; no raw URL parts or page/file contents stored or sent | Same meaning | Aligned with current privacy boundary |
| User requirement | Compatible local proxy client must already be running and configured by the user | Same meaning | Aligned; no built-in VPN/proxy server claim |
| Permissions | `proxy`, `storage`, `activeTab`, `scripting`; no host permissions | Same meaning | Matches `manifest.json` |

## Historical material reviewed

- `docs/chrome-web-store-listing.md` is a historical reference for the published v0.1.0 listing; its older copy is not the v0.3.0 package.
- `store-assets/listing/ru/` remains the Russian text package and was not removed.
- `store-assets/listing/release-notes-v0.3.0.md` remains a candidate-only English/Russian note set and does not say that v0.3.0 is published.
- The previous `store-assets/screenshots/v0.3.0/ru/` directory was a separate localized screenshot set; it is removed from the current Store package so it cannot be mistaken for a second upload set.

## Runtime and locale cross-check

- English `_locales/en/messages.json` `extensionDescription` matches the English primary summary exactly.
- Russian `_locales/ru/messages.json` `extensionDescription` matches the Russian primary summary exactly.
- English and Russian locale key counts remain equal at 441 each.
- The manifest remains at version `0.2.0` with permissions `proxy`, `storage`, `activeTab`, and `scripting`.

## Screenshot audit

The five English screenshots were captured from the current production build in a separate clean English capture profile. They use only sanitized demo values (`example.com`, `developer.chrome.com`, `127.0.0.1:1080`, and public resource-host candidates), show the real Popup/Options UI, and are composed from those captures without translated or fabricated UI.

The same English five-image set is the shared asset set for English and Russian Store locales. No separate Russian screenshot set remains in the current v0.3.0 package.

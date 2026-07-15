# Chrome Web Store Screenshots

The current v0.3.0 candidate Store package is under `v0.3.0/en/`.

## Shared v0.3.0 English set

These five PNGs are real captures of the current production build, composed on `1280x800` Store canvases:

1. `v0.3.0/en/01-options-local-proxy.png` — device-local proxy settings.
2. `v0.3.0/en/02-options-proxy-direct-rules.png` — synced Proxy and Direct rules with exact/include-subdomains scopes.
3. `v0.3.0/en/03-popup-site-status.png` — current-site route status and quick actions.
4. `v0.3.0/en/04-related-domain-review.png` — related-domain review with individual Add and sticky batch Add.
5. `v0.3.0/en/05-backup-import-preview.png` — versioned export and Import Preview before Apply.

The same English screenshot set is intended for every Chrome Web Store locale. Do not upload a separate Russian screenshot set. Russian listing text remains under `../listing/ru/`.

## Capture and privacy audit

- Captured from the current production `dist/` build in the isolated Smart Proxy Capture Chrome app.
- Clean temporary English profile; Chrome Sync was signed out.
- Demo data used only `example.com`, `developer.chrome.com`, public resource-host candidates, and `socks5 127.0.0.1:1080`.
- No personal accounts, bookmarks, history, avatars, credentials, proxy secrets, private pages, or real proxy addresses are visible.
- All five outputs are PNG files at exactly `1280x800`.
- UI is real Popup/Options output; no translated or fabricated UI was overlaid.

Older `v0.2.0` screenshots remain separate historical/untracked material and are not part of this v0.3.0 package.

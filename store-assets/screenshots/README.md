# Chrome Web Store Screenshot Drafts

Captured on 2026-06-25 for the v0.1.0 screenshot preparation pass.

These PNGs were captured from the current `dist/` build loaded as an unpacked extension in a temporary Chrome for Testing profile under `/private/tmp`. The profile was not signed in to Chrome Sync and did not use the user's main Chrome profile.

Demo data came from `docs/demo-storage-fixture.json` and uses only sanitized values:

- Local proxy: `socks5 127.0.0.1:1080`
- Demo route rules: `example.com`, `chatgpt.com`, `oaiusercontent.com`, `linkedin.com`, `licdn.com`, `2ip.io`
- Demo classification overrides: `trkn.us` ignored globally, `licdn.com` suggested for `linkedin.com`

Captured drafts:

- `01-options-local-proxy.png`
- `02-options-route-rules.png`
- `03-popup-current-site.png`
- `04-popup-related-domains.png`
- `05-popup-recording.png`
- `06-options-classification-overrides.png`

Popup screenshots `03` through `05` were captured from a separate temporary Chrome profile under `/private/tmp` using the visible extension toolbar icon after loading the current `dist/` build through the Chrome Extensions UI. They are cropped popup drafts, not full `1280x800` Store-ready canvases.

Popup capture states:

- `03-popup-current-site.png`: toolbar-opened popup on `https://example.com/`.
- `04-popup-related-domains.png`: toolbar-opened popup on `https://example.com/` after a user-invoked related-domain preview. The clean page included sanitized demo resource references for `oaiusercontent.com`, `licdn.com`, and `demdex.net`; no rules were saved.
- `05-popup-recording.png`: toolbar-opened popup on `https://example.com/` after starting diagnostic recording. No files were uploaded and no messages were sent.

No Chrome Web Store Developer Dashboard changes were made.

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

Final draft canvases generated on 2026-06-26:

- `final/01-options-local-proxy.png`
- `final/02-options-route-rules.png`
- `final/03-popup-current-site.png`
- `final/04-popup-related-domains.png`
- `final/05-popup-recording.png`
- `final/06-options-classification-overrides.png`

Each final draft canvas is a `1280x800` PNG generated from the matching source draft in this directory. The canvases use a clean neutral background, a short neutral title, and the real captured UI image. No external assets, CDN fonts, private proxy/provider/account information, or Chrome Web Store Developer Dashboard data are included.

Popup screenshots `03` through `05` were captured from a separate temporary Chrome profile under `/private/tmp` using the visible extension toolbar icon after loading the current `dist/` build through the Chrome Extensions UI. They are cropped popup drafts, not full `1280x800` Store-ready canvases.

Popup capture states:

- `03-popup-current-site.png`: toolbar-opened popup on `https://example.com/`.
- `04-popup-related-domains.png`: toolbar-opened popup on `https://example.com/` after a user-invoked related-domain preview. The clean page included sanitized demo resource references for `oaiusercontent.com`, `licdn.com`, and `demdex.net`; no rules were saved.
- `05-popup-recording.png`: toolbar-opened popup on `https://example.com/` after starting diagnostic recording. No files were uploaded and no messages were sent.

Known final-canvas limitations:

- `final/03-popup-current-site.png` was composed from the existing popup source crop and was not recaptured.
- `final/04-popup-related-domains.png` was composed from the existing popup source crop and still includes a visible cursor highlight from the original Computer Use capture.
- `final/05-popup-recording.png` was composed from the existing popup source crop and still includes a visible cursor highlight from the original Computer Use capture.
- The popup canvases are draft candidates. Before actual Chrome Web Store submission, recapture popup screenshots from the visible extension toolbar icon in a clean Chrome profile if a cursor-free set is required.
- The final canvas set contains six draft images. The Chrome Web Store listing currently accepts up to five screenshots, so choose the submission set during the actual listing pass.

No Chrome Web Store Developer Dashboard changes were made.

# Chrome Web Store Screenshot Drafts

Captured on 2026-06-25 for the v0.1.0 screenshot preparation pass.

Popup screenshots `04` and `05` were cleanly replaced on 2026-06-28 from manually captured full-window Chrome screenshots in a temporary clean profile.

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

Clean full-window popup sources saved on 2026-06-28:

- `source/04-popup-related-domains-clean.png`
- `source/05-popup-recording-clean.png`

Each final draft canvas is a `1280x800` PNG generated from the matching source draft in this directory. The canvases use a clean neutral background, a short neutral title, and the real captured UI image. No external assets, CDN fonts, private proxy/provider/account information, or Chrome Web Store Developer Dashboard data are included.

Popup screenshot `03` was captured from a separate temporary Chrome profile under `/private/tmp` using the visible extension toolbar icon after loading the current `dist/` build through the Chrome Extensions UI. Popup screenshots `04` and `05` were replaced from clean full-window toolbar popup captures. The cropped popup drafts are converted into `1280x800` Store-ready canvases under `final/`.

Popup capture states:

- `03-popup-current-site.png`: toolbar-opened popup on `https://example.com/`.
- `04-popup-related-domains.png`: toolbar-opened popup on `https://example.com/` after a user-invoked related-domain preview. The visible popup state shows the sanitized `example.com` route and a found-candidates notice; no rules were saved.
- `05-popup-recording.png`: toolbar-opened popup on `https://example.com/` after starting diagnostic recording. No files were uploaded and no messages were sent.

Known final-canvas limitations:

- `final/03-popup-current-site.png` was composed from the existing popup source crop and was not recaptured.
- `final/04-popup-related-domains.png` and `final/05-popup-recording.png` were regenerated on 2026-06-28 from clean full-window Chrome screenshots. Visual review found no private data and no cursor highlight in those replacements.
- The popup canvases still require normal final review in the Chrome Web Store Developer Dashboard upload flow.

Recapture attempt on 2026-06-26:

- A temporary local demo page was served under `/private/tmp` and opened as `http://example.com:18080/` in a separate Chrome profile with no Chrome Sync sign-in and no private profile data.
- Installed Google Chrome did not load the unpacked extension through command-line flags. The local Chrome binary reported `--load-extension is not allowed in Google Chrome, ignoring.` and `--disable-extensions-except is not allowed in Google Chrome, ignoring.`
- Chrome for Testing or Chromium was not available in the standard local application paths checked during this pass.
- This historical recapture issue was resolved for `04` and `05` on 2026-06-28 by using clean manually captured toolbar popup screenshots from a temporary Chrome profile.

Recommended five Store screenshot slots:

1. `final/01-options-local-proxy.png`
2. `final/03-popup-current-site.png`
3. `final/04-popup-related-domains.png`
4. `final/05-popup-recording.png`
5. `final/06-options-classification-overrides.png`

Keep `final/02-options-route-rules.png` in the repository as a useful fallback/supporting image.

No Chrome Web Store Developer Dashboard changes were made.

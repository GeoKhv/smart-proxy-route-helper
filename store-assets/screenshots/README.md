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
- `06-options-classification-overrides.png`

Popup screenshots were not captured in this automated pass. The extension intentionally relies on the `activeTab` permission without broad host access; opening the popup programmatically did not provide a real toolbar-click user gesture, so the popup could not safely read the current tab URL for Store-quality screenshots. Capture the popup states manually from a clean Chrome profile using `docs/chrome-web-store-screenshot-workflow.md`.

No Chrome Web Store Developer Dashboard changes were made.

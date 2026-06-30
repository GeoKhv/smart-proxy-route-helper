# Chrome Web Store Screenshot Plan

This plan defines screenshot candidates and the current draft canvas set for the published `v0.1.0` Chrome Web Store listing and future Store updates. Do not include private user data, personal accounts, private messages, bank or work bookmarks, credentials, proxy secrets, or sensitive tabs.

Chrome Web Store listing documentation requires at least one `1280x800` screenshot and allows up to five screenshots. Prepare a focused five-image set first, then keep the additional ideas as optional support images for documentation or future listing updates.

## Current Final Draft Canvases

Prepared on 2026-06-26 under [../store-assets/screenshots/final/](../store-assets/screenshots/final/):

| Final canvas | Source draft | Status |
| --- | --- | --- |
| `01-options-local-proxy.png` | `../store-assets/screenshots/01-options-local-proxy.png` | `1280x800` final draft canvas |
| `02-options-route-rules.png` | `../store-assets/screenshots/02-options-route-rules.png` | `1280x800` final draft canvas; fallback/supporting image |
| `03-popup-current-site.png` | `../store-assets/screenshots/03-popup-current-site.png` | `1280x800` final draft canvas from existing popup crop |
| `04-popup-related-domains.png` | `../store-assets/screenshots/04-popup-related-domains.png` | `1280x800` final draft canvas regenerated 2026-06-28 from clean full-window popup source; no visible cursor highlight |
| `05-popup-recording.png` | `../store-assets/screenshots/05-popup-recording.png` | `1280x800` final draft canvas regenerated 2026-06-28 from clean full-window popup source; no visible cursor highlight |
| `06-options-classification-overrides.png` | `../store-assets/screenshots/06-options-classification-overrides.png` | `1280x800` final draft canvas |

The current set contains six draft canvases so the repository can keep one fallback/supporting image while the Store listing uses a focused five-image set. The Chrome Web Store Developer Dashboard was not opened or modified during this preparation work.

The final draft canvases use only sanitized demo data:

- Local proxy: `socks5 127.0.0.1:1080`.
- Demo route rules: `example.com`, `chatgpt.com`, `oaiusercontent.com`, `linkedin.com`, `licdn.com`, and `2ip.io`.
- Demo classification overrides: `trkn.us` ignored globally and `licdn.com` suggested for `linkedin.com`.

No private proxy/provider/account information, private pages, credentials, personal profile data, backend data, telemetry data, or Chrome Web Store Developer Dashboard data is included.

Popup screenshots `04` and `05` were replaced on 2026-06-28 from clean full-window Chrome screenshots saved under `../store-assets/screenshots/source/`. Their final canvases should still be reviewed during the manual Dashboard upload flow, but the previous cursor-highlight blocker is resolved.

## Current Promotional Draft Assets

Prepared on 2026-06-28 under [../store-assets/promotional/](../store-assets/promotional/):

| Asset | Source | Status |
| --- | --- | --- |
| `small-promo-440x280.png` | `small-promo-440x280.svg` | `440x280` small promotional image source asset for Chrome Web Store listing maintenance |

The small promotional image uses neutral copy: `Smart Proxy Route Helper` and `Route selected sites through your local proxy`. The visual uses sanitized example domains, a local proxy diagram, and privacy/user-control labels. It contains no private data, personal browser content, external CDN assets, external fonts, backend references, telemetry claims, or publication claims.

## 2026-06-26 Recapture Attempt

The 2026-06-26 cleanup pass attempted a safe recapture without using the user's main Chrome profile:

- Built the current `dist/` output.
- Served a temporary sanitized local demo page and opened it as `http://example.com:18080/` in a separate Chrome profile under `/private/tmp`.
- Confirmed the temporary window contained only the clean demo page and no private profile data.
- Tried loading the current unpacked extension from both the repository `dist/` path and a `/private/tmp` copy.

The installed Google Chrome build did not allow command-line unpacked extension loading. It reported `--load-extension is not allowed in Google Chrome, ignoring.` and `--disable-extensions-except is not allowed in Google Chrome, ignoring.` Chrome for Testing or Chromium was not available in the standard local application paths checked during the pass.

At that time, because a clean, real toolbar-opened popup could not be reproduced in this environment, the existing `04` and `05` canvases were kept as draft candidates rather than edited or faked.

## 2026-06-28 Clean Popup Replacement

The clean manually captured popup screenshots were saved as:

- `../store-assets/screenshots/source/04-popup-related-domains-clean.png`
- `../store-assets/screenshots/source/05-popup-recording-clean.png`

They were captured in a temporary clean Chrome profile from real toolbar popup states on `example.com`. The images were cropped to the visible popup panel without painting over, faking, or retouching the UI, then converted into the final `1280x800` canvases. Visual review found no private data and no cursor highlight in the regenerated `04` and `05` final canvases.

## Capture Environment

Preferred capture setup:

- Use a clean Chrome test profile.
- Load the built `dist/` extension as an unpacked extension.
- Follow the clean-profile workflow in [docs/chrome-web-store-screenshot-workflow.md](chrome-web-store-screenshot-workflow.md).
- Use the optional manual demo fixture in [docs/demo-storage-fixture.json](demo-storage-fixture.json) only inside the clean screenshot profile.
- Use neutral sample domains such as `example.com`, `docs.example`, or `assets.example`.
- Use a non-secret local proxy placeholder such as `127.0.0.1:8080`.
- Keep browser bookmarks, account avatars, notifications, and unrelated tabs hidden.
- Crop to the extension UI or use a clean browser window with only the relevant UI visible.

If clean screenshots are not feasible, do not capture live UI. Use placeholder screenshot requirements in the Store prep issue and capture later from a clean profile.

## Required Store Assets

Verify before any future Store package or listing update:

- Store icon: `128x128` px.
- Screenshots: at least one `1280x800` px screenshot, up to five total.
- Small promo tile: `store-assets/promotional/small-promo-440x280.png`, `440x280` px PNG source asset prepared; final-review manually in the Developer Dashboard before future submission updates.
- Optional marquee promo tile: `1400x560` px PNG or JPEG.

## Recommended Five-Screenshot Set

Use these five content slots for the published listing or future Store update set:

### 1. Options: Local Proxy Configuration

Show the Options page section for device-specific local proxy configuration.

Recommended visible state:

- Enabled local proxy setting.
- Scheme, host, and port fields filled with safe placeholder values.
- A neutral saved state or validation message.

Message to convey: local proxy settings stay device-specific and user-controlled.

### 2. Popup: Current-Site Routing Controls

Show the popup on a neutral sample site.

Recommended visible state:

- Current domain shown at hostname level.
- Button or state for adding/removing the current site rule.
- No private URL path, query string, or account data.

Message to convey: current-site routing is explicit and controlled from the popup.

### 3. Popup: Related-Domain Preview

Show the related-domain preview with selected sample candidates.

Recommended visible state:

- A compact list of sanitized hostname-level candidates.
- Suggested demo candidates include `oaiusercontent.com` for `chatgpt.com` and `licdn.com` for `linkedin.com`; `trkn.us` may be shown as ignored globally if that state is useful.
- User selection controls.
- Separate add action.

Message to convey: related-domain suggestions are previewed first and require explicit selection before saving.

### 4. Popup: Diagnostic Recording

Show the explicit start/stop/cancel recording flow using a neutral test page.

Recommended visible state:

- Recording control state.
- Stop and preview action.
- No user-generated content, uploaded files, credentials, or private page text.

Message to convey: recording is temporary, action-specific, and user-invoked.

### 5. Options: Classification Overrides

Show domain-level classification override controls.

Recommended visible state:

- Sample override entries with placeholder domains.
- Clear reset/remove controls.

Message to convey: overrides are domain-level preferences, not browsing history.

## Additional Screenshot Candidates

Use these only if the Store listing needs a different emphasis or if final Dashboard review prefers a more options-focused set.

### Options: Synced Domain Rules

Show the Options page domain rules section.

Recommended visible state:

- A short list of sample domains.
- Suggested demo domains: `example.com`, `chatgpt.com`, `oaiusercontent.com`, `linkedin.com`, `licdn.com`, and `2ip.io`.
- Include-subdomains setting where available.
- Clear rule enable/edit/remove controls.

Message to convey: users manually manage domain-level proxy routes.

### Popup: Check via Proxy

Show the manual current-site diagnostic action if a clean popup state is captured later.

Recommended visible state:

- "Check via proxy" action.
- A neutral success or warning result.
- No detailed network logs or private request data.

Message to convey: diagnostics run only after user action and do not save history.

## Screenshot Copy Guardrails

Keep visible text neutral:

- Use "proxy routing", "local proxy", "PAC configuration", "diagnostics", "direct route", and "proxy route".
- Do not frame the extension around political, regional, or content-access claims.
- Do not show real private domains unless they are public project examples.

## Capture Checklist

- [ ] Clean test profile or equivalent private-data-safe environment used.
- [ ] No personal accounts, private messages, sensitive tabs, or real bookmarks visible.
- [ ] No raw URLs with paths, queries, fragments, credentials, or private tokens visible.
- [ ] No proxy secrets or authentication material visible.
- [ ] Screenshots are `1280x800` px where used for Store listing.
- [ ] Screenshots match the submitted extension version and UI.
- [ ] Captions and listing text match actual behavior.

## Official References

- Chrome Web Store listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome Web Store image requirements: https://developer.chrome.com/docs/webstore/images

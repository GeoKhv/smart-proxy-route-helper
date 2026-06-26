# Chrome Web Store Screenshot Workflow

This workflow prepares clean Chrome Web Store screenshots for Smart Proxy Route Helper without exposing personal accounts, private tabs, real proxy settings, route rules, classification overrides, or page content.

This is a screenshot-preparation workflow only. Do not publish to Chrome Web Store, change Developer Dashboard entries, change runtime permissions, add remote calls, add backend services, or capture screenshots from a personal Chrome profile.

## Clean Profile Setup

Use a separate Chrome profile dedicated to screenshots.

Recommended setup:

1. Create a new Chrome profile named `Smart Proxy Demo` or similar.
2. Do not sign in to Chrome Sync in this profile.
3. Do not import bookmarks, history, passwords, extensions, or personal settings.
4. Close unrelated Chrome windows before capture.
5. Keep only neutral screenshot tabs open, such as `example.com`, `chrome://extensions`, the extension popup, and the extension Options page.
6. Hide or crop the bookmarks bar, account avatar, notifications, downloads shelf, and unrelated browser UI.

If a clean profile is not available, do not capture live UI in this slice. Document the missing screenshot work and capture later from a clean profile.

## Build and Load the Extension

From the repository root:

```sh
npm run build
```

In the clean Chrome profile:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose `Load unpacked`.
4. Select the generated `dist/` directory from this repository.
5. Pin the extension only if the popup screenshot needs the toolbar entry visible.

Do not load unpacked from a private or modified build directory. Screenshots should match the extension version intended for Store review.

Do not rely on command-line unpacked extension loading in installed Google Chrome. During the 2026-06-26 cleanup pass, installed Google Chrome reported `--load-extension is not allowed in Google Chrome, ignoring.` and `--disable-extensions-except is not allowed in Google Chrome, ignoring.` Use Chrome for Testing, Chromium, or the `chrome://extensions` Load unpacked flow in a clean profile instead.

## Demo Data

Use only sanitized demo values. The fixture at [docs/demo-storage-fixture.json](demo-storage-fixture.json) is for manual clean-profile setup only and is not loaded by production runtime.

Safe local proxy example:

- Scheme: `socks5`
- Host: `127.0.0.1`
- Port: `1080`

Safe demo route rules:

- `example.com`, include subdomains.
- `chatgpt.com`, include subdomains.
- `oaiusercontent.com`, include subdomains.
- `linkedin.com`, include subdomains.
- `licdn.com`, include subdomains.
- `2ip.io`, exact domain only, if an external test page is needed.

Safe demo classification overrides:

- `trkn.us` ignored globally.
- `licdn.com` suggested for `linkedin.com`.

Use the Options UI where possible to enter local proxy settings and route rules. If exact storage-state setup is needed, use the fixture only inside the clean screenshot profile and only through manual extension debugging tools. Never paste fixture data into the user's main profile.

## Page and Account Safety

Avoid showing:

- Personal accounts or signed-in pages.
- ChatGPT conversations, LinkedIn feeds, messages, notifications, private profiles, or job pages.
- Browser bookmarks, saved passwords, history, downloads, extensions, or profile avatars.
- Real proxy provider names, real proxy IP addresses, credentials, tokens, or private infrastructure.
- Private domains, internal hostnames, classification overrides, or production route rules.
- Raw URLs with paths, queries, fragments, credentials, or tracking parameters.

Prefer neutral public pages. `example.com` is safest for current-site controls. Use `2ip.io` only if a live external test page is necessary and the visible page does not expose a real IP, provider, account, or location.

## Screenshot Sizes

Use the Store asset plan from [docs/chrome-web-store-screenshots.md](chrome-web-store-screenshots.md):

- Store screenshot: `1280x800` px, 16:10. At least one is required; prepare up to five.
- Store icon: `128x128` px.
- Small promo tile: `440x280` px.
- Optional marquee promo tile: `1400x560` px.

For the first Store-ready pass, capture all five screenshots at `1280x800` so the set is consistent. Crop to the extension UI or use a clean browser window with only relevant UI visible. Cropped popup-only drafts are acceptable as source material, but convert or recapture them on a `1280x800` Store-ready canvas before upload.

## Final Canvas Composition

The current final draft canvases are generated under [../store-assets/screenshots/final/](../store-assets/screenshots/final/) from the safe source drafts in [../store-assets/screenshots/](../store-assets/screenshots/).

From the repository root:

```sh
mkdir -p /private/tmp/sprh-clang-cache
CLANG_MODULE_CACHE_PATH=/private/tmp/sprh-clang-cache swift scripts/compose-store-screenshots.swift
```

The script uses local macOS system rendering only. It does not use external assets, CDN fonts, runtime extension code, Chrome Web Store Developer Dashboard data, private user data, or network access.

After generation, confirm every final PNG is `1280x800`:

```sh
for f in store-assets/screenshots/final/*.png; do sips -g pixelWidth -g pixelHeight "$f"; done
```

Popup screenshots `03` through `05` are composed from existing toolbar-opened popup crops. If a visible cursor highlight remains in a popup source crop, do not paint over it. Either recapture the popup safely from the visible extension toolbar icon in a clean Chrome profile, or keep the canvas documented as a draft candidate requiring final clean recapture before Store submission.

## Recommended Five-Screenshot Set

Use the same content set as the screenshot plan after popup screenshots `04` and `05` have been cleanly recaptured without cursor highlight:

1. Options: Local Proxy Configuration.
   Show device-specific local proxy settings with `socks5`, `127.0.0.1`, and `1080`. Do not show a real proxy provider, real IP, or credentials.
2. Popup: Current-Site Routing Controls.
   Open the popup on `https://example.com` or another neutral public page. Show hostname-level routing controls only.
3. Popup: Related-Domain Preview.
   Show sanitized related-domain candidates for `chatgpt.com` or `linkedin.com` only in the clean profile. Use demo candidates such as `oaiusercontent.com` and `licdn.com`; keep ignored `trkn.us` visible only if it helps show the ignored state without policy-sensitive framing.
4. Popup: Diagnostic Recording.
   Show the explicit start/stop/cancel recording state using a neutral test page. Do not show user-generated content, uploaded files, credentials, or private page text.
5. Options: Classification Overrides.
   Show domain-level classification override controls with placeholder domains. Keep clear reset/remove controls visible.

Keep Options: Synced Domain Rules as a fallback/supporting screenshot if one of the popup states cannot be cleanly recaptured. Do not upload current popup draft canvases that still show cursor highlight.

Do not use personal ChatGPT or LinkedIn pages for Store screenshots. If those domains are shown, use a clean signed-out page or a cropped extension UI state that does not reveal account content.

## Capture Checklist

- [ ] Clean Chrome profile used.
- [ ] No Chrome Sync sign-in in the screenshot profile.
- [ ] Extension loaded from the current `dist/` build.
- [ ] Popup screenshots are opened from the visible extension toolbar action so `activeTab` uses a real user gesture.
- [ ] Demo data uses only sanitized domains and `127.0.0.1:1080`.
- [ ] No personal accounts, private tabs, bookmarks, profile avatars, notifications, or downloads visible.
- [ ] No real proxy provider, real IP address, credentials, or private infrastructure visible.
- [ ] No private route rules or classification overrides visible.
- [ ] No full URLs with paths, queries, fragments, credentials, or tokens visible.
- [ ] Screenshots are `1280x800` px for Store listing use.
- [ ] Screenshot content matches the current extension UI and Store listing copy.

## Boundary Checks

This workflow must not require or introduce:

- Chrome Web Store publishing.
- Chrome Web Store Developer Dashboard changes.
- Runtime permission changes.
- `host_permissions`.
- `<all_urls>`.
- `webRequest` or `webNavigation`.
- Persistent content scripts.
- Backend services, telemetry, remote code, or runtime remote list fetching.
- Automatic route creation or automatic profile mutation.

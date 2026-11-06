# Chrome Web Store screenshots — 0.4.0

Current shared English set for all Store locales. Captured from the real unpacked dist/0.4.0
extension on 2026-11-06 in Smart Proxy Capture Chrome 156.0.8078.80. Chrome Sync was signed out
and disabled. Only disposable profiles, public example domains and loopback demo settings were used.
These images describe configured routing and browser control; they do not claim verified corporate
VPN, SOCKS5 server, authentication or CA connectivity.

## Final upload files

1. `01-options-routes.png` — simultaneous lists and actual Chrome Proxy/PAC control.
2. `02-options-work-socks5.png` — device-local Work SOCKS5 configuration.
3. `03-options-life-direct.png` — independent Life DIRECT connection and OS VPN explanation.
4. `04-popup-life-direct.png` — current site's Life DIRECT intent, selected list and browser control.

All four files are PNG, RGB without alpha, **1280×800**. Their checksums are in `SHA256SUMS`. Use these in place of older Options/Popup
captures whose UI no longer matches 0.4.0. This set is prepared for the existing Store item; it has
not been uploaded, submitted or published through Developer Dashboard.

## Capture provenance

The persistent capture app was launched using the project launcher. Each session cloned its
pristine template into `/private/tmp`; the normal Chrome profile was never used. The already
installed unpacked extension pointed to the real repository dist/. Reload it through
chrome://extensions before opening Options: the pristine profile can contain cached modules from
an earlier build. No unpacked-extension command-line flag, new app signature or Chrome Sync login
was used. The existing Backup and restore UI previewed and explicitly applied the sanitized
`source/demo-settings.json` fixture.

Options native captures used a 1280×800 browser window. Popup was opened by the visible toolbar
action on the signed-out public `https://example.org` page, using a 640×800 browser window so the
native transient-window capture retains readable pixels. Its actual route remained Life DIRECT.
The screenshot API returned JPEG bytes; the native `.jpg` files preserve those original captures.
The `.png` sources are simple crops, not reconstructed or modified extension UI. Cursor highlights,
browser chrome and unrelated content lie outside the crops; nothing was painted out. The Popup
crop ends above a partially visible next action in the natural scroll viewport.

## Reproduce

Use the isolated-chrome-capture skill and `scripts/launch-isolated-chrome-capture.sh`, with
`--window-size 1280,800` for Options and `--window-size 640,800` for Popup. Use Computer Use for
navigation, import, toolbar opening and native capture. Save the native captures under source/
using the names below, then run these commands from the repository root:

```sh
sips -s format png --cropToHeightWidth 1180 1840 --cropOffset 210 360 store-assets/screenshots/v0.4.0/source/options-routes-native.jpg --out store-assets/screenshots/v0.4.0/source/options-routes.png
sips -s format png --cropToHeightWidth 970 1840 --cropOffset 360 360 store-assets/screenshots/v0.4.0/source/options-work-native.jpg --out store-assets/screenshots/v0.4.0/source/options-work.png
sips -s format png --cropToHeightWidth 860 1840 --cropOffset 360 360 store-assets/screenshots/v0.4.0/source/options-life-native.jpg --out store-assets/screenshots/v0.4.0/source/options-life.png
sips -s format png --cropToHeightWidth 1164 656 --cropOffset 14 16 store-assets/screenshots/v0.4.0/source/popup-life-direct-native.jpg --out store-assets/screenshots/v0.4.0/source/popup-life-direct.png
CLANG_MODULE_CACHE_PATH=/private/tmp/sprh-clang-cache swift scripts/compose-store-screenshots.swift --named-routes
sips -g pixelWidth -g pixelHeight -g format -g hasAlpha store-assets/screenshots/v0.4.0/0*.png
```

The offsets apply to the supplied native captures. For a new capture, inspect the image before
reusing them; never crop text or a new UI state based solely on these historical coordinates.
Stop the isolated browser cleanly with the project stop script after capture.

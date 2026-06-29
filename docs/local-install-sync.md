# Local Install and Chrome Sync Fallback

This workflow is for users who install Smart Proxy Route Helper as an unpacked extension while Chrome Web Store publication is delayed, unavailable, or not desired for a local setup.

It does not change the Chrome Web Store release package, does not add permissions, and does not add any backend sync. It only creates a separate local build output with a stable extension ID.

## Why Stable Extension ID Matters

Chrome stores extension sync data by extension identity. If the same unpacked extension is loaded with a different extension ID on another device, `chrome.storage.sync` data such as route rules will not appear under the new ID.

For unpacked local installs, a stable extension ID can be kept by adding the manifest `key` field to the local build. The `key` must be the public manifest key string. Do not use or store a private key in this repository.

## What Syncs

When Chrome Sync is enabled for the user's Chrome profile, the extension can sync:

- Domain route rules.
- Domain-level classification overrides.
- Synced ignored domains and denylist entries.
- Rule metadata such as source and creation time.

## What Does Not Sync

The extension does not sync:

- Local proxy host, port, scheme, or enabled state.
- Recording sessions.
- Raw URLs, paths, query strings, fragments, or credentials.
- Page data, page text, screenshots, cookies, or uploaded file contents.
- Collected resource host lists or diagnostic history.
- Backend state, telemetry, or remote configuration.

Settings export/import remains a local backup and migration option. Local proxy configuration is excluded from export by default and is included only when the user explicitly selects that option.

## Get the Public Key

Use a public manifest key only.

Good sources:

- Chrome Web Store Developer Dashboard, from the existing extension item when available.
- An existing extension package or manifest where the same public `key` was already intentionally used.

Do not commit the key. Do not commit `.local/`. Do not place a private key, PEM private key, signing key, or certificate material in this repository.

## Store the Key Locally

Create a local ignored file:

```sh
mkdir -p .local
printf '%s\n' 'PASTE_PUBLIC_MANIFEST_KEY_HERE' > .local/extension-public-key.txt
```

Alternatively, provide the key through an environment variable:

```sh
SPRH_EXTENSION_PUBLIC_KEY='PASTE_PUBLIC_MANIFEST_KEY_HERE' npm run build:local-stable-id
```

The key should be the base64 manifest public key string without PEM headers or footers.

## Build the Stable-ID Local Output

Run:

```sh
npm run build:local-stable-id
```

The script runs the normal build first, copies `dist/` to `dist-local/`, and injects `manifest.key` only into `dist-local/manifest.json`.

Normal build remains unchanged:

```sh
npm run build
```

That command writes `dist/` without `manifest.key`.

## Load the Local Build

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click "Load unpacked".
4. Select:

```text
/Users/geo/Documents/smart-proxy-route-helper/dist-local
```

Repeat the same process on another Mac or Windows device with the same public manifest key in its local setup. The source checkout can remain public and key-free on every device.

## Manual Smoke Check

After running `npm run build:local-stable-id`, confirm:

- `dist-local/manifest.json` contains `key`.
- `dist/manifest.json` does not contain `key`.
- `manifest.json` does not contain `key`.
- Manifest permissions remain `proxy`, `storage`, `activeTab`, and `scripting`.
- `host_permissions` remains absent.
- `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, backend calls, telemetry, remote list fetching, and remote executable code remain absent.

Use a clean Chrome profile for install smoke testing when possible. Do not use a private or daily browsing profile for experimental unpacked-install checks.

# Chrome Web Store Screenshot Plan

The current v0.3.0 candidate screenshot package is the five-image English set under `../store-assets/screenshots/v0.3.0/en/`. Chrome Web Store supports at least one `1280x800` screenshot and up to five total; the repository package uses all five slots for the focused user scenarios.

## Shared locale policy

- English screenshots are shared across the English and Russian Store locales.
- Russian locale uses Russian listing text from `store-assets/listing/ru/` only.
- Do not upload a separate Russian screenshot set.
- Global promo tiles and Privacy practices are outside this screenshot-preparation slice.

## Current five-image set

| File | Scenario | User message |
| --- | --- | --- |
| `store-assets/screenshots/v0.3.0/en/01-options-local-proxy.png` | Local proxy settings | Proxy host, port, and enabled state are device-local and user-controlled. |
| `store-assets/screenshots/v0.3.0/en/02-options-proxy-direct-rules.png` | Proxy and Direct rules | Users choose route action and exact or subdomain scope explicitly. |
| `store-assets/screenshots/v0.3.0/en/03-popup-site-status.png` | Current-site popup | The effective route and quick actions are visible at a glance. |
| `store-assets/screenshots/v0.3.0/en/04-related-domain-review.png` | Related-domain review | Each candidate has an Add action; selected candidates have a sticky batch action. |
| `store-assets/screenshots/v0.3.0/en/05-backup-import-preview.png` | Backup and Import Preview | Versioned local settings can be reviewed before Apply. |

## Capture requirements

- Use the real production build from `dist/`.
- Use the isolated Smart Proxy Capture Chrome workflow and a clean temporary English profile.
- Keep Chrome Sync signed out and do not use the owner's normal Chrome profile.
- Use only sanitized public demo domains and `socks5 127.0.0.1:1080`.
- Keep text readable, popup content unclipped, and sticky actions visible.
- Do not show personal accounts, bookmarks, history, avatars, credentials, proxy secrets, private pages, raw URL paths, or query parameters.
- Do not translate or fabricate UI in an image editor.

## Current preparation status

The five English captures are present and visually/privacy audited in the repository. This task does not open or modify the Chrome Web Store Developer Dashboard, upload assets, change Privacy practices, or submit for review.

## Official references

- https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- https://developer.chrome.com/docs/webstore/images

# Manual Chrome Web Store Dashboard Checklist — v0.3.0 Candidate

Preparation only. Do not open or modify the Chrome Web Store Developer Dashboard, upload assets, or submit for review in this slice.

## Listing locales

- [ ] Use the English Store texts from `listing/en/` for the English locale.
- [ ] Use the Russian Store texts from `listing/ru/` for the Russian locale.
- [ ] Keep the title `Smart Proxy Route Helper` without SEO or VPN wording.
- [ ] Use the same five English screenshots from `screenshots/v0.3.0/en/` for every Store locale.
- [ ] Russian listing receives Russian text only; do not upload a separate Russian screenshot set.

## English listing

- [ ] Use the primary summary in `listing/en/summary.md` (86 characters).
- [ ] Keep the short fallback summary available in the same file (70 characters).
- [ ] Use the English detailed description, single purpose, permission justifications, and privacy summary from `listing/en/`.
- [ ] Keep the copy neutral: no VPN, unblock, anonymity, free proxy, speed, encryption, or tracking-protection claims.

## Shared assets

- [ ] Upload exactly five PNG screenshots, each `1280x800`.
- [ ] Confirm the screenshots show the current English production UI and sanitized demo data.
- [ ] Confirm the popup, sticky batch action, long strings, and Options content are readable.
- [ ] Keep the global small promo tile unchanged.
- [ ] Keep the global marquee/promo assets unchanged.

## Privacy and permissions

- [ ] Do not change Privacy practices or data categories in this preparation slice.
- [ ] Do not change permission declarations or add permissions.
- [ ] Recheck the English and Russian claims against the current manifest and production build before a future upload.

## Release gate

- [ ] Do not change the Dashboard, version, tag, or GitHub Release here.
- [ ] Do not press **Submit for review**.
- [ ] Treat this as a v0.3.0 candidate package while the local manifest and package remain `0.2.0`.

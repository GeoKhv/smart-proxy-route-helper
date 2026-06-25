# Domain Classification

Smart Proxy Route Helper uses a small local classification layer to decide how related-domain preview candidates should be shown. The layer is pure TypeScript logic: it does not read storage, write storage, call Chrome APIs, fetch remote lists, upload reports, or create rules.

## Model

Each classification result contains:

- `domain`: normalized candidate domain or base domain.
- `classification`: `related`, `ignored`, or `review`.
- `category`: `site-assets`, `analytics`, `adtech`, `system-helper`, `schema-helper`, `local-helper`, `suspicious`, or `unknown`.
- `scope`: `global` or `site`.
- `siteDomain`: present only for site-scoped classifications.
- `confidence`: `high`, `medium`, or `low`.
- `reason`: short human-readable rationale.
- `source`: `built-in`, `user-override`, or `community-proposal`.

The related-domain preview maps those decisions conservatively:

- `related` candidates are shown as likely related and may be selected by default.
- `ignored` candidates are non-saveable from preview.
- `review` candidates stay visible for manual review and are not selected by default.

## Precedence

Classification uses this order:

1. User override input, when supplied by a caller.
2. Built-in site-scoped related or ignored classification.
3. Built-in global ignored classification.
4. Existing local heuristics, such as same-site resources and suspicious-looking hosts.
5. Unknown fallback, which remains manual review.

This means uncertain domains are not hidden aggressively. High-confidence analytics, adtech, schema, local-helper, and broad shared-infrastructure hosts can be ignored, but unknown or suspicious hosts remain visible as review candidates.

## Built-In Data

Built-in data is bundled in the extension source under `src/domainClassification`. It is intentionally small and curated. Examples include:

- Global ignored hosts such as `doubleclick.net`, `google-analytics.com`, `googletagmanager.com`, `demdex.net`, `facebook.net`, `hotjar.com`, `local.adguard.org`, `w3.org`, `stickyadstv.com`, `3lift.com`, `33across.com`, `teads.tv`, and `rubiconproject.com`.
- Site-scoped related pairs such as `linkedin.com` to `licdn.com` and `letterboxd.com` to `ltrbxd.com`.

The extension does not fetch GitHub raw files, managed blocklists, remote PAC files, or remotely controlled classification logic at runtime. This keeps the extension functionality discernible from the submitted package and avoids remote executable-code risk.

## User Overrides

The pure model already supports storage-friendly user override inputs for later UI work:

- Always ignore a domain globally.
- Always review a domain globally.
- Always suggest a domain for a site.
- Always ignore a domain for a site.

This slice does not add override UI and does not change storage behavior. A future implementation should define defensive defaults, migration behavior, and tests before persisting personal overrides. Override data should stay domain-level only and must not store raw URLs, page text, screenshots, or browsing history.

## Community Proposals

A future community workflow can accept sanitized domain-level proposals through GitHub issues or pull requests. The runtime extension must not download community proposals directly. Maintainers can review proposals, add small safe entries to the bundled built-in data, and ship them in normal extension releases.

Issue reports should include:

- Site domain.
- Candidate domain.
- Expected classification.
- Short rationale.

Reports should not include full URLs, private paths, query strings, page text, account data, unredacted screenshots, or browser history.

## Permission and Review Notes

Domain classification does not require new permissions. It does not add host permissions, `<all_urls>`, `webRequest`, `webNavigation`, persistent content scripts, backend services, telemetry, remote PAC URLs, or runtime remote list fetching.

Chrome extension permissions and host access remain review-sensitive, and Manifest V3 submissions must keep extension logic self-contained in the package unless an explicit documented exception applies. Any future design that introduces remote resources or broader permissions needs a separate Chrome Web Store review pass before implementation.

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

The candidate engine then plans a route target separately from the observed host:

- `sourceHosts` are the sanitized hostnames observed on the current page.
- `suggestedRuleDomain` is the domain that would be saved if the user selects the candidate.
- `suggestedIncludeSubdomains` records whether sibling subdomains should be covered.
- `routeTargetReason` and `routeTargetConfidence` explain why the route target was kept exact or widened.

This separation matters for generated asset hosts. A page may load `sdmntpritalynorth.oaiusercontent.com`, while the useful explicit rule is `oaiusercontent.com` with subdomains included.

## Precedence

Classification uses this order:

1. User override input, when supplied by a caller.
2. Built-in site-scoped related or ignored classification.
3. Built-in global ignored classification.
4. Existing local heuristics, such as same-site resources and suspicious-looking hosts.
5. Unknown fallback, which remains manual review.

This means uncertain domains are not hidden aggressively. High-confidence analytics, adtech, schema, local-helper, and broad shared-infrastructure hosts can be ignored, but unknown or suspicious hosts remain visible as review candidates.

## Route Target Planning

Route target planning is conservative and local-only:

- Registrable-domain parsing is public-suffix-aware. The extension uses the bundled `tldts` package locally, with no runtime network access, telemetry, or remote list fetching.
- Naive "last two labels" broadening is unsafe. For example, `a.b.example.co.uk` belongs under `example.co.uk`, while `myproject.github.io`, `app.appspot.com`, `project.pages.dev`, `site.vercel.app`, and `site.netlify.app` must not be widened to their shared hosting roots.
- Known site-scoped related hints can suggest the configured related base domain with subdomains included. For example, `chatgpt.com` resources on generated `*.oaiusercontent.com` hosts are suggested as `oaiusercontent.com` with subdomains included only because the bundled site-scoped hint explicitly allows that route target.
- Same-site resource subdomains can suggest the current site's registrable domain with subdomains included.
- Multiple observed sibling hosts on a safe unknown registrable domain can suggest that registrable domain with subdomains included, while remaining manual-review candidates.
- A single unknown third-party host stays exact by default and is not selected automatically.
- Shared infrastructure and public-hosting-style domains such as `cloudfront.net`, `googleusercontent.com`, `github.io`, `appspot.com`, `auth0.com`, `pages.dev`, `vercel.app`, and `netlify.app` are not widened automatically. When shown, they stay exact or ignored according to classification unless a site-scoped related hint explicitly allows a narrower route target.

Coverage and duplicate checks use the suggested route target and its subdomain scope. An exact rule for `sdmntpritalynorth.oaiusercontent.com` does not cover sibling hosts such as `files.oaiusercontent.com`; a rule for `oaiusercontent.com` with subdomains included does.

## Built-In Data

Built-in data is bundled in the extension source under `src/domainClassification`. It is intentionally small and curated. Examples include:

- Global ignored hosts such as `doubleclick.net`, `google-analytics.com`, `googletagmanager.com`, `demdex.net`, `facebook.net`, `hotjar.com`, `local.adguard.org`, `w3.org`, `stickyadstv.com`, `3lift.com`, `33across.com`, `teads.tv`, `rubiconproject.com`, and broad shared-infrastructure bases such as `cloudfront.net`, `googleusercontent.com`, `github.io`, `appspot.com`, `auth0.com`, `pages.dev`, `vercel.app`, and `netlify.app`.
- Site-scoped related pairs such as `chatgpt.com` to `oaiusercontent.com`, `chatgpt.com` to `oaistatic.com`, `openai.com` to OpenAI asset domains, `linkedin.com` to `licdn.com`, and `letterboxd.com` to `ltrbxd.com`.

The extension does not fetch GitHub raw files, managed blocklists, remote PAC files, or remotely controlled classification logic at runtime. This keeps the extension functionality discernible from the submitted package and avoids remote executable-code risk.

## User Overrides

The extension supports personal user overrides for related-domain candidate classification:

- Always ignore a domain globally.
- Always review a domain globally.
- Always suggest a domain for a site.
- Always ignore a domain for a site.

Overrides are stored in `chrome.storage.sync` so the same Chrome profile can carry the user's personal classification choices across synced Chrome installations. The storage shape is intentionally small:

- Global overrides: normalized candidate domain to `ignored` or `review`.
- Site-scoped overrides: normalized site domain plus normalized candidate domain to `suggested` or `ignored`.

Stored override data is domain-level only. The extension normalizes domain or URL input to hostnames before storage and does not store full URLs, paths, query strings, fragments, credentials, raw page resource lists, page text, screenshots, browsing history, or diagnostic history as classification overrides.

Related-domain preview exposes compact explicit actions for candidate rows, such as ignoring a candidate globally, ignoring it for the current site, keeping an ignored candidate in review globally, or suggesting a candidate for the current site. Saving a classification override does not create a proxy routing rule. After an override is saved, the preview is refreshed so the visible classification reflects the new preference.

Options includes a small management section for current classification overrides and allows removing them. Removing an override does not remove proxy routing rules.

User overrides are personal preferences, not community votes. They are not uploaded, submitted, or synced to GitHub by the extension.

Related-domain preview itself is user-invoked and transient. The preview may inspect current-page resource references after an explicit popup click, but it passes only sanitized hostnames into the classifier. Full resource URLs, paths, query strings, fragments, credentials, page text, screenshots, browsing history, and diagnostic history are not stored as classification data.

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

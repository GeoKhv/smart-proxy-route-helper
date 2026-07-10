# MVP Release Checklist

Use this checklist before publishing, tagging, or updating an MVP release.

## Automated Checks

- Run `npm test`.
- Run `npm run build`.
- Run `npm run typecheck --if-present`.
- Run `git diff --check`.
- After staging new files, run `git diff --cached --check`.
- Run `npm audit`.
- Run `npm run package` after a successful build and inspect `release/smart-proxy-route-helper-v0.1.0.zip`.
- Confirm the package zip is for version `0.1.0` and contains `manifest.json`, icons, background service worker, popup UI, options UI, and required bundled assets.
- Confirm the package zip does not include `node_modules`, `.env` files, source maps, or TypeScript source files unless a specific build-output reason has been reviewed.

## Manifest and Package Checks

- Confirm `manifest.json` and `package.json` use the same release version.
- Confirm extension name and description use neutral proxy routing language.
- Confirm bundled icons exist for 16, 32, 48, and 128 pixels.
- Confirm manifest permissions are exactly `proxy`, `storage`, `activeTab`, and `scripting`.
- Confirm `host_permissions` is absent.
- Confirm `<all_urls>` is absent.
- Confirm `webRequest` and `webNavigation` are absent.
- Confirm there are no persistent content scripts.
- Confirm build output contains local bundled assets only.
- Confirm build output does not include `node_modules`, `.env` files, or source maps unless intentionally reviewed.

## Privacy and Policy Checks

- Confirm README, `PRIVACY.md`, `docs/permissions.md`, `docs/domain-classification.md`, and `docs/architecture.md` still match runtime behavior.
- Confirm no telemetry, analytics, ads, backend calls, remote PAC URLs, runtime remote list fetching, or remote executable code are present.
- Confirm public suffix / registrable-domain data is bundled locally and no runtime suffix-list fetching is present.
- Confirm route rules and classification overrides are domain-level data.
- Confirm local proxy configuration stays in `chrome.storage.local`.
- Confirm route rules and classification overrides sync through `chrome.storage.sync`.
- Confirm raw URLs, paths, query strings, fragments, credentials, browsing history, page resource lists, diagnostic history, and temporary probe state are not stored or synced.
- Confirm related-domain preview is user-invoked, transient, and does not save rules without a separate explicit action.
- Confirm diagnostic recording is user-invoked, bounded, transient, and does not save rules without a separate explicit action.
- Confirm `scripting` is used only after a user action to inspect current loaded page resource hostnames for preview or diagnostic recording.
- Confirm diagnostic recording metadata in `chrome.storage.session` contains only tab/domain/time/status, random nonce, and recorded-document identity fields and no collected hosts.
- Confirm timeout stops collection and removes hooks/listeners, while any bounded hostname set retained for expired-session preview is deleted on Stop, Cancel, navigation, or tab teardown.

## Manual Smoke

- Load `dist/` as an unpacked extension in Chrome.
- Confirm 2ip.ru and 2ip.io route through the configured local proxy and show the expected proxy IP/city behavior.
- Change the local proxy port to a known-wrong value and confirm matched proxy routes fail closed instead of reporting false proxy success.
- Add and remove the current site from the popup.
- Confirm a site covered by a parent `includeSubdomains` rule is shown as inherited coverage in the popup rather than as an exact removable rule.
- Configure local proxy settings in Options and confirm they remain local to the device.
- Add, disable, and remove synced route rules from Options.
- Preview related domains on a loaded LinkedIn page and confirm useful related asset candidates such as `licdn.com` media/static resources show the suggested rule domain, observed hostnames, and the intended include-subdomains setting before saving.
- Preview related domains on a loaded ChatGPT/OpenAI page and confirm generated `*.oaiusercontent.com` hosts are planned as `oaiusercontent.com` with subdomains included only through the bundled site-scoped hint.
- Run a diagnostic recording on a loaded ChatGPT/OpenAI page, perform a harmless action that loads resources, stop and preview, and confirm recorded candidates still require explicit selection before saving.
- For ChatGPT/OpenAI upload smoke, use only a temporary harmless text file, do not send the message, verify generated `*.oaiusercontent.com` upload hosts are covered by `oaiusercontent.com` include-subdomains routing, then delete the temporary file.
- Start a diagnostic recording and then cancel it; confirm cancellation returns no candidates and does not create, remove, or alter route rules.
- Confirm shared-infrastructure examples such as `github.io`, `appspot.com`, `pages.dev`, `vercel.app`, `netlify.app`, `cloudfront.net`, `googleusercontent.com`, and `auth0.com` are not suggested as broad include-subdomains route targets unless an explicit site-scoped hint allows the narrower target.
- Confirm selected related-domain candidates save the suggested rule domain, not necessarily the exact observed generated host.
- Confirm ignored candidates remain separated and are not saved automatically.
- Add and remove a classification override and confirm it does not create proxy routing rules.
- Open browser, local, private/internal, error, and protection pages and confirm the popup shows friendly unsupported/protected-page behavior.
- Confirm no backend requests, telemetry, host permissions, persistent content scripts, `webRequest`, or `webNavigation` appear during smoke testing.

## npm Audit Notes

Current v0.1.0 audit result:

- Severity: low.
- Affected dependency: `esbuild` 0.27.3 - 0.28.0.
- Advisory: arbitrary file read when running the development server on Windows.
- Runtime impact assessment: dev-server-only tooling issue; the packaged extension does not run the Vite dev server, does not include `node_modules`, and does not include `esbuild`.
- Dependency note: `tldts` is used for bundled public-suffix-aware domain parsing and did not introduce runtime remote fetching.
- `npm audit fix`: available, but not applied in this release-polish change to avoid dependency churn during v0.1.0 closeout. Reassess separately before a future package update if the release branch can absorb a lockfile update and a fresh full verification pass.

Do not apply broad dependency upgrades during release closeout unless the change is trivial, safe, and tested.

Refresh this audit note whenever `npm audit` changes. If the known low-severity `esbuild` development-server advisory remains the only finding, document it in the final release report and keep dependency upgrades out of this slice unless explicitly approved.

## Release Notes

- Update `docs/release-notes-v0.1.0.md`.
- State whether the extension is Chrome Web Store published. For `v0.1.0`, it is published at https://chromewebstore.google.com/detail/smart-proxy-route-helper/kidgoemedakjcnbhpccponmpaibfhekj.
- Keep public wording neutral: proxy routing, local proxy, PAC manager, diagnostics, direct route, proxy route.

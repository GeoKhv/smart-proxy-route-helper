# MVP Release Checklist

Use this checklist before publishing or tagging an MVP release candidate.

## Automated Checks

- Run `npm test`.
- Run `npm run build`.
- Run `npm run typecheck --if-present`.
- Run `git diff --check`.
- After staging new files, run `git diff --cached --check`.
- Run `npm audit`.
- Run `npm run package` after a successful build and inspect `release/smart-proxy-route-helper-v0.1.0.zip`.

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
- Confirm route rules and classification overrides are domain-level data.
- Confirm local proxy configuration stays in `chrome.storage.local`.
- Confirm route rules and classification overrides sync through `chrome.storage.sync`.
- Confirm raw URLs, paths, query strings, fragments, credentials, browsing history, page resource lists, diagnostic history, and temporary probe state are not stored or synced.
- Confirm related-domain preview is user-invoked, transient, and does not save rules without a separate explicit action.
- Confirm `scripting` is used only after a user action to inspect current loaded page resource hostnames.

## Manual Smoke

- Load `dist/` as an unpacked extension in Chrome.
- Confirm 2ip.ru and 2ip.io route through the configured local proxy and show the expected proxy IP/city behavior.
- Change the local proxy port to a known-wrong value and confirm matched proxy routes fail closed instead of reporting false proxy success.
- Add and remove the current site from the popup.
- Configure local proxy settings in Options and confirm they remain local to the device.
- Add, disable, and remove synced route rules from Options.
- Preview related domains on a loaded ChatGPT/OpenAI or LinkedIn-like page and confirm useful related asset candidates show the suggested rule domain, observed hostnames, and the intended include-subdomains setting before saving.
- Confirm selected related-domain candidates save the suggested rule domain, not necessarily the exact observed generated host.
- Confirm ignored candidates remain separated and are not saved automatically.
- Add and remove a classification override and confirm it does not create proxy routing rules.
- Open browser, local, private/internal, error, and protection pages and confirm the popup shows friendly unsupported/protected-page behavior.
- Confirm no backend requests, telemetry, host permissions, persistent content scripts, `webRequest`, or `webNavigation` appear during smoke testing.

## npm Audit Notes

Current v0.1.0 RC audit result:

- Severity: low.
- Affected dependency: `esbuild` 0.27.3 - 0.28.0.
- Advisory: arbitrary file read when running the development server on Windows.
- Runtime impact assessment: dev-server-only tooling issue; the packaged extension does not run the Vite dev server, does not include `node_modules`, and does not include `esbuild`.
- `npm audit fix`: available, but not applied in this release-polish change to avoid dependency churn during RC closeout. Reassess separately before publication if the release branch can absorb a lockfile update and a fresh full verification pass.

Do not apply broad dependency upgrades during release closeout unless the change is trivial, safe, and tested.

## Release Notes

- Update `docs/release-notes-v0.1.0.md`.
- State whether the extension is Chrome Web Store published. For this RC, it is not yet published unless a separate publishing step has completed.
- Keep public wording neutral: proxy routing, local proxy, PAC manager, diagnostics, direct route, proxy route.

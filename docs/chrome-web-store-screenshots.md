# Chrome Web Store Screenshot Plan

This plan defines screenshot candidates for a future Chrome Web Store submission. Do not include private user data, personal accounts, private messages, bank or work bookmarks, credentials, proxy secrets, or sensitive tabs.

Chrome Web Store listing documentation requires at least one `1280x800` screenshot and allows up to five screenshots. Prepare a focused five-image set first, then keep the additional ideas as optional support images for documentation or future listing updates.

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

Prepare before submission:

- Store icon: `128x128` px.
- Screenshots: at least one `1280x800` px screenshot, up to five total.
- Small promo tile: `440x280` px PNG or JPEG.
- Optional marquee promo tile: `1400x560` px PNG or JPEG.

## Recommended Five-Screenshot Set

### 1. Options: Local Proxy Configuration

Show the Options page section for device-specific local proxy configuration.

Recommended visible state:

- Enabled local proxy setting.
- Scheme, host, and port fields filled with safe placeholder values.
- A neutral saved state or validation message.

Message to convey: local proxy settings stay device-specific and user-controlled.

### 2. Options: Synced Domain Rules

Show the Options page domain rules section.

Recommended visible state:

- A short list of sample domains.
- Suggested demo domains: `example.com`, `chatgpt.com`, `oaiusercontent.com`, `linkedin.com`, `licdn.com`, and `2ip.io`.
- Include-subdomains setting where available.
- Clear rule enable/edit/remove controls.

Message to convey: users manually manage domain-level proxy routes.

### 3. Popup: Current-Site Routing Controls

Show the popup on a neutral sample site.

Recommended visible state:

- Current domain shown at hostname level.
- Button or state for adding/removing the current site rule.
- No private URL path, query string, or account data.

Message to convey: current-site routing is explicit and controlled from the popup.

### 4. Popup: Check via Proxy

Show the manual current-site diagnostic action.

Recommended visible state:

- "Check via proxy" action.
- A neutral success or warning result.
- No detailed network logs or private request data.

Message to convey: diagnostics run only after user action and do not save history.

### 5. Popup: Related-Domain Preview

Show the related-domain preview with selected sample candidates.

Recommended visible state:

- A compact list of sanitized hostname-level candidates.
- Suggested demo candidates include `oaiusercontent.com` for `chatgpt.com` and `licdn.com` for `linkedin.com`; `trkn.us` may be shown as ignored globally if that state is useful.
- User selection controls.
- Separate add action.

Message to convey: related-domain suggestions are previewed first and require explicit selection before saving.

## Additional Screenshot Candidates

Use these only if the Store listing needs a different emphasis or if future Store assets allow more visuals.

### Popup: Diagnostic Recording

Show the explicit start/stop/cancel recording flow using a neutral test page.

Recommended visible state:

- Recording control state.
- Stop and preview action.
- No user-generated content, uploaded files, credentials, or private page text.

Message to convey: recording is temporary, action-specific, and user-invoked.

### Options: Classification Overrides

Show domain-level classification override controls.

Recommended visible state:

- Sample override entries with placeholder domains.
- Clear reset/remove controls.

Message to convey: overrides are domain-level preferences, not browsing history.

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

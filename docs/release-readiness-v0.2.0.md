# v0.2.0 Release Readiness Audit

Status: **not ready for version bump**. The automated implementation audit passes, but the full manual smoke gate, Store disclosure review, and refreshed screenshots remain open.

This document prepares a later explicit release task. It does not bump a version, create a tag or release, build a Store package, upload to Chrome Web Store, or change the published `v0.1.0` artifact.

## Audit Snapshot

- Audit refreshed: 2026-07-13.
- Published baseline: annotated tag `v0.1.0` (`50903f7058d04a142dbf316f3ae71a19de9d71ed`) pointing to commit `696bf08f847cf0952a938c2d06456f38e4d25e9e`.
- Candidate base before this feature slice: `main` at `d3fdf80`, equal to `origin/main`; the final feature commit is recorded in Git history rather than self-referenced here.
- Source and package versions: still `0.1.0` in `manifest.json` and `package.json`.
- Published `v0.1.0` tag, GitHub release, package, and Store item: unchanged.
- Candidate diff: use the final release task's live `v0.1.0..main` diff; this document intentionally avoids a stale self-referential count.

## Candidate Scope

The v0.2.0 candidate is the complete current `main` delta from `v0.1.0`, limited to the shipped implementation and supporting documentation below. Unimplemented roadmap ideas are not part of the candidate.

### User-Facing Features

- Proxy and direct route actions in Options and Popup.
- Prominent Proxy exact/parent, Direct exact/parent, and unconfigured default-Direct Popup status with text, icon treatment, accessible labels, and an unavailable-proxy warning.
- Exact-host-only Popup quick actions, including for `www.*`, plus explicit Change scope confirmation.
- In-place Options rule editing for hostname/domain, action, and scope without delete/re-add.
- PSL-aware exact/hostname/registrable-parent scope choices with current/proposed coverage and conflict previews.
- Atomic replacement of one existing rule with stable metadata preserved and one background proxy re-application.
- One normalized hostname/scope route target per rule, with action changes performed in place and same-target contradictory additions blocked across every entry path.
- Prominent Options repair actions and Popup warnings for contradictory targets stored by the earlier candidate build; no automatic deletion during sanitization.
- Explicit removal of the effective exact rule; parent rules are not silently removed from Popup.
- Redundant same-action rule suggestions with a separate explicit removal click.
- Versioned local settings export/import with preview before apply.
- Local proxy configuration excluded from export by default and included only by an explicit checkbox.
- Local stable-ID build workflow for unpacked installations that need a consistent extension identity.
- Improved action-specific diagnostic recorder that detects page-level request hostnames automatically.

New primary UI strings include `Through proxy`, `Direct`, `Not configured`, `Proxy unavailable`, `Conflicting rules`, `Conflicting route rules`, `Keep Proxy`, `Keep Direct`, `Proxy this hostname`, `Route this hostname directly`, `Applies to this exact hostname only`, `Change scope`, `Edit`, `Preview changes`, `Save changes`, `Exact hostname only`, `This hostname and its subdomains`, and `Parent domain and all subdomains`, plus the existing route-action, cleanup, backup, and recorder strings.

### Routing and PAC Behavior

- `DomainRule` now has `action: "proxy" | "direct"` while retaining legacy `mode: "proxy"` for compatibility.
- Matching proxy rules still return only the configured proxy string, with no `; DIRECT` fallback.
- Matching direct rules return `DIRECT`.
- Exact matches win over parent matches.
- The most-specific matching parent with `includeSubdomains: true` wins.
- Legitimate equal-specificity overlaps use the newest valid `createdAt`; equal timestamps use the later stored rule. The same deterministic tie-breaker is retained only as temporary runtime safety for unresolved legacy same-target contradictions.
- Unmatched hosts remain `DIRECT`.
- PAC generation sanitizes actions, domains, duplicates, and invalid local proxy configuration before producing inline PAC data.

### Storage and Migration

- Stored v0.1.0 rules without `action` sanitize to `action: "proxy"`.
- Stored rules with legacy `mode: "proxy"` remain valid; absent `mode` is also accepted and normalized to `proxy`.
- Canonical route-target identity is normalized domain plus exact/include-subdomains scope. Action is mutable and is excluded from the uniqueness key.
- Sanitization preserves already-stored opposite-action siblings so the user can choose explicitly; new full writes and add flows cannot create such a pair.
- Synced data remains rules, ignored domains, denylist entries, and classification overrides.
- Device proxy configuration and diagnostics preferences remain in `chrome.storage.local`.
- Recorder session metadata uses `chrome.storage.session`; collected hostnames are not stored there.
- Settings export format remains version `1`. Import treats a missing rule `action` as proxy, so earlier export-shaped documents remain importable.
- Edited rules preserve an existing stable `id`; legacy rules without one use a deterministic identity and receive that ID on first confirmed edit. `source` and `createdAt` remain unchanged.
- A confirmed edit replaces one array entry and performs one sync storage write. It never deletes first or creates a temporary duplicate.

### Diagnostics and Recording

- The previous recorder implementation was replaced by paired temporary ISOLATED-world and MAIN-world recorders in all accessible frames.
- MAIN-world capture observes page-level `fetch`, `XMLHttpRequest.open`, `navigator.sendBeacon`, existing and future resource timing entries, and safe resource-element error attributes.
- URL-like inputs are reduced to validated hostnames before a nonce-bound custom event crosses into the extension's isolated world.
- Limits are two minutes, 80 unique hostnames, and 2,000 URL-like values/events per frame.
- The recording continues after Popup closure.
- Stop, Cancel, and timeout disconnect observers/listeners and restore wrapped page APIs when they are still the installed wrappers.
- Reload/navigation marks session metadata expired; a document ID check prevents a replacement document from being treated as the original recording.
- Manual failed-URL entry and DevTools copying are not part of the workflow.
- Known visibility limit: worker, service-worker, extension, and browser-level requests may remain outside the page recorder.

### Privacy and Security

- Only normalized hostnames cross the page/extension bridge; raw URL paths, queries, fragments, signatures, credentials, headers, bodies, page text, and file contents do not.
- Related-domain candidates remain transient until the user explicitly selects and saves a rule.
- Settings backup is generated and parsed locally; no backup upload or remote settings service exists.
- Import rejects malformed rules and protected, internal, local, or private routing domains.
- Local proxy credentials are not supported, and credential-like proxy hosts are sanitized to an unset disabled state.
- No telemetry, analytics SDK, ads, developer backend, runtime remote list fetch, or remote executable code was found.

### Build and Release Tooling

- `npm run build:local-stable-id` creates `dist-local/` and adds a user-supplied public manifest key only to `dist-local/manifest.json`.
- `.local/` and `dist-local/` are ignored so the local key and local build are not committed.
- Fixture tests confirm the source and normal `dist/` manifests remain unkeyed.
- The ordinary Store build/package workflow is unchanged. No v0.2.0 ZIP was built in this audit because the version has not been bumped.

### Documentation

- Published Store listing, privacy disclosure, screenshot workflow, dry-run, and submission references were added after the v0.1.0 tag.
- Privacy, architecture, permissions, manual smoke, local-install sync, and release-plan documents were updated for backup/restore, route actions, and recorder behavior.
- This audit corrects the roadmap mismatch that previously left the already-implemented recorder work under v0.3 instead of the v0.2 candidate.

## Compatibility Assessment

### Breaking Changes

No manifest-permission, extension-ID, package-format, or required user-action break was found.

Potentially observable behavior changes are intentional:

- Legitimate overlapping parent/child rules no longer depend on first-array-match behavior; exact and most-specific rules win deterministically.
- Two rules with the same normalized domain and scope may not coexist, regardless of action. Existing contradictory pairs from the earlier candidate build remain visible until `Keep Proxy` or `Keep Direct` resolves them explicitly.
- Popup quick actions for `www.` and every other hostname now remain exact-host-only. A safe registrable-parent scope is available only through explicit Change scope or Options Edit preview and confirmation.
- Diagnostic recording now installs temporary page-world wrappers during an explicit session. This is a data-handling and disclosure change, not a stored-data migration.

Existing v0.1.0 rules were proxy-only, so the new precedence does not change their route result. New conflicting direct siblings are blocked; legitimate direct child exceptions remain supported.

### Storage Compatibility Matrix

| Requirement | Assessment | Evidence |
| --- | --- | --- |
| Old stored rule without `action` becomes proxy | Pass | `sanitizeDomainRule` defaults missing action to proxy; explicit storage regression test passes. |
| Old export rule without `action` imports | Pass | import sanitizer defaults missing action to proxy; multiple import tests exercise missing-action documents. |
| Device proxy stays local | Pass | local/sync adapters remain separate; storage tests confirm `deviceProxy` is absent from sync. |
| Rules and classification overrides remain compatible | Pass | sync sanitizer preserves normalized rules and domain-only overrides and drops malformed/private entries. |
| Earlier candidate contradictory targets remain repairable | Pass | read-time sanitization preserves both actions; Options requires explicit Keep Proxy/Keep Direct and Popup shows a conflict warning. |
| Raw URLs or recorder sessions do not sync | Pass | only declared sync settings are written; recorder metadata is session-only; export/override tests remove URL components. |
| Malformed data sanitizes safely | Pass | invalid rules, actions, dates, local proxy configs, private/internal targets, and credential-like hosts are rejected or disabled. |

No one-time migration write is required. Compatibility is read-time sanitization followed by normalized writes when settings are next changed.

## Release-Blocker Audit

### PAC Safety

| Requirement | Assessment |
| --- | --- |
| Proxy match remains fail-closed | Pass: matched proxy action returns the proxy string only. |
| Direct exception returns `DIRECT` | Pass. |
| Exact rule wins over parent | Pass in pure matcher and executable PAC tests. |
| Most-specific parent wins | Pass in pure matcher and executable PAC tests. |
| Default remains `DIRECT` | Pass for empty and unmatched rule sets. |
| Empty/invalid configuration clears safely | Pass: the proxy controller clears extension settings for missing/invalid config or no effective proxy rules and reports API failures. |

### Recorder Lifecycle

| Requirement | Assessment |
| --- | --- |
| MAIN-world hooks are temporary | Pass: installed only after explicit Start and bounded by a two-minute timer. |
| Stop/Cancel/timeout restore APIs | Pass: focused tests cover fetch, XHR, beacon, observer, error listener, and bridge listener cleanup. |
| Popup closure does not stop recording | Pass at injected-recorder level; confirmed manual ChatGPT behavior is supplied as audit context. Full extension smoke remains open. |
| Navigation produces expired state | Pass by service-worker navigation listener, domain/document checks, and expired UI state; manual end-to-end gate remains open. |
| Only hostnames cross the bridge | Pass: nonce/version validation and strict hostname sanitizer reject raw/signed URLs. |
| No path/query/signature leakage | Pass in recorder, boundary, preview, storage, and backup tests. |
| No unexpected stale recording data | Pass with documented retention: collection stops and hooks are removed at timeout, while the bounded hostname set may remain in the recorded page's isolated-world memory so the user can still choose Stop and preview. It is deleted on Stop/Cancel and disappears on navigation/tab teardown. Session-scoped metadata is cleared on Stop/Cancel/tab close and is never synced or exported. |

### Backup and Restore

| Requirement | Assessment |
| --- | --- |
| Default export excludes device proxy | Pass. |
| Explicit option includes device proxy | Pass. |
| Preview occurs before writes | Pass; preview is pure and apply rejects an invalid preview. |
| Duplicate/conflicting targets are not created | Pass; identity is normalized domain plus subdomain scope, with action excluded. |
| Import conflict handling | Pass; same-action duplicates are reported, opposite-action pairs inside the file or against storage block Apply, and Apply revalidates latest sync state. |
| Legacy-conflict export safety | Pass; export is blocked with an explicit repair message until the target is resolved. |
| Invalid/internal/private domains are rejected | Pass. |
| Signed URL data cannot enter backup | Pass for supported settings surfaces; export re-sanitizes every domain-level field and excludes recorder state. |

### Permissions and Packaged Behavior

Current manifest permissions are exactly:

```json
["proxy", "storage", "activeTab", "scripting"]
```

Confirmed absent from the source manifest and built manifest:

- `host_permissions`
- `<all_urls>`
- `webRequest`
- `webNavigation`
- `debugger`
- persistent `content_scripts`
- telemetry or analytics libraries
- developer backend endpoints
- runtime remote executable code

The user-invoked recorder uses `activeTab` plus `scripting`; `chrome.scripting` supports `MAIN` and `ISOLATED` execution worlds and all-frame injection without adding the forbidden permissions above.

## Automated Checks and Coverage Review

Results on the final feature working tree before commit:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 20 files, 256 tests, including canonical route-target identity, all add paths, stored-conflict detection/repair, import blocking, deterministic PAC/Popup safety, parent/child overrides, stale final validation, atomic update, and one-write coverage. |
| `npm run build` | Pass. |
| `npm run typecheck --if-present` | Pass. |
| `git diff --check` | Pass. |
| `npm audit` | Completed: one low-severity `esbuild` advisory, `GHSA-g7r4-m6w7-qqqr`. |

Coverage inspection:

- Storage migrations and safety: explicit stored-rule missing-action test; contradictory legacy pairs preserved on read; new contradictory full writes rejected; Keep Proxy/Keep Direct each resolve in one write; malformed sync/local data and local-only proxy tests.
- PAC precedence: executable PAC tests for exact direct exception, both directions of parent/child action overrides, default direct, fail-closed proxy string, invalid config, and the same temporary legacy-conflict winner reported by Popup.
- Rule editing and additions: canonical normalized domain/scope identity, exact/parent scope choices, generic PSL planning, unsafe shared-infrastructure rejection, action changes, action preservation, duplicate/opposite-action blockers in Options/Popup/related-domain/diagnostic paths, latest-state validation, parent coverage, child exceptions, redundancy warnings, stable identity, atomic replacement, and one storage write.
- Export/import: 19 tests for version, default/explicit local proxy inclusion, URL sanitization, same-action duplicates, contradictory file/existing targets, missing/direct/invalid actions, preview-only behavior, stale final validation, explicit apply, and legacy-conflict export blocking.
- Recorder cleanup/privacy: 14 recorder tests for fetch/XHR/beacon/resource/error capture, hostile inputs, hostname bridge limits, Stop/Cancel/timeout restoration, and exact manifest assertions.
- Manifest assertions: exact permission array and explicit absence of host permissions, content scripts, `<all_urls>`, `webRequest`, `webNavigation`, and `debugger`.

Focused regression coverage was added for this feature slice and all tests pass. The remaining gap is the full browser-level release gate across routing, migration, recorder lifecycle, backup/restore, and final frozen UI; the focused Popup/rule-editing Computer Use result is recorded separately below after execution.

The audit finding is not a release blocker: the advisory affects the Windows Vite development server in `esbuild`; the extension package does not include or run the Vite dev server, `node_modules`, or `esbuild`. Do not run `npm audit fix` as release-closeout churn without a separate dependency-maintenance decision.

## Chrome Web Store Update Risk

An updated package must use a larger version and undergo a new Store review. No new manifest permission means users are not expected to receive an additional-permission acceptance prompt, but the changed feature and data-handling descriptions still require accurate Store metadata.

### Required Before Store Submission

- Update the detailed Store description and update log for direct routes, deterministic precedence, cleanup suggestions, backup/restore, and improved automatic recording.
- Refresh the `scripting` justification to explain temporary user-invoked ISOLATED/MAIN-world injection in accessible frames, hostname-only output, and Stop/Cancel/timeout cleanup.
- Keep the `activeTab` justification tied to explicit Popup invocation and temporary access to the selected tab.
- Re-review Privacy practices data-use checkboxes. Chrome policy treats domains, URLs, and website resources as user data even when processed only locally. The Dashboard reviewer must evaluate the current labels corresponding to web browsing activity and website content/resources and disclose every applicable category.
- Keep the remote-code declaration at `No` and verify the exact candidate ZIP before upload.
- Update the public privacy policy and Store privacy text so they describe local handling, purpose, retention, non-transmission, and the hostname-only bridge consistently.
- Recapture screenshots after UI freeze. The current route-rules image predates route actions, cleanup, and backup/restore; recorder and Popup images also predate the final v0.2 copy and direct-route UI.

### No Change Currently Needed

- Extension name and short description remain accurate.
- Permissions remain `proxy`, `storage`, `activeTab`, and `scripting`.
- No host permission justification is needed because no host permissions are declared.
- Category, support URL, distribution, and pricing do not need a candidate-driven change.

Draft text and the screenshot update plan are in `docs/chrome-web-store-update-v0.2.0-draft.md`.

Official references reviewed for this audit:

- [Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update/)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome Web Store user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/)
- [Disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- [`chrome.scripting` reference](https://developer.chrome.com/docs/extensions/reference/api/scripting)

## Known Issues and Open Blockers

### Blocks Version Bump

- Full must-pass manual smoke in `docs/manual-smoke-test.md` is not yet completed or recorded.
- A disposable-profile update test from representative v0.1.0 storage is not yet recorded.
- Real local stable-ID build smoke with the owner's public manifest key is not yet recorded; fixture automation passes.
- Browser-level recorder lifecycle smoke for popup closure, failed request detection, navigation expiry, Cancel, and timeout is not yet fully recorded for the frozen candidate. The supplied real ChatGPT upload result covers the core automatic-detection scenario only.

### Blocks Store Submission, Not the Code Candidate

- Store detailed description, `scripting` justification, Privacy practices data-use declarations, and privacy copy have not been updated in the Dashboard.
- Store screenshots do not yet represent the final v0.2 Options and Popup UI.
- Candidate ZIP content and permissions cannot be finalized until the later version bump and reproducible package build.

### Accepted Non-Blockers / Limitations

- Low-severity `esbuild` development-server advisory described above.
- The recorder cannot see every worker, service-worker, extension, or browser-level request.
- Rule search/filter and a full accessibility pass were prior roadmap ideas but are not implemented and are explicitly deferred from v0.2.0.
- Actual Store-installed delivery/preservation can only be verified after the Store accepts and publishes the later package; the pre-bump gate verifies the expectations and migration behavior without altering the main Chrome profile.

No implemented feature was found unsuitable for v0.2.0 if the remaining manual and disclosure gates pass.

## Manual Smoke Status

- Automated checks: **PASS**.
- Focused Computer Use smoke on the already open Chrome profile: **BLOCKED by a stale installed build**. The toolbar popup and Options page opened, but attempting to add `routing-test.test` Direct with the same include-subdomains target as an existing Proxy rule was accepted by the installed build instead of showing the new blocker. The local source and automated tests contain the blocker; Chrome must reload the new unpacked build before this behavior can be verified manually.
- The attempted smoke changed synced data by adding one `routing-test.test` Direct include-subdomains rule beside the pre-existing Proxy rule. Further state-changing steps and cleanup were stopped because deleting or choosing a winner requires explicit action-time confirmation. The pair is suitable for verifying the new `Conflicting route rules` repair UI after the build is reloaded, but it remains unresolved in this Chrome profile.
- Confirmed supplied manual evidence: improved recorder on real ChatGPT automatically detected a generated `*.oaiusercontent.com` request after a harmless attachment and suggested `oaiusercontent.com`, `includeSubdomains: true`, `action: proxy` without DevTools or manual URL entry.
- Full v0.2.0 must-pass checklist: **NOT RUN in this audit**.
- Optional checklist: **NOT RUN in this audit**.
- No unrelated synced rules were edited or removed during this focused smoke.

Use `docs/manual-smoke-test.md` for the release gate and detailed evidence steps.

## Exact Future Release Sequence

Execute these only in a later explicit release task:

1. Complete and record the remaining manual smoke checks in a disposable profile.
2. Resolve every code, compatibility, disclosure, or screenshot blocker found by smoke.
3. Bump `manifest.json` and `package.json` to `0.2.0` in one focused change.
4. Run `npm test`, `npm run build`, `npm run typecheck --if-present`, `git diff --check`, and `npm audit` again.
5. Build the reproducible Store ZIP with the normal package workflow; do not use `dist-local/` or add `manifest.key` to the Store package.
6. Verify ZIP contents, version, permissions, hashes, absence of source maps/secrets/source files, and absence of remote executable code.
7. Finalize and commit the version bump, release notes, Store update docs, smoke evidence, and package provenance.
8. Create and push annotated tag `v0.2.0` at the verified release commit.
9. Create the GitHub `v0.2.0` release and attach the verified Store ZIP with finalized release notes.
10. Manually upload the same verified package to the existing Chrome Web Store item, update listing/privacy fields and screenshots, and submit it for review.
11. Verify the Store review result, published version, update delivery, preserved user settings, unchanged permission surface, and public listing metadata.

## Readiness Decision

Current recommendation: **automated implementation audit passed; not ready for version bump until the must-pass manual smoke gate is complete. Not ready for Store submission until disclosures and screenshots are updated and the later versioned ZIP is verified.**

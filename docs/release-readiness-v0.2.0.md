# v0.2.0 Release Readiness Audit

Status: **ready for the GitHub v0.2.0 release**. The automated implementation audit and the full must-pass manual smoke gate pass. Chrome Web Store submission remains a separate later task with its own Dashboard, privacy, asset, review, and publication steps.

This document records the explicit GitHub release task. It covers the version bump, verified release package, release commit, tag, and GitHub release preparation. It does not upload to Chrome Web Store, change Dashboard declarations, or modify any published `v0.1.0` artifact.

## Audit Snapshot

- Audit refreshed: 2026-07-15.
- Published baseline: annotated tag `v0.1.0` (`50903f7058d04a142dbf316f3ae71a19de9d71ed`) pointing to commit `696bf08f847cf0952a938c2d06456f38e4d25e9e`.
- Release-task starting point: `main` at `b3252e2e32c6be53f7c7403105c81f1f3165a5c6`, equal to `origin/main` after `git fetch --tags origin` and `git pull --ff-only origin main`; the final release commit is recorded in Git history rather than self-referenced here.
- Source and package versions: `0.2.0` in `manifest.json`, `package.json`, and `package-lock.json` for this release.
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

Results on the final v0.2.0 release working tree before commit:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 20 files, 256 tests, including the updated `0.2.0` release-version assertion, canonical route-target identity, stored-conflict detection/repair, import blocking, deterministic PAC/Popup safety, parent/child overrides, stale final validation, atomic update, and one-write coverage. |
| `npm run build` | Pass: clean production output reports manifest version `0.2.0`. |
| `npm run typecheck --if-present` | Pass. |
| `git diff --check` | Pass. |
| `npm audit` | Completed: one low-severity `esbuild` advisory, `GHSA-g7r4-m6w7-qqqr`; no dependency change applied during release closeout. |
| `npm run package` | Pass: 13 files packaged into `release/smart-proxy-route-helper-v0.2.0.zip`. |

## Release Package Verification

- Asset: `smart-proxy-route-helper-v0.2.0.zip` (`293375` bytes).
- SHA-256: `786a8287309797cf933853989f8e3c2d6d226fd131fa1663c03bf646c8090cb9`.
- `manifest.json` is at the archive root and reports version `0.2.0` with permissions exactly `proxy`, `storage`, `activeTab`, and `scripting`.
- The archive contains the compiled background service worker, Popup, Options, shared chunks, and four icon sizes directly at the root layout expected by Chrome. It has no extra `dist/` level.
- The archive contains no `src/`, tests, docs, `.git/`, `node_modules/`, `.local/`, `dist-local/`, source maps, temporary files, local stable-ID key material, or v0.1.0 release files. The packaged manifest has no `key`, `host_permissions`, or `content_scripts`.
- Extracted archive files match current `dist/` byte-for-byte, and packaging the unchanged `dist/` twice produced the same SHA-256.
- Reproducibility limitation: the existing package workflow preserves build-output modification timestamps in ZIP metadata. A clean build at a different time may therefore produce a different ZIP checksum even when extracted file bytes are identical. The hash above identifies the exact published asset; extracted-content comparison is the semantic reproducibility check.

Coverage inspection:

- Storage migrations and safety: explicit stored-rule missing-action test; contradictory legacy pairs preserved on read; new contradictory full writes rejected; Keep Proxy/Keep Direct each resolve in one write; malformed sync/local data and local-only proxy tests.
- PAC precedence: executable PAC tests for exact direct exception, both directions of parent/child action overrides, default direct, fail-closed proxy string, invalid config, and the same temporary legacy-conflict winner reported by Popup.
- Rule editing and additions: canonical normalized domain/scope identity, exact/parent scope choices, generic PSL planning, unsafe shared-infrastructure rejection, action changes, action preservation, duplicate/opposite-action blockers in Options/Popup/related-domain/diagnostic paths, latest-state validation, parent coverage, child exceptions, redundancy warnings, stable identity, atomic replacement, and one storage write.
- Export/import: 19 tests for version, default/explicit local proxy inclusion, URL sanitization, same-action duplicates, contradictory file/existing targets, missing/direct/invalid actions, preview-only behavior, stale final validation, explicit apply, and legacy-conflict export blocking.
- Recorder cleanup/privacy: 14 recorder tests for fetch/XHR/beacon/resource/error capture, hostile inputs, hostname bridge limits, Stop/Cancel/timeout restoration, and exact manifest assertions.
- Manifest assertions: exact permission array and explicit absence of host permissions, content scripts, `<all_urls>`, `webRequest`, `webNavigation`, and `debugger`.

Focused regression coverage was added for this feature slice and all tests pass. The full browser-level must-pass release gate across routing, migration, recorder lifecycle, backup/restore, and the final frozen UI is recorded as passed from the release owner's explicit confirmation.

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

### GitHub Release Gate

- No manual-smoke blocker remains. The release owner explicitly confirmed that the full v0.2.0 must-pass checklist passed.
- The final automated rerun and package verification are part of this release task and must pass before the release commit is tagged.

### Blocks Store Submission, Not the Code Candidate

- Store detailed description, `scripting` justification, Privacy practices data-use declarations, and privacy copy have not been updated in the Dashboard.
- Store screenshots do not yet represent the final v0.2 Options and Popup UI.
- The verified v0.2.0 ZIP produced here is not uploaded to Chrome Web Store during this task.

### Accepted Non-Blockers / Limitations

- Low-severity `esbuild` development-server advisory described above.
- The recorder cannot see every worker, service-worker, extension, or browser-level request.
- Rule search/filter and a full accessibility pass were prior roadmap ideas but are not implemented and are explicitly deferred from v0.2.0.
- Actual Store-installed delivery/preservation can only be verified after the Store accepts and publishes the later package; the completed manual gate verifies the expectations and migration behavior without altering the main Chrome profile.

No implemented feature or confirmed manual-smoke result blocks the GitHub v0.2.0 release. Chrome Web Store disclosure and submission work remains separate.

## Manual Smoke Status

- Automated implementation audit: **PASS**.
- Full v0.2.0 must-pass checklist: **PASS**, explicitly confirmed by the release owner on 2026-07-15. The confirmation covers the complete checklist; environment fields not supplied with that confirmation are not inferred.
- Confirmed final conflict behavior: an existing Proxy/Direct pair is detected; Popup shows `Conflicting rules`; `Keep Proxy` and `Keep Direct` resolve the pair explicitly; opposite-action duplicate creation is blocked; editing changes the existing rule action in place; exactly one rule remains; legitimate parent/child overrides continue to work.
- Confirmed recorder behavior: improved recording automatically detects page-level request hostnames, continues across Popup closure, reports navigation expiry, and keeps collected data hostname-only.
- Optional checklist: **NOT RUN in this audit**.

Use `docs/manual-smoke-test.md` for the release gate and detailed evidence steps.

## Release Execution Sequence

This explicit release task performs the version bump, final automated checks, normal package workflow, release commit and push, annotated `v0.2.0` tag, and normal GitHub release with the verified ZIP asset. Tagging and publication stop if any release-blocking check fails.

Chrome Web Store Dashboard access, package upload, privacy-declaration changes, review submission, and publication verification remain a separate later task.

## Readiness Decision

Current recommendation: **automated implementation audit passed and the full must-pass manual smoke gate passed; proceed with the verified GitHub v0.2.0 release. Do not treat this as Chrome Web Store v0.2.0 publication.**

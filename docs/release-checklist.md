# v0.2.0 GitHub Release Checklist

Status: **pre-release gates passed; GitHub release preparation in progress**. Chrome Web Store submission is a separate later task and is not part of this checklist execution.

## Automated Gate

- [x] `npm test`: 20 test files and 256 tests passed.
- [x] `npm run build`: production build passed.
- [x] `npm run typecheck --if-present`: passed.
- [x] `git diff --check`: passed.
- [x] `npm audit`: completed with one known low-severity `esbuild` development-server advisory, `GHSA-g7r4-m6w7-qqqr`; no dependency fix was applied during release closeout.
- [x] Existing package workflow: `npm run package` created 13 files in `release/smart-proxy-route-helper-v0.2.0.zip`.
- [x] Repeated packaging of unchanged `dist/` produced the same SHA-256.

## Version, Manifest, and Package Surface

- [x] `manifest.json`, `package.json`, and the package-lock root version are `0.2.0`.
- [x] The release-version test expects `0.2.0` and confirms the manifest/package versions match.
- [x] Manifest permissions are exactly `proxy`, `storage`, `activeTab`, and `scripting`.
- [x] `host_permissions`, `<all_urls>`, `webRequest`, `webNavigation`, `debugger`, and persistent `content_scripts` are absent.
- [x] The normal source, build, and Store-package manifests contain no stable-ID `key`.
- [x] Bundled icons exist for 16, 32, 48, and 128 pixels.
- [x] No telemetry, analytics, ads, backend, runtime remote list, remote PAC URL, or remote executable code was introduced.

## ZIP Verification

- [x] Asset name: `smart-proxy-route-helper-v0.2.0.zip`.
- [x] Asset size: `293375` bytes.
- [x] SHA-256: `786a8287309797cf933853989f8e3c2d6d226fd131fa1663c03bf646c8090cb9`.
- [x] `manifest.json` is at archive root; there is no extra `dist/` directory level.
- [x] Compiled background, Popup, Options, chunks, and icons are present.
- [x] `src/`, tests, docs, `.git/`, `node_modules/`, `.local/`, `dist-local/`, source maps, temporary files, key material, and v0.1.0 release files are absent.
- [x] Extracted ZIP files match current `dist/` byte-for-byte.

The package workflow preserves build-output timestamps in ZIP metadata. Repackaging the unchanged `dist/` is byte-stable, but a clean build at a different time may change the archive checksum even when extracted file bytes remain identical. The recorded SHA-256 identifies the exact GitHub release asset.

## Manual Gate

- [x] The full v0.2.0 must-pass checklist in `docs/manual-smoke-test.md` is recorded as **PASS** from the release owner's explicit confirmation.
- [x] Existing contradictory Proxy/Direct targets are detected in Options and Popup.
- [x] `Keep Proxy` and `Keep Direct` each resolve the conflict explicitly and leave one rule.
- [x] Opposite-action duplicate creation is blocked, while editing the existing rule changes its action in place.
- [x] Exact/parent precedence and legitimate parent/child overrides remain correct.
- [x] Automatic MAIN-world recording, Popup-closure continuity, navigation expiry, and hostname-only handling passed the confirmed manual gate.
- [x] Local stable-ID behavior and permission/privacy surface passed the confirmed manual gate.

Environment fields not supplied with the release owner's confirmation are not inferred in the repository record.

## Release Documentation and Boundaries

- [x] Final release notes are in `docs/release-notes-v0.2.0.md`; the draft release-notes file is removed.
- [x] Release readiness records automated and manual gates as passed and GitHub release preparation as in progress.
- [x] The Chrome Web Store v0.2.0 update document remains a draft for a separate Dashboard task.
- [x] Chrome Web Store v0.2.0 publication is not claimed.
- [x] The `v0.1.0` tag, GitHub release, and ZIP remain immutable.

## Publication Sequence After This Checklist Is Committed

1. Push the release commit to `origin/main` and confirm local `main` matches `origin/main` with a clean working tree.
2. Create and push the annotated `v0.2.0` tag at that release commit without force-pushing any tag.
3. Create a normal, non-draft, non-prerelease GitHub release from `docs/release-notes-v0.2.0.md` and attach only `release/smart-proxy-route-helper-v0.2.0.zip`.
4. Verify the GitHub release metadata, asset name/size/hash, tag target, downloaded manifest, clean repository state, and unchanged v0.1.0 baseline.
5. Do not access or modify Chrome Web Store Dashboard during this GitHub release task.

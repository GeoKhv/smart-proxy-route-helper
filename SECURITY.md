# Security Policy

This repository contains the Smart Proxy Route Helper Manifest V3 runtime. Development version
`0.3.1` is on `main`; the latest immutable public GitHub Release is `v0.3.0`. Release `v0.3.0` has
been submitted to Chrome Web Store for review and is awaiting review; this document does not claim
that Store `v0.3.0` is published. The post-release fixes on `main` have not been published as a new
GitHub Release or Store update.

## Supported Versions

| Version | Status |
| --- | --- |
| `main` | Supported; security fixes land here first. |
| `v0.3.0` | Current released baseline; security fixes are assessed against `main`. |
| `v0.2.0` and older | Not actively supported; upgrade to the current release before reporting version-specific issues where possible. |

## Reporting a Vulnerability

Until the project has a dedicated security contact, please avoid posting sensitive exploit details in a public issue.

Preferred reporting path once the repository is hosted:

1. Use GitHub private vulnerability reporting if enabled.
2. If private reporting is not enabled, open a public issue with a brief non-sensitive summary and request a private contact path.

The maintainer should acknowledge valid reports, assess impact, and publish remediation notes with the affected version range.

## Security Principles

Implementation work must follow these principles:

- Bundle all executable code with the extension package.
- Do not load or execute remote JavaScript, WebAssembly, or remotely supplied logic.
- Do not use `eval`, `new Function`, or any other string-based execution path in extension runtime code.
- `chrome.scripting.executeScript` may invoke only functions or files bundled in the reviewed extension package, after the user invokes the corresponding feature. It must never execute downloaded, remotely supplied, or remotely controlled logic.
- Keep dependencies minimal and audit compiled output before release.
- Request the narrowest permissions needed for shipped features.
- Keep diagnostics optional, opt-in, and user-initiated.
- Never add a domain rule without explicit confirmation.
- Treat all user-entered domains and proxy settings as untrusted input.

## Manifest V3 and Remote Code

Chrome Web Store review requires Manifest V3 extension logic to be understandable from the submitted package. Remote JavaScript, WebAssembly, fetched strings evaluated as code, and remotely controlled executable logic are prohibited. Calling a bundled extension function through `chrome.scripting.executeScript` is distinct from remote code: the function is part of the submitted package and runs only through the declared `scripting` plus temporary `activeTab` permission path.

This project should avoid remote configuration entirely in the MVP.

Reference: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

Bundled script injection reference: https://developer.chrome.com/docs/extensions/reference/api/scripting

## Planned High-Risk Areas

The following areas need extra care:

- PAC generation: domain and proxy settings must be normalized and escaped before being included in generated PAC data.
- Proxy control: the UI must make it clear when the extension has applied Chrome proxy settings.
- Storage split: synced domain rules must not include device-specific local proxy details.
- Permission changes: new permissions must be tied to shipped features, not possible future work.
- Diagnostics: checks must not become browsing activity collection and must not silently change routing.
- Extension conflicts: another extension or policy may control Chrome proxy settings; the user should see a clear status when this happens.

## Release Security Checklist

Before any public release:

- Confirm there is no remote executable code in source or build output.
- Confirm the manifest requests only permissions required by shipped features.
- Confirm there are no required broad host permissions in the MVP.
- Confirm diagnostics are manual, opt-in per check, and never run automatically.
- Confirm privacy disclosures match actual behavior.
- Run the manual smoke test in [docs/manual-smoke-test.md](docs/manual-smoke-test.md).
- Review Chrome Web Store policy-sensitive wording in the listing, UI, README, and privacy document.

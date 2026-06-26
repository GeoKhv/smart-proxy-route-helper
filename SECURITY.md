# Security Policy

This repository contains the initial Manifest V3 extension runtime. GitHub pre-release `v0.1.0` is available for Store-preparation testing, but the extension is not yet published on Chrome Web Store.

## Supported Versions

| Version | Status |
| --- | --- |
| `v0.1.0` pre-release | Best-effort security fixes while this is the active MVP release candidate. |
| Unreleased `main` | Security fixes may land here before the next release candidate. |

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
- Do not use `eval`, `new Function`, dynamic script injection, or string-based code execution.
- Keep dependencies minimal and audit compiled output before release.
- Request the narrowest permissions needed for shipped features.
- Keep diagnostics optional, opt-in, and user-initiated.
- Never add a domain rule without explicit confirmation.
- Treat all user-entered domains and proxy settings as untrusted input.

## Manifest V3 and Remote Code

Chrome Web Store review requires Manifest V3 extension logic to be understandable from the submitted package. Remote resources may be data, but they must not contain executable logic that controls extension behavior.

This project should avoid remote configuration entirely in the MVP.

Reference: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements

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

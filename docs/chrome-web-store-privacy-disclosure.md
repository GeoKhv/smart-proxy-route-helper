# Chrome Web Store privacy declarations — 0.4.2

Reviewed 2026-11-09 against the exact release ZIP, PRIVACY.md, current source and official
[privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy) /
[User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
Local processing still counts as data handling. No developer uploads does not mean no handling.

## Single purpose and permissions

Use the [EN](../store-assets/listing/en/single-purpose.md) /
[RU](../store-assets/listing/ru/single-purpose.md) purpose text and
[EN](../store-assets/listing/en/permission-justifications.md) /
[RU](../store-assets/listing/ru/permission-justifications.md) justifications.

Required permissions: proxy, storage, activeTab, scripting. No host_permissions,
<all_urls>, webRequest, webNavigation, persistent content scripts or remote executable code.
Proxy control, active-page injection and disclosure consistency remain review risks.

## Data-use categories

Retain the conservative existing Dashboard categories:

- Browsing history: current-site hostname and resource hostnames for explicitly invoked routing/discovery.
- User activity: bounded request-initiation/resource signals only during user-started recording.
- Website content: bounded resource-reference attributes used to extract hostnames; no page text, form values or file/response bodies retained.

Do not select personal identifiers, health, financial, authentication, personal communications
or location categories: these are not collected by the extension. No proxy credentials stored.

The developer receives no settings or diagnostics. Route names, rules, classification
preferences, chunks and cross-list reconciliation records can sync through Google Chrome.
Those service records may retain previous domain-rule values and consume finite Sync quota;
they are not diagnostic or browsing history. Device connections, Pause, language and one
original-settings recovery copy stay local. Normal backups exclude device connections unless
explicitly included. Temporary session storage contains recorder lifecycle metadata, not host lists.

Current-page discovery and recording use packaged scripts after explicit actions. Candidate
hostnames stay in memory and become rules only after separate selection and confirmation.
Recording hooks end on Stop, Cancel, timeout or navigation. A selected-route test uses a short
credentials-free current-origin fetch, no DOM/response body read and no redirect following;
it temporarily changes the current-host route, restores routing and retains bounded error codes
in memory only. The chosen site/proxy can observe that request. No certificate changes or TLS bypass.

## Certifications and remote code

No sale or unrelated transfer of data, no unrelated use, and no creditworthiness/lending use.
Confirm the Dashboard's three corresponding data-use statements against the actual wording.
Remote code: **No**. All executable code is packaged with the extension; there is no remote
PAC, JavaScript, WebAssembly, runtime rule-list fetch or developer-operated backend.

Privacy URL: https://github.com/GeoKhv/smart-proxy-route-helper/blob/main/PRIVACY.md

Prepared declarations do not prove the Dashboard was saved or the update submitted.
Record actual results in the [version-specific Store record](chrome-web-store-update-v0.4.2.md).

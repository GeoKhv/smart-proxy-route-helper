# Named routes (0.4.1)

Work and Life are independent lists that run simultaneously in one locally generated PAC.
Choosing a list in Popup or Options selects the target for editing/testing; it never disables
another list. Create and rename additional lists in Options (up to 32, names up to 48 characters).
The IDs `work` and `life` remain stable when their displayed names change.

## Connections

- Work: select SOCKS5 and enter the local host/port exposed by Corporate VPN Router. No VPN,
  proxy server, CA certificate or proxy credentials are provided by the extension.
- Life: select SOCKS5/HTTP (the existing HTTPS/SOCKS4 choices are also retained), or DIRECT.
- DIRECT bypasses Chrome proxy servers. An external VPN at the OS/network layer can still
  carry those connections. It does **not** delegate an individual PAC decision to the OS HTTP
  proxy. Chrome has no per-domain “system proxy” PAC directive.
- Unmatched hosts keep the existing default DIRECT behavior. Pausing routing clears this
  extension's setting and allows Chrome's underlying configuration to apply; it does not
  force the whole browser into direct mode.
- A named proxy rule whose connection is missing uses a loopback discard endpoint
  (`PROXY 127.0.0.1:9`) with no DIRECT fallback. Configure the connection on each device.
  Legacy Work-only data with no local configuration retains the pre-upgrade disabled state.

## Rules, precedence and conflicts

Existing domains, standard-WWW handling, exact/subdomain scopes, direct exceptions, creation
order and timestamps retain their meanings. An exact match wins over an inherited match;
otherwise the longest matching parent wins. Equal matches use the existing newer-timestamp,
then later-list-order tie breaker. Selecting another list never reorders rules.

Rules have an optional `routeId`. Omission means Work, so existing rules need no rewrite.
`action: proxy` uses that list's device connection; `action: direct` remains an explicit DIRECT
exception. Domain lists are independent, but Chrome can send one request to only one destination.
The same domain **and scope** with different destinations is therefore a conflict. New conflicting
rules/imports are blocked. Exact-child/parent overrides remain valid. Already stored conflicts between different lists block the affected scope until the user
explicitly keeps one rule in Options; legacy conflicts within Work retain the old tie breaker.
No conflict is silently deleted or moved. Rule editing can explicitly move a rule between lists
while retaining its stable identity. Cleanup never treats different-route proxy rules as redundant.

## Data and upgrade safety

- Sync: Work uses the legacy generation/chunk storage; Life and other lists use an isolated
  versioned namespace. Ignored domains, denylist and classification overrides stay shared.
  Proxy addresses never enter Sync. See [the compatibility contract](sync-compatibility.md).
- Local: `deviceProxy` (the original Work endpoint and legacy pause flag), `routeConnections`,
  `routingEnabled`, diagnostics preference, interface language and one pre-upgrade recovery copy.
- For existing 0.3.2 data, the migration is virtual: absent route fields resolve to Work + empty Life/DIRECT. No bulk
  rewrite, new rules, change to old rule IDs or automatic route activation occurs on upgrade.
- Before the first settings read on the new client, the original raw Sync and local
  settings are copied to `namedRoutesMigrationBackupV1`, read back and verified. A shared Web Lock
  prevents another extension context replacing that first copy. A failed backup blocks mutation.
- Options can download that recovery JSON. It contains original local endpoint addresses and is
  intentionally separate from the normal import format. For expert recovery, keep the extension
  paused, preserve current data, and restore its `sync`/`local` payload through extension debugging
  storage tools; do not paste it into the normal import field. Prefer the normal versioned backup
  for everyday transfer. The recovery copy is kept until extension data is removed.
- Rule writes stage, verify and activate a generation before cleanup. Failed activation restores
  the previous metadata/catalog/settings. If rollback cannot be verified, both generations remain
  available rather than deleting possibly active chunks. Incomplete incoming Sync leaves the last
  applied PAC unchanged. A rule whose catalog arrives later stays visible and blocked until its
  device connection is configured.
- Shared origin Web Locks serialize reads that migrate legacy data and all read/modify/write
  operations across Popup, Options and the worker. Chrome's cross-device conflict semantics still
  apply; this is not a distributed transaction or a replacement for backups.

## Backup compatibility

Export format version 2 includes route IDs/names. Endpoints and device pause state are excluded
by default; selecting **Include local proxy config** includes all saved route connections for this
device. Import accepts v1 and v2, previews domain-level changes, blocks destination conflicts,
unknown route references and ID collisions, and preserves existing endpoints absent from an
import. A v1 proxy endpoint updates the actual Work connection. Apply rechecks current Sync and
local state, rejects stale previews, serializes both storage areas, and attempts Sync rollback if
the local write fails. Language and diagnostics preferences are not imported from the backup.
0.3.2 cannot understand v2 backups or named routes, but can continue editing shared Work rules.
It applies only Work, including any matching parent rule; it cannot implement Life/DIRECT or
Life/Proxy overrides. Upgrade every device to 0.4.1+ before relying on named routes across devices.
Do not keep a 0.4.0 client in the same Sync group. See [compatibility limits](sync-compatibility.md).

## Availability, HTTPS and corporate CAs

Popup shows configured intent separately from Chrome's actual `levelOfControl` and expected PAC.
Another extension or policy can override proxy settings. Opening either UI and subsequent proxy
setting changes refresh the warning; there is no background network polling. Reapply routing in
Options explicitly requests the current configuration again.

**Test selected route** is a bounded, user-invoked origin check. The selected connection temporarily
routes the current hostname while other rules stay in place; the normal PAC is restored in `finally`,
even after an uncertain apply. Routing changes and tests are serialized in the worker. No rule is
saved by the test. A separate user action is required to save a recommendation.

Using the existing activeTab/scripting grant, a short isolated-world function requests only the
open tab's HTTP(S) origin root, with no credentials/cookies, cache reuse or redirect following.
It reads no DOM or response body. Navigation invalidates the result. A worker-side deadline restores PAC even if tab script execution stalls. A resolved HTTPS fetch shows
that **this request's** HTTPS handshake succeeded under that test PAC; it does not prove raw SOCKS
socket health, proxy authentication, all page dependencies or every later request. An HTTP-only
success explicitly leaves HTTPS/certificates unverified. Timeout and generic network failure never
prove that the proxy itself is down.

Only during that test, `chrome.proxy.onProxyError` is observed for bounded certificate/TLS error
codes. Raw error details, addresses and URLs are discarded. A certificate code prevents a healthy
result and Work directs the user to check corporate CA trust in the **Corporate VPN Router setup
wizard**. TLS protocol codes do not imply a CA failure. Chrome does not expose the affected tab
on this event, so the UI says that another connection may be responsible. If Chrome hides the
cause behind a failed fetch, the UI explicitly cannot distinguish CA/TLS, DNS, proxy or site failure.
No certificate is installed, no HTTPS validation is disabled, no error-page bypass is offered,
and no broad permission, native messaging, external diagnostic endpoint or certificate service is used.

## Store review and verification limits

Required permissions remain exactly `proxy`, `storage`, `activeTab`, `scripting`, with no host
permissions, persistent content scripts, webRequest, webNavigation or debugger. Explain the new
one-time origin probe under the existing scripting justification in the Store dashboard. Proxy
control and script injection remain review-sensitive even without adding permissions. Current
single purpose, privacy disclosure and screenshots must match this behavior; Store acceptance is
not guaranteed by local tests.

Official references checked on 2026-11-06:

- [Chrome proxy API](https://developer.chrome.com/docs/extensions/reference/api/proxy)
- [ChromeSetting control and precedence](https://developer.chrome.com/docs/extensions/reference/api/types)
- [Minimum permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions)
- [Chrome Web Store policies](https://developer.chrome.com/docs/webstore/program-policies)

The probe explicitly uses Chrome’s ISOLATED world. Chromium’s [isolated-world network regression test](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/extensions/content_script_apitest.cc) verifies that isolated-world fetch bypasses a page service worker. This upstream evidence is separate from this release’s local browser smoke; it is not a claim of running Chromium’s test suite.

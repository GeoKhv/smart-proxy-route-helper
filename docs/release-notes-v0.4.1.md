# Smart Proxy Route Helper 0.4.1

Fixes the P1 mixed-version Sync regression in 0.4.0: old 0.3.2 clients could route
Life through their own proxy, then remove Life's route ID when saving another rule.

Work stays in the old compatible storage. Life and additional named lists now use
an isolated versioned namespace that old readers and writers do not touch. Existing
0.3.2 settings and Pause/Resume require no reconfiguration. Intact 0.4.0 named data
is migrated with a recovery copy; already-lost route IDs are not guessed.

Incoming same-scope conflicts between different lists preserve both records and
block the affected scope until the user explicitly chooses a rule in Options.
Staged writes, activation fences and cross-list ordering preserve incomplete-update
and timestamp-tie behavior. No permissions, backend, telemetry or remote code added.

**Compatibility boundary:** old clients continue to apply Work only. They cannot
implement Life's second proxy or DIRECT overrides of Work parents. Update all
participating devices to 0.4.1+ before relying on named routes across devices.
Do not keep 0.4.0 clients connected to the same Sync group. See
[the full contract](sync-compatibility.md).

Validation includes automated tests against the actual 0.3.2 release bundle and
visible isolated Chrome E2E with real toolbar Popup, Options, local HTTP/SOCKS5
traffic, preserved extension ID/storage, restart and offline Sync-data round trips.
Actual signed-in Google Sync and signed Chrome Web Store auto-update are NOT TESTED.
No unconditional mass-rollout GO is claimed before that remaining validation.

The existing v0.4.0 tag and ZIP are preserved. Chrome Web Store is unchanged.

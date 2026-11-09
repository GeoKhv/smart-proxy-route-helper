# Sync compatibility in 0.4.2 (candidate)

0.4.1 fixed the 0.4.0 regression in which an installed 0.3.2 client interpreted a
Life rule as Work/Proxy, then removed its route ID while saving an unrelated rule.
The old client's code cannot be changed by the new client.

## Supported contract

- Upgrading 0.3.2 retains its rules, DIRECT exceptions, local endpoint, language,
  diagnostics preference and active/paused state. Untagged rules remain Work.
- Work rules remain in `rulesMeta` / `rulesChunk:*`, schema version 1. Sequential
  Work additions, edits and deletions are readable and writable by both versions.
- Non-Work rules use `namedRoutesV1` and `namedRulesChunkV1:*`. The catalog is in
  the same versioned metadata. 0.3.2 neither reads these rules nor cleans these
  chunks when saving Work. Named edits do not rewrite unchanged Work metadata.
- Connections and Pause/Resume remain device-local. A shared Life rule may use
  DIRECT on one new device and a deliberately configured HTTP/SOCKS5 connection
  on another. No endpoint is exported to Sync.
- Independent Work/named edits publish only their own list pointer. Cross-list
  order anchors of unchanged named records are preserved, even after Work edits.
- 0.4.1's `namedEpoch` / `workTransition` equality fence is obsolete. It could
  permanently reject complete independently merged data. Fully delivered 0.4.1
  records are read without rewriting or dropping them.
- A cross-list edit stages immutable `splitOperationV2:*` metadata and
  `splitOperationChunkV2:*` deltas. Either list pointer references the operation.
  Readers validate the entire dependency graph and reconstruct an unacknowledged
  half; they remove only exact old records, retaining conflicting newer variants.
  Later intentional edits acknowledge the operation, preventing resurrection.
- Missing active chunks or operation records reject the read; the controller
  retains its previous PAC and reports failure. This does not promise routing for
  a new hostname before all required data is available. A completed independent
  update no longer waits for an unrelated generation. Pause remains available at
  the local proxy-controller layer even while Sync is incomplete.
- Operation records are retained while referenced, including causal ancestors;
  there is no unsafe distributed garbage collection. Many cross-list edits use
  additional Sync quota. A quota failure rejects the save without discarding the
  previous data. Ordinary single-list edits do not grow the operation journal.
- Verified staging, rollback and cleanup preserve possibly active generations
  when a rollback fails. Local Web Locks serialize extension contexts.
- Cross-list order anchors preserve timestamp-tie ordering without duplicating
  Work rules in protected storage. Work-only precedence is unchanged.

## Important limits on old devices

**0.3.2 does not support Life or any additional named connection.** It only applies
its own Work rules. A new Life-only hostname with no matching Work rule is DIRECT
on an old device, even when Life uses a proxy on a new device. If an existing Work
parent covers the hostname, the old device continues to apply that Work rule.
No new client can supply a second local endpoint to the installed old PAC runtime.
Update every participating device to 0.4.2+ before relying on Life across devices.
The Popup and Options state this boundary; unchanged Work setups need no migration
or mandatory reconfiguration.

If an old user explicitly creates a competing Work rule for the same hostname and
scope, both records are retained on 0.4.1. The affected scope is blocked using the
existing loopback discard destination (no DIRECT fallback), with a warning in
Popup. Use Options to explicitly keep the intended rule. Same-list legacy
conflicts retain their existing behavior. Parent/child overrides remain supported;
old devices still evaluate only the Work subset.

0.4.0 is **not** a supported participant after named storage isolation: it can
still publish unsafe tagged rules into legacy chunks. Upgrade those clients first.
Intact tagged 0.4.0 data is copied to the protected namespace and scrubbed from
legacy storage; already-stripped route IDs cannot be reconstructed reliably and
are not guessed. The original verified local recovery copy is retained. If a
0.4.0 client reintroduces tagged legacy rules after isolation, 0.4.1 rejects the
read and keeps its last PAC instead of silently combining them.

0.4.1 is not a supported concurrent named-route writer after upgrading to 0.4.2:
it cannot understand operation receipts and still republishes stale named pointers.
Upgrade those clients before resuming edits. Recovery of complete 0.4.1 data is
covered; the old protocol cannot prove an in-flight partial cross-list move atomic.

Chrome Sync still has asynchronous delivery and finite quotas. Concurrent writers
to the same Work generation, or the same modern named generation, retain the
existing last-writer behavior; this patch is not a CRDT and does not promise
lossless simultaneous edits. Separate Work/named namespaces prevent an old writer
from corrupting the new records. Settings exports remain useful backups.

## Alternatives considered

- A route ID or version field inside the old chunks is insufficient: 0.3.2 ignores
  the field and rewrites the list without it.
- A DIRECT projection of every Life rule would overwrite old Work behavior, cannot
  represent a second proxy endpoint, and creates ambiguous editable shadow rules.
- Moving every rule to a new namespace would strand later old-device Work edits.
- Keeping Work shared and isolating only the new records is the smallest change
  that supports the original Work workflow and protects named data from old writes.

## Verification boundary

Automated tests execute the immutable storage bundle from the real v0.3.2 ZIP.
The 0.4.2 regression fixture is the exact synthetic ten-rule payload delivered by
Google during the failed 2026-11-06 acceptance (without local or account data).
Tests cover independent writes in both orders and all 24 per-key permutations,
cross-list replay, conflicts, delayed operation chunks and intentional deletion.

Actual signed-in Google Sync and toolbar Popup acceptance of this candidate are
pending. No final release / Store GO is claimed until that gate passes. Signed
Chrome Web Store update delivery is separate and has not been exercised.

[Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)
describes asynchronous storage, approximately 100 KB total Sync capacity and 8 KB
per item. No new permissions or remote resources were added.

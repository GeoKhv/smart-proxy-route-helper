# Smart Proxy Route Helper 0.4.2

Fixes a P1 found during signed-in Google Chrome Sync acceptance of 0.4.1:
independent offline Work and online Life edits could arrive completely but remain
permanently unusable because their generation activation fences disagreed. The
receiving browser kept an older PAC and a newly delivered Work hostname could use
DIRECT instead of its configured proxy.

Work and named lists now advance independently. An unchanged list's pointer and
ordering anchors are not republished by an unrelated edit. The obsolete 0.4.1
cross-generation fence is no longer used to reject complete lists.

Edits affecting both lists stage an immutable operation before publishing either
pointer. Each pointer acknowledges the operations already included in its list.
A receiver can replay the missing half without overwriting unrelated additions;
changed conflicting records remain available for explicit resolution. Missing
operation/chunk data is rejected, rather than treated as an empty list. Local
Pause can still release routing while Sync is incomplete.

Work retains the schema understood by installed 0.3.2. Life and operation records
use protected namespaces that 0.3.2 does not read or delete. A subsequent legacy
Work generation remains authoritative; historical operations are not replayed over
an intentional old-client Work edit. Life routing requires 0.4.2 on all devices
that need it. Upgrade 0.4.0/0.4.1 participants before further named-route editing.

No permissions, telemetry, remote executable code or external service was added.
Connections, language and Pause remain local. Chrome Web Store is unchanged.

Acceptance: **418 automated tests PASS**, **57 real network assertions PASS**,
including signed-in Google Sync in two isolated visible Chrome profiles, the
original offline ten-rule regression, installed 0.3.2 interoperability,
cross-route conflict blocking and the real toolbar Popup. All 15 final rules were
checked on both devices. See the [verification record](releases/v0.4.2-release-record.md).

**GO for Store submission within the documented compatibility contract.** Signed
Chrome Web Store update delivery is **NOT TESTED**. Chrome Web Store is unchanged.
Same-list concurrent snapshots retain last-writer semantics; this is not a general
lossless CRDT. Upgrade 0.4.0/0.4.1 named writers before further editing.

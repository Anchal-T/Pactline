# Pactline demo events

These fixtures pair the sandbox schedule and procurement records with the active [60 Hz pump reference](../../specs/pump-reference.json). Quantities, quote amounts, supplier messages, approvals, and inspections are simulated. The manufacturer curve references in the pump dataset are public technical evidence.

Run from the repository root.

```sh
pnpm exec tsx scripts/run-demo.ts all
pnpm exec tsx scripts/run-demo.ts acceptance
pnpm exec tsx scripts/run-demo.ts reopen
```

| Path | Input sequence and expected behavior |
| --- | --- |
| `recovery` | Initial delay, one follow-up, escalation, offers, and two pinned human decisions. Execution stays blocked on incomplete technical evidence. |
| `acceptance` | Starts at the verified recovery seed, then replays shipment receipt and inspection. Receipt leaves accepted quantity at zero. Verified acceptance of both units is required for closure. |
| `reopen` | Starts at the same verified recovery seed and replays the revised forecast before any receipt or acceptance. The expected transition is `MITIGATED` to `INVESTIGATING`. |
| `out-of-order` | Delivers the version 2 forecast first. Version 1 occurred earlier and arrives later under the same source series. Ingress keeps version 2. |
| `float-absorbed` | Delays the anchor kit. Its buffer moves site prep by three workdays. Available float absorbs the slip. |
| `untrusted-text` | Stores a supplier message with a harmless instruction canary. Normalization marks the message as tainted. |

The [replay manifest](replay-manifest.json) lists the required files in order for each path. Files 01–11 are event envelopes with fixture expectations. The runner checks required files, the matching scenario seed, event envelopes, taint, and outcomes in the in-memory event store. Lifecycle transitions, approvals, and dispatch remain expectations for persistent runtime integration.

Offer A passes the head check. Selected motor and site evidence remain open, so overall compliance is incomplete. Offer B fails the mandatory head check. Offer C lacks selected motor evidence. The expired quote is separate from the current A quote. The scripted human decisions in `recovery` leave execution blocked until independent technical evidence is verified. The [verified recovery seed](verified-recovery.json) gives `acceptance` and `reopen` their own sandbox starting state with an authorized, confirmed action and zero accepted units.

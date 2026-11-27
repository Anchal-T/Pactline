# 05 — Reference Execution Trace (Hero Scenario)

> **Role of this doc:** one scenario, every hop, literal payloads. This is the **acceptance test** for Phases 2–5: a milestone is "done" when the trace runs further than before with the same outputs.
> **Status:** Proposed — November 27, 2026. All records are **SANDBOX / SYNTHETIC**. Candidate products are referenced by fixture ID (`cfg-A`, `cfg-B`, `cfg-C`) until real public datasheets are collected and cited in [07](07_Canonical_Demo_Dataset.md) — names must never be filled in from memory.
> **Clock:** `VirtualClock`; timestamps stored in UTC (`Z`, matching the Zod envelope), displayed in Asia/Kolkata; schedule calendar Mon–Fri with project holidays.

---

## Phase 0 — Seeded state (before the first event)

| Record | Key values |
| --- | --- |
| Project | `proj-hvac-demo-001`, schedule rev `sched-rev-003` (CURRENT), baseline `sched-rev-001` (immutable) |
| Package | `pkg-pump-chw-001`, 2 × chilled-water end-suction pumps, tags P-CHW-01A / P-CHW-01B, requirement set `reqset-pump-r2` |
| Material need | `mn-001`: activity `A-140 Install CHW pumps`, required usable `2027-01-04`, readiness buffer 2 working days |
| PO line | `pol-pump-001` (PO `PO-4500-1123` line 1), qty 2, vendor `ven-001`, config `cfg-BOD` (basis of design), contractual arrival `2026-12-28` |
| Commitment history | `vc-001` arrival 2026-12-28 (ACKNOWLEDGED, 2026-10-02) |
| Schedule result | `A-140` total float 0 d (on path to `M-200 CHW plant commissioned`) |

---

## Phase 1 — Vendor slip arrives (untrusted)

**HTTP** `POST /api/events/ingest`

```json
{
  "source": "sandbox-vendor-email",
  "source_event_id": "msg-77812@vendor.sandbox",
  "type": "VendorCommitmentChanged",
  "project_id": "proj-hvac-demo-001",
  "subject_type": "POLine",
  "subject_id": "pol-pump-001",
  "occurred_at": "2026-12-01T09:00:00Z",
  "evidence_ref": "doc://mail/msg-77812",
  "payload": {
    "raw_text_ref": "doc://mail/msg-77812#body",
    "extracted": { "revised_arrival_date": "2027-01-07", "po_ref": "PO-4500-1123", "reason_code": "MANUFACTURING_BACKLOG" }
  }
}
```

**Normaliser** → dedupe on `source_event_id` (new), quarantined extraction ×3 agrees, PO ref cross-checked → `taint: verified` for `po_ref`, `untrusted` for `reason_code` (no corroboration yet).

**SQL (one transaction)**

```sql
INSERT INTO events (event_id, type, source_event_id, received_at, …) VALUES ('evt-001', 'VendorCommitmentChanged', 'msg-77812@vendor.sandbox', '2026-12-01T09:05:00Z', …);
INSERT INTO vendor_commitments (id, po_line_id, kind, arrival_date, status, valid_from, recorded_at, source_ref)
  VALUES ('vc-002', 'pol-pump-001', 'FORECAST', '2027-01-07', 'REVISED', '2026-12-01T09:00', '2026-12-01T09:05', 'doc://mail/msg-77812');
UPDATE vendor_commitments SET valid_to = '2026-12-01T09:00' WHERE id = 'vc-001';   -- history kept
INSERT INTO audit_events (kind, subject, detail) VALUES ('EVENT_INGESTED', 'pol-pump-001', '{"event_id":"evt-001"}');
```

---

## Phase 2 — Impact (S1, deterministic + Monte Carlo)

`tickIncidents` → `pactline_assess_delivery_risk`

```json
{
  "specialist": "delivery_risk", "status": "OK",
  "result": { "items": [{
    "po_line_id": "pol-pump-001", "need_date": "2027-01-04",
    "usable_date_p50": "2027-01-11", "usable_date_p80": "2027-01-15",
    "float_days": 0, "float_consumed": 5,
    "impact_class": "CRITICAL", "p_on_time": 0.04, "criticality_index": 0.97,
    "affected_activities": ["A-140", "A-150", "A-160", "M-200"]
  }], "project_finish_p50": "2027-02-19", "project_finish_p80": "2027-02-24" },
  "confidence": { "method": "deterministic", "tier": "CERTAIN", "score": 1.0, "evidence_coverage": 0.8,
                  "reason": "CPM on sched-rev-003; 2 of 10 downstream durations use documented defaults" },
  "evidence": [{ "ref_id": "src_1", "kind": "email", "uri": "doc://mail/msg-77812", "excerpt": "…revised dispatch now 07 January 2027…", "trust_tier": "vendor_claim" }]
}
```

*Numbers above are illustrative targets; the real values are whatever the engine computes on the final fixture and are then frozen here.*

**Incident opened** — `INC-0001` `DETECTED`, owner `operator`, `next_review_at` +4 h, `next_action` "investigate + source alternatives".

---

## Phase 3 — Parallel investigation & sourcing

Two `specialist_tasks` inserted, each with `StatePin { schedule_rev: sched-rev-003, reqset: reqset-pump-r2, po_line_ver: 4 }`.

**S2 result (abridged)**

```json
{ "result": {
  "confirmed_facts": [{ "fact": "Forecast arrival moved 2026-12-28 → 2027-01-07", "refs": ["src_1"] }],
  "hypotheses": [{ "statement": "Supplier manufacturing backlog", "confidence": 0.55, "supporting_refs": ["src_1"], "contradicting_refs": [] }],
  "missing_evidence": ["Factory test date", "Whether partial shipment (1 of 2) is possible"],
  "next_questions": [{ "to_role": "VENDOR", "question": "Can 1 unit ship by 2026-12-28?", "draft_ref": "draft-001" }],
  "vendor_reliability": { "promise_vs_actual_slip_ratio": 1.4, "n": 3 } },
  "confidence": { "tier": "PROBABLE", "method": "agreement", "reason": "single vendor-claim source" } }
```

**S4 → S3 (three candidates)**

| Candidate | Head @ 100 m³/h | Required | Motor | NPSH margin | Verdict | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `cfg-A` | from digitized curve | ≥ 35 m (grade per req) | 18.5 kW, IE3, 400 V | ≥ +1.0 m | **PASS** | all mandatory checks pass on cited evidence |
| `cfg-B` | below 35 m beyond tolerance | ≥ 35 m | ok | ok | **FAIL** | `PUMP.HEAD.BELOW_DUTY` (mandatory) |
| `cfg-C` | ok | ≥ 35 m | **no motor data** | ok | **UNKNOWN** | `MISSING_EVIDENCE` → engineer handoff |

Each row carries `spec_ref` (`reqset-pump-r2 §Mandatory 1`, page/quote) and `submittal_ref` (datasheet page + bbox).

---

## Phase 4 — Lead time & recovery options

**S5 for `cfg-A` from `ven-002`** → `{ "regime": "STOCKED", "p50_weeks": 2.5, "interval_80": {"lo": 2, "hi": 4}, "basis": [offer-A1, market prior refs] }`

**S6 result**

```json
{ "options": [
  { "option_id": "opt-1", "kind": "EXPEDITE_ORIGINAL", "p_on_time": 0.12, "cost_delta_inr": 60000, "required_approvals": ["COMMERCIAL"], "blockers": ["vendor has not confirmed expedite"] },
  { "option_id": "opt-2", "kind": "SUBSTITUTE", "config": "cfg-A", "offer": "offer-A1", "p_on_time": 0.81, "cost_delta_inr": 210000,
    "required_approvals": ["TECHNICAL", "COMMERCIAL"], "completion_test": "accepted_qty >= 2 for cfg-A" },
  { "option_id": "opt-3", "kind": "SPLIT", "detail": "1 × original + 1 × cfg-A", "p_on_time": 0.58, "cost_delta_inr": 120000, "required_approvals": ["TECHNICAL", "COMMERCIAL"] },
  { "option_id": "opt-4", "kind": "RESEQUENCE", "p_on_time": null, "blockers": ["needs planner approval; not modelled"] } ],
  "eliminated": [{ "config": "cfg-B", "reason": "mandatory FAIL" }, { "config": "cfg-C", "reason": "UNKNOWN on mandatory motor requirement" }],
  "recommended": "opt-2" }
```

Grounding validator checks the narrative: every config ID, offer ID, amount and date must match the structured options; otherwise template fallback.

---

## Phase 5 — Approval (pinned)

`INC-0001 → AWAITING_APPROVAL`

```json
{ "approval_id": "apr-001", "incident_id": "INC-0001", "kind": "TECHNICAL+COMMERCIAL",
  "subject": { "option_id": "opt-2", "config_id": "cfg-A" },
  "pins": { "requirement_rev": "reqset-pump-r2", "config_rev": "cfg-A@3", "offer_rev": "offer-A1@1", "plan_rev": "plan-INC-0001@2" },
  "expires_at": "2026-12-04T12:30:00Z", "required_roles": ["ENGINEER_OF_RECORD", "PROCUREMENT_MANAGER"] }
```

Via MCP: Amber receives `status: NEEDS_HUMAN` with a handoff, or (if supported) an elicitation request. Via UI: Approval Queue. Decision: `POST /api/approvals/apr-001/decide { "decision": "APPROVE", "role": "ENGINEER_OF_RECORD", "pins": {…} }` (same for PM).

---

## Phase 6 — Execution through the gateway

```sql
BEGIN;
  SELECT … FROM approvals WHERE id='apr-001' FOR UPDATE;          -- re-verify pins & expiry
  INSERT INTO action_receipts (idempotency_key, action, status, payload)
    VALUES ('INC-0001:opt-2:send_po_to_ven-002:v1', 'SEND_PO', 'DISPATCHING', '{…}');
COMMIT;
```

`tickOutbox` → `SandboxExternalAdapter.execute()` → `CONFIRMED`, `external_id: sbx-po-889`. Second outbox entry: courtesy notice to `ven-001` (routine template, no approval needed). Incident → `MITIGATED`; follow-up timer `FollowUpDue` at +2 working days for vendor acknowledgement.

**Crash beat (scenario 7):** kill worker after `execute()` and before `CONFIRMED` → restart → `reconcile('INC-0001:opt-2:…')` finds `sbx-po-889` → mark `CONFIRMED`; external send count = 1.

---

## Phase 7 — Silence, follow-up, acknowledgement

- `FollowUpDue` fires with no acknowledgement → one templated follow-up (rate-limited, idempotent) → second timeout → `ESCALATED` to procurement manager with the thread.
- Vendor acknowledges dispatch `2026-12-22` → new `vendor_commitments` row → S1 recompute → `p_on_time 0.93`.

---

## Phase 8 — Receipt and verification

`ShipmentReceived { qty: 2 }` + nameplate photos → S9:

```json
{ "matches": [
  { "field": "model", "expected": "cfg-A model string", "observed": "…", "verdict": "MATCH" },
  { "field": "ie_class", "expected": "IE3", "observed": "IE3", "verdict": "MATCH" },
  { "field": "volts/ph/hz", "expected": "400/3/50", "observed": "400/3/50", "verdict": "MATCH" } ],
  "disposition_recommendation": "ACCEPT" }
```

Human inspection records `accepted_qty = 2` → `VERIFYING → CLOSED` (invariant 5 satisfied). Closure record lists every evidence ref.

---

## Phase 9 — Reopen variant (scenario 10)

Run instead of Phase 8: on `2026-12-26` vendor `ven-002` reports a 9-day slip while incident is `MITIGATED` → S1 recompute → `CRITICAL` → `MITIGATED → INVESTIGATING` (REOPEN), plan version 3, prior approval stays valid only for `cfg-A` (offer pin changed → `apr-001` invalidated, new approval required).

---

## Phase 10 — What the UI and Amber see at each phase

| Phase | Dashboard | Agent log entry | Amber (MCP) |
| --- | --- | --- | --- |
| 1 | New event toast | `EVENT_INGESTED evt-001` | — |
| 2 | Incident card turns CRITICAL, countdown | `SPECIALIST S1 run_… OK` | `pactline_get_incident` → CRITICAL |
| 3 | Compliance matrix fills A/B/C | `S2`, `S4`, `S3×3` | each specialist callable alone |
| 4 | Recovery frontier chart | `S5`, `S6`, `GROUNDING_OK` | `pactline_plan_recovery` |
| 5 | Approval queue item with pins | `APPROVAL_REQUESTED apr-001` | `NEEDS_HUMAN` / elicitation |
| 6 | Receipt timeline; crash recovered | `ACTION_DISPATCHED`, `RECONCILED`, `CONFIRMED` | — |
| 7 | Follow-up and escalation markers | `FOLLOW_UP_SENT`, `ESCALATED` | — |
| 8 | Nameplate match card, CLOSED | `RECEIPT_VERIFIED`, `INCIDENT_CLOSED` | `pactline_verify_receipt` |

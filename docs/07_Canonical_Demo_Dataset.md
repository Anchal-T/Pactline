# 07 — Canonical Demo Dataset Specification

> **Role of this doc:** a specification, not a research report. Every seed script, fixture, eval case and screenshot derives from this one frozen project. If a fixture disagrees with this doc, the fixture is wrong.
> **Status:** Proposed — November 27, 2026. Extends existing files in `data/fixtures/` and `data/specs/pump-spec.md`.

---

## 1. Principles

1. **One coherent project**, India context: 400 V / 3 ph / 50 Hz, metric units (m³/h, m, kW), ₹, Asia/Kolkata timezone. Never mix in 60 Hz requirement sets.
2. **Two kinds of data, always labelled:**
   - **AUTHENTIC** — public manufacturer datasheets/curves, public standards references, public market reports. Stored with URL, retrieval date, content hash, page.
   - **SANDBOX** — POs, vendor messages, quotes, approvals, shipments, photos-of-record. Every file carries `"_note": "SYNTHETIC SANDBOX …"`.
3. **No invented products.** Candidate configurations exist only after the datasheet is downloaded and cited. Until then they are `cfg-A/B/C` placeholders.
4. **Held-out split.** Eval inputs the agents have never seen during development live in `data/eval/heldout/` and are not referenced by any prompt or fixture.

## 2. Project & schedule (`data/fixtures/project-schedule.json`)

- `proj-hvac-demo-001` — "Data-hall CHW plant, Building 2 (SANDBOX)".
- Calendar: Mon–Fri, holidays 2026-12-25, 2027-01-26.
- Revisions: `sched-rev-001` BASELINE (immutable), `sched-rev-003` CURRENT.
- 14 activities (IDs fixed):

| ID | Activity | Dur (wd) | Predecessors | Notes |
| --- | --- | --- | --- | --- |
| A-100 | CHW pump submittal review | 10 | — | |
| A-110 | Pump manufacture (vendor) | 40 | A-100 | procurement-linked |
| A-120 | Factory performance test | 3 | A-110 | |
| A-130 | Delivery to site | 5 | A-120 | material need anchor |
| A-135 | Plinths & inertia bases cast | 8 | — | civil |
| A-140 | Install CHW pumps | 5 | A-130, A-135 | **need date anchor** |
| A-145 | Install chillers | 10 | — | parallel path |
| A-150 | CHW piping connections | 8 | A-140, A-145 | |
| A-155 | Electrical terminations & VFDs | 5 | A-150 | |
| A-160 | Flushing & pressure test | 4 | A-155 | |
| A-170 | Cooling tower install | 12 | — | float path (scenario 1) |
| A-180 | Condenser water piping | 6 | A-170 | float path |
| A-190 | Pre-commissioning checks | 3 | A-160, A-180 | |
| M-200 | CHW plant commissioned (milestone) | 0 | A-190 | contractual deadline |

Durations may be tuned once so the schedule engine reproduces the trace in [05](05_Reference_Execution_Trace.md); after that they are frozen. Optional PERT ranges per activity for Monte Carlo (`optimistic/most_likely/pessimistic`), defaults documented where absent.

## 3. Packages, needs, POs (`data/fixtures/equipment-packages.json`, `purchase-orders.json`)

| Package | Qty | Need (activity) | PO line | Vendor | Role in eval |
| --- | --- | --- | --- | --- | --- |
| `pkg-pump-chw-001` CHW primary pumps P-CHW-01A/B | 2 | A-140 | `pol-pump-001` / PO-4500-1123 | `ven-001` | hero incident |
| `pkg-pump-cw-002` Condenser water pumps | 2 | A-180 | `pol-pump-002` | `ven-003` | float-absorbed delay (scenario 1) |
| `pkg-ct-003` Cooling tower | 1 | A-170 | `pol-ct-001` | `ven-004` | stale/out-of-order update (scenario 2) |
| `pkg-vfd-004` VFD panel | 2 | A-155 | `pol-vfd-001` | `ven-005` | parallel contention (scenario 11) |
| `pkg-pump-chw-001` (2nd line) | 1 | A-140 | `pol-pump-001b` | `ven-001` | partial acceptance (scenario 9) |

Vendors `ven-001…ven-005` are **fictional SANDBOX companies** with obviously synthetic names (e.g. "Sandbox Pumps Pvt Ltd"). Real manufacturers appear only as *product sources*, never as counterparties to sandbox POs.

## 4. Requirements (`data/specs/pump-spec.md` → `reqset-pump-r2`)

Existing synthetic spec is retained and versioned:

| Req ID | Predicate | Mandatory | Evidence needed |
| --- | --- | --- | --- |
| R-01 | Head ≥ 35 m at 100 m³/h, acceptance per ISO 9906 grade (configured) | yes | curve for exact model/impeller/rpm |
| R-02 | Efficiency at duty ≥ 72% | yes | curve or datasheet value at duty |
| R-03 | 400 V / 3 ph / 50 Hz, IE3 minimum | yes | motor data |
| R-04 | NPSHa − NPSHr ≥ 1.0 m at duty (NPSHa = 5.5 m) | yes | NPSHr curve |
| R-05 | Motor non-overloading to end of curve ≤ rated kW × SF 1.0 | yes | power curve + motor rating |
| R-06 | Flanges DN100 suction / DN80 discharge, PN16 | yes | dimensional sheet |
| R-07 | Water 6–12 °C | yes | fluid/temperature range |
| R-08 | Cast-iron casing; stainless impeller preferred | no | materials list |
| R-09 | VFD-suitable motor | no | motor data |

`reqset-pump-r3` (scenario 6): R-01 head raised to 36 m → invalidates approvals pinned to r2.

## 5. Product configurations (`data/fixtures/product-configurations/`)

To collect (owner: Phase 1C): **2–3 manufacturers × 3–5 configurations** of horizontal end-suction pumps around 100 m³/h @ 35 m, 1450 rpm, 50 Hz, from public datasheets/curve PDFs (e.g. KSB, Kirloskar, Grundfos, Xylem/Lowara, Wilo — whichever publish usable 50 Hz curves). Each config file:

```json
{ "config_id": "cfg-A", "manufacturer": "<from source>", "model": "<from source>", "impeller_mm": 0, "rpm": 1450, "hz": 50,
  "curves": { "hq": [[0,0]], "eta": [], "npshr": [], "p2_kw": [] }, "curve_source": { "uri": "", "page": 0, "retrieved_at": "", "content_hash": "", "digitized_by": "manual|vision", "rms_error_m": 0 },
  "motor": { "kw": 0, "ie": "IE3", "volts": 400, "phase": 3, "hz": 50 } | null,
  "flanges": { "suction_dn": 100, "discharge_dn": 80, "pn": 16 }, "materials": {}, "_trust": "AUTHENTIC" }
```

**Required coverage:** at least one config that passes all mandatory requirements (`cfg-A`), one that fails head at duty (`cfg-B`), one with motor data absent (`cfg-C`, set `motor: null` *only* if the real sheet lacks it, or use a curve-only sheet), plus 2+ extra configs reserved for held-out eval.

## 6. Offers, messages, documents (SANDBOX)

- `offers/offer-A1.json` — `cfg-A` from `ven-002`, qty 2, ₹ price, lead time 2–3 weeks STOCKED, `expires_at` 2026-12-04 (scenario 5 uses an expired variant).
- `mail/` — vendor emails as `.eml`-like JSON: slip notice, silence (absence), acknowledgement, **injection email** (scenario 12) with hidden instruction text, and a PDF submittal with white-on-white injected text.
- `photos/` — nameplate images rendered from a template (synthetic plate, SANDBOX watermark) for match and mismatch cases.
- `quotes/` — 3 quote PDFs for S8 with differing exclusions (freight, start-up, VFD, base frame, warranty start).

## 7. Event sequence (`data/fixtures/demo-events/`)

Existing `01-vendor-delay.json` kept. Full ordered set:

| File | Event | Day (virtual) | Expected behaviour |
| --- | --- | --- | --- |
| 01-vendor-delay | VendorCommitmentChanged pol-pump-001 → 2027-01-07 | D0 | CRITICAL incident |
| 02-vendor-silence | FollowUpDue (no reply) | D2 | one follow-up, then escalate on D4 |
| 03-offers | OfferReceived A1, B1, C1 | D1 | A PASS, B FAIL, C UNKNOWN |
| 04-tech-approval | ApprovalGranted TECHNICAL apr-001 | D2 | pins checked |
| 05-commercial-approval | ApprovalGranted COMMERCIAL apr-001 | D2 | EXECUTING → outbox |
| 06-shipment | ShipmentReceived qty 2 + photos | D15 | S9 MATCH |
| 07-inspection | InspectionCompleted accepted 2 | D15 | CLOSED |
| 08-second-delay | VendorCommitmentChanged (while MITIGATED) | D20 (variant) | REOPEN |
| 09-injection-email | SupplierResponseReceived with injected text | any | blocked, 0 writes |
| 10-float-absorbed | VendorCommitmentChanged pol-pump-002 +3 d | any | FLOAT_ABSORBED, no incident |
| 11-out-of-order | Two commitments, older `source_version` arrives last | any | older ignored |

## 8. ID stability contract

- IDs in this doc are **business keys** and never change once frozen. DB surrogate keys may differ; `entity_links` maps them.
- Fixture regeneration must keep IDs, dates and amounts identical, or bump the dataset version (`dataset_version: "2026-11-27.1"`) and update [05](05_Reference_Execution_Trace.md).

## 9. Provenance & licensing log

`data/SOURCES.md` lists every authentic file: title, publisher, URL, retrieval date, licence/terms note, SHA-256, and which fixture uses it. Required for the README "data sources" section.

## 10. Open items

- Choose manufacturers whose public 50 Hz curves are legible enough to digitize.
- Confirm ISO 9906 grade tolerance values from the standard before encoding R-01 acceptance.
- Decide whether to include a second equipment module stub (AHU fan or chiller) in eval.

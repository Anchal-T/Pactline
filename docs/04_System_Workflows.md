# 04 — Pactline System Workflows & Diagrams

> **Role of this doc:** the visual source of truth — architecture, information flow, lifecycles and the key runtime sequences — as Mermaid diagrams that render on GitHub.
> **Status:** Proposed — November 27, 2026. Consistent with AGENTS.md (Shape B: single Postgres + transactional outbox + stateless ticks) and [03 Agent Suite](03_Agent_Suite_Specification.md).
> **Reading tip:** each diagram is followed by the rules it encodes. If code and diagram disagree, the invariant list in AGENTS.md §5 wins, then this doc.

---

## 1. System architecture (information flow first)

```mermaid
flowchart TB
  subgraph EXT["External world (sandboxed in prototype)"]
    VEMAIL["Vendor email / portal<br/>(untrusted)"]
    DOCS["Spec, submittals, datasheets,<br/>quotes (PDF / image)"]
    SITE["Site: nameplate photo,<br/>voice note"]
    SCHED["Schedule export<br/>(P6 / XER-like JSON)"]
    ERP["ERP / PO system<br/>(sandbox adapter)"]
    PUB["Public sources<br/>(catalogs, registries,<br/>market reports, price index)"]
  end

  subgraph AMBER["Kaya Amber (caller)"]
    AMB["Amber orchestrator"]
  end

  subgraph EDGE["Edges"]
    MCP["MCP server<br/>(streamable HTTP + stdio)"]
    API["REST API + WS<br/>(apps/api)"]
    UI["Operator dashboard<br/>(apps/frontend)"]
  end

  subgraph INGRESS["Ingress (untrusted → typed)"]
    NORM["Event normaliser<br/>dedupe · order · envelope"]
    DOCPIPE["Document pipeline<br/>layout parse · bbox · hash"]
    QX["Quarantined extractors<br/>(narrow Zod schemas)"]
  end

  subgraph CORE["Deterministic kernel"]
    WS[("Neon Postgres<br/>world state · facts (bi-temporal)<br/>incidents · plans · approvals<br/>outbox · receipts · audit")]
    SE["Schedule engine<br/>CPM + Monte Carlo"]
    PE["Pump evaluator"]
    ER["Entity resolver"]
    CD["Conflict detector"]
    GW["Policy & execution gateway"]
  end

  subgraph RT["Incident runtime (stateless ticks)"]
    T1["ingestEvent"]
    T2["tickIncidents"]
    T3["tickTasks"]
    T4["tickOutbox"]
  end

  subgraph AG["Agent workers (read-only, version-pinned)"]
    OPD["OperatorDecider"]
    SPEC["Specialists S1–S9"]
  end

  VEMAIL --> NORM
  SCHED --> NORM
  ERP --> NORM
  DOCS --> DOCPIPE --> QX
  SITE --> DOCPIPE
  PUB -.cached snapshots.-> SPEC
  NORM --> T1 --> WS
  QX --> WS
  T2 --> OPD
  T3 --> SPEC
  SPEC --> SE & PE & ER
  SPEC --> CD
  OPD -->|"proposed actions"| GW
  GW --> WS
  T4 --> GW
  GW -->|"approved, idempotent"| ERP
  GW -->|"approved, idempotent"| VEMAIL
  AMB <--> MCP
  MCP --> RT
  MCP --> SPEC
  UI <--> API
  API --> WS
  API --> T1
```

**Rules encoded**
- Untrusted inputs reach agents only as typed, tainted values (§8).
- Agents never hold credentials; only the gateway's adapters write externally, and only from the outbox.
- Postgres is the single owner of durable state — no LangGraph checkpointer, no second store.
- MCP exposes specialists directly (stateless analysis) *and* operator/runtime tools (stateful, durable).

---

## 2. The standing control loop

```mermaid
flowchart LR
  O["Observe<br/>events · timers · documents"] --> I["Interpret<br/>link records · facts · impact"]
  I --> P["Plan<br/>specialists · options · plan_steps"]
  P --> A["Act / coordinate<br/>approvals · outbox · follow-ups"]
  A --> V["Verify<br/>external state vs postcondition"]
  V --> M["Maintain<br/>monitor until acceptance"]
  M --> R{"New evidence<br/>invalidates result?"}
  R -- yes --> I
  R -- no, accepted --> C["Close with evidence"]
  M -. timer .-> O
```

---

## 3. Incident lifecycle (state machine)

```mermaid
stateDiagram-v2
  [*] --> DETECTED: impact WARNING or CRITICAL
  DETECTED --> INVESTIGATING: operator tick
  INVESTIGATING --> PLANNING: facts + impact ready
  INVESTIGATING --> BLOCKED: missing evidence past deadline
  PLANNING --> AWAITING_APPROVAL: binding option selected
  PLANNING --> EXECUTING: only routine follow-ups needed
  AWAITING_APPROVAL --> EXECUTING: valid approval (pins match, not expired)
  AWAITING_APPROVAL --> PLANNING: rejected / pin invalidated
  EXECUTING --> MITIGATED: credible commitment confirmed
  EXECUTING --> ESCALATED: uncertain write / timeout
  MITIGATED --> VERIFYING: shipment received
  MITIGATED --> INVESTIGATING: new delay (REOPEN)
  VERIFYING --> CLOSED: accepted_qty ≥ required_qty OR valid WAIVER
  VERIFYING --> PLANNING: inspection fail / partial acceptance
  ESCALATED --> PLANNING: human resolves
  BLOCKED --> INVESTIGATING: evidence arrives
  CLOSED --> [*]
```

**Invariant reminders:** every non-CLOSED state has `owner`, `next_review_at`, and `next_action` or `blocker` (DB CHECK). MITIGATED ≠ CLOSED. Transitions use optimistic `version` checks.

---

## 4. Hero scenario — end-to-end sequence

```mermaid
sequenceDiagram
  autonumber
  participant V as Vendor (sandbox)
  participant N as Normaliser
  participant DB as Postgres
  participant OP as Operator
  participant S1 as S1 Delivery Risk
  participant S2 as S2 Investigation
  participant S4 as S4 Equivalents
  participant S3 as S3 Compliance
  participant S5 as S5 Lead-Time
  participant S6 as S6 Recovery
  participant H as Human (PM / EoR)
  participant GW as Gateway + Outbox

  V->>N: email "P-CHW-01A/B ship slips to 07-Jan"
  N->>DB: VendorCommitmentChanged (tainted fields)
  DB-->>OP: tickIncidents → impact check
  OP->>S1: assess(po_line pol-pump-001)
  S1-->>OP: CRITICAL, P(on-time)=0.18, float −6d
  OP->>DB: Incident INC-0001 DETECTED → INVESTIGATING
  par investigate and source
    OP->>S2: investigate(INC-0001)
    S2-->>OP: cause=backlog (PROBABLE), slip history 1.4×
  and
    OP->>S4: find_equivalents(duty 100 m³/h @ 35 m)
    S4->>S3: check A, B, C
    S3-->>S4: A PASS · B FAIL head · C UNKNOWN motor
    S4-->>OP: candidates + compliance
  end
  OP->>S5: forecast(A, vendor X stocked)
  S5-->>OP: p50 2.5 wk, 80% [2, 4]
  OP->>S6: plan_recovery(INC-0001)
  S6-->>OP: expedite P=0.31 · substitute A P=0.84 (+₹) · split P=0.66
  OP->>DB: PLANNING → AWAITING_APPROVAL (approval pins req_rev, config_rev, offer_rev, plan_rev)
  DB-->>H: approval request (technical + commercial)
  H->>DB: approve (exact revisions)
  DB-->>OP: EXECUTING
  OP->>GW: propose send_PO_amendment + vendor_notice
  GW->>DB: action_receipts DISPATCHING (idempotency_key)
  GW->>V: execute (sandbox)
  GW->>DB: CONFIRMED → MITIGATED
  Note over OP,DB: follow-up timers; vendor commitments monitored
  V->>N: shipment received, nameplate photo
  N->>DB: ShipmentReceived
  OP->>DB: VERIFYING (S9 nameplate check, accepted_qty)
  OP->>DB: CLOSED with evidence
```

---

## 5. Specialist delegation contract

```mermaid
sequenceDiagram
  participant OP as Operator
  participant RT as tickTasks
  participant W as Specialist worker
  participant VAL as Envelope validator
  participant DB as Postgres

  OP->>DB: insert specialist_task (StatePin, objective, budget, deadline)
  RT->>DB: SELECT … FOR UPDATE SKIP LOCKED
  RT->>W: run(task, scoped read snapshot)
  W-->>VAL: SpecialistResult
  VAL->>VAL: schema · no-invention · verbatim excerpts · confidence tier
  alt pins still current
    VAL->>DB: task COMPLETED + result
  else input revisions drifted
    VAL->>DB: task STALE (kept for audit, not executable)
  end
  alt status NEEDS_HUMAN / ABSTAINED
    DB-->>OP: create HumanHandoff
  end
```

---

## 6. Approval & execution gateway (exactly-once intent)

```mermaid
flowchart TD
  A["Operator proposes action"] --> B{"Action class?"}
  B -- READ / DRAFT --> X["Allowed, logged"]
  B -- EXTERNAL_WRITE routine --> C{"Within template,<br/>recipient & rate limits?"}
  B -- BINDING --> D{"Valid approval?<br/>role · pins match · not expired"}
  C -- no --> H["Escalate"]
  C -- yes --> E
  D -- no --> H
  D -- yes --> T{"Any tainted argument<br/>not human-approved?"}
  T -- yes --> H
  T -- no --> E["INSERT action_receipts<br/>status=DISPATCHING, idempotency_key<br/>(same txn as approval re-check)"]
  E --> F["tickOutbox → adapter.execute()"]
  F --> G{"Outcome"}
  G -- confirmed --> K["CONFIRMED + external_id"]
  G -- timeout / crash --> R["reconcile(idempotency_key)"]
  R -- found --> K
  R -- not found, safe --> F
  R -- cannot verify --> U["UNCERTAIN → ESCALATED"]
```

---

## 7. Crash and restart recovery (demo beat for Track 01)

```mermaid
sequenceDiagram
  participant W1 as Worker (pid 1)
  participant DB as Postgres
  participant AD as Sandbox adapter
  participant W2 as Worker (pid 2)
  W1->>DB: receipt act-17 DISPATCHING
  W1->>AD: execute(act-17)
  AD-->>AD: side effect happens
  Note over W1: kill -9 before CONFIRMED is written
  W2->>DB: tickOutbox finds act-17 DISPATCHING (lease expired)
  W2->>AD: reconcile(act-17)
  AD-->>W2: exists, external_id=ext-552
  W2->>DB: act-17 CONFIRMED (no second send)
```

**Demo metric:** duplicate external writes after `kill -9` = 0 (scenario 7).

---

## 8. Untrusted input path (prompt-injection defence)

```mermaid
flowchart LR
  E["Vendor email / PDF<br/>(may contain 'ignore previous…')"] --> S["Spotlight / datamark"]
  S --> Q["Quarantined extractor<br/>schema: {ship_date, po_ref, reason_code}"]
  Q --> TV["Typed values<br/>taint = untrusted"]
  TV --> XC{"Deterministic cross-check<br/>PO exists · vendor known · date sane"}
  XC -- pass --> VV["taint = verified"]
  XC -- fail --> FL["Finding: anomaly<br/>+ INJECTION_SUSPECTED if instruction-like"]
  VV --> OP["Operator / specialists"]
  FL --> OP
  OP -->|"proposal"| GW["Gateway policy:<br/>no tainted args to side effects"]
```

---

## 9. Lead-time & schedule risk computation

```mermaid
flowchart LR
  MR["Market report priors<br/>(SourceRefs, ranges)"] --> MIX["Mixture prior<br/>by regime STOCKED / ETO"]
  VH["Vendor promise vs actual<br/>(bi-temporal facts)"] --> ADJ["Slip-ratio adjustment"]
  PPI["Price-index momentum"] --> WID["Widen only"]
  QT["Quoted lead time + basis"] --> MIX
  MIX --> ADJ --> WID --> CF["Split-conformal calibration<br/>(held-out pairs)"]
  CF --> DIST["Lead-time distribution<br/>p50 · 80% · 95%"]
  DIST --> MC["Monte Carlo over CPM<br/>10k seeded runs"]
  CPM["CPM network<br/>(schedule_rev)"] --> MC
  MC --> OUT["P(on-time) · criticality index<br/>p50/p80 project finish"]
  OUT --> CFX["Counterfactual per recovery option<br/>ΔP(on-time) vs cost"]
```

---

## 10. Compliance evaluation pipeline (S3)

```mermaid
flowchart TB
  SP["Spec 23 21 23 + equipment schedule"] --> SC["Spec compiler (model)<br/>→ typed Requirement[] + quotes"]
  SC --> HA{"Rule set approved<br/>by engineer?"}
  HA -- no --> HQ["Handoff: approve rule set"]
  HA -- yes --> RS[("requirement_set rev N")]
  SUB["Submittal / datasheet PDF"] --> LP["Layout parse<br/>page · bbox · tables · figures"]
  LP --> EX["Value extraction ×2<br/>(disagreement → conflict)"]
  LP --> CV["Curve digitizer ×3–5<br/>median · PCHIP fit · RMS"]
  EX --> PC[("product_configuration rev M")]
  CV --> PC
  RS --> EV["Deterministic evaluator<br/>head@Q · ISO 9906 grade · region<br/>NPSH margin · motor non-overload<br/>electrical · flanges · materials"]
  PC --> EV
  EV --> F["Findings PASS / FAIL / UNKNOWN / N/A<br/>each citing spec + submittal"]
  F --> G{"|margin| < extraction error?"}
  G -- yes --> U["UNKNOWN + LOW_CONFIDENCE handoff"]
  G -- no --> OK["Verdict recommendation"]
```

---

## 11. Data model (core entities)

```mermaid
erDiagram
  PROJECT ||--o{ SCHEDULE_REVISION : has
  SCHEDULE_REVISION ||--o{ ACTIVITY : contains
  ACTIVITY ||--o{ DEPENDENCY : "pred/succ"
  PROJECT ||--o{ EQUIPMENT_PACKAGE : has
  EQUIPMENT_PACKAGE ||--o{ MATERIAL_NEED : "needed by"
  ACTIVITY ||--o{ MATERIAL_NEED : requires
  EQUIPMENT_PACKAGE ||--o{ REQUIREMENT_SET : "rev"
  REQUIREMENT_SET ||--o{ REQUIREMENT : contains
  PURCHASE_ORDER ||--o{ PO_LINE : contains
  PO_LINE ||--o{ FULFILLMENT_ALLOCATION : allocates
  MATERIAL_NEED ||--o{ FULFILLMENT_ALLOCATION : satisfied_by
  PO_LINE ||--o{ VENDOR_COMMITMENT : "history (append-only)"
  PO_LINE ||--o{ RECEIPT : receives
  RECEIPT ||--o{ INSPECTION : inspected
  PRODUCT_CONFIGURATION ||--o{ EVIDENCE : "sourced by"
  PRODUCT_CONFIGURATION ||--o{ COMPLIANCE_FINDING : evaluated
  REQUIREMENT ||--o{ COMPLIANCE_FINDING : against
  VENDOR ||--o{ SUPPLIER_OFFER : quotes
  PRODUCT_CONFIGURATION ||--o{ SUPPLIER_OFFER : offered
  VENDOR ||--o{ PREQUAL_SCORECARD : assessed
  INCIDENT ||--o{ SPECIALIST_TASK : delegates
  INCIDENT ||--o{ PLAN : has
  PLAN ||--o{ PLAN_STEP : contains
  INCIDENT ||--o{ RECOVERY_OPTION : considers
  RECOVERY_OPTION ||--o{ APPROVAL : "requires (pinned revs)"
  APPROVAL ||--o{ ACTION_RECEIPT : authorizes
  FACT }o--|| ENTITY_LINK : "about"
  INCIDENT ||--o{ AUDIT_EVENT : logs
```

New vs. plan doc §15: `FACT` (bi-temporal), `ENTITY_LINK`, `PLAN`/`PLAN_STEP`, `SPECIALIST_TASK`, `PREQUAL_SCORECARD`, `AUDIT_EVENT`, `CALIBRATION` (not drawn).

---

## 12. Event catalogue

| Event | Producer | Consumer | Notes |
| --- | --- | --- | --- |
| `ScheduleRevised` | ingress | runtime | new revision; BASELINE immutable |
| `VendorCommitmentChanged` | ingress | runtime → S1 | append-only commitment history |
| `MilestoneMissed` | timer / ingress | runtime | |
| `SupplierResponseReceived` | ingress | S2 | tainted until cross-checked |
| `SubmittalReceived` / `DocumentIngested` | doc pipeline | S3 | long-running MCP task |
| `RequirementSetRevised` | ingress / human | runtime | invalidates findings + approvals |
| `OfferReceived` / `OfferExpired` | ingress / timer | S4, S6 | `expires_at NOT NULL` |
| `ApprovalGranted` / `ApprovalRejected` | UI / MCP | runtime | pinned revisions |
| `ShipmentReceived` / `InspectionCompleted` | ingress / S9 | runtime | accepted ≠ received |
| `FollowUpDue` | timer | operator | bounded retries → escalate |
| `SiteObservation` | voice / photo | S9 / operator | multimodal |
| internal: `ImpactRecomputed`, `IncidentOpened/Updated/Reopened/Closed`, `TaskCompleted/Stale`, `PlanRevised`, `DisagreementRaised`, `ActionDispatched/Confirmed/Uncertain`, `InjectionSuspected` | kernel | UI WS + audit | every one lands in `audit_events` |

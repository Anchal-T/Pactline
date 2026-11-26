# Pactline — Build Checklist

> **Product:** Procurement Continuity Operator — autonomous agent suite for construction procurement recovery
> **Primary Track:** Track 03 (Vertical Agents) | **Supporting:** Track 01 (Durable execution, long-horizon work)
> **Submission Deadline:** Sunday, December 6, 2026
> **Equipment Niche (Prototype):** Commercial HVAC chilled-water centrifugal pumps

---

## How to use this checklist

Data, kernel, and agent tasks can run in parallel where their dependencies allow. Start dashboard work after the deterministic kernel and all 12 required scenarios pass. Submission materials can start early. The [runtime architecture](https://app.notion.com/p/42358d57c29881aab441d6b9870af6a2) and [AGENTS.md](../AGENTS.md) define the agreed stack and verification gate.

**Legend:**
- ⬜ = Not started
- 🟡 = In progress, including scaffolds and drafts
- ✅ = Done
- 🔴 = Blocked (note blocker)
- 👤 = Assignee field — write your name

---

## Phase 1: Data & Domain Foundation
> **Can be picked up by:** 1 person | **Est. effort:** 2–3 days
> **What this delivers:** Sandbox project and procurement fixtures paired with authentic public mechanical specifications and manufacturer pump data.

### 1A — Project Schedule Data
- ✅ Create the synthetic baseline with 12 activities and 12 finish-to-start dependencies. [Schedule fixture](../data/fixtures/project-schedule.json)
- ✅ Define activity types for design, procurement, fabrication, delivery, inspection, installation, and commissioning.
- ✅ Set workday durations, planned dates, and predecessor/successor relationships.
- ✅ Include a critical path through pump installation and 13 workdays of float for site preparation.
- ✅ Define the workweek, holiday exclusions, and the site-preparation start constraint.

### 1B — Equipment & Procurement Data
- ✅ Create three sandbox packages for chilled-water pumps, anchor kits, and piping connection kits. [Procurement fixture](../data/fixtures/equipment-packages.json)
- ✅ Link each package to a schedule activity through a `MaterialNeed` with a quantity, required usable date, and readiness buffer.
- ✅ Add PO lines with fictional suppliers, quantities, release dates, and contractual arrivals.
- ✅ Add an active allocation for each material need within the linked PO line quantity.
- ✅ Add planned fabrication, test, dispatch, and delivery milestones.
- ✅ Record an initial vendor acknowledgment for each PO line.

### 1C — Technical Specifications & Product Data
- ✅ Create the 60 Hz technical reference dataset from the NPS CHWP-1 schedule and project specifications. [Pump reference fixture](../data/specs/pump-reference.json)
- ✅ Record typed duty-point, equipment, motor, and insulation criteria with applicability, evidence needs, and tolerance assumptions. Site NPSH, physical fit, materials, and pressure limits are recorded as open criteria.
- ✅ Digitize the Bell & Gossett e-1510 and Taco FI curves for the selected impellers, speeds, and water basis. Store sampled head, efficiency, and NPSHr with source locators and estimated reading error.
- ✅ Check that the fixture supports a head pass, a head failure, and an unknown motor finding.
- ✅ Retain the superseded 50 Hz values for context. [Historical draft](../data/specs/pump-spec.md)

### 1D — Demo Event Sequence
- 🟡 👤 ___________ — Script the sandbox demo incident sequence.
- ✅ Add the first vendor delay fixture. The December 14 notice follows PO release and acknowledgment. The January 7 forecast arrival shifts earliest installation from December 30 to January 11. [Delay event](../data/fixtures/demo-events/01-vendor-delay.json)
- ⬜ Event 2: Vendor silence on follow-up (stale update)
- ⬜ Event 3: Alternative product offers received (candidate A passes, B fails head, C missing motor data). Obtain a selected motor submittal and resolve the open site criteria before labeling a candidate as a full pass.
- ⬜ Event 4: Technical approval granted for candidate A
- ⬜ Event 5: Commercial approval granted
- ⬜ Event 6: Shipment and receipt
- ⬜ Event 7: Inspection result
- ⬜ Event 8: Second delay → incident reopens
- ⬜ Output format: Ordered JSON event files with timestamps, payloads, and expected agent behavior

---

## Phase 2: Backend Core — Deterministic Kernel
> **Can be picked up by:** 1–2 people | **No dependencies (parallel with Phase 1)** | **Est. effort:** 3–4 days
> **What this delivers:** The non-LLM backbone — world state, schedule engine, incident state machine, policy gateway.

### 2A — World State Store (Database)
- 🟡 👤 ___________ — Set up Neon PostgreSQL and Drizzle migrations. The database client and migration configuration are scaffolded. [Database package](../packages/db/package.json)
- ⬜ Define schema for all Phase 3 entities:
  - ⬜ Project, ScheduleRevision
  - ⬜ Activity, Dependency
  - ⬜ EquipmentPackage, MaterialNeed
  - ⬜ PurchaseOrder, POLine
  - ⬜ FulfillmentAllocation
  - ⬜ VendorCommitment, Milestone
  - ⬜ RequirementSet, Requirement
  - ⬜ ProductConfiguration, Evidence
  - ⬜ ComplianceFinding
  - ⬜ SupplierOffer
  - ⬜ Incident
  - ⬜ RecoveryPlan, RecoveryAction
  - ⬜ Approval
  - ⬜ ActionReceipt
  - ⬜ Receipt, Inspection, Acceptance
- ⬜ Implement versioned record history (all updates preserved, not overwritten)
- ⬜ Write seed data loader (loads Phase 1 JSON into DB)
- ⬜ Write basic CRUD + query functions for each entity

### 2B — Schedule Engine
- ⬜ 👤 ___________ — Implement deterministic CPM/float calculator
- ⬜ Forward pass: compute early start / early finish for all activities
- ⬜ Backward pass: compute late start / late finish for all activities
- ⬜ Calculate total float per activity
- ⬜ Identify critical path
- ⬜ **Impact analysis function:** Given a delayed item, recompute affected activities and report:
  - ⬜ Which activities are delayed
  - ⬜ How much float is consumed
  - ⬜ Whether the critical path is affected
  - ⬜ New projected dates
- ⬜ Handle calendar constraints (working days only)
- ⬜ Unit tests with known schedule → known results

### 2C — Incident State Machine
- ⬜ 👤 ___________ — Implement incident lifecycle manager
- 🟡 Complete the incident states. The domain type exists and needs `CLOSED`. [Domain entities](../packages/domain/src/entities.ts)
- ⬜ Define valid transitions with preconditions
- ⬜ Enforce invariants:
  - ⬜ Require verified accepted quantity or a valid waiver with schedule disposition before closure.
  - ⬜ No duplicate procurement allocation
  - ⬜ Reopening on new evidence that invalidates recovery
  - ⬜ Require an owner, review deadline, and either a next action or a blocker on every open incident.
- ⬜ Transition logging (full audit trail of state changes with timestamps)
- ⬜ Unit tests for valid and invalid transitions

### 2D — Event Ingress & Normalization
- ⬜ 👤 ___________ — Build event intake pipeline
- 🟡 Align the event envelope and fixture IDs. The Zod schema currently requires UUIDs, and the delay fixture uses `evt-001`. [Event schema](../packages/domain/src/events.ts)
- 🟡 Wire `POST /api/events/ingest` to validate the envelope and call `IncidentRuntime.ingestEvent()`. The route currently returns a placeholder acknowledgment. [Event route](../apps/api/src/routes/events.ts)
- ⬜ Deduplication by source_event_id
- ⬜ Out-of-order handling with version/effective-date rules
- ⬜ Record commitments from `VendorCommitmentChanged` in append-only history and compute the forecast from the latest valid commitment.
- ⬜ Event → incident trigger rules (e.g., forecast exceeds need date → open incident)

### 2E — Policy & Execution Gateway
- ⬜ 👤 ___________ — Build the authority enforcement layer
- ⬜ Define action types and their required approval levels
- ⬜ Idempotency key generation and duplicate-action prevention
- ⬜ Pre-action checks: scope, approval validity (exact revision match), preconditions
- ⬜ Action intent logging before execution
- ⬜ Action receipt recording after execution
- ⬜ Reconcile uncertain outcomes by idempotency key before retrying.

### 2F — Compliance Evaluator (Deterministic)
- ⬜ 👤 ___________ — Build typed requirement evaluation engine
- ⬜ Requirement predicate types: numeric comparison (≥, ≤, =, range), string match, boolean
- ⬜ Pump-specific predicates:
  - ⬜ Head at specified flow ≥ minimum (with interpolation from curve data)
  - ⬜ Efficiency at duty point
  - ⬜ Motor / electrical / VFD compatibility
  - ⬜ NPSH available vs. required (with margin)
  - ⬜ Physical dimensions and connection fit
  - ⬜ Material and pressure rating
- ⬜ Evaluate: PASS / FAIL / UNKNOWN / NOT_APPLICABLE per requirement
- ⬜ Return evidence references for each finding
- ⬜ No extrapolation beyond validated data range → UNKNOWN
- ⬜ Unit tests with known product data → known compliance results

---

## Phase 3: Backend — Agent Layer (LLM)
> **Can be picked up by:** 1–2 people | **Depends on:** Phase 2A (DB schema), Phase 2D (event pipeline) — can start skeleton while Phase 2 builds | **Est. effort:** 3–4 days
> **What this delivers:** The LLM-powered agents that reason, investigate, and coordinate.

### 3A — Agent Framework Setup
- ⬜ 👤 ___________ — Set up agent orchestration framework
- 🟡 Implement stateless, read-only LangChain calls behind `AgentWorkers` and `OperatorDecider`. Dependencies are declared. Neon owns durable execution state. [Agent workers package](../packages/agent-workers/package.json)
- 🟡 Configure `ChatOpenAI` through Cloudflare AI Gateway or another OpenAI-compatible endpoint, with separate model settings for extraction, investigation, and operator decisions. [Environment example](../.env.example)
- ⬜ Define delegation contract schema (task_id, incident_id, role, objective, input versions, evidence refs, output schema)
- ⬜ Implement task dispatch and result collection
- ⬜ Implement bounded delegation (max depth, max parallel tasks, timeout with escalation)
- ⬜ Implement structured output validation on return

### 3B — Procurement Operator Agent
- ⬜ 👤 ___________ — Build the main operator agent
- ⬜ System prompt with role, standing responsibility, authority boundaries
- ⬜ Event handler: receive event → load incident + world state context → decide next step
- ⬜ Delegation logic: when to call which specialist
- ⬜ Recovery plan composition: compare options from specialists, rank, propose
- ⬜ Approval request generation: exact configuration/revision/evidence for human review
- ⬜ Follow-up scheduling: set timers for vendor response deadlines, approval expiry
- ⬜ Incident progression: drive incident through lifecycle based on specialist results
- ⬜ Persistence: save operator state between events (durable execution)
- ⬜ Recover worker ticks from persisted Neon state and reconcile uncertain outbox actions before retrying.

### 3C — Investigation Agent
- ⬜ 👤 ___________ — Build root cause investigation specialist
- ⬜ Input: conflicting/stale commitments, PO history, vendor updates
- ⬜ Output: supported hypotheses, confirmed facts, missing evidence, next questions
- ⬜ Capability: reconcile multiple data sources, detect inconsistencies
- ⬜ Constraint: cannot assert unconfirmed root cause — must label confidence
- ⬜ Structured output with evidence citations

### 3D — Engineering Compliance Agent (LLM Extraction)
- ⬜ 👤 ___________ — Build specification extraction specialist
- ⬜ Input: spec document (PDF/markdown), submittal document
- ⬜ Output: extracted requirements with types, units, conditions, mandatory status
- ⬜ Capability: parse engineering specifications, identify requirement clauses
- ⬜ Hand off extracted requirements to deterministic compliance evaluator (Phase 2F)
- ⬜ Handle ambiguous / unclear spec language → flag UNKNOWN rather than guess
- ⬜ Source citation for every extracted requirement (document, page, section)

### 3E — Alternative Sourcing Agent
- ⬜ 👤 ___________ — Build product/supplier search specialist
- ⬜ Input: required specifications, quantity, location, latest viable date, supplier constraints
- ⬜ Output: candidate products with configurations, availability, lead time, source refs
- ⬜ Search against product catalog data (Phase 1C) — no invented products/vendors
- ⬜ Return compliance summary (pre-screen against requirements)
- ⬜ Include availability evidence and quote validity/expiry
- ⬜ Constraint: no fabricated stock, prices, or delivery commitments

### 3F — Recovery Planning Logic
- ⬜ 👤 ___________ — Build recovery option evaluation (can be inside operator or separate)
- ⬜ Compare options: expedite original, substitute product, split fulfillment, resequence
- ⬜ For each option: projected usable date, cost/risk, required approvals, blockers
- ⬜ Hard constraints first (mandatory requirement failures eliminate options), ranking second
- ⬜ Include approval and logistics lead times in projected dates
- ⬜ Structured comparison output for UI and for operator decision

### 3G — Pre-UI Verification
- 🟡 Implement the 12 required scenarios. The harness currently enumerates them. [Scenario scaffold](../packages/eval-harness/src/scenarios/index.ts)
- ⬜ Pass all 12 scenarios against an isolated Neon branch using `VirtualClock` and a fault-injecting `SandboxExternalAdapter`. [Verification targets](../AGENTS.md#6-verification-target-12-mandatory-scenarios)

---

## Phase 4: Frontend — Operator Dashboard
> **Deferred until:** The deterministic kernel and all 12 required scenarios pass (Phase 3G).
> **What this delivers:** The visual dashboard for demo and human-in-the-loop interaction.

### 4A — Project Setup & Layout
- ⬜ 👤 ___________ — Initialize frontend project
- 🟡 Build on the existing Next.js scaffold after the verification gate passes. [Web package](../apps/web/package.json)
- ⬜ Install shadcn/ui + Tailwind CSS
- ⬜ Create app layout: sidebar navigation + main content area
- ⬜ Define routes: Dashboard, Incident Detail, Schedule, Compliance, Approvals, Agent Log
- ⬜ Set up API client (axios / fetch wrapper) pointing to backend

### 4B — Incident Dashboard (Main View)
- ⬜ 👤 ___________ — Build the central incident list/card view
- ⬜ Fetch and display all incidents from `GET /api/incidents`
- ⬜ Show: severity badge, status chip, affected package, countdown to required-on-site date
- ⬜ Filter by: status, severity, equipment category
- ⬜ Sort by: urgency (days to deadline), severity, last updated
- ⬜ Click-through to incident detail view
- ⬜ Real-time updates via WebSocket (`WS /ws/incidents`)

### 4C — Incident Detail & Timeline View
- ⬜ 👤 ___________ — Build deep-dive incident page
- ⬜ Fetch incident detail from `GET /api/incidents/{id}`
- ⬜ Render chronological timeline of all events, delegations, findings, actions
- ⬜ Each timeline entry shows: timestamp, event type, summary, source link, confidence
- ⬜ Expandable detail for each entry (full evidence, raw data)
- ⬜ Current status and next expected action prominently displayed
- ⬜ Specialist delegation visualization (which agent did what, when)

### 4D — Schedule Impact Visualization
- ⬜ 👤 ___________ — Build schedule/Gantt component
- ⬜ Fetch schedule data from `GET /api/schedule/impact/{incident_id}`
- ⬜ Render Gantt chart or dependency graph (Recharts / D3.js / React Flow)
- ⬜ Highlight: affected activities (red), float consumed (yellow), critical path
- ⬜ Show before/after comparison when delay is introduced
- ⬜ Tooltip with activity details on hover

### 4E — Compliance Matrix View
- ⬜ 👤 ___________ — Build requirement comparison table
- ⬜ Fetch compliance data from `GET /api/compliance/{package_id}`
- ⬜ Table: rows = requirements, columns = candidate products A/B/C
- ⬜ Color coding: ✅ PASS (green), ❌ FAIL (red), ❓ UNKNOWN (yellow), ➖ N/A (gray)
- ⬜ Mandatory requirements visually distinct from optional
- ⬜ Clickable evidence references for each finding
- ⬜ Confidence score displayed per finding

### 4F — Recovery Plan Comparison
- ⬜ 👤 ___________ — Build side-by-side recovery option view
- ⬜ Fetch options from `GET /api/recovery/{incident_id}/options`
- ⬜ Card per option: projected date, cost delta, risk level, required approvals, blockers
- ⬜ Visual comparison (bar chart or table)
- ⬜ Highlight recommended option with reasoning

### 4G — Approval Queue
- ⬜ 👤 ___________ — Build human-in-the-loop approval interface
- ⬜ List pending approvals with full context
- ⬜ Show: what is being approved, exact configuration/revision, evidence summary, agent recommendation
- ⬜ Action buttons: Approve / Reject / Request More Info
- ⬜ POST decision to `POST /api/approvals/{id}/decide`
- ⬜ Confirmation and status update after action

### 4H — Agent Activity Log
- ⬜ 👤 ___________ — Build real-time agent action feed
- ⬜ Stream from `WS /ws/agent-activity` or `GET /api/agents/activity`
- ⬜ Chronological feed: event received → specialist called → finding returned → action taken
- ⬜ Each entry: timestamp, agent role, action type, summary, source/evidence link
- ⬜ Filter by: agent role, action type, incident
- ⬜ This satisfies Track 01 requirement: "Logs every action it takes and every specialist it calls"

---

## Phase 5: Integration, MCP & End-to-End
> **Can be picked up by:** 1–2 people (ideally someone who worked on Phase 2 or 3) | **Depends on:** Phase 2 + 3 + 4 (at least partial) | **Est. effort:** 2–3 days
> **What this delivers:** MCP server, full pipeline wiring, end-to-end demo flow.

### 5A — MCP Server Implementation
- ⬜ 👤 ___________ — Expose backend as MCP server (required by hackathon)
- 🟡 Configure the TypeScript MCP server. The stdio entry point exists and tool registration is pending. [MCP server](../apps/mcp/src/index.ts)
- ⬜ Implement MCP tools:
  - ⬜ `analyze_schedule_impact` — calls schedule engine
  - ⬜ `investigate_procurement_issue` — calls investigation agent
  - ⬜ `check_compliance` — calls compliance evaluator
  - ⬜ `find_alternatives` — calls sourcing agent
  - ⬜ `evaluate_recovery_options` — calls recovery planning
  - ⬜ `get_incident_status` — queries incident manager
  - ⬜ `submit_approval` — records approval decision
- ⬜ Structured JSON input/output per tool
- ⬜ Confidence scores in all outputs
- ⬜ Source citations in all findings
- ⬜ Test MCP server with direct calls (verify Amber-callable)

### 5B — End-to-End Pipeline Wiring
- ⬜ 👤 ___________ — Connect all systems for the demo flow
- ⬜ Load seed data (Phase 1) into DB (Phase 2A)
- ⬜ Wire event ingress → world state update → incident trigger → operator dispatch
- ⬜ Wire operator → specialist delegation → result collection → incident progression
- ⬜ Wire approval queue → frontend → backend → incident continuation
- ⬜ Wire follow-up scheduler → operator re-engagement
- ⬜ Test full incident lifecycle: delay event → detection → investigation → sourcing → compliance → recovery → approval → execution → verification → closure
- ⬜ Test reopen on second delay

### 5C — Demo Mode & Replay
- ⬜ 👤 ___________ — Build demo replay capability
- 🟡 Connect the ordered fixture replay to `IncidentRuntime.ingestEvent()`. The replay script currently reads and logs events. [Replay script](../scripts/run-demo.ts)
- ⬜ Timed event replay (simulate days passing in seconds/minutes)
- ⬜ Frontend demo mode: guided walkthrough with annotations explaining each phase
- ⬜ Reset function to restart demo from scratch
- ⬜ All synthetic data clearly labeled as synthetic in the UI

### 5D — Docker Deployment
- ⬜ 👤 ___________ — Containerize everything for judges
- ⬜ Dockerfile for the TypeScript backend and workers on Node 24.
- ⬜ Dockerfile for the Next.js frontend.
- ⬜ Docker Compose for app services with a Neon connection configured via `DATABASE_URL`.
- ⬜ Single `docker compose up` starts everything
- ⬜ README with setup instructions, model names, cost/response time estimates
- ⬜ Environment variable for LLM API key

---

## Phase 6: Submission Deliverables
> **Can be picked up by:** 1–2 people | **Partially parallel with other phases** | **Est. effort:** 2 days
> **What this delivers:** Everything needed for the December 6 submission.

### 6A — Demo Video (up to 5 minutes)
- ⬜ 👤 ___________ — Record end-to-end demo video
- ⬜ Script the narrative: problem → agent detects → investigates → finds alternatives → compliance check → recovery plan → approval → execution → verification → reopen on new delay
- ⬜ Show the UI dashboard in action
- ⬜ Show MCP server being called (Amber integration proof)
- ⬜ Show structured output + source citations + confidence scores
- ⬜ Show agent activity log / audit trail
- ⬜ Label all synthetic data
- ⬜ Keep under 5 minutes

### 6B — Pitch Deck (8–10 slides)
- ⬜ 👤 ___________ — Create pitch deck
- ⬜ Slide 1: Problem — procurement delays cost millions; human expediting is manual and reactive
- ⬜ Slide 2: Solution — Pactline: autonomous procurement continuity operator
- ⬜ Slide 3: How it works — event-driven detection → investigation → recovery → verification
- ⬜ Slide 4: Architecture — world model, deterministic kernel, specialist agents, MCP interface
- ⬜ Slide 5: Track 03 specialists — investigation, compliance, sourcing, recovery planning
- ⬜ Slide 6: Track 01 capabilities — durable execution, crash recovery, long-horizon work
- ⬜ Slide 7: Compliance matrix + recovery comparison (screenshots)
- ⬜ Slide 8: Differentiation — closed-loop recovery, not just document analysis or alerts
- ⬜ Slide 9: Tech stack, models used, cost/response time
- ⬜ Slide 10: Team + next steps

### 6C — Code Repository & README
- ⬜ 👤 ___________ — Prepare submission repository
- ⬜ Clean code with consistent structure
- ⬜ README with:
  - ⬜ Project description and track (Track 03 primary, Track 01 supporting)
  - ⬜ Setup instructions (clone → install → docker compose up)
  - ⬜ How to run the agent
  - ⬜ How to run the demo
  - ⬜ Models used with cost and response time per run
  - ⬜ Data sources cited
  - ⬜ Team members and affiliations
- ⬜ LICENSE file
- ⬜ .env.example with required environment variables

### 6D — DevPost Submission
- ⬜ 👤 ___________ — Submit on DevPost
- ⬜ Track and challenge selection
- ⬜ Division selection (Student or Professional)
- ⬜ Code repository link
- ⬜ Demo video link
- ⬜ Pitch deck upload
- ⬜ Team member names and affiliations
- ⬜ Written description aligned with pitch deck

---

## Phase Dependency Map

- Phase 1 provides the fixtures, and Phase 2 provides the kernel. Phase 1B uses the Phase 1A schedule IDs. Phase 1D uses the procurement fixtures and Phase 1C candidate evidence.
- Phase 3 agent wiring uses the Phase 2 world store and event ingress. Phase 3G verifies the fixtures, kernel, and runtime before Phase 4 starts.
- Phase 5 MCP wiring can start alongside the backend. The full dashboard demo uses the Phase 4 views and approval flow.
- Phase 6 materials can start early. The final demo uses the verified Phase 5 flow.

## Parallelism Guide

| Timing | Person A (Backend) | Person B (Backend/Agents) | Person C (Verification/Frontend) | Person D (Data/Deliverables) |
| --- | --- | --- | --- | --- |
| Before the verification gate | Phase 2 world store, schedule, gateway, and compliance | Incident runtime, ingress, and Phase 3 agents | Phase 3G scenario harness and verification | Phase 1C, 1D, and pitch deck draft |
| After the verification gate | Phase 5A MCP server and backend integration | Phase 5B end-to-end wiring | Phase 4 dashboard and Phase 5C demo mode | Deployment, README, video, and submission |

---

> **Remember:** Track 03 says "a suite that covers as much of the procurement workflow as possible, without trading away depth." Each specialist must be **world-class at its job**, not a thin wrapper. The judges want something "a procurement manager would use tomorrow."

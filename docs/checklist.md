# Pactline — Build Checklist

> **Product:** Procurement Continuity Operator — autonomous agent suite for construction procurement recovery
> **Primary Track:** Track 03 (Vertical Agents) | **Supporting:** Track 01 (Durable execution, long-horizon work)
> **Submission Deadline:** Sunday, December 6, 2026
> **Equipment Niche (Prototype):** Commercial HVAC chilled-water centrifugal pumps

---

## How to use this checklist

Each phase is **self-contained enough for a separate person/pair to pick up**. Dependencies between phases are marked explicitly. Phases 1–3 can be worked on **in parallel** by different people. Phase 4 depends on Phase 1 + 2 + 3. Phase 5 depends on Phase 4. Phase 6 is independent and can start early.

**Legend:**
- ⬜ = Not started
- 🟡 = In progress
- ✅ = Done
- 🔴 = Blocked (note blocker)
- 👤 = Assignee field — write your name

---

## Phase 1: Data & Domain Foundation
> **Can be picked up by:** 1 person | **No dependencies** | **Est. effort:** 2–3 days
> **What this delivers:** The synthetic project dataset that every other phase consumes.

### 1A — Project Schedule Data
- ⬜ 👤 ___________ — Create synthetic project schedule (10–15 activities with realistic dependencies)
- ⬜ Define activity types: design, procurement, fabrication, delivery, inspection, installation, commissioning
- ⬜ Set realistic durations and predecessor/successor relationships
- ⬜ Include at least one critical path through pump installation
- ⬜ Define calendars and constraints (working days, holidays)
- ⬜ Output format: JSON file with activities, dependencies, dates, constraints

### 1B — Equipment & Procurement Data
- ⬜ 👤 ___________ — Create synthetic equipment packages (3–5 packages, primary: chilled-water pumps)
- ⬜ Define MaterialNeed records linking packages to schedule activities
- ⬜ Create PO lines with vendor, quantities, contractual dates
- ⬜ Create vendor milestone plans (fabrication → test → ship → deliver)
- ⬜ Create initial VendorCommitment records (baseline promises)
- ⬜ Output format: JSON seed data files

### 1C — Technical Specifications & Product Data
- ⬜ 👤 ___________ — Create synthetic pump specification requirements
- ⬜ Define typed requirements: flow/head at duty point, efficiency, motor/electrical, NPSH, dimensions, materials, pressure rating
- ⬜ Include mandatory vs. optional distinction per requirement
- ⬜ Define acceptance tolerances and evidence needed per requirement
- ⬜ Collect 2–3 real manufacturer product families from public catalogs (Grundfos, Xylem/B&G, Wilo)
- ⬜ Extract performance curves / data points for specific configurations
- ⬜ Create ProductConfiguration records with evidence references
- ⬜ Output format: JSON requirement sets + product configurations with source citations

### 1D — Demo Event Sequence
- ⬜ 👤 ___________ — Script the demo incident sequence (the synthetic "movie" the demo plays)
- ⬜ Event 1: Vendor announces delay (day 38 arrival vs. day 30 needed)
- ⬜ Event 2: Vendor silence on follow-up (stale update)
- ⬜ Event 3: Alternative product offers received (candidate A passes, B fails head, C missing motor data)
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
- ⬜ 👤 ___________ — Set up database (PostgreSQL or SQLite)
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
- ⬜ **[Keploy](https://github.com/keploy/keploy):** record `POST /api/events/ingest` calls during demo replay → auto-generate regression tests stored in `apps/api/keploy/`

### 2C — Incident State Machine
- ⬜ 👤 ___________ — Implement incident lifecycle manager
- ⬜ Define states: DETECTED, INVESTIGATING, PLANNING, AWAITING_APPROVAL, EXECUTING, MITIGATED, VERIFYING, CLOSED, ESCALATED, BLOCKED
- ⬜ Define valid transitions with preconditions
- ⬜ Enforce invariants:
  - ⬜ No closure without verified acceptance
  - ⬜ No duplicate procurement allocation
  - ⬜ Reopening on new evidence that invalidates recovery
  - ⬜ Every open incident has owner + next action + review deadline
- ⬜ Transition logging (full audit trail of state changes with timestamps)
- ⬜ Unit tests for valid and invalid transitions

### 2D — Event Ingress & Normalization
- ⬜ 👤 ___________ — Build event intake pipeline
- ⬜ Define event envelope schema (event_id, type, project_id, subject, timestamps, source, evidence_ref, payload)
- ⬜ REST endpoint: `POST /api/events/ingest`
- ⬜ Deduplication by source_event_id
- ⬜ Out-of-order handling with version/effective-date rules
- ⬜ Event → world state update propagation (e.g., VendorCommitmentChanged → update PO line forecast)
- ⬜ Event → incident trigger rules (e.g., forecast exceeds need date → open incident)

### 2E — Policy & Execution Gateway
- ⬜ 👤 ___________ — Build the authority enforcement layer
- ⬜ Define action types and their required approval levels
- ⬜ Idempotency key generation and duplicate-action prevention
- ⬜ Pre-action checks: scope, approval validity (exact revision match), preconditions
- ⬜ Action intent logging before execution
- ⬜ Action receipt recording after execution
- ⬜ Uncertain outcome handling (flag for reconciliation, don't retry blindly)

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
- ⬜ **[Keploy](https://github.com/keploy/keploy):** record `check_compliance` MCP tool calls → replay suite in `apps/mcp/keploy/`

---

## Phase 3: Backend — Agent Layer (LLM)
> **Can be picked up by:** 1–2 people | **Depends on:** Phase 2A (DB schema), Phase 2D (event pipeline) — can start skeleton while Phase 2 builds | **Est. effort:** 3–4 days
> **What this delivers:** The LLM-powered agents that reason, investigate, and coordinate.

### 3A — Agent Framework Setup
- ⬜ 👤 ___________ — Set up agent orchestration framework
- ⬜ Choose framework: LangGraph / custom / Temporal (evaluate based on durable state needs)
- ⬜ Configure LLM provider (Gemini 2.5 Pro / Flash)
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
- ⬜ Crash recovery: resume correctly from last checkpoint without duplicating actions

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

---

## Phase 4: Frontend — Operator Dashboard
> **Can be picked up by:** 1–2 people | **Depends on:** Phase 2 API endpoints (can start with mock data) | **Est. effort:** 3–4 days
> **What this delivers:** The visual dashboard for demo and human-in-the-loop interaction.
>
> **Design rule — [Unslop](https://github.com/heydamir/unslop):** Every component below must pass an Unslop review before it is marked done. Run Unslop after each section completes. A component that renders but looks like a default template is **not done**. The dashboard must look like something a procurement manager would trust with real incident data.

### 4A — Project Setup & Layout
- ⬜ 👤 ___________ — Initialize frontend project
- ⬜ Set up Next.js / React + Vite project
- ⬜ Install shadcn/ui + Tailwind CSS
- ⬜ Create app layout: sidebar navigation + main content area
- ⬜ Define routes: Dashboard, Incident Detail, Schedule, Compliance, Approvals, Agent Log
- ⬜ Set up API client (axios / fetch wrapper) pointing to backend
- ⬜ **Unslop check:** layout, typography, color palette, sidebar — no default shadcn theme, no placeholder copy

### 4B — Incident Dashboard (Main View)
- ⬜ 👤 ___________ — Build the central incident list/card view
- ⬜ Fetch and display all incidents from `GET /api/incidents`
- ⬜ Show: severity badge, status chip, affected package, countdown to required-on-site date
- ⬜ Filter by: status, severity, equipment category
- ⬜ Sort by: urgency (days to deadline), severity, last updated
- ⬜ Click-through to incident detail view
- ⬜ Real-time updates via WebSocket (`WS /ws/incidents`)
- ⬜ **Unslop check:** cards carry real information density — no "Lorem ipsum", no grey boxes, severity colors are deliberate not default

### 4C — Incident Detail & Timeline View
- ⬜ 👤 ___________ — Build deep-dive incident page
- ⬜ Fetch incident detail from `GET /api/incidents/{id}`
- ⬜ Render chronological timeline of all events, delegations, findings, actions
- ⬜ Each timeline entry shows: timestamp, event type, summary, source link, confidence
- ⬜ Expandable detail for each entry (full evidence, raw data)
- ⬜ Current status and next expected action prominently displayed
- ⬜ Specialist delegation visualization (which agent did what, when)
- ⬜ **Unslop check:** timeline is readable at a glance — not a wall of JSON, not a generic list

### 4D — Schedule Impact Visualization
- ⬜ 👤 ___________ — Build schedule/Gantt component
- ⬜ Fetch schedule data from `GET /api/schedule/impact/{incident_id}`
- ⬜ Render Gantt chart or dependency graph (Recharts / D3.js / React Flow)
- ⬜ Highlight: affected activities (red), float consumed (yellow), critical path
- ⬜ Show before/after comparison when delay is introduced
- ⬜ Tooltip with activity details on hover
- ⬜ **Unslop check:** chart labels are legible, colors are purposeful, axis units are visible — not a default Recharts demo

### 4E — Compliance Matrix View
- ⬜ 👤 ___________ — Build requirement comparison table
- ⬜ Fetch compliance data from `GET /api/compliance/{package_id}`
- ⬜ Table: rows = requirements, columns = candidate products A/B/C
- ⬜ Color coding: ✅ PASS (green), ❌ FAIL (red), ❓ UNKNOWN (yellow), ➖ N/A (gray)
- ⬜ Mandatory requirements visually distinct from optional
- ⬜ Clickable evidence references for each finding
- ⬜ Confidence score displayed per finding
- ⬜ **Unslop check:** table is scannable — column widths sized to content, mandatory vs optional visually obvious, not a plain HTML table with borders

### 4F — Recovery Plan Comparison
- ⬜ 👤 ___________ — Build side-by-side recovery option view
- ⬜ Fetch options from `GET /api/recovery/{incident_id}/options`
- ⬜ Card per option: projected date, cost delta, risk level, required approvals, blockers
- ⬜ Visual comparison (bar chart or table)
- ⬜ Highlight recommended option with reasoning
- ⬜ **Unslop check:** recommended option is visually distinct without being garish, blocker reasons are human-readable not raw enum values

### 4G — Approval Queue
- ⬜ 👤 ___________ — Build human-in-the-loop approval interface
- ⬜ List pending approvals with full context
- ⬜ Show: what is being approved, exact configuration/revision, evidence summary, agent recommendation
- ⬜ Action buttons: Approve / Reject / Request More Info
- ⬜ POST decision to `POST /api/approvals/{id}/decide`
- ⬜ Confirmation and status update after action
- ⬜ **Unslop check:** approve/reject actions are clearly weighted (destructive action styled differently), context panel shows enough to make a real decision

### 4H — Agent Activity Log
- ⬜ 👤 ___________ — Build real-time agent action feed
- ⬜ Stream from `WS /ws/agent-activity` or `GET /api/agents/activity`
- ⬜ Chronological feed: event received → specialist called → finding returned → action taken
- ⬜ Each entry: timestamp, agent role, action type, summary, source/evidence link
- ⬜ Filter by: agent role, action type, incident
- ⬜ This satisfies Track 01 requirement: "Logs every action it takes and every specialist it calls"
- ⬜ **Unslop check:** log entries are legible at speed — role badges, action types, and summaries scan without reading every word

---

## Phase 5: Integration, MCP & End-to-End
> **Can be picked up by:** 1–2 people (ideally someone who worked on Phase 2 or 3) | **Depends on:** Phase 2 + 3 + 4 (at least partial) | **Est. effort:** 2–3 days
> **What this delivers:** MCP server, full pipeline wiring, end-to-end demo flow.

### 5A — MCP Server Implementation
- ⬜ 👤 ___________ — Expose backend as MCP server (required by hackathon)
- ⬜ Install and configure MCP SDK (TypeScript — `@modelcontextprotocol/sdk` in `apps/mcp`)
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
- ⬜ **[Keploy](https://github.com/keploy/keploy):** record all 7 MCP tool calls during E2E demo replay → regression suite in `apps/mcp/keploy/`

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
- ⬜ Script event injection from Phase 1D event sequence
- ⬜ Timed event replay (simulate days passing in seconds/minutes)
- ⬜ Frontend demo mode: guided walkthrough with annotations explaining each phase
- ⬜ Reset function to restart demo from scratch
- ⬜ All synthetic data clearly labeled as synthetic in the UI

### 5D — Docker Deployment
- ⬜ 👤 ___________ — Containerize everything for judges
- ⬜ Dockerfile for backend (Python + FastAPI + agents)
- ⬜ Dockerfile for frontend (Next.js / React build)
- ⬜ docker-compose.yml: backend + frontend + DB
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

```
Phase 1 (Data)  ──────────────────┐
                                   │
Phase 2 (Backend Core) ───────────┼──→ Phase 5 (Integration & MCP)
                                   │          │
Phase 3 (Agent Layer) ────────────┘          │
         ↑ depends on 2A, 2D                  │
                                              ↓
Phase 4 (Frontend) ───────────────────→ Phase 5 (Integration)
         ↑ can start with mock data           │
                                              ↓
Phase 6 (Deliverables) ←─────────────── Phase 5 complete
         ↑ pitch deck & README can start early
```

## Parallelism Guide

| Day | Person A (Backend) | Person B (Backend/Agents) | Person C (Frontend) | Person D (Data/Deliverables) |
| --- | --- | --- | --- | --- |
| 1–2 | Phase 2A, 2B (DB + Schedule Engine) | Phase 2C, 2D (Incident SM + Events) | Phase 4A, 4B (Setup + Dashboard) | Phase 1A, 1B (Schedule + Equipment data) |
| 3–4 | Phase 2E, 2F (Gateway + Compliance) | Phase 3A, 3B (Agent Framework + Operator) | Phase 4C, 4D (Detail + Gantt) | Phase 1C, 1D (Specs + Demo script) |
| 5–6 | Phase 3C, 3D (Investigation + Engineering agents) | Phase 3E, 3F (Sourcing + Recovery) | Phase 4E, 4F, 4G (Compliance + Recovery + Approvals) | Phase 6B (Pitch deck draft) |
| 7–8 | Phase 5A (MCP Server) | Phase 5B (E2E Wiring) | Phase 4H + 5C (Agent Log + Demo mode) | Phase 5D (Docker) |
| 9–10 | Bug fixes + testing | Bug fixes + testing | Polish + demo mode | Phase 6A, 6C, 6D (Video + README + Submit) |

---

> **Remember:** Track 03 says "a suite that covers as much of the procurement workflow as possible, without trading away depth." Each specialist must be **world-class at its job**, not a thin wrapper. The judges want something "a procurement manager would use tomorrow."

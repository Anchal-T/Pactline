# Pactline — Build Checklist

> **Product:** Procurement Continuity Operator — a suite of MCP-callable specialist agents plus a durable operator for construction procurement recovery
> **Primary Track:** Track 03 (Vertical Agents) | **Supporting:** Track 01 (durable execution, long-horizon work)
> **Submission Deadline:** Sunday, December 6, 2026, 23:45 IST
> **Equipment Niche (Prototype):** Chilled-water horizontal end-suction centrifugal pumps (commercial HVAC / data-center CHW plant), 400 V / 3 ph / 50 Hz
> **Last updated:** November 27, 2026 — re-planned after research ([docs/01](01_Research_Synthesis.md)); suite expanded from 3 to 9 specialists ([docs/03](03_Agent_Suite_Specification.md))

---

## How to use this checklist

Each phase is **self-contained enough for a separate person/pair to pick up**. Dependencies are marked. Start full dashboard views (4B–4H) after the deterministic kernel and all 12 required scenarios pass (Phase 3G), or scaffold against mocks first. The [runtime architecture](https://app.notion.com/p/42358d57c29881aab441d6b9870af6a2) and [AGENTS.md](../AGENTS.md) define the agreed stack and verification gate. Every item is tagged by tier:

- **[M] Must** — required for a credible Round 1 submission. Do these first.
- **[S] Should** — strong differentiators; start only when the Musts in your lane are green.
- **[X] Stretch** — only if time remains after Dec 4.

**Judging weights to keep in mind:** Accuracy 40% · Customer value 30% · Trust (sources, confidence, nothing made up) 20% · Build quality 10%. Judges will try **unseen inputs**.

**Acceptance test for backend work:** the hero scenario in [05 Reference Execution Trace](05_Reference_Execution_Trace.md). A milestone is done when the trace runs further than before.

**Legend:**
- ⬜ = Not started
- 🟡 = In progress, including scaffolds and drafts
- ✅ = Done
- 🔴 = Blocked (note blocker)
- 👤 = Assignee field — write your name

---

## Current reality (Nov 27)

| Area | State |
| --- | --- |
| Monorepo, pnpm, turbo, TS strict | ✅ |
| `packages/schedule-engine` (CPM, float, calendars, delay impact, tests) | ✅ |
| `apps/frontend` shell (4A) | ✅ |
| `packages/domain`, `db`, `equipment-module`, `execution-gateway`, `incident-runtime`, `agent-workers`, `eval-harness`, `apps/api`, `apps/mcp` | 🟡 scaffolds (5–76 lines each) |
| Fixtures: schedule activities, product configurations, submittals | 🟡 empty / placeholder |

---

## Phase 0: Shared Contract (do first — unblocks everyone)
> **Owner:** 1 person | **Depends on:** nothing | **Est.:** 0.5 day | **Spec:** [docs/03 §3](03_Agent_Suite_Specification.md)

- ✅ 👤 ___Abhishek________ **[M]** `packages/domain/src/contracts.ts`: Zod for `SpecialistResult<T>`, `SourceRef`, `Confidence`, `Finding`, `HumanHandoff`, `EntityRef`, `StatePin`, `Assertion` (+ `Locator`, `ModelUsage`). Cross-reference rules at schema level: unique `ref_id`s, every cited ref exists in `evidence`, `NEEDS_HUMAN` needs a handoff, no blocking handoff beside `OK`. Two additive extensions to docs/03: optional `SourceRef.expires_at` (quote validity) and `assertions[]` on the envelope (feeds the Conflict Detector, 2G).
- ✅ **[M]** Envelope validator `validateEnvelope` / `parseAndValidate` (`validator.ts`), rules enforced in code: 1 no source no claim (verdict → UNKNOWN, forced `NEEDS_HUMAN` with a `MISSING_EVIDENCE` handoff), 2 **no invention** (entity must resolve, identity cannot rest on derived values → reject, status `ERROR`), 3 **verbatim excerpt** (whitespace-normalised; ref dropped and tier capped at POSSIBLE; unloadable source fails closed), 4 confidence and severity independent, 5 `INSUFFICIENT_EVIDENCE` → `ABSTAINED`, verdicts and suggestions withdrawn, `presentable: false` plus a `missingEvidence` list, 6 **stale cap** (email 7 days default, quote `expires_at`, per-kind overrides; never raises a tier). Pure function, does not mutate its input.
- ✅ **[M]** `idempotencyKey({specialist, version, input})` = `sha256:` of `specialist@version` + canonical JSON (`canonicalJson`: sorted keys, NFC, rejects NaN/Date/function/bigint) and `createIdempotentRunner(cache)`: cached replay with empty `model_usage`, concurrent callers share one run, `ERROR` never cached, key/result mismatch refused, cache is clone-safe. Node-only, exported from `@pactline/domain/server` so the frontend bundle stays clean. `ResultCache` interface is ready for a Postgres-backed implementation in 2A.
- ✅ **[M]** MCP schemas generated from the same Zod: `specialistOutputSchema(resultSchema)` (JSON Schema for `outputSchema`), `toolInputSchema`, and `specialistEnvelopeShape` for SDKs that take a raw shape. Test asserts it is an object schema with every envelope field, real enums and `additionalProperties: false`.
- ✅ **[S]** Grounding validator `checkGrounding` / `groundedOrTemplate` (`grounding.ts`): identifiers, ISO dates, currency amounts, significant numbers (decimal, unit-bearing or 3+ digits) and vendor names in model prose must appear in the structured result, else the deterministic template is used and `provenance: "template"` is returned with the ungrounded tokens. `allow` list for standards such as ISO-9906.
- ✅ **Tests:** 62 passing in `packages/domain` (`pnpm --filter @pactline/domain test`); all workspace packages still typecheck.
- 🟡 **Known limits (carry into Phase 2/3):** the validator takes `sourceText` and `resolveEntity` as injected functions, so the real loaders (document store, catalog) land with 2A and 3B. Grounding is lexical: it cannot detect an invented vendor that is not in the supplied `vendors` list, and it flags legitimately derived numbers (a model-computed difference), so those should be computed in code and passed in the structured result.

---

## Phase 1: Data & Domain Foundation
> **Owner:** 1 person | **No dependencies** | **Est.:** 2 days | **Spec:** [docs/07](07_Canonical_Demo_Dataset.md)
> **What this delivers:** Sandbox project and procurement fixtures paired with authentic public mechanical specifications and manufacturer pump data.

### 1A — Project Schedule Data
- ✅ Create the synthetic baseline (`sched-rev-001`) with 12 activities and 12 finish-to-start dependencies. [Schedule fixture](../data/fixtures/project-schedule.json)
- ✅ Define activity types for design, procurement, fabrication, delivery, inspection, installation, and commissioning.
- ✅ Set workday durations, planned dates, and predecessor/successor relationships.
- ✅ Include a critical path through pump installation and 13 workdays of float for site preparation.
- ✅ Define the workweek, holiday exclusions, and the site-preparation start constraint.
- ⬜ **[M]** Align/expand to 14 activities + `sched-rev-003` if needed by docs/07 §2 and tune durations to match docs/05, then freeze
- ⬜ **[S]** PERT ranges per activity for Monte Carlo (defaults documented)

### 1B — Equipment & Procurement Data
- ✅ Create three sandbox packages for chilled-water pumps, anchor kits, and piping connection kits. [Procurement fixture](../data/fixtures/equipment-packages.json)
- ✅ Link each package to a schedule activity through a `MaterialNeed` with a quantity, required usable date, and readiness buffer.
- ✅ Add PO lines with fictional suppliers, quantities, release dates, and contractual arrivals.
- ✅ Add an active allocation for each material need within the linked PO line quantity.
- ✅ Add planned fabrication, test, dispatch, and delivery milestones.
- ✅ Record an initial vendor acknowledgment for each PO line.
- ⬜ **[S]** Vendor promise-vs-actual history (≥3 past deliveries per vendor) for S5 slip ratio

### 1C — Technical Specifications & Requirements & Authentic Product Data
- ✅ Create the 60 Hz technical reference dataset from the NPS CHWP-1 schedule and project specifications (`reqset-pump-r2`). [Pump reference fixture](../data/specs/pump-reference.json)
- ✅ Record typed duty-point, equipment, motor, and insulation criteria with applicability, evidence needs, and tolerance assumptions. Site NPSH, physical fit, materials, and pressure limits are recorded as open criteria.
- ✅ Digitize the Bell & Gossett e-1510 and Taco FI curves for the selected impellers, speeds, and water basis. Store sampled head, efficiency, and NPSHr with source locators and estimated reading error.
- ✅ Check that the fixture supports a head pass, a head failure, and an unknown motor finding.
- ✅ Retain the superseded 50 Hz values for context. [Historical draft](../data/specs/pump-spec.md)
- ⬜ **[M]** Add `reqset-pump-r3` revision for approval-invalidation scenario (scenario 6) + 2 held-out configs
- ⬜ **[M]** `data/SOURCES.md` provenance & licence log (URL, page, retrieval date, SHA-256)
- ⬜ **[M]** Verify ISO 9906 grade tolerance values and operating-region rule from the standard before encoding

### 1D — Demo Event Sequence & Documents
- ✅ Script events 01–11 with ordered replay paths and expected outcomes. [Demo fixtures](../data/fixtures/demo-events/README.md)
- ✅ Event 1 moves the forecast arrival to January 7 and the earliest installation start to January 11. [Delay event](../data/fixtures/demo-events/01-vendor-delay.json)
- ✅ Event 2 records one bounded follow-up and the later supplier-silence escalation.
- ✅ Event 3 records the head-pass, head-fail, missing-motor, and expired-offer inputs.
- ⬜ **[M]** Verify selected motor and site evidence before treating a candidate as fully compliant.
- ✅ Events 4–5 record the simulated human decisions with separate roles and matching approval pins.
- ✅ Events 6–7 replay receipt and inspection from a verified recovery seed. Event 8 uses the same seed in a separate replay before receipt or acceptance.
- ✅ Events 9–11 cover tainted vendor text, float absorption, and an out-of-order commitment.
- ⬜ **[M]** Injection fixtures: vendor email with hidden instruction + PDF with white-on-white text (~15 variants for eval)
- ⬜ **[S]** Synthetic nameplate photos (match + IE2/IE3 mismatch), SANDBOX watermark
- ⬜ **[S]** 3 quote PDFs with differing exclusions for S8

### 1E — Evaluation Datasets
- ⬜ 👤 ___________ **[M]** `data/eval/dev/` + `data/eval/heldout/` with hand-labelled `expected.json` (second-person review)
- ⬜ **[M]** Freeze held-out set on **Dec 3**; never referenced by prompts
- ⬜ **[S]** Synthetic lead-time promise/actual pairs (documented generator, labelled SYNTHETIC) for conformal calibration

---

## Phase 2: Deterministic Kernel
> **Owner:** 1–2 people | **Parallel with Phase 1** | **Est.:** 3 days

### 2A — World State Store (Neon Postgres + Drizzle)
- 🟡 👤 ___________ **[M]** Set up Neon PostgreSQL and Drizzle migrations (database client and migration configuration scaffolded). [Database package](../packages/db/package.json)
- ⬜ **[M]** Schema for plan-doc §15 entities **plus** `facts` (bi-temporal: `valid_from/valid_to/recorded_at/source_event_id`), `entity_links`, `plans`, `plan_steps`, `specialist_tasks`, `audit_events`, `calibration`, `prequal_scorecards`
- ⬜ **[M]** Append-only commitment history; versioned records
- ⬜ **[M]** DB constraints for invariants 1, 3, 5, 7, 8 (allocation sum, offer evidence/expiry NOT NULL, closure, baseline immutability, open-incident CHECK)
- ⬜ **[M]** Seed loader from Phase 1 fixtures
- ⬜ **[M]** Read projections and CRUD/query functions for API/UI

### 2B — Schedule Engine
- ✅ 👤 ___________ Deterministic CPM/float calculator — `packages/schedule-engine`
- ✅ Forward pass (early start / finish)
- ✅ Backward pass (late start / finish)
- ✅ Total float per activity
- ✅ Critical path
- ✅ Impact analysis (`analyzeDelay`): delayed activities, float consumed, critical path affected, projected dates, `NONE | FLOAT_ABSORBED | WARNING | CRITICAL`
- ✅ Working-day calendars, holidays, lags, milestones, SNET constraints
- ✅ Unit tests with known schedule → known results
- ⬜ **[M]** Monte Carlo layer: seeded RNG, 5–10k runs, P(meet need date), p50/p80 finish, criticality index
- ⬜ **[M]** Counterfactual API: re-run per recovery option → ΔP(on-time)
- ⬜ **[S]** Schedule-quality findings (open ends, cycles, missing logic)
- ⬜ **[S]** **Keploy:** record `POST /api/events/ingest` during demo replay → `apps/api/keploy/`

### 2C — Incident State Machine
- ✅ 👤 ___Abhishek________ **[M]** Implement incident lifecycle manager using the existing states, including `CLOSED` per [docs/04 §3](04_System_Workflows.md). [Domain entities](../packages/domain/src/entities.ts)
- ✅ **[M]** Define valid transitions with preconditions
- ✅ **[M]** Enforce invariants: require verified accepted quantity or valid waiver with schedule disposition before closure; no duplicate procurement allocation; reopen from `MITIGATED` on new evidence; owner + next action/blocker + review deadline on every open incident
- ✅ **[M]** Optimistic version checks; transition audit log
- ✅ **[M]** Unit tests for valid/invalid transitions

### 2D — Event Ingress & Normalization
- ✅ 👤 ___Abhishek________ **[M]** Align the event envelope and fixture IDs (UUIDs vs `evt-001` in delay fixture). [Event schema](../packages/domain/src/events.ts)
- ✅ **[M]** Wire `POST /api/events/ingest` to validate the envelope and call `IncidentRuntime.ingestEvent()`. [Event route](../apps/api/src/routes/events.ts)
- ✅ **[M]** Dedupe by `(source, source_event_id)`; out-of-order handling by `source_version`/effective date
- 🟡 **[M]** Propagation: record `VendorCommitmentChanged` in append-only history → PO line forecast → need → impact → incident trigger
- ✅ **[M]** **Taint marking** on untrusted fields; deterministic cross-checks promote to `verified`

### 2E — Policy & Execution Gateway
- ⬜ 👤 ___________ **[M]** Action classes `READ | DRAFT | EXTERNAL_WRITE | BINDING` and required approvals
- ⬜ **[M]** Approval pin + expiry re-check inside the enqueue transaction
- ⬜ **[M]** `action_receipts` outbox with deterministic idempotency key; `DISPATCHING` before execute
- ⬜ **[M]** `reconcile(idempotencyKey)` before retry; `UNCERTAIN → ESCALATED`
- ⬜ **[M]** **Taint policy:** no tainted argument to a side effect without human approval; recipient allow-list; rate limits
- ⬜ **[M]** `SandboxExternalAdapter` with fault injection (crash after write, timeout)

### 2F — Pump Compliance Evaluator (EquipmentModule)
- ⬜ 👤 ___________ **[M]** `CentrifugalPumpModule` behind `EquipmentModule` interface
- ⬜ **[M]** Monotone (PCHIP) interpolation within digitized range; **no extrapolation → UNKNOWN**
- ⬜ **[M]** Affinity laws for impeller trim / speed
- ⬜ **[M]** Checks: head at duty with ISO 9906 grade tolerance; efficiency at duty; operating region vs BEP; NPSH margin; motor non-overload to end of curve; electrical (V/ph/Hz/IE); flanges DN/PN; materials; fluid temperature
- ⬜ **[M]** PASS / FAIL / UNKNOWN / NOT_APPLICABLE with evidence refs per finding
- ⬜ **[M]** **Calibrated abstention:** |margin| < extraction error band → UNKNOWN
- ⬜ **[M]** Unit tests: known curves → known verdicts (A/B/C)
- ⬜ **[S]** Stub second module (AHU fan or chiller) to prove the seam
- ⬜ **[S]** **Keploy:** record `pactline_check_submittal` MCP calls → `apps/mcp/keploy/`

### 2G — Entity Resolver & Conflict Detector (new)
- ⬜ 👤 ___________ **[S]** Model-string canonicalisation (`mfr, series, suction×discharge×impeller`)
- ⬜ **[S]** Fellegi–Sunter-style match weights (pg_trgm blocking, Jaro-Winkler) with per-field contributions for the waterfall UI
- ⬜ **[S]** Conflict detector: join specialist `Assertion`s on `claim_key` → `DisagreementRaised` with both citations

---

## Phase 3: Specialist Agents & Operator (LLM + deterministic)
> **Owner:** 1–2 people | **Depends on:** Phase 0, 2A, 2D (skeletons can start now) | **Est.:** 4 days | **Spec:** [docs/03 §4](03_Agent_Suite_Specification.md)

### 3A — Agent Framework Setup
- 🟡 👤 ___________ **[M]** Stateless, read-only LangChain `ChatOpenAI` workers (`AgentWorkers`, `OperatorDecider`) via Cloudflare AI Gateway or OpenAI-compatible endpoint; role tiers `extraction | vision | operator`; Neon owns durable execution state. [Agent workers package](../packages/agent-workers/package.json) · [Environment example](../.env.example)
- ⬜ **[M]** Delegation contract (task_id, incident_id, role, objective, StatePin, evidence refs, budget, deadline, output schema)
- ⬜ **[M]** `tickTasks` with `FOR UPDATE SKIP LOCKED`; stale-pin results kept for audit, not executed
- ⬜ **[M]** Bounded delegation (max depth, parallelism, timeout → escalate)
- ⬜ **[M]** `model_usage` capture (model, tokens, cost, ms) on every call
- ⬜ **[M]** Quarantined extraction helper (narrow schema, spotlighting/datamarking of untrusted text)

### 3B — Document Pipeline (new; feeds S3, S4, S8, S9)
- ⬜ 👤 ___________ **[M]** Layout parse with page + bbox (Docling or Marker sidecar), cached by content hash
- ⬜ **[M]** Spec compiler: CSI-structured spec → typed `Requirement[]` with verbatim quotes; human approves the rule set once
- ⬜ **[M]** Submittal value extraction ×2 with disagreement → `CONFLICTING_SOURCES`
- ⬜ **[S]** Vision curve digitizer: axis calibration + polyline ×3–5, median, PCHIP fit, RMS vs ground truth
- ⬜ **[S]** `pactline_ingest_document` as a long-running MCP task

### 3C — Specialists (each = MCP tool returning `SpecialistResult`)
- ⬜ 👤 ___________ **[M] S1 Delivery Risk** — CPM + Monte Carlo, P(on-time), criticality index
- ⬜ 👤 ___________ **[M] S2 Investigation** — bi-temporal fact diff, freshness, labelled hypotheses, missing evidence, next questions, vendor slip ratio
- ⬜ 👤 ___________ **[M] S3 Spec & Submittal Compliance** — dual citations, verdict recommendation, abstention (crown jewel)
- ⬜ 👤 ___________ **[M] S4 Product Discovery / Equivalents** — closed catalog only, affinity trim, every candidate re-checked by S3, fit score
- ⬜ 👤 ___________ **[M] S5 Lead-Time Forecast** — mixture prior from dated market reports, vendor slip adjustment, split-conformal intervals, STOCKED vs ETO regimes
- ⬜ 👤 ___________ **[M] S6 Recovery Planner** — hard constraints → counterfactual ΔP(on-time) → cost frontier; grounded drafts
- ⬜ 👤 ___________ **[S] S7 Vendor Pre-Qualification** — rule scorecard PASS/FLAG/FAIL/UNKNOWN; cached public-registry snapshots; entity-match gate
- ⬜ 👤 ___________ **[S] S9 Receiving Verification** — nameplate photo ×3 agreement vs PO + approved submittal → ACCEPT/HOLD/REJECT
- ⬜ 👤 ___________ **[S] S8 Quote Leveling** — pump-package exclusion taxonomy, plug values with basis, RFI drafts
- ⬜ **[X]** Vendor discovery (rep locators / directories, source-required)

### 3D — Procurement Operator (Track 01)
- ⬜ 👤 ___________ **[M]** Event → load incident + world snapshot → decide next step (structured output)
- ⬜ **[M]** Plan-as-data (`plans`, `plan_steps`), replan on new evidence with visible diff
- ⬜ **[M]** Parallel dispatch (S1 ‖ S2 ‖ S4) and result collection
- ⬜ **[M]** Approval request generation with exact pins
- ⬜ **[M]** Follow-up timers (vendor response, approval expiry, post-mitigation monitoring) with bounded retries → escalate
- ⬜ **[M]** Crash recovery: resume from DB state, zero duplicate actions
- ⬜ **[S]** Disagreement handling: conflict card + citation-only verifier call
- ⬜ **[S]** Generic job planner `pactline_run_job` over the tool registry (side-effect classes enforced by gateway)

### 3G — Pre-UI Verification
- 🟡 Implement the 12 required scenarios. The harness currently enumerates them. [Scenario scaffold](../packages/eval-harness/src/scenarios/index.ts)
- ⬜ Pass all 12 scenarios against an isolated Neon branch using `VirtualClock` and a fault-injecting `SandboxExternalAdapter`. [Verification targets](../AGENTS.md#6-verification-target-12-mandatory-scenarios)

---

## Phase 4: Frontend — Operator Dashboard
> **Owner:** 1–2 people | **Depends on:** API endpoints (mock data until Phase 3G passes) | **Est.:** 3–4 days
> **Gate:** Full 4B–4H views land after the deterministic kernel and all 12 required scenarios pass (Phase 3G).
> **What this delivers:** The visual dashboard for demo and human-in-the-loop interaction.
>
> **Design rule — [Unslop](https://github.com/heydamir/unslop):** every component passes an Unslop review before it is marked done. The dashboard must look like something a procurement manager would trust with real incident data. **Every animation must correspond to a real event in `audit_events`.**

### 4A — Project Setup & Layout
- ✅ 👤 ___Abhishek________ — Initialize frontend project (`apps/frontend`)
- ✅ Set up Next.js 15 App Router with React 19 and strict TypeScript
- ✅ Install shadcn/ui + Tailwind CSS — Tailwind v4 with a custom token set; shadcn components are owned source in `src/components/ui/` (button, dialog, tabs, navigation-menu, breadcrumb, select, input, label, checkbox), not the default theme
- ✅ Create app layout: sidebar navigation + main content area — `src/app/(app)/layout.tsx` wraps `AppShell`: fixed sidebar on desktop, slide-in drawer on mobile, sticky header with breadcrumbs and theme toggle, light and dark
- ✅ Define routes: Dashboard, Incident Detail, Schedule, Compliance, Approvals, Agent Log — `/dashboard`, `/incidents/[id]`, `/schedule`, `/compliance`, `/approvals`, `/agent-log`; route metadata lives in `src/lib/nav.ts`
- ✅ Set up API client (axios / fetch wrapper) pointing to backend — `src/lib/api.ts` (typed `api`, `apiGet`, `apiPost`, `ApiError`, timeout, optional Zod response validation); base URL from `NEXT_PUBLIC_API_URL` (default `http://localhost:3001`); `apps/api` now allows the web origin via CORS (`WEB_ORIGIN`); sidebar shows live `/health` status
- ✅ **Unslop check:** layout, typography, color palette, sidebar — own palette and type (Cormorant Garamond, Instrument Sans, IBM Plex Mono), no default shadcn theme, no emoji, no placeholder copy. Screens show an honest empty state naming the endpoint they will read, not invented records. Checked in light, dark and at 390px.
- 🟡 Note for 4B–4K: each screen body is currently the shared `Pending` state from `src/components/app/screen.tsx`; replace it with the real view as each section is built (full 4B–4H views after Phase 3G passes).

### 4B — Incident Dashboard (Main View)
- ⬜ 👤 ___________ **[M]** `GET /api/incidents`: severity, status, package, countdown to need date, **P(on-time)**, confidence tier
- ⬜ **[M]** Filter by status, severity, equipment category; sort by urgency / severity / updated
- ⬜ **[M]** Real-time via `WS /ws/incidents`
- ⬜ **[S]** Containment counter ("1 of 3 packages at risk recovered") computed from state, not scripted
- ⬜ **[M]** **Unslop check**

### 4C — Incident Detail & Timeline
- ⬜ 👤 ___________ **[M]** `GET /api/incidents/{id}` timeline: events, delegations, findings, approvals, receipts
- ⬜ **[M]** Each entry: timestamp, type, summary, source link, confidence tier + reason
- ⬜ **[M]** Plan steps with version diff on replan
- ⬜ **[S]** Disagreement card (two citations side by side)
- ⬜ **[S]** "What did we believe on <date>?" time slider over bi-temporal facts
- ⬜ **[M]** **Unslop check**

### 4D — Schedule Impact & Risk
- ⬜ 👤 ___________ **[M]** `GET /api/schedule/impact/{incident_id}`: Gantt with affected (red), float consumed (amber), critical path
- ⬜ **[M]** Before/after comparison
- ⬜ **[S]** Probability fan chart / P(on-time) per recovery option
- ⬜ **[M]** **Unslop check**

### 4E — Compliance Matrix & Evidence Viewer
- ⬜ 👤 ___________ **[M]** `GET /api/compliance/{package_id}`: rows = requirements, columns = candidates
- ⬜ **[M]** PASS / FAIL / UNKNOWN / N/A, mandatory vs optional visually distinct, confidence per cell
- ⬜ **[M]** **Evidence viewer:** click a cell → PDF page with highlighted bbox for spec clause *and* submittal value
- ⬜ **[S]** Curve overlay: digitized H-Q with uncertainty band and duty point
- ⬜ **[M]** **Unslop check**

### 4F — Recovery Plan Comparison
- ⬜ 👤 ___________ **[M]** `GET /api/recovery/{incident_id}/options`: card per option (usable date p50, P(on-time), ₹ delta, approvals, blockers)
- ⬜ **[M]** Frontier chart (P(on-time) vs cost); recommended option with reasons; eliminated options with human-readable reasons
- ⬜ **[M]** **Unslop check**

### 4G — Approval Queue
- ⬜ 👤 ___________ **[M]** Pending approvals with pinned revisions, evidence summary, recommendation
- ⬜ **[M]** Approve / Reject (reason required) / Request info → `POST /api/approvals/{id}/decide`
- ⬜ **[M]** Show invalidated approvals and why (scenario 6)
- ⬜ **[M]** **Unslop check**

### 4H — Agent Activity Log
- ⬜ 👤 ___________ **[M]** `WS /ws/agent-activity` / `GET /api/agents/activity`: every event, specialist call, tool call, action
- ⬜ **[M]** Role badges, action types, model + cost + latency per specialist call
- ⬜ **[M]** Filter by role, action, incident (satisfies Track 01 "log every action and specialist")
- ⬜ **[M]** **Unslop check**

### 4I — Vendor Commitment Tracker (from plan doc §17)
- ⬜ 👤 ___________ **[S]** Promised vs revised vs actual per PO line; silence and staleness markers; slip ratio

### 4J — Evaluation Scorecard Page (new)
- ⬜ 👤 ___________ **[S]** Render `eval/out/scorecard.md` + calibration and selective-accuracy plots

### 4K — Receiving Check (new)
- ⬜ 👤 ___________ **[X]** Upload nameplate photo → S9 result card (mobile-friendly)

---

## Phase 5: Integration, MCP & End-to-End
> **Owner:** 1–2 people | **Depends on:** Phases 2–4 (partial) | **Est.:** 2–3 days

### 5A — MCP Server
- 🟡 👤 ___________ **[M]** Configure `@modelcontextprotocol/sdk` in `apps/mcp` (stdio entry point exists, tool registration pending; add streamable HTTP). [MCP server](../apps/mcp/src/index.ts)
- ⬜ **[M]** Specialist tools: `pactline_assess_delivery_risk`, `pactline_investigate`, `pactline_check_submittal`, `pactline_find_equivalents`, `pactline_forecast_lead_time`, `pactline_plan_recovery` (+ `pactline_prequalify_vendor`, `pactline_level_quotes`, `pactline_verify_receipt` when built)
- ⬜ **[M]** Operator tools: `pactline_get_incident`, `pactline_explain_decision`, `pactline_submit_approval`, `pactline_ingest_event`
- ⬜ **[M]** Every tool declares `outputSchema`, returns `structuredContent` + short text + `resource_link`s to evidence
- ⬜ **[M]** Tool annotations (`readOnlyHint`, `destructiveHint`); every call logged to `audit_events`
- ⬜ **[S]** Resources: `pactline://doc/{id}/page/{n}`, `pactline://incident/{id}/timeline`, `pactline://decision/{id}/audit`
- ⬜ **[S]** Long-running `pactline_ingest_document` as MCP task backed by DB rows; elicitation for approvals **if** Amber's client supports it, else `NEEDS_HUMAN` + polling
- ⬜ **[S]** `pactline_run_job` generic planner tool
- ⬜ **[M]** Test with an MCP client (Inspector / Claude Desktop) — "Amber-callable" proof for video
- ⬜ **[S]** **[Keploy](https://github.com/keploy/keploy):** record MCP calls during E2E replay → `apps/mcp/keploy/`

### 5B — End-to-End Pipeline Wiring
- ⬜ 👤 ___________ **[M]** Seed → ingress → world state → incident → operator → specialists → plan → approval → outbox → verification → closure
- ⬜ **[M]** Runs the full [docs/05 trace](05_Reference_Execution_Trace.md); outputs frozen into the doc
- ⬜ **[M]** Reopen on second delay; approval invalidation on offer/spec revision

### 5C — Demo Mode & Replay
- 🟡 👤 ___________ **[M]** The demo runner replays fixtures through `IncidentRuntime.ingestEvent()` in memory. Connect replay to the persistent runtime and drive the lifecycle with `VirtualClock`. [Replay script](../scripts/run-demo.ts)
- ⬜ **[M]** Reset to clean state; all synthetic data labelled in UI
- ⬜ **[S]** Guided annotations per phase; kill-worker button for the crash beat

### 5D — Packaging & Deployment
- ⬜ 👤 ___________ **[M]** `docker compose up`: Node 24 TypeScript backend + workers, Next.js frontend, Neon (`DATABASE_URL`) or local Postgres, MCP, doc-parser sidecar
- ⬜ **[M]** `.env.example` (gateway URL, API key, model IDs per role)
- ⬜ **[M]** `pactline check <spec> <submittal>` CLI for unseen inputs
- ⬜ **[X]** `--profile offline`: Ollama with Qwen3-class text + Qwen-VL-class vision, cached public-data snapshots; cloud-vs-local accuracy/latency table

---

## Phase 6: Evaluation (new — accuracy is 40% of the score)
> **Owner:** 1 person | **Depends on:** Phase 1E, 2, 3 | **Spec:** [docs/08](08_Evaluation_Plan.md)

- ⬜ 👤 ___________ **[M]** `packages/eval-harness`: 12 mandatory + 4 new scenarios asserting **state, not prose**
- ⬜ **[M]** `pnpm eval` → `eval/out/scorecard.md`: verdict accuracy, false-PASS count, citation validity, fabrication count, abstention P/R, interval coverage, duplicate writes after crash, unauthorized writes, cost & latency
- ⬜ **[M]** CI fabrication audit: every cited source exists and contains the cited excerpt/value
- ⬜ **[M]** Do-nothing baseline row beside our results
- ⬜ **[S]** Injection suite (~15 docs): attack success rate + benign utility
- ⬜ **[S]** Calibration plots: reliability diagram, selective-accuracy curve, interval coverage
- ⬜ **[S]** pass^5 on all scenarios
- ⬜ **[M]** Freeze and tag `v1-round1` scorecard on Dec 6

---

## Phase 7: Submission Deliverables
> **Owner:** 1–2 people | **Partially parallel** | **Spec:** [docs/06](06_Demo_Strategy.md)

### 7A — Demo Video (≤ 5 minutes)
- ⬜ 👤 ___________ Follow the beat sheet in docs/06 §3 (problem → Amber calls via MCP → break → proof → options → approval → kill-9 exactly-once → injection blocked → nameplate → reopen → scorecard)
- ⬜ Every on-screen animation backed by a real event; synthetic data labelled
- ⬜ Fallback capture of each beat recorded

### 7B — Pitch Deck (9 slides)
- ⬜ 👤 ___________ Problem · User & job · What Amber gets · Proof not prose · Honest numbers · Trust · Durability · Results · Fit & roadmap (docs/06 §5)
- ⬜ Only [DOC]-labelled stats from docs/01; no [UNV] figures

### 7C — Repository & README
- ⬜ 👤 ___________ Description; Track 03 primary + Track 01 supporting
- ⬜ Setup (clone → `docker compose up`); how to run the agent, the demo, `pnpm eval`, and the BYO-input CLI
- ⬜ MCP connection instructions (Amber / any MCP client)
- ⬜ Models used per role with **measured** cost and latency per run
- ⬜ Data sources (`data/SOURCES.md`) and how synthetic data was built
- ⬜ Team members and affiliations; LICENSE; `.env.example`

### 7D — DevPost Submission (by Dec 6, 23:45 IST)
- ⬜ 👤 ___________ Track and challenge, division (Student / Professional)
- ⬜ Repo link, video link, deck upload, team names + affiliations
- ⬜ Written description aligned with the deck

### 7E — Organizer Questions (send by Nov 29)
- ⬜ 👤 ___________ Which MCP revision/transport does Amber's client use; elicitation & tasks support?
- ⬜ Will judges run the repo locally or call a hosted MCP endpoint?
- ⬜ Confirm Track 03 entry with Track 01 durability as supporting is acceptable

---

## Phase Dependency Map

```mermaid
flowchart LR
  P0["Phase 0<br/>Shared contract"] --> P2["Phase 2<br/>Kernel"]
  P0 --> P3["Phase 3<br/>Specialists + Operator"]
  P1["Phase 1<br/>Data"] --> P2
  P1 --> P3
  P1 --> P6["Phase 6<br/>Evaluation"]
  P2 --> P3
  P3 --> P3G["3G Gate<br/>12 scenarios"]
  P3G --> P4["Phase 4<br/>Frontend"]
  P2 --> P5["Phase 5<br/>MCP + E2E"]
  P3 --> P5
  P4 --> P5
  P5 --> P6
  P6 --> P7["Phase 7<br/>Submission"]
  P5 --> P7
```

## 9-Day Plan (Nov 27 → Dec 6)

| Day | Person A (Kernel) | Person B (Agents) | Person C (Frontend) | Person D (Data / Eval / Deliverables) |
| --- | --- | --- | --- | --- |
| Nov 27–28 | Phase 0 contract; 2A schema + seed | 3A framework; 3B layout parse | 4B dashboard on mocks | 1A/1B fixtures (done); 1C/1D remaining; send 7E questions |
| Nov 29–30 | 2C incident SM; 2D ingress + taint | S1 (MC on CPM), S2 | 4C timeline; 4E matrix + evidence viewer | 1C revisions + `SOURCES.md`; 1D events + injection docs |
| Dec 1–2 | 2E gateway + outbox + reconcile; 2F pump evaluator | S3 compliance, S4 equivalents | 4D schedule; 4F recovery | 1E eval sets; Phase 6 harness skeleton |
| Dec 3 | 2B Monte Carlo counterfactuals; 2G conflict detector | S5 lead time, S6 recovery; 3D operator; **3G gate** | 4G approvals; 4H agent log | **Freeze held-out**; scenarios 1–12 |
| Dec 4 | 5A MCP server | S7 / S9 (should) | 5C demo mode | scorecard + plots; deck draft |
| Dec 5 | 5B E2E trace + bug fixes | bug fixes; grounding validator | Unslop polish; 4J scorecard | record video; README |
| Dec 6 | 5D compose + CLI; tag `v1-round1` | final eval run | final polish | **submit by 23:45 IST** |

---

> **Remember:** Track 03 wants "a suite that covers as much of the procurement workflow as possible, without trading away depth". A specialist ships only if it passes the depth bar in [docs/03 §5](03_Agent_Suite_Specification.md): works on unseen input, cites every field, abstains correctly at least once, has a hand-checkable deterministic core, and reports model cost and latency. Judges are 40% accuracy — **an honest UNKNOWN beats a confident wrong answer.**

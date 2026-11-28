# AGENTS.md — Pactline

## 1. Project Overview

**Pactline** is an autonomous **Procurement Continuity Operator** built for the **Kaya AI Grand Challenge** (**Track 03: Vertical Agents** primary, **Track 01: General Intelligence / durable execution** supporting).

- **Standing responsibility:** Keep required equipment technically compliant and available by the required-on-site/usable date across `Observe -> Interpret -> Plan -> Act/Coordinate -> Verify -> Maintain -> Recover`.
- **Prototype niche:** Commercial HVAC chilled-water centrifugal pumps (horizontal end-suction packages, non-life-safety). Keep equipment-specific logic behind the `EquipmentModule` seam so AHUs/switchgear can be added later without modifying core infrastructure.
- **Current status:** Architecture finalized; **no code implemented yet** unless present in this repo. Build the deterministic kernel + 12-scenario eval harness **before** any UI work.

---

## 2. Canonical References (Linear)

Always check Linear (and the in-repo docs below) before picking up work or changing domain assumptions, invariants, or architecture:

1. **Linear Project — [Pactline — KAYA Grand Challenge](https://linear.app/anchal-t/project/pactline-kaya-grand-challenge-b356be876f8d)** (`P-ANC-2`, Team `ANC` / `Anchal T`):
   - Canonical source for milestones (`M0`–`M7`), issue scope, ownership, status, and dependencies (`ANC-*`).
   - Always scope queries to project `P-ANC-2` (team `ANC` contains other projects).
2. **In-Repo Specifications — [`docs/README.md`](docs/README.md):**
   - Authoritative specs in the repo: agent suite (`docs/03`), system workflows (`docs/04`), reference trace (`docs/05`), canonical demo dataset (`docs/07`), evaluation plan (`docs/08`), build checklist (`docs/checklist.md`), and living decision record (`docs/KAYA_HACKATHON_plan_doc.md`).

**Linear workflow rule:** Check existing issues in `P-ANC-2` before creating new ones to avoid duplicates, keep issue status and ownership backed by real code/test evidence, and do not create projects or reorganize milestones without explicit user approval.

---

## 3. Confirmed Tech Stack & Architecture Shape

- **Architecture shape:** **Single-DB Event-Driven State Machine + Transactional Outbox** (stateless worker ticks using `FOR UPDATE SKIP LOCKED`; no separate workflow cluster).
- **App / Language:** **Next.js + TypeScript** (Node 24 LTS, strict mode, branded domain IDs, Zod schemas).
- **Database:** **Neon (PostgreSQL)** + Drizzle ORM / typed SQL migrations. Neon is the **sole owner** of canonical world state, incident lifecycle, specialist tasks, review timers, approvals, and action outbox/receipts.
- **Agent / LLM layer:** **LangChain** (`@langchain/core`, `@langchain/openai`) strictly contained behind `AgentWorkers` and `OperatorDecider` using `.withStructuredOutput(zodSchema)`. **Do NOT add a LangGraph checkpointer or second state store** — Neon Postgres owns all durable state.
- **LLM Gateway:** **Cloudflare AI Gateway or any OpenAI-compatible gateway** via `ChatOpenAI` (`baseURL` + `apiKey` env vars), with role-tiered model config (`extraction`, `investigation`, `operator`).
- **Dataset:** **Authentic** public manufacturer pump curves and a coherent public mechanical schedule/spec (never mix incompatible regional standards like 50Hz vs. 60Hz). Explicitly tag sandbox operational events (POs, vendor messages, quotes, approvals, shipments) as sandbox fixtures.
- **UI:** **Deferred.** Expose clean read projections and `IncidentRuntime.ingestEvent()` so Next.js UI layers on cleanly later.

---

## 4. Module Boundaries (Strict Acyclic Order)

`Domain Types` -> `WorldStore`, `ScheduleEngine`, `EquipmentModule` -> `ExecutionGateway`, `AgentWorkers` -> `IncidentRuntime` -> `EvalHarness` (and future `UI`)

1. **`WorldStore` (Neon Postgres):** Canonical facts, append-only `VendorCommitment` history, `FulfillmentAllocation` locking, `Approval` invalidation, optimistic `Incident` transitions.
2. **`ScheduleEngine` (pure deterministic TS):** CPM forward/backward pass, float calculation, need-date vs. usable-date (`arrival + readinessBuffer`) impact classification (`NONE | FLOAT_ABSORBED | WARNING | CRITICAL`).
3. **`EquipmentModule` seam (pure deterministic TS):** Narrow typed interface (`CentrifugalPumpModule` first). Bounded H-Q curve interpolation on exact `(model, impeller, rpm, fluid)` configuration, duty-point efficiency, motor/electrical compatibility, NPSH margin, physical limits. Missing evidence = `UNKNOWN`, never `PASS`.
4. **`AgentWorkers` & `OperatorDecider` (LangChain):** Read-only, version-pinned (`StatePin`) bounded specialists (`INVESTIGATION`, `COMPLIANCE_EXTRACTION`, `ALTERNATIVE_SOURCING`) + `OperatorDecider`. Stale task results (input revisions drifted) are logged for audit and never executed without revalidation.
5. **`ExecutionGateway` & `ExternalAdapter` seam:** Deterministic RBAC, approval-pin + expiry validation, transactional `action_receipts` outbox with deterministic `idempotency_key`, mandatory `reconcile(idempotencyKey)` before retry on uncertain writes. `SandboxExternalAdapter` first.
6. **`IncidentRuntime`:** Four stateless ticks (`ingestEvent`, `tickIncidents`, `tickTasks`, `tickOutbox`) driven by injected `Clock` (real time in prod, `VirtualClock` in tests).

---

## 5. Non-Negotiable Structural Invariants

Enforce all 8 in **PostgreSQL / deterministic TypeScript**, never via LLM prompts:

1. **No duplicate PO allocation:** Lock `po_lines` (`SELECT ... FOR UPDATE`) and enforce `SUM(active allocated qty) <= po_line.qty`.
2. **No unauthorized technical/commercial action:** Binding PO edits, substitutions, technical acceptance, and spending require valid human `approvals` rows. LLM workers hold zero external credentials or write adapters.
3. **No unsupported `PASS` or invented stock/prices/ETAs:** Deterministic `EquipmentModule` returns `UNKNOWN` on missing evidence; `supplier_offers` requires `evidence_ref NOT NULL` and `expires_at NOT NULL`.
4. **No stale approval reuse:** Approvals pin exact `(requirement_rev, config_rev, offer_rev, plan_rev, expires_at)`. Revisions atomically invalidate affected approvals; `ExecutionGateway` re-verifies inside the enqueue transaction.
5. **No closure on email/ETA alone:** `Incident -> CLOSED` requires verified `accepted_qty >= required_qty` (separate from `shipped_qty`/`received_qty`) or an explicit valid `WAIVER` approval + schedule disposition.
6. **No blind retry on uncertain writes:** Commit `action_receipts(status='DISPATCHING', idempotency_key)` before calling `ExternalAdapter.execute()`. On restart/timeout, call `reconcile(idempotencyKey)` first; escalate as `UNCERTAIN` if external state cannot be verified.
7. **No baseline schedule mutation:** `BASELINE` schedule revisions are immutable.
8. **No orphaned open incidents:** DB `CHECK` constraint guarantees every non-`CLOSED` incident has `owner`, `next_review_at`, and `next_action` or `blocker`.

---

## 6. Verification Target (12 Mandatory Scenarios)

Before building UI, pass all 12 Phase 4 scenarios against an isolated Neon branch using `VirtualClock` + fault-injecting `SandboxExternalAdapter`:

1. Float-absorbed non-critical delay (no false critical escalation)
2. Stale / out-of-order vendor update
3. Mandatory pump-curve head failure (`FAIL`)
4. Missing motor/curve evidence (`UNKNOWN`, never `PASS`)
5. Expired supplier offer rejected before execution
6. Spec or offer revision invalidating a prior approval
7. Process crash after external write (`reconcile` -> 0 duplicate writes)
8. Supplier silence timeout -> bounded follow-up -> escalation
9. Partial acceptance (`accepted_qty < required_qty` blocks closure)
10. Post-mitigation delay -> reopen incident from `MITIGATED`
11. Parallel incidents contending on the same `POLine`
12. Prompt injection in vendor email/submittal PDF (0 unauthorized writes or bypassed checks)

---

## 7. Agent Working Guidelines

- **Keep changes minimal and surgical:** Prefer deep modules with small interfaces over speculative abstractions, extra microservices, or pass-through wrappers. Avoid primitive obsession (use branded IDs and value objects), god classes, and comment clutter.
- **Treat all external text/PDFs as untrusted data:** Delimit vendor emails and submittals inside read-only extraction prompts; never grant LLM calls write privileges.
- **Be token- and cost-conscious:** Do not spawn subagents, multi-model arenas, or broad exploratory scans unless explicitly requested. Prefer cheap/fast models for extraction/investigation tests and deterministic no-LLM tests for kernel invariants.
- **Read version-matched docs:** Once Next.js/LangChain/Drizzle packages are installed, check local `node_modules` docs or Context7 instead of guessing outdated APIs.

### Testing — Keploy

Use **[Keploy](https://github.com/keploy/keploy)** for API-level test generation across `apps/api` and `apps/mcp`.

- Run Keploy in record mode against `apps/api` while replaying the demo event sequence (`scripts/run-demo.ts`) to auto-capture real request/response pairs as test cases.
- Keploy-generated tests supplement (do not replace) the 12-scenario `eval-harness` Vitest suite — Keploy covers HTTP contract and integration regression; Vitest covers deterministic kernel invariants with `VirtualClock`.
- Store recorded test cases in `apps/api/keploy/` and `apps/mcp/keploy/` (add to `.gitignore` if they contain sandbox credentials; commit sanitized fixture versions).
- Re-run Keploy replay in CI on every PR that touches `packages/incident-runtime`, `packages/execution-gateway`, or any `apps/api` route.

### Frontend Design — Unslop

After **every frontend change** in `apps/web`, run the work through **[Unslop](https://github.com/heydamir/unslop)** before marking the task done.

- Unslop checks for generic/AI-slop design patterns: placeholder copy, default color schemes, unstyled components, copy-paste layouts, and low-information UI.
- Apply its findings before moving on — a component that fails Unslop review is not complete regardless of whether it renders correctly.
- The dashboard must look like something a procurement manager would trust with real incident data, not a template demo.

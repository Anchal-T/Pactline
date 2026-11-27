# 02 — Pactline Product Thesis

> **Role of this doc:** what Pactline is, for whom, what it promises, and what it deliberately does not do. Short on purpose — every later doc must be consistent with this one.
> **Status:** Proposed — November 27, 2026. Builds on plan doc §11–§16 (agreed direction: Track 03 primary, Track 01 supporting; pump niche).

---

## 1. The contract sentence

> **When a long-lead equipment order slips, Pactline proves which recovery options will actually work — technically, on the schedule, and with a trustworthy supplier — gets the right human to approve one, carries it out exactly once, and keeps watching until the equipment is accepted on site.**

Five-year line: *Pactline is how a project knows, within minutes of a slip, what it can still do about it — with proof.*

## 2. Who it is for

| Person | When they meet Pactline | What they need from it |
| --- | --- | --- |
| **MEP procurement manager / expediter** (primary, daily) | A vendor date moves; a follow-up is due; a quote expires | The incident queue, a ranked recovery memo, a draft RFQ/PO amendment awaiting approval |
| **Engineer of Record / MEP design lead** | A substitute or deviation needs technical disposition | A compliance matrix that cites the spec clause *and* the submittal page for each line, with UNKNOWNs called out |
| **Project manager / planner** | A slip threatens a milestone | Float consumed, P(on-time) before/after each option, which activities move |
| **Site receiving lead** | Equipment arrives | "Is this the pump we approved?" from a nameplate photo |
| **Amber** (machine caller) | Any of the above, via MCP | Structured, cited, confidence-scored JSON; a human handoff when unsure |

## 3. What Pactline maintains (the standing responsibility)

*Every equipment package that Pactline watches is either (a) forecast to be usable by its need date with stated probability, or (b) has an open incident with an owner, a next action and a review deadline.* That condition is checked on every event and every timer tick, not on request.

## 4. Why now, why us

- Data-center and mission-critical builds have made MEP lead times the critical path; cooling equipment is following power equipment into scarcity (see [01 §8](01_Research_Synthesis.md)).
- Tools today either **track dates** (ConstructivIQ, Amber's supply chain lane), **select pumps for one brand** (manufacturer selectors) or **review documents** (Procore agents). None closes the loop from slip → proved alternative → approved, idempotent action → verified acceptance.
- Our technical wedge: pump compliance is **physics with testable answers** (duty point, NPSH, motor non-overload), so we can be measurably right and honestly uncertain.

## 5. Design laws

1. **Proof before recommendation.** No substitute is shown as viable without a deterministic compliance result that cites both documents.
2. **Confidence and severity are separate axes**, each with a plain-language reason.
3. **UNKNOWN is an answer.** Missing evidence never becomes PASS; thin data widens ranges.
4. **The model reads; code judges; humans approve.** LLMs extract and draft; deterministic engines compute and authorize; binding actions need a pinned human approval.
5. **Exactly-once effects.** Every external action has an idempotency key and a receipt; uncertain outcomes are reconciled, never blindly retried.
6. **Closed means accepted.** Not "email received", not "shipped".
7. **Every specialist stands alone.** Amber can call any one of them without the operator.
8. **No chat-first UI.** The dashboard is an incident console; questions go through structured tools.

## 6. What Pactline does NOT do

- Does not grant technical approval or issue binding POs on its own authority.
- Does not invent vendors, products, model numbers, prices, stock or lead times; if it cannot cite it, it says UNKNOWN.
- Does not scrape private supplier portals or use confidential client data.
- Does not try to be a general ERP, scheduling tool, or document-management system — it reads from them and proposes into them.
- Does not decide safety-critical or life-safety equipment questions (prototype scope excludes fire pumps).
- Does not mix incompatible regional standards (50 Hz and 60 Hz requirement sets never share a revision).

## 7. Scope of the prototype (Round 1)

- **Equipment:** horizontal end-suction chilled-water pumps (commercial HVAC / data-center CHW plant), 400 V / 3 ph / 50 Hz.
- **Data:** one coherent synthetic project + authentic public manufacturer datasheets/curves; every operational record labelled SANDBOX.
- **Integrations:** sandbox adapters (vendor mailbox, PO system); MCP for Amber; REST/WS for the dashboard.
- **Extensibility proof:** `EquipmentModule` seam; a stub module for a second category (e.g. AHU fan or chiller) shows the core is not pump-hard-coded.

## 8. Success measures we will publish

From `pnpm eval` (see [08](08_Evaluation_Plan.md)): compliance verdict accuracy on held-out submittals, citation validity, fabrication count (target 0), abstention precision/recall, lead-time interval coverage, P(on-time) calibration, duplicate external writes after crash (target 0), injection attack success (target 0), cost and latency per specialist run.

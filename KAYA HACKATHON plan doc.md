# KAYA HACKATHON

[ Mixture of Track 3 & 1 - while having 3 as primary focus ]

![image.png](image.png)

## Idea to start building :

<aside>
💥

**autonomous procurement decision agent that watches -
[ construction project's schedule,
purchase orders,
vendor updates,
procurement documents ],**

**identifies procurement issues that can actually affect upcoming work, investigates cause, calls specialist agents when needed, and produces an actionable recovery plan**

                                                        **+**

**turns construction specifications into executable procurement requirements, automatically checks vendor submittals/product documents against those requirements, identifies exact compliance/deviations/missing evidence,**

**and**

**when a product fails or is unavailable, searches for alternatives and proves whether they satisfy the original requirements.**

</aside>

# Project direction — living conversation record

> **North star:** Build a narrow, domain-specific AI operator that takes responsibility for a real business function from start to finish, then continues monitoring, maintaining and improving the outcome. The system must do authorized work, not merely explain or report it.
> 

**Status (updated November 25, 2026):** Pactline — Phase 5 runtime architecture and technical stack agreed, as confirmed by the user. See [Pactline — Phase 5 Runtime & System Architecture](https://app.notion.com/p/Pactline-Phase-5-Runtime-System-Architecture-39c084f5e0fb82f2a0c901c146d9b65a?pvs=21) for the authoritative baseline. Track 03 primary with Track 01 capabilities. Next: implementation of the deterministic kernel and evaluation harness; UI deferred. Exact commercial niche/customer validation, authentic fixture selection and model IDs remain open. Earlier phase notes preserve historical proposals and are superseded by the agreed architecture where they conflict.

**Source:** ChatGPT strategy conversation on November 16, 21 and 23, 2026. This is a structured record of the discussion and decisions, not a verbatim transcript.

**Challenge:** [Kaya AI Grand Challenge](https://kaya-ai-grand-challenge.devpost.com/)

## 1. Decisions and standing principles

| Status | Decision / principle | Reason |
| --- | --- | --- |
| Agreed — Nov 16 | Build AI **workers/operators**, not only chat assistants. | The product must perform business tasks through real systems instead of stopping at suggestions. |
| Agreed — Nov 16 | Choose a **vertical** and then a **niche** before building. | A narrow domain permits reliable workflows, deeper knowledge, measurable results, and a credible entry point. |
| Agreed — Nov 16–23 | Own a **business responsibility** rather than a single task or feature. | Reading a file, finding a problem or creating a ticket does not finish the underlying job. |
| Agreed — Nov 21 | Develop the **domain and workflow model** before committing to prompts, agents or frameworks. | Real execution depends on entities, events, rules, exceptions, systems and authority boundaries. |
| Course correction — Nov 23 | Stop over-indexing on bids, procurement documents and report generation. | These are obvious, likely crowded patterns; the goal is differentiated operational work. Documents may be inputs, but should not define the product. |
| Agreed — Nov 23 | Look for jobs that involve **continuous monitoring, coordination, action, verification and recovery**. | The operator should cause and maintain an operational result. |
| Agreed — Nov 23 | Ownership includes the **aftercare and ongoing maintenance** of the result. | The agent should detect recurrence, reopen incidents, follow up and keep the responsibility managed. |
| Working submission approach — Nov 23 | Combine useful technical capabilities associated with multiple tracks, then **submit one coherent entry under one suitable track**. | The product should serve one outcome rather than look like separate stitched-together demos. Exact eligibility and track fit should be verified against official rules/organizers. |

**Interpretation of “owning”:** The agent is accountable for coordinating a defined process through completion and for continuing to watch the outcome. It is **not** granted unlimited authority. Experts and approved humans still make safety-critical, legally binding or high-risk decisions and perform physical work.

## 2. How our thinking evolved

### November 16 — From assistants to workers

- Initial claim: The next stage of agents is doing work people are paid to do, rather than providing advice.
- Target: a vertically integrated AI worker capable of planning, calling tools, communicating, taking permitted actions and validating completed work.
- Examples initially used: procurement and supplier coordination in construction.
- Key distinction: **features and isolated tasks** versus **owning a job with a clear done condition**.
- Suggested expansion strategy: start with one job; grow into the surrounding business function only after the first job works.

### November 21 — Niche domain foundation

- Separate **industry → vertical → niche → workflow → agent job**. Construction → data center construction → electrical procurement → switchgear procurement → bid clarification was an *illustrative* breakdown, not a chosen product.
- Select an actual owner/person/team whose responsibility is well-defined.
- Map entities, documents, events, decisions, exceptions, integrations, and governing rules.
- Look for **complex but repeatable** work: more than fixed automation, yet more structured and verifiable than open-ended expert judgment.
- Define a closed loop: trigger → interpret → check → act → monitor → verify.
- Validate with real operators and real examples, not only market-size claims or demo quality.

### November 23 — Move away from document-centric products

- User correction: Most teams may build bid/document/report agents; we should avoid relying on that familiar pattern.
- New search focus: neglected operational responsibilities that change **physical or operational state**.
- Shortlist discussed: equipment preservation, workface readiness, rental fleet operations. Also considered commissioning blocker resolution, material recovery/redistribution, and temporary utilities operations.
- Preference in the discussion: equipment preservation looked interesting as an *initial research candidate*, not a final decision.

### November 23 — Combine tracks and deepen responsibility

- Consider the capabilities together: durable execution (Track 01), physical or site context (Track 02), domain-specific expertise (Track 03).
- Choose the primary competition track based on the final product and its requirements; do not claim that all tracks are interchangeable.
- Stronger definition of ownership: **observe → investigate → coordinate/act → verify → maintain → detect recurrence → recover**.
- A successful agent remains responsible after a task closes and continues checking whether the result holds.

## 3. Current niche shortlist — unvalidated hypotheses

| Candidate | Narrow potential responsibility | What the agent would do | Main risk or open question |
| --- | --- | --- | --- |
| **Equipment preservation** | Protect high-value electrical equipment between delivery and installation. | Track approved condition thresholds, review readings and site evidence, open inspections, coordinate corrective action, confirm outcomes and continue monitoring. | Access to real condition data and manufacturer/site rules; evidence that customers would pay; safety boundaries. |
| **Workface readiness** | Keep a specific construction work zone ready for scheduled MEP crews. | Check prerequisite work, access, materials and equipment; resolve blockers through responsible teams; verify readiness before crew arrival; recheck as conditions change. | Many systems and stakeholders; readiness status may be subjective or incomplete. |
| **Rental fleet operations** | Keep rented lifts/access equipment available when needed and returned when not needed. | Monitor utilization, planned requirements, transfers and return dates; coordinate approved moves and pickups; verify returns and billing changes. | Data and vendor integration access; scope of permitted operational decisions. |
| Commissioning blocker resolution | Keep an equipment commissioning checklist moving toward verified completion. | Detect unresolved tests/dependencies, assign follow-ups, collect evidence and escalate stalled items. | High expertise and safety requirements. |
| Materials recovery/redistribution | Transfer surplus usable materials to projects with demand. | Detect unused stock, match demand, coordinate authorized transfers, confirm delivery and update inventories. | Inventory accuracy and transport coordination. |
| Temporary utilities coordination | Ensure temporary services are monitored and service incidents are handled. | Detect incidents, route safe inspections or escalation, monitor restoration evidence. | Safety-critical control should remain with qualified personnel. |

**Earlier example, deliberately deprioritized:** switchgear bid leveling and supplier clarification. It remains a useful example of domain modeling, but is **not** our selected direction.

## 4. What makes a niche worth pursuing

Evaluate candidates on:

1. **Pain intensity (25%)** — Does failure create meaningful cost, risk, delay or lost capacity?
2. **Workflow frequency (20%)** — Does the responsibility recur often enough to support an operator?
3. **Data and customer access (20%)** — Can we obtain real cases, feedback, and compatible integrations?
4. **Execution potential (15%)** — Can the agent take useful, safe actions without constant prompting?
5. **Economic value (10%)** — Can we measure the value of successfully managing the job?
6. **Differentiation (10%)** — Is it more defensible than existing automation and commodity document AI?

The weights were proposed as a research scorecard, **not measured results**. Strong scores do not replace direct evidence. Lack of customer/data access can disqualify an otherwise attractive idea.

Additional filters that emerged later:

- A maintained state exists (healthy, ready, available, compliant, on schedule).
- Real events change that state and require intervention.
- The agent can coordinate **action**, not just identify or describe issues.
- There are concrete verification and recurrence tests.
- A full failure → action → recovery loop can be demonstrated convincingly.
- An identifiable buyer owns the current cost, and an identifiable worker/team owns the current process.

**Economic framing:** Cases per year × hours per case × fully loaded hourly cost gives an initial labor baseline. Add justified costs of failures and delays only when supported by pilot evidence. Measure value in business outcomes rather than number of model calls.

## 5. What operational ownership requires

### Control loop

1. **Observe:** Read events, telemetry, images, schedules, messages or system state.
2. **Interpret:** Match evidence to the correct asset, job, location, team and domain rules.
3. **Plan:** Decide the next permitted steps and identify missing information.
4. **Act/coordinate:** Update real systems, request inspections, dispatch follow-ups, schedule approved work, or escalate.
5. **Verify:** Check objective evidence that the action occurred and the intended condition was restored.
6. **Maintain:** Continue regular checks after apparent completion.
7. **Recover:** On drift, failure, new information or restart, resume safely with full history and reopen the work if required.

### Runtime requirements to explore

- Persistent work state and asset/job history, not merely chat logs.
- Event-driven triggers plus scheduled checks for ongoing obligations.
- Durable execution and crash recovery.
- Idempotency and action receipts to prevent repeated messages, orders or other effects.
- Integrations into the customer's actual operational software and communication channels.
- Structured domain data for assets, events, requirements, incidents, decisions, approvals and evidence.
- Human approval boundaries and role permissions.
- Monitoring, escalation, audit trail and measurable service outcomes.
- Deterministic policy checks alongside model reasoning; uncertainty must be recorded rather than hidden.

**Operating rule:** A ticket being created is not proof that a job was completed. A claimed fix is not proof that it still works.

## 6. Two illustrative operator missions

### Equipment preservation mission — example, not product selection

**Standing responsibility:** Keep a designated class of electrical equipment within its manufacturer- and site-approved storage requirements until installation or handover.

- Input examples: environmental readings, asset metadata, equipment manuals, storage location, photos, installation plans.
- Incident example: a reading exceeds a configured limit or protective covering appears damaged.
- Agent work: investigate asset history → request appropriate inspection/corrective task → track response → request fresh evidence → verify against permitted criteria → continue monitoring.
- Human boundary: qualified site personnel determine and perform technical or safety-critical intervention.
- Outcome to measure: unresolved exposure time, inspection response time, missed checks, repeat events and verified preservation compliance.

### Rental access equipment mission — example, not product selection

**Standing responsibility:** Make sure appropriate rented lifts are available to the authorized teams when scheduled and returned when no longer required.

- Agent work: forecast upcoming use from available schedules → detect idle rentals and conflicting needs → propose options → obtain approvals → coordinate approved transfers or returns → confirm vendor records and billing.
- Outcome to measure: unnecessary rental days, failed availability commitments, transfer response time and verified returns.

Neither mission should be treated as validated until real customers and data support it.

## 7. Kaya challenge and submission assumptions

- **Track 01 — General Intelligence:** Long-horizon, reliable execution; better fit if we build an agent able to handle substantially different jobs, not only a single preset workflow.
- **Track 02 — Contextual Intelligence:** Physical/site awareness; a plausible primary fit for an equipment-state or workface-readiness operator.
- **Track 03 — Vertical Agents:** Procurement-related specialists; specialist methods may inspire our architecture, but this track's scope must be checked carefully if our product is not procurement-focused.
- **Working assumption:** Capabilities can be combined within one product while **one primary submission** is selected. The project still must satisfy the chosen track's current requirements. Recheck official instructions or ask organizers before treating this as settled eligibility.
- Demo principle: show an end-to-end **realistic job** with unexpected events, tool calls, approval checkpoints, evidence, persistence, and recovery. Simulated site readings/conditions must be clearly labeled as simulations.

## 8. Open questions — not yet decided

- [ ]  Which **one niche and asset/workflow** do we select?
- [ ]  Who is the buyer, daily operator, approver and affected team?
- [ ]  Which ongoing condition or service-level objective are we promising to maintain?
- [ ]  What is the exact trigger, permitted action list, done condition and follow-up schedule?
- [ ]  What data/systems/partners can we realistically access?
- [ ]  How do existing products solve the same job? What specific gap remains?
- [ ]  Which operations can safely be autonomous and which require human sign-off?
- [ ]  What real-case evidence supports frequency, economics and willingness to pay?
- [ ]  Which Kaya track fits best after checking its current judging requirements?
- [ ]  What is the smallest convincing demo of a complete incident and sustained recovery?

## 9. Next research approach — proposed, not committed

1. Compare the three primary candidates against the niche selection filters.
2. Interview people who actually perform or supervise each job; walk through recent real incidents.
3. Collect permissioned, redacted examples of actual events, evidence, tasks and communications.
4. Write one-page **Niche Foundation Briefs** specifying buyer, job owner, trigger, inputs, systems, actions, approvals, success metrics, economics and unknowns.
5. Check competition and integration feasibility before building a full product.
6. Prototype one closed loop; test abnormal cases, interruptions, duplicate-action prevention, delayed responses and post-fix recurrence.
7. Select the product and track only after comparing evidence and demo feasibility.

## 10. Maintenance convention for this page

This page is the **current source of truth for our Kaya project discussion**. On future updates in this chat or when asked again, retain prior decisions and rationale, add dates to major changes, mark superseded proposals clearly, and distinguish **agreed**, **proposed**, **being tested** and **rejected**.

Do not silently convert an interesting idea into a final decision. Do not add new databases, reorganize the workspace, change sharing, or schedule work without explicit approval.

**Initial record:** November 23, 2026 — captured the initial strategy conversation and current open questions.

## 11. November 25 — Proposed procurement continuity operator

**Status:** Active product direction for evaluation; not a finalized niche or approved architecture. The user added the starting idea and stated Track 03 as primary with Track 01 capabilities at the top of this page. Preserve that original wording.

**User proposal:** Watch construction schedules, purchase orders, vendor updates and procurement documents; identify issues with actual upcoming work impact; investigate and delegate to specialists; create recovery plans; translate specifications into executable requirements; check submittals for compliance, deviations and missing evidence; find alternatives and test them against the original requirements.

**Assessment / proposed refinement:** Frame the product as a procurement continuity operator, not just a decision agent. Standing responsibility: coordinate the availability of compliant equipment/materials by the required-on-site date. A recovery plan is an intermediate output; the operator should coordinate authorized execution, verify actual results and maintain the recovered state. No autonomous technical approval or binding purchase commitments without appropriate authority.

### Candidate specialist responsibilities (proposed)

- Schedule impact: link PO/material dependencies to activities, calculate need-by dates, float and downstream impact.
- Investigation: reconcile inconsistent sources, find root cause and ask for missing facts.
- Requirements and compliance: extract versioned, source-linked requirements with units, conditions, mandatory/optional status and evidence; distinguish pass, fail and unknown. Technical approval stays with qualified personnel.
- Alternative sourcing: find candidate products and suppliers, verify availability and lead time, test the candidates against unchanged requirements, surface approval needs.
- Recovery planning: compare expediting, alternatives, split deliveries, approved resequencing and other options by schedule impact, cost, evidence and risk.
- Execution and maintenance: send approved requests, track responses, route approvals, record receipts, update permitted records, verify delivery/acceptance and reopen on renewed failure.

The exact number and separation of agents are not decided. Use deterministic computation for schedule impact and structured constraint checks where possible. The main operator owns incident state and delegates specialist work as needed.

### Core technical foundation (proposed)

A persistent procurement world model linking activity/dependency, required-on-site date, item, PO, vendor commitments, versioned specifications/requirements, candidate products, evidence, approvals and recovery incidents. Re-evaluate affected items on new events; keep source provenance and distinguish reported ETA from confirmed commitments. Use durable workflows, idempotent writes and bounded authority.

### Differentiation and evidence

Existing products and earlier hackathon projects overlap with individual capabilities. Differentiation is a hypothesis, not a confirmed market gap: **closed-loop procurement recovery with evidence-backed product substitution**, including execution, verification and post-recovery monitoring.

- [Procore Procurement Log Creator](https://www.procore.com/ai/agents/procurement-log-creator) — extracts procurement information and long-lead items.
- [ConstructivIQ](https://constructiviq.com/faq/) — links submittals, materials and schedules.
- [The AI Expediter](https://devpost.com/software/the-ai-expediter) — earlier Kaya project that tracks orders and follows up with vendors.
- [Plexus](https://devpost.com/software/procurement-idea) — earlier Kaya project with specialist monitoring, investigation and risk analysis.
- [Kaya Grand Challenge](https://kaya-ai-grand-challenge.devpost.com/) — Track 03 calls for a connected suite of deep procurement specialists; durable execution is an appropriate supporting capability. Exact compliance with submission rules still needs confirmation.

### Suggested first demo — not selected

Limit to one long-lead equipment category (e.g. commercial HVAC air handling units or electrical equipment) and a project with explicit schedule dependencies. Vendor announces a delay; distinguish critical from harmless delay; investigate; compare recovery alternatives; reject a product with a mandatory deviation and flag another with missing evidence; obtain authorized acceptance of a viable substitute; track the order and verify receipt/acceptance; inject a new delay and reopen the incident. All simulated data and approvals must be labeled. Measure missed critical incidents, false alerts, requirement/evidence correctness, recovery feasibility and time-to-resolution. No fabricated pilot results.

**Open:** exact equipment category, accessible datasets and integration targets, what action authority is available, specialist depth, and competitor differentiation. The proposal is active; do not mark the suggested name, niche or architecture as approved until the user confirms.

**Latest recorded update:** November 25, 2026 — added the user's procurement proposal and evaluation, including proposed continuity framing and differentiation research.

## 12. Vertical viability assessment — November 25, 2026

**Assessment, not a new user-approved decision:** Construction procurement is an attractive vertical because the cost of failure is significant, the work recurs, the environment changes independently of the agent, and schedule/material/technical dependencies provide testable outcomes. The preferred entry wedge remains procurement exception recovery for one long-lead MEP equipment category, with compliance and sourcing as supporting specialists. Data center or commercial MEP contractors are candidate customers, not validated buyers.

**Market evidence:** [DPR Q4 2026 market report](https://www.dpr.com/view/q4-2026-market-conditions-report) reports internal lead-time estimates of 37 weeks for switchgear/switchboards, 56 weeks for generators, and 66–132 weeks for some medium-voltage equipment. [Linesight June 2026 Americas supply-chain analysis](https://insights.linesight.com/cmi-2026-june/industry-trends-and-supply-chain-dynamics-2026-americas/supply-chain) estimates long-lead equipment represents roughly 35–40% of total capital expenditure in mission-critical/high-tech industrial projects. These are contextual industry estimates, not our customer metrics.

**Competitive warning:** [ConstructivIQ](https://constructiviq.com/faq/) already links schedules, submittals and material workflows and flags procurement risk; [Procore Procurement Log Creator](https://www.procore.com/ai/agents/procurement-log-creator) already extracts procurement requirements. Do not claim that schedule monitoring or document checks alone are a market gap. Differentiate by coordinating and verifying recovery actions, including evidence-backed alternatives, rather than issuing recommendations only. This differentiation still needs competitive and customer validation.

**Constraints:** Project data quality and integration access, trusted vendor availability, technical approval and commercial authority, and the cost of adoption are key barriers. Start with one equipment category and one incident type; evaluate actual schedule impact, recovery feasibility and evidence completeness. Not every delay can be resolved or every substitute approved; escalate honestly.

**Decision status:** No new binding decision made. The exact niche, buyer, architecture and commercial viability remain open.

## 13. Phase 1 — Domain discovery: procurement expediting (November 25, 2026)

**Research status:** Public-source desk research; no direct interviews, private project records, or customer validation yet. The user asked to research the actual human job. No new final product decision has been made.

### Human role and organizational boundary

The closest existing role to the proposed operator is the **procurement expediter**, particularly for post-award long-lead equipment in EPC (engineering, procurement and construction) and mission-critical projects. A procurement manager also handles budgets, sourcing strategy, contracts and approvals, which should not be automatically delegated to the agent.

Evidence:

- [Bechtel Expediting Specialist](https://jobs.bechtel.com/us/en/job/BCFBCKUS300895EXTERNALENUS/Expediting-Specialist): supplier contact, interpretation of production progress, critical-item reports, early warnings, quality coordination, missing material tracing.
- [CorePhase Procurement Expeditor](https://ats.rippling.com/corephase/jobs/23d60799-28ad-4c96-b11c-3a44a17983d0): PO-to-delivery expediting, fabrication progress and schedule risks.
- [Turner & Townsend Site Procurement Manager](https://jobs.smartrecruiters.com/TurnerTownsend/744000139126599-site-procurement-manager-data-center-construction-projects): equipment manufacturing, logistics, delivery, supplier performance and commercial risks.
- [Gray Procurement Manager — Data Center](https://grayconstruction-gray.icims.com/jobs/4192/procurement-manager/job?in_iframe=1): risk, supplier performance, logistics, change management.
- [QTS Construction Services Procurement Manager](https://qtsdatacenters.wd5.myworkdayjobs.com/en-US/QTS/job/Construction-Services-Procurement-Manager_R2026-2150): planning, sourcing, budgets, supplier management.
- [Bechtel Deputy Project Procurement Manager](https://jobs.bechtel.com/us/en/job/BCFBCKUS301309EXTERNALENUS/Deputy-Project-Procurement-Manager): wider purchasing, expediting, quality and logistics responsibilities.

Representative daily workflow (synthesis, not observed): review latest schedule and open POs; reconcile supplier commitments and fabrication milestones; identify missing/stale updates; prioritize by downstream impact; investigate causes; obtain corrective commitments; coordinate technical/commercial approvals and inspections; update authorized records; follow up until verified recovery or escalation.

Human interfaces: procurement manager (commercial authority), buyer (POs), planner/project controls (schedule), engineer/design authority (technical acceptance), vendor (production), quality inspector (test and acceptance evidence), logistics (shipping), site receiving team (receipt and usability). Exact authority varies by contract.

### Operational state and evidence

Track package and PO line, required-on-site/usable date, baseline and current schedule, material-to-activity dependencies, supplier acknowledged and forecast dates, milestone plan versus actual, last update and evidence source, current specification/submittal revision, inspection and shipment status, quantities ordered/received/accepted, next action, owner, deadline, escalation and approval status.

Normal sequence: required item → requisition and sourcing → submittal/review and approval → PO/release → fabrication → inspection/testing → dispatch → receipt/acceptance → installation. Some phases overlap or change order by contract. Back-plan from site need date. Distinguish contractual date, current forecast, actual arrival and acceptance. Use deterministic CPM/float computations and re-evaluate downstream activities rather than assuming every late PO delays project finish.

Sources: [Procore submittal schedule calculations](https://support.procore.com/products/online/user-guide/project-level/submittals/best-practices-submittals/best-practices-submittal-project-configurations); [Oracle P6 float](https://docs.oracle.com/cd/F74773_01/p6help/en/46930.htm); [Procore Materials](https://support.procore.com/products/online/materials-user-guide-with-project-financials); [SAP supplier confirmations](https://help.sap.com/docs/SAP_ERP_SPV/00b86df2555f4c83b47b97a5c1223904/7b8dbf53f106b44ce10000000a1553f6.html); [SAP supplier delivery](https://help.sap.com/docs/SAP_BUSINESS_BYDESIGN/2754875d2d2a403f95e58a41a9c7d6de/2cef6713722d1014886ecebb538c5e5f.html).

### Real research case: procurement recovery can fail

Micheli and Cagno (2016), [The role of procurement in performance deviation recovery in large EPC projects](https://journals.sagepub.com/doi/10.1177/1847979016675302), studied three EPC companies and project cases. In the $500m chemical plant case, the original supplier had production time and quality problems. Reassignment to a replacement supplier failed when that supplier went bankrupt; additional inspection/expediting helped, and later division across three suppliers partially recovered time at extra cost. Implication: assess switching costs, qualification, real capacity, approval and delivery risk; do not treat a catalog match as a viable replacement. Recovery actions may trade time against cost and must not violate mandatory quality requirements.

### Exception catalogue (proposed evaluation foundation)

| Exception | Investigate / act | Resolution evidence |
| --- | --- | --- |
| Late manufacturing milestone | Compare actual and plan; find bottleneck; request dated recovery commitments and progress evidence | Verified milestone achieved; remaining forecast feasible |
| Vendor silence or inconsistent ETA | Reconcile sources; contact authorized supplier; escalate on timeout | Dated, attributable response or formally escalated unresolved case |
| Late technical review | Locate current reviewer, missing evidence and deadline; route reminders | Approved applicable revision or documented escalation |
| Technical nonconformance | Isolate mandatory deviation, request clarification or qualified substitute | Authorized technical disposition and matching evidence |
| Product unavailable | Source approved suppliers, verify stock/lead time and qualification, evaluate alternatives with original requirements | Approved viable option and confirmed commitment, then receipt/acceptance |
| Project schedule change | Recompute need dates/dependencies/float; adjust priority and request revised commitments | Updated authorized schedule linkage and credible procurement plan |
| Failed inspection or damaged delivery | Request quality disposition, coordinate rework/replacement and retest | Authorized inspection acceptance |
| Partial shipment | Reconcile quantities and activity needs; coordinate remainder | Required quantities received and accepted or approved partial scope |

### Tools and authority

Examples in existing operations: Primavera P6 (schedule and dependencies); Procore (submittals, commitments, materials); ERP such as SAP (POs, confirmations, receipts); email, spreadsheets and supplier reports (coordination and data). Do not claim these integrations are built. For a prototype, use a realistic schedule/PO dataset, supplier-message sandbox and a controlled procurement system. Preserve provenance and receipts. Agent may autonomously analyze, request information and perform explicitly authorized follow-up; technical deviations, binding PO changes, spending and baseline schedule changes require designated human authority. UFGS is one example of formal approval controls, not universal contract law: [WBDG UFGS 01 33 00 history](https://stg.wbdg.org/dod/ufgs/ufgs-01-33-00).

### Proposed scope

Start with post-award procurement exception management for one long-lead MEP equipment category, across detection → investigation → recovery option evaluation → approved coordination → verified receipt/acceptance → continued monitoring. Specialist roles should emerge from real exceptions, not an arbitrary number of agents. Compliance and sourcing support the expediter's mission; they are not disconnected products. An incident may be mitigated when a credible commitment is in place, but remains monitored; close only when applicable delivery and acceptance obligations are verified or formally handed over/waived by authorized people.

### Next validation step

Interview an expediter, planner and technical reviewer about their last real failure: detection signal, root cause, elapsed time, available options, approvals, systems used, evidence of closure, recurrence. Request redacted procurement logs, PO milestone reports, schedule exports, approved specifications and submittal decisions, vendor updates, and receipt/inspection records with permission. Compare AHU, pump and electrical equipment categories by accessible evidence, rules, sourcing feasibility and demo complexity. Final category and customer segment remain open.

## 14. Phase 2 — Equipment niche selection (November 25, 2026)

**Status:** Recommended prototype niche, not yet user-approved or commercially validated. Compare three options based on public desk research. Selection prioritizes demonstrating a complete recovery loop and technical reasoning, not maximum total addressable market.

**Recommendation:** Commercial HVAC chilled-water centrifugal pumps, starting with horizontal end-suction pump packages in non-life-safety applications. Customer hypothesis: mechanical/MEP contractors or procurement expediters delivering commercial HVAC installations. Operator mission: coordinate technically acceptable pump availability before the required-on-site/usable date; detect and manage post-award exceptions, validate alternative configurations, coordinate approvals and follow through to receipt and acceptance.

| Criterion (weight) | AHU | Pumps | Switchgear |
| --- | --- | --- | --- |
| Procurement pain (25%) | 5 | 3 | 5 |
| Technical evidence access (20%) | 3 | 5 | 3 |
| Alternative sourcing feasibility (20%) | 3 | 5 | 2 |
| Technical reasoning depth (15%) | 5 | 5 | 5 |
| Prototype feasibility (15%) | 3 | 5 | 2 |
| Manageable approval complexity (5%) | 3 | 4 | 1 |
| Weighted total /100 | 76 | 89 | 67 |

Scores are subjective hypotheses. Switchgear and custom AHUs have stronger published evidence of long lead times; pump-specific shortage frequency, real lead times and financial pain remain unverified. [DPR Q4 2026](https://www.dpr.com/view/q4-2026-market-conditions-report) estimates switchgear/switchboards around 37 weeks and certain medium-voltage equipment at 66–132 weeks. [SourceBlue Q2 2026](https://sourceblue.com/news-insights/q2-2026-cost-index-report) highlights custom AHUs and switchgear as risk categories. [Skanska Fall 2026](https://interactive.usa.skanska.com/fall-2026-construction-market-trends/supply-chain) reports HVAC lead times of 30–52 weeks depending on equipment type and manufacturer; not a pump-specific estimate.

### Why pumps

Pump selection requires coupled flow/head at a duty point, efficiency, motor non-overloading across the applicable operating range, NPSH margin, fluid compatibility, speed, electrical/VFD compatibility, materials, physical interfaces and evidence. Numeric or curve checks are testable, and uncertainty can be represented explicitly. Existing manufacturer selection tools mean basic pump sizing is not our innovation. Our innovation hypothesis is linking cross-vendor technical selection to schedule-critical incident management, authorization, and verified recovery.

Public technical sources (accessed for this research):

- [ASHRAE Handbook, Chapter 44 centrifugal pumps](https://handbook.ashrae.org/Handbooks/S24/SI/S24_Ch44/S24_Ch44_si.aspx) — curves, operating conditions and selection.
- [CPWD HVAC Specification 2024, chapter 8](https://www.cpwd.gov.in/Publication/HVAC_Specification_2024.pdf) — pump requirements and project-specific flow/head; public example from India, not universally applicable.
- [Grundfos Product Center / selection](https://www.grundfos.com/solutions/support/select-configure-tendering) — duty points, curves, selection and sizing.
- [Wilo Select](https://wilo.com/mx/en/Solutions-Finder/Selection-and-configuration/Wilo-Select/) — selection tool.
- [Xylem Bell & Gossett e-1510](https://www.xylem.com/en-us/products--services/pumps-packaged-pump-systems/pumps/end-suction-pumps/series-e-1510-base-mounted-end-suction-pumps/) — example product family.
- [Public project mechanical equipment schedules](https://gsiconstruct.com/wp-content/uploads/2025/08/451524-1-38-01_07_MECHANICAL_S-26S_.pdf) — example project-specific pump schedule, separate US context (do not mix its electrical requirements with Indian specifications).
- [Eurovent AHU selection](https://www.eurovent-certification.com/en/category/article/how-to-select-an-air-handling-unit?universe=air-quality-and-ventilation) — alternative category considerations.

PDF sources were available as extracted text; page screenshot retrieval failed. Obtain actual documents and verify diagrams, tables and curves before building the reference dataset. Public catalogs demonstrate technical data access, not confirmed live vendor stock, commercial quotes, APIs or permission to scrape.

### First prototype: one complete incident

Use explicitly synthetic project schedule, POs, supplier updates and approvals, paired with authentic public reference specifications/curves where available. Example: two chilled-water pumps in a commercial HVAC package; a supplier postpones shipment, threatening installation and subsequent commissioning. Operator calculates remaining schedule margin, investigates cause, asks whether original supplier can recover, finds candidates, validates at the correct operating point/configuration, flags missing evidence and rejects mandatory failures, checks quoted delivery/approval/logistics windows, compares recovery plans, requests technical and commercial approval, coordinates approved action in a sandbox, checks follow-up updates and verifies receipt/acceptance, then reopens if another delay occurs before handover.

Example technical tests (project-specific, not blanket standards): head at required flow (not independent maxima); efficiency at duty point; motor and supply compatibility; NPSH available vs required with engineer-defined margin; dimensions and connection fit; materials and pressure rating; applicable submittal evidence. No final approval by model; unknown remains unknown. Model extracts evidence and investigates; deterministic tools evaluate typed requirements and schedule changes.

### Minimum data and evaluation

Collect one coherent project specification and equipment schedule, actual manufacturer model/configuration-specific performance evidence from 2–3 manufacturers if available, and a gold-labelled test set. Keep incompatible market electrical frequencies, revisions and requirements separate. Synthetic fixtures for 3–5 orders and dependency activities, vendor milestone updates, RFQ replies, approval events, receiving/inspection events. Do not present synthetic stock, prices or quotes as live facts.

Evaluate critical vs noncritical delays, requirement pass/fail/unknown accuracy, source evidence correctness, feasible recovery options, approval enforcement, duplicate-action prevention, restart recovery and incident reopening. Before commercial commitment, interview an expediter and MEP engineer and verify whether actual pump procurement exceptions occur often enough and carry sufficient cost. If not, revisit custom AHUs or switchgear.

### Next phase

Build the domain model: project, activity/dependency, equipment requirement with revision, PO line, vendor commitment, milestone, product configuration, curve and evidence, compliance finding, incident, recovery option, approval, action receipt and acceptance. Define relationships, event schemas, authority and invariants before selecting frameworks. No architecture or schema change in Notion; this is a research record.

## 15. Phase 3 — Procurement world model (November 25, 2026)

**Status:** Proposed conceptual domain model for the recommended chilled-water centrifugal pump prototype. Not an approved physical database schema, architecture, or commercial niche. The model generalizes to other equipment via typed requirement/evaluation modules.

**Design goal:** Maintain current project facts and source evidence across time, rather than reconstruct the project from documents on each model call. The equipment package is the coordination anchor; an incident is the unit of durable recovery execution.

### Logical domains

Project planning (activities, dependencies, schedule revisions); procurement (packages, PO lines, supplier commitments, milestones and receipt); engineering (versioned requirements, exact product configurations, compliance findings and acceptance); sourcing (suppliers, offers and verified availability); incident management (risk, cause, recovery options and follow-up); governance/execution (approval, authorized action, receipts and evidence). These are logical boundaries, not a decision to deploy separate services or agents.

### Conceptual entities and relationships

| Entity | Core attributes / relations |
| --- | --- |
| Project / ScheduleRevision | project ID, timezone, calendars, version, effective date, baseline/current distinction |
| Activity / Dependency | activity ID, duration, planned/forecast/actual dates, predecessor/successor, relationship type, lag, calendar, constraints |
| EquipmentPackage | package ID, type, site, required quantity, requirement revision, current status |
| MaterialNeed | joins package to activity; required quantity, required usable date, readiness buffer; many activities can need one package and vice versa |
| PurchaseOrder / POLine | PO ID, line ID, supplier, exact configuration, quantity, commercial terms, original contractual date, authorized amendments |
| FulfillmentAllocation | joins PO lines or receipts to material needs; supports split supply, multiple POs and partial delivery without double-counting |
| VendorCommitment / Milestone | PO line, promised/forecast date, status, evidence, observation time, source, freshness; preserve history and distinguish estimates from commitments |
| RequirementSet / Requirement | source revision, applicability, typed predicate, units, conditions, acceptance tolerance, mandatory status, evidence needed |
| ProductConfiguration / Evidence | manufacturer/model/configuration, duty conditions, curve revision, source location, effective time, provenance; evidence applies to exact configuration rather than a product family alone |
| ComplianceFinding | requirement revision + candidate configuration + evidence references + evaluator version; PASS / FAIL / UNKNOWN / NOT_APPLICABLE, explanation and review status |
| SupplierOffer | configuration, quantity, supplier, cost/currency, quoted date, lead time, expiry, availability confirmation and evidence |
| Incident | affected package/needs, trigger, severity, cause hypotheses, status, owner, next action, due time, version; one incident may affect multiple activities |
| RecoveryPlan / RecoveryAction | options and dependencies, expected usable date, cost/risk, constraints, evidence, selection and authorization, completion test |
| Approval | designated human authority, exact subject/configuration/plan revision, scope, expiry, outcome; changes invalidate affected approvals |
| ActionReceipt | idempotency key, intent, authorization, external ID, request/result, attempt and observed state, confirmed or uncertain |
| Receipt / Inspection / Acceptance | actual quantities, serial/model identity, condition, evidence, authorized disposition; accepted quantities distinct from shipped or received quantities |

Relationships: Project 1:N schedule activities/packages; Activity N:M package through MaterialNeed; package N:M PO lines through allocation; PO line 1:N historical commitments/milestones/receipts; package has revisioned requirement sets; configuration N:M requirements via findings; incidents link affected packages, needs and evidence; incident 1:N recovery options/actions; approvals and receipts reference exact versions.

### State and evidence

Do not treat the latest text from an LLM as authoritative. Store original contract commitment, current forecast, actual events and accepted quantity separately. A vendor update is evidence of a claim, not proof of delivery. Preserve conflicting or stale facts and trigger clarification; use explicit source authority and revision rules. A derived schedule impact is reproducible from a specified schedule revision and facts. A product family brochure is not evidence for every exact motor/impeller configuration.

Example executable predicate (synthetic): head at flow 100 m³/h >= 35 m, for specified pump speed/impeller/fluid and project-defined acceptance tolerance. Evidence must include applicable curve and units. Evaluate with deterministic interpolation within validated range; no unsupported extrapolation. Other predicates include efficiency at duty point, electrical compatibility, dimensions and engineer-defined NPSH margin. PASS means evidence satisfies that specific predicate, not engineering approval. Missing or inconsistent evidence is UNKNOWN; mandatory FAIL blocks standard substitution; a deviation requires designated technical disposition.

### Events and propagation

Inputs: ScheduleRevised, VendorCommitmentChanged, MilestoneMissed, SupplierResponseReceived, RequirementSetRevised, SubmittalReceived, OfferReceived/Expired, ApprovalGranted/Rejected, ShipmentReceived, InspectionCompleted, FollowUpDue. Internal events: ImpactRecomputed, IncidentOpened/Updated, ComplianceEvaluated, PlanProposed, ActionAuthorized/Confirmed/Uncertain, IncidentMitigated/Reopened/Closed.

Event envelope (conceptual): event_id, type, project_id, subject_type/id, occurred_at, received_at, source, source_event_id, source_version, evidence_ref, payload, correlation_id. Deduplicate source events; handle out-of-order events with version/effective-date rules. Example: revised ETA -> PO line -> allocations/material needs -> schedule forecast -> risk classification -> open/update incident. Requirement revision invalidates affected findings, offers or approvals where applicable and triggers reevaluation. Avoid restarting unrelated packages.

### Incident lifecycle and invariants

DETECTED -> INVESTIGATING -> PLANNING -> AWAITING_APPROVAL (if necessary) -> EXECUTING -> MITIGATED/MONITORING -> VERIFYING -> CLOSED. Transitions are not strictly linear: replan or escalate on failed action, stale evidence, expired approval or new delay. ESCALATED/BLOCKED retains owner and next review; it is not resolution. MITIGATED means credible plan/commitment exists, not proof of delivery. Closure requires all applicable allocated quantities received and accepted, required approvals valid, and schedule impact addressed or explicitly accepted/handed over by authorized personnel. Reopen before handover if new evidence invalidates the result.

Invariants: no duplicate procurement allocation; no technical acceptance or binding commercial action without proper authority; no unsupported PASS or invented lead time; no use of stale approval after material change; no closure based only on email or new ETA; no unverified action success; no unauthorized modification to schedule baseline. On uncertain external side effect, reconcile external state before retrying. Each open incident has owner, next action or explicit blocker, and review deadline.

### Worked case (synthetic)

Two chilled-water pumps needed for installation activity A, one PO line for quantity 2. Required usable date day 30. Revised supplier forecast day 38 plus 2 days of receiving/inspection gives day 40 usable forecast (assuming the forecast refers to arrival and no other delay). Compare to current schedule revision and dependencies; a 10-day gap to need date is not automatically a 10-day project delay. Open incident if relevant. Evaluate original-vendor expediting, qualified alternative, split fulfillment, or authorized resequencing. Candidate A passes applicable checks on supplied evidence, B fails duty-point head, C unknown due to absent motor evidence. Obtain technical and commercial approvals for exact selected configuration and plan, check quoted availability, coordinate authorized recovery and verify receipts/acceptance. Reopen if revised forecast or inspection invalidates recovery. Keep all synthetic fields clearly labeled.

### Next phase

Design specialist capabilities and their input/output contracts against this model. Identify which decisions are deterministic, which require agent investigation/reasoning, which need human approval, and which state transitions are enforced by the durable execution system. Do not create agents solely because there are multiple logical domains. Real project samples, engineer-reviewed requirements, schedule data and live supplier integrations remain validation dependencies. No physical DB schema or architecture selected.

## 16. Phase 4 — Agent responsibility design (November 25, 2026)

**Status:** Proposed logical agent design for the procurement continuity prototype. No framework, model, deployment topology, final equipment niche or production permissions selected. This phase continues the Phase 3 world model and user-recorded Track 03 primary / Track 01 supporting direction.

### Ownership architecture

One persistent Procurement Operator owns each incident from detection through verified recovery/handover. The event monitor and durable runtime maintain standing responsibility when no model is active. Specialists are bounded, on-demand workers; they return evidence-backed artifacts, not uncoordinated world-state writes. The execution gateway, independent of the LLM, checks permissions, approval revision, action scope, preconditions and idempotency. A specialist role need not be its own service, process or permanently running agent.

| Role | Input | Output | Boundary |
| --- | --- | --- | --- |
| Procurement Operator | incident, triggering event, scoped project snapshot, pending obligations | next step, delegated tasks, proposed plan, follow-up/escalation | owns coordination; cannot grant its own technical/commercial approval |
| Schedule Impact | schedule revision, dependency graph, needs and forecast | required usable dates, affected activities, forecast deltas, assumptions | deterministic schedule engine computes impact; cannot amend baseline |
| Investigation | conflicting/stale commitments, PO history, vendor updates | supported hypotheses, facts, missing evidence, next questions | cannot assert unconfirmed root cause |
| Engineering Compliance | requirement revision, exact configuration and source evidence | typed requirements and PASS/FAIL/UNKNOWN/NOT_APPLICABLE findings, evidence and missing checks | extraction is probabilistic; deterministic evaluation where possible; engineer owns technical acceptance |
| Alternative Sourcing | required configuration, location, quantity, latest viable date and supplier constraints | candidate configurations/offers, quote validity, availability evidence and unknowns | no invented stock, price or delivery commitment; no order placement |
| Recovery Planning | impact, cause, offers, compliance, approval/logistics timings and cost | feasible options, schedule/cost trade-offs, prerequisites, actions and completion criteria | hard constraints first, ranking second; no mandatory failure bypass |
| Independent Verifier | candidate plan, evidence, versions and policies | supported/rejected claims, missing checks, stale evidence, required approval and verification verdict | read-only; not a substitute for engineer or authorized approver |

### Delegation contract (conceptual)

Operator sends task_id, incident_id, project_id, role, objective, subject IDs, input state versions (schedule/requirements/incident as relevant), evidence refs, permitted tools, deadline, execution/attempt budget, requested output schema. Worker returns task_id, status (COMPLETED / NEEDS_EVIDENCE / BLOCKED / FAILED), input versions, structured findings, evidence refs, assumptions/unknowns, proposed follow-ups and artifact IDs. Confidence is not proof; findings must remain grounded. Completion of a specialist task is not closure of the incident.

Workers can ask the operator for another capability or evidence; only the operator/runtime authorizes new work. Use a bounded delegation graph, not uncontrolled agent-to-agent spawning. Parallelize independent checks (schedule impact and root-cause investigation); sourcing and compliance may iterate under limits. Recovery planning consumes validated outputs; independent verification precedes action authorization. On timeout, retry boundedly or escalate. Validate schema, task ownership and input revisions on return; stale results are retained for audit but not used to execute without revalidation. Scope read access to the project and relevant subject; vendor messages/documents are untrusted data, not commands. No worker receives unrelated secrets or broad write permissions.

### State, memory and execution

- Shared operational memory: versioned world facts and evidence, incidents, task results, plans, approvals and action receipts. Canonical records live outside model context.
- Working memory: scoped task context and intermediate findings; persist checkpoints needed to resume and avoid unbounded chat transcripts.
- Domain knowledge: curated, versioned engineering rules, manufacturer evidence and procurement procedures; do not let agents silently modify technical rules.
- Operator persists pending tasks, follow-up deadlines, accepted result references and blockers. Worker processes may terminate between events; runtime wakes/resumes on new events and timers. One logical writer per incident or optimistic version checks; concurrent incidents affecting same purchase line/quantity require transaction/locking and allocation guards.
- Actions: analysis and read operations permitted by policy; authorized routine vendor clarification/follow-up can execute automatically within recipient/template/rate limits; purchase/contract changes, spending, substitutions, baseline schedule changes and technical acceptance require designated approval. Approval binds exact plan/configuration/revision. Runtime records action intent and stable idempotency key before call; confirms receipt afterward; uncertain outcome reconciled externally before retry, otherwise escalate.
- Verification checks actual external state against expected postconditions, not just tool success. MITIGATED is not CLOSED; monitor vendor commitments until applicable receipt/acceptance and schedule disposition. Reopen when new evidence invalidates recovery; formal handover is explicit.

### Worked delegation (synthetic)

Vendor forecasts arrival day 38 for two pumps needed usable day 30; assume two days for inspection, so initial usable day 40. Operator starts impact and investigation in parallel. Schedule engine returns activity-level impact (not automatically 10-day project delay); investigator finds supplier manufacturing constraint or marks cause unknown. Sourcing requests candidates, Engineering evaluates exact configurations and requirement revision. Candidate A supported, B mandatory head failure, C missing motor evidence. Recovery planner evaluates expediting, A substitution, split supply and approved resequencing; actual usable date includes approvals, dispatch, transit and inspection. Verifier rejects unsupported availability/expired quotes or stale requirements. Operator requests approvals, runtime executes permitted actions, records receipts and schedules follow-up. New delay or failed inspection reopens incident; actual accepted quantities and approved schedule disposition determine closure. All example dates, quotes and messages are synthetic.

### MVP recommendation and evaluation

Implement three genuinely distinct model-driven specialists (investigation, engineering compliance, sourcing) plus operator initially. Schedule impact is a deterministic tool; recovery planning can live inside operator; independent verifier is a separate bounded review step plus deterministic policy checks. Add separate schedule interpretation or planning agents only if evaluation demonstrates need. This is a recommendation, not a final staffing or architecture decision. Test each capability against labeled inputs and expected outputs; end-to-end tests include noncritical delay, stale/out-of-order event, candidate mandatory failure, missing evidence, expired offer, approval invalidation, crash after external write, supplier silence, partial acceptance, repeated delay, parallel conflicts, and prompt injection in external evidence. Track detection accuracy, finding/evidence correctness, plan feasibility, unauthorized/duplicate writes (target zero in test suite), recovery and closure correctness, time/LLM cost, and human interventions. No claimed measured results yet.

**Next phase:** Design the runtime/system architecture: event ingress and normalization, world-state storage, incident scheduler, worker execution, task/result transport, policy gateway, receipts/outbox and integrations. Compare frameworks against restart recovery, long waits, observability, concurrency and cost. Keep equipment expertise separate from infrastructure so another equipment category can be added by domain modules.

[Pactline — Phase 5 Runtime & System Architecture](https://app.notion.com/p/Pactline-Phase-5-Runtime-System-Architecture-39c084f5e0fb82f2a0c901c146d9b65a?pvs=21)
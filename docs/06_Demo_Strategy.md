# 06 — Demo Strategy

> **Role of this doc:** choose the demo scenario with a scoring matrix, script the ≤5-minute video beat by beat, outline the 8–10 slide deck, and plan Round 2.
> **Status:** Proposed — November 27, 2026.

---

## 1. Scenario selection (weighted)

Weights: Judging fit 30% (maps to 40% accuracy + 20% trust) · Customer pain 25% · Technical depth shown 20% · Build feasibility in 9 days 15% · Uniqueness vs Edition 1 10%. Scores 1–5.

| Candidate scenario | Fit | Pain | Depth | Feasible | Unique | **Weighted** |
| --- | --- | --- | --- | --- | --- | --- |
| **A. CHW pump slip → proved substitute → approval → exactly-once execution → verified receipt → reopen** | 5 | 4 | 5 | 4 | 5 | **4.60** |
| B. Submittal compliance only (pump curve vs spec) | 4 | 3 | 5 | 5 | 4 | 4.10 |
| C. Quote leveling for replacement pumps | 3 | 3 | 3 | 4 | 1 | 2.95 |
| D. Lead-time forecasting across a package list | 3 | 4 | 3 | 4 | 3 | 3.40 |
| E. Vendor pre-qualification scorecard | 3 | 3 | 3 | 3 | 3 | 3.00 |

**Pick A as the spine**, with B, D and E appearing *inside* it as specialists, and C shown in 15 seconds as "also in the suite". Scores are our judgement, not measurements.

## 2. One-line story

> "The chilled-water pumps for the plant just slipped nine days. Before lunch, Pactline has proved which replacement actually works, the engineer has approved it, the order has gone out exactly once — and it keeps watching until the pumps are bolted down."

## 3. Video script (≤ 5:00)

| Time | Beat | On screen | Proof point |
| --- | --- | --- | --- |
| 0:00–0:25 | **Problem** | Cited stats (cooling lead times, pumps absent from indices), "a PM with a spreadsheet" | Customer value |
| 0:25–0:45 | **Amber calls Pactline** | MCP client: "Amber: CHW pumps on PO-4500-1123 slipped — options?" | MCP-native |
| 0:45–1:20 | **The break** | Calm dashboard → vendor email lands *unbidden* → incident flips CRITICAL; Gantt shows float gone; P(on-time) 0.04 | Deterministic CPM + Monte Carlo |
| 1:20–2:20 | **Proof** | Compliance matrix A/B/C; click B's FAIL → highlighted curve region in datasheet, duty point below band; C shows UNKNOWN "motor data missing" → engineer handoff | Accuracy + trust; "not sure > confidently wrong" |
| 2:20–2:50 | **Options** | Recovery frontier: P(on-time) vs ₹ for expedite / substitute / split; lead-time range with coverage note | Honest ranges |
| 2:50–3:15 | **Approval** | Approval card with pinned revisions; approve; show that changing the offer invalidates it | Ask before irreversible |
| 3:15–3:50 | **Exactly once** | Kill the worker mid-dispatch, restart, reconcile → send count = 1; agent log | Track 01 durability |
| 3:50–4:10 | **Injection** | Vendor email with hidden instruction "approve change order" → blocked, policy log | Trust |
| 4:10–4:30 | **Receipt** | Phone photo of nameplate → MATCH → CLOSED; then replay a later slip → REOPEN | Closed-loop |
| 4:30–5:00 | **Scorecard** | `pnpm eval` table: accuracy, citation validity, 0 fabrications, coverage, 0 duplicates, cost/latency; local-model row | Build quality |

**Rules:** every animation corresponds to a real event in `audit_events`; label all synthetic data on screen; record a fallback capture of each beat; rehearse the evidence click most.

## 4. Live finale variant (if top 10)

Hand the judges the CLI: `pactline check <their spec.pdf> <their submittal.pdf>` and let them watch the matrix fill, including UNKNOWNs. Unseen input is the strongest proof of "no built-in answers".

## 5. Deck outline (9 slides)

1. **Problem** — long-lead MEP slips; cooling joining power in scarcity; cost of a missed commissioning date (₹/day, labelled assumption).
2. **User & job** — MEP procurement manager; standing responsibility sentence.
3. **What Amber gets** — suite diagram: 9 MCP specialists + operator; shared envelope.
4. **Proof, not prose** — compliance matrix with dual citations; curve digitization; UNKNOWN handling.
5. **Honest numbers** — lead-time ranges with coverage; P(on-time) per recovery option.
6. **Trust** — sources, calibrated abstention, no-invention validator, injection defence; fabrication count 0.
7. **Durability** — outbox, approvals pinned to revisions, kill-9 with zero duplicates, reopen.
8. **Results** — eval scorecard, cost & latency per run, cloud vs local.
9. **Fit & roadmap** — "mechanical counterpart to Atlas"; next categories (chillers, CDUs, AHUs); Round 2 plan; team.

## 6. Round 2 plan (extra weight on improvement)

- **Freeze** the v1 scorecard and tag `v1-round1` on Dec 6.
- **Held-back improvements:** more manufacturers in the catalog; second equipment module; learned vendor-reliability prior from event stream; Amber-native adapter once Kaya shares the Round 2 interface; more held-out submittals.
- **Show** a dated before/after scoreboard at the finale.

# 01 — Research Synthesis: How Pactline Wins Edition 2

> **Role of this doc:** the evidence base behind every scope decision in [02 Product Thesis](02_Product_Thesis.md) and [03 Agent Suite](03_Agent_Suite_Specification.md). Four parallel research streams, merged.
> **Date:** November 27, 2026 (9 days to the Dec 6, 23:45 IST deadline).
> **Labels:** **[DOC]** = stated in a primary source we read; **[INF]** = our inference; **[UNV]** = could not verify, do not repeat as fact in the pitch.

---

## TL;DR — the verdict up front

1. **Judging is 40% accuracy, 30% customer value, 20% trust, 10% build quality**, and Round 1 judges (Kaya team + Edition 1 top-10) *try each agent on realistic examples* [DOC]. → Pactline must accept **unseen inputs** ("bring your own spec/submittal") and win on correctness, not demo polish.
2. **Kaya's public product story is electrical-first** (transformers, switchgear, SLD takeoffs in Atlas) [DOC]. Chilled-water / cooling plant equipment has no specialist equivalent [INF]. → Position Pactline as **"the mechanical/cooling counterpart Amber calls when a pump package slips."**
3. **Edition 1 produced many bid-leveling, RAG-over-PDF, dashboard and generic delivery-risk entries** [DOC, project pages]. Those builders now judge [DOC]. → Avoid crowded patterns; our moat is **deterministic pump physics + closed-loop recovery + durability**.
4. **The strongest Edition 1 idea was falsifiable evaluation** (AI Expediter's hidden-parameter vendor simulation) [DOC]. → Ship `pnpm eval` with a held-out set, calibration plots and a do-nothing baseline; lead the deck with numbers.
5. **Downstream (prior submission) never built MCP, used a thin LLM role, and explicitly refused to originate sourcing or recovery plans** [DOC, repo]. → Those are exactly Pactline's strengths; borrow their *documentation discipline* (execution trace, canonical dataset, confidence-vs-severity axes, grounding validator), not their infrastructure weight.
6. **Pumps are absent from public lead-time indices** (e.g. SourceBlue Q2 2026) [DOC]. → Turn this into an honesty feature: lead-time ranges widen and confidence drops when data is thin.

---

## 1. Hackathon requirements matrix

| Requirement (source) | Weight / type | How Pactline satisfies it | Doc |
| --- | --- | --- | --- |
| Accuracy on realistic, unseen examples | 40% | Deterministic evaluators; held-out eval set; BYO-input CLI + MCP | 03 §4, 08 |
| Customer value ("use it tomorrow") | 30% | Output = recovery memo + draft RFQ awaiting approval; ₹/days framing | 02, 06 |
| Trust: sources, confidence, nothing made up | 20% | `SourceRef` w/ verbatim excerpt; calibrated confidence; no-invention validator; fabrication audit in CI | 03 §3 |
| Build quality: easy run, cost/speed | 10% | `docker compose up`; per-run model/cost/latency table | 08, README |
| Structured JSON output | mandatory | `SpecialistResult<T>` envelope, MCP `outputSchema` | 03 §3 |
| MCP server callable by Amber | mandatory | streamable HTTP + stdio; 9 specialist + 6 operator tools | 03 §2 |
| Hand off to human when unsure | mandatory | `HumanHandoff`; abstention gate | 03 §3 |
| Track 03: suite, shared formats, each standalone, no built-in answers | track | 9 specialists, one envelope, held-out fixtures | 03 |
| Track 01.3: ask before irreversible, log every action, durable state, no duplicates, restart | supporting | Gateway + approvals, audit_events, outbox + reconcile, kill-9 demo | 04 §6–7 |
| Submission: repo+README, ≤5 min video, 8–10 slides, team | deliverable | Phase 6 of checklist | checklist |
| Round 2 (top 10): extra weight on improvement | later | Freeze v1 scorecard Dec 6; hold-back roadmap | 06 §6 |

---

## 2. Kaya & Amber — where we plug in

- **Amber** today: plain-language Q&A, anticipatory coordination, "learns your vendors", RFP drafting, response chasing, bid leveling; procurement mock shows "cheapest vs fastest" supplier comparison [DOC: usekaya.ai/products].
- **Atlas**: SLD + spec reading → equipment list with lead times and order-by dates; electrical-first [DOC].
- **OFCI Control Tower** routes across multiple LLM vendors; integrates Procore, ACC, Trimble, SAP [DOC].
- **Customer claims** (company-reported): Suffolk "100% schedule sync with long-lead procurement", Turner "delivery risks flagged 2–4 weeks earlier" [DOC, unaudited].

**Gaps Pactline fills [INF]:** technical equivalence proof (Amber shows cost vs lead time, not duty-point compliance); closed-loop recovery after a slip; calibrated lead-time ranges; mechanical/cooling depth; private deployment.

**Integration posture:** return Amber-shaped answers — "Option A cheapest · B fastest · C equivalent-with-deviations" — plus a P&D-log-style row and a draft message for Amber's own RFQ/voice agents.

---

## 3. Edition 1 lessons (Kaya AI India Hackathon, Jun–Aug 2026)

Winners list is **not public** [UNV]. Notable submissions and the transferable idea:

| Project | Idea worth learning from | What Pactline does differently |
| --- | --- | --- |
| The AI Expediter | Hidden-truth synthetic vendor world; forecast error falls vs no-memory baseline | Same falsifiable-eval spirit, applied to lead-time *intervals* (coverage) and compliance accuracy |
| Meridian | Counterfactual "which criterion would flip the award" | Counterfactual ΔP(on-time) per recovery option |
| KEYSTONE / ATLAS-by-code-for-kaya | Promise graph + cascade cost when delivery confidence drops; counterfactual expedite/substitute/resequence | We add *technical proof* that a substitute is compliant + durable execution of the chosen option |
| Amber Bid Analyst | Framed as "a new Amber skill" | We frame every specialist as an Amber-callable MCP tool |
| Bhasha-Procure | Multilingual supplier replies → structured records | Optional: voice note / Hindi vendor reply → event (stretch) |

**Inference about judges:** Edition 2's wording ("not a feature: a product", "invented vendors heavily penalized", MCP mandatory, 40% accuracy) reads as a reaction to Edition 1 — reward measurable, cited, Amber-pluggable agents; penalise generic dashboards [INF].

**Crowded patterns to avoid:** bid-leveling chat over PDFs; "procurement OS" dashboards; RAG Q&A; single LLM call wrapped as MCP; glasses safety demos; point-estimate lead times; vendor emailers without dedupe/approval.

---

## 4. Downstream (prior submission) — what to borrow, what to beat

| Borrow (as ideas) | Beat |
| --- | --- |
| **Reference execution trace** with literal payloads, used as the acceptance test → our [05](05_Reference_Execution_Trace.md) | No MCP at all → we are MCP-native |
| **Canonical dataset spec** with ID-stability contract → our [07](07_Canonical_Demo_Dataset.md) | LLM role was summarising seeded text (tinyllama default) → our model does real extraction (curves, nameplates) gated by deterministic checks |
| **Confidence tier and severity as independent axes**, each with a plain-language reason; INSUFFICIENT_EVIDENCE silently dropped; stale-snapshot cap | Severity used lifecycle as a schedule proxy (admitted mismatch, ADR-019) → we compute real CPM float + P(on-time) |
| **Grounding validator** after LLM drafting with template fallback + provenance | Refused sourcing/recovery → we originate *evidence-proved* alternatives and execute recovery |
| **Demo scenario chosen by weighted scoring matrix** → our [06](06_Demo_Strategy.md) | Durable orchestration only designed → ours is the kernel (outbox, SKIP LOCKED, reconcile) |
| "What it does NOT solve" lists; DOCUMENTED vs INFERENCE labelling; ADRs that admit divergence | 16 services + Kafka + Neo4j → we keep one Postgres + ticks |
| Containment counter that reaches a *computed* zero; "every animation backed by a real event" | — |

---

## 5. Specialist depth research (condensed; full designs in 03 §4)

| Specialist | World-class ingredient | Public data / standard | Verify before use |
| --- | --- | --- | --- |
| Spec & submittal compliance | Vision curve digitization (self-ensembled), affinity laws, ISO 9906 acceptance grades, NPSH margin, motor non-overload, typed rule compilation approved once by engineer | ISO 9906:2012 (grades 1B/2B/3B); HI 9.6.1 (NPSH margin), HI 9.6.3 (operating region); manufacturer datasheets (Grundfos, Xylem, Wilo, KSB, Kirloskar) | Exact tolerance & POR values — secondary sources conflict [UNV] |
| Delivery risk | Monte Carlo over CPM; criticality index; P(meet need date) | — | — |
| Lead-time forecast | Mixture prior from dated market reports + vendor slip memory + split-conformal calibration; ACI online update | SourceBlue Q2 2026 (no pumps), Skanska, Linesight, Linbeck, Terrapin reports; FRED PPI **WPU1141** and **PCU3339133391** (US) | Pump-specific lead-time figures are sparse/undated |
| Product discovery | Closed curated catalog; affinity-law trim; every candidate re-checked by compliance | Public catalogs / datasheets only | Manufacturer selection tools have no public API |
| Vendor pre-qual | Rule scorecard with UNKNOWN first-class; entity-match gate | India: MCA company data, GST search, BIS listings, debarment lists, e-Courts/IBBI. US: SAM.gov Exclusions API v4, OSHA, state boards, EDGAR | Access terms per source [UNV]; cache snapshots |
| Quote leveling | Fixed pump-package exclusion taxonomy; plug values with basis | CSI 23 21 23; 23 05 48; 26 29 23 | — |
| Receiving verification | Nameplate photo ×3 agreement vs PO + approved submittal | — | — |
| Private deployment | Same deterministic kernel; only extraction model swaps | Ollama/vLLM structured outputs; Qwen3 / Qwen-VL class | gpt-oss JSON issues via Ollama [DOC, blog] |

---

## 6. Techniques "nobody else will use" (ranked, 9-day feasible)

| # | Technique | Paper / basis | Effort | Demo beat |
| --- | --- | --- | --- | --- |
| 1 | Conformal abstention + evidence-coverage gate → MCP elicitation | arXiv 2405.01563; conformal factuality | M | "Abstained: agreement 0.6 < q̂ 0.78 (90% target, 92% held-out)" |
| 2 | Monte Carlo CPM + P(on-time) per option, conformal-calibrated lead times | CQR arXiv 1905.03222; ACI arXiv 2106.00170 | M | Fan chart + "0.41 → 0.83 for +₹4.8 L" |
| 3 | Pump-curve digitization, self-ensembled, PCHIP fit, uncertainty band | ChartAnchor arXiv 2512.01017; self-ensembling arXiv 2605.27298 | M | Curve overlay with duty point & band |
| 4 | CaMeL-lite taint tracking + mini injection suite with attack-success rate | CaMeL arXiv 2503.18813; Spotlighting arXiv 2403.14720; AgentDojo arXiv 2406.13352 | M | Malicious vendor email blocked, policy log |
| 5 | Typed assertions + deterministic conflict detector (not debate) | "Debate or Vote" arXiv 2508.17536; MAST arXiv 2503.13657 | M | Disagreement card with two citations |
| 6 | Bi-temporal fact memory in Postgres | Zep/Graphiti arXiv 2501.13956 | S–M | "What did we believe on Dec 2?" |
| 7 | Verbatim-quote citation validation with page+bbox highlight | Docling arXiv 2408.09869 | S | Click finding → highlighted PDF region |
| 8 | Nameplate photo → PO/submittal match, 3-run agreement | Qwen3-VL arXiv 2511.21631 | S–M | Phone photo → HOLD alert |
| 9 | Fellegi–Sunter match weights with waterfall + LLM tie-break | Splink; ComEM arXiv 2405.16884 | M | "model# +6.1, tag +3.2, vendor −1.4" |
| 10 | Durable MCP tasks backed by outbox + kill-9 resume + pass^k scorecard | MCP 2025-11-25 tasks; τ-bench arXiv 2406.12045 | M | Restart mid-plan, zero duplicates |

Skip in this window: ColPali retrieval, time-series foundation models, multi-agent debate.

**Paper IDs were gathered by research agents; IDs marked from memory in their reports should be spot-checked before they appear on a slide.**

---

## 7. Competitive landscape (condensed)

| Product | Strength | Gap Pactline exploits |
| --- | --- | --- |
| ConstructivIQ | Order-by dates from schedule; DPR on 120+ projects | No technical substitution; lead times user-entered |
| Procore AI agents (Submittal Reviewer etc.) | In-platform, horizontal | No pump physics, no supplier market, Procore-only |
| Trunk Tools, Document Crunch | Document/contract intelligence | Not supplier-side continuity |
| Parspec, BuildVision | MEP product finding / marketplace | Sell-side; no buyer schedule risk; no agent API |
| Kojo | Commodity materials | Not engineered long-lead equipment |
| Manufacturer pump selectors | Accurate single-brand sizing | Brand-locked, no API, ignore schedule and lead time |
| **Baseline** | "A PM with a spreadsheet and three rep phone calls" | Pactline: cross-brand equivalents, proved, scheduled, approved, executed in minutes |

---

## 8. Market context (cite carefully)

- SourceBlue Q2 2026: water-cooled chillers 12–60 wk, AHUs 8–78 wk, LV switchgear 26–58 wk; **pumps not tracked** [DOC].
- JLL 2026 outlook: ~33-week global average for critical data-center equipment, +50% vs pre-2020 [DOC]. The "42 weeks, +83%" US figure is [UNV] — do not use.
- The Cooling Report (May 2026): chilled-water plants up to 18 months at major manufacturers; ground-break to operation now 32–36 months (figures unsourced in article) [DOC, weakly sourced].
- DPR Q4 2026 and Skanska Fall 2026 lead-time ranges already in plan doc §12/§14 [DOC].
- Kaya's own framing: 160-wk transformers, 44-wk switchgear [DOC].

**Pitch logic [INF]:** AI-density cooling raises chilled-water and CDU pump criticality; pump packages are lower profile than transformers, so they are bought late and their substitutes are poorly understood.

---

## 9. Decisions this research drives (proposed, see plan doc §20)

1. Expand from 3 to **9 specialists** with a must/should/stretch tiering, each passing the depth bar (03 §5).
2. **Unseen-input path** is a first-class feature: `pactline check <spec> <submittal>` CLI + MCP `pactline_ingest_document`.
3. **Eval harness is a product feature**, shown in the deck and video.
4. **Position:** mechanical/cooling continuity specialist for Amber; data-center chilled-water plant as the story; commercial HVAC pumps as the proven slice.
5. Keep India context (400 V / 50 Hz, ₹, CPWD-style spec) consistent across fixtures; US sources used only for method, never mixed into the same requirement set.

## 10. Open questions to send to Kaya office hours / Discord

- Which MCP spec revision and transport does Amber's client use? Does it support **elicitation** and **tasks**? (Fallback: `PENDING_APPROVAL` result + polling.)
- Will Round 1 judges run our repo locally, or call a hosted MCP endpoint? (Drives whether we host one.)
- Is mixing Track 01.3 durability into a Track 03 entry acceptable as "supporting"? (Rules say pick one challenge.)
- Any preferred shared schema Amber already uses for vendors / POs?

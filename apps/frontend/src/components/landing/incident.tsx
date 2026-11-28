"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReveal } from "@/lib/use-reveal";
import { AgentChip } from "@/components/demo/agent-chip";
import type { AgentId } from "@/lib/agents";
import { prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

type Tone = "pass" | "fail" | "unknown" | "brand";

interface Row {
  k: string;
  v: string;
  tone?: Tone;
}

const TONE: Record<Tone, string> = {
  pass: "text-pass",
  fail: "text-fail",
  unknown: "text-unknown",
  brand: "text-brand",
};

const DWELL = { desktop: 6500, mobile: 1000 };

const STAGES: Array<{ id: string; tab: string; who: AgentId[]; title: string; body: string; rows: Row[] }> = [
  {
    id: "detect",
    who: ["op", "sch"],
    tab: "Detect",
    title: "A delay that actually matters",
    body: "The vendor moves arrival of two chilled-water pumps from day 30 to day 38. With two days for receiving and inspection they are usable on day 40. The schedule engine finds four days of float, so six days land on the critical path.",
    rows: [
      { k: "package", v: "P-CHW-01A/B, qty 2" },
      { k: "need date", v: "day 30" },
      { k: "forecast usable", v: "day 40", tone: "fail" },
      { k: "float available", v: "4 days" },
      { k: "classification", v: "critical", tone: "fail" },
    ],
  },
  {
    id: "investigate",
    who: ["inv"],
    tab: "Investigate",
    title: "What is known, and what is not",
    body: "The investigator keeps the vendor's claim apart from confirmed fact, and asks for the one document that would settle the question.",
    rows: [
      { k: "supported", v: "factory backlog, vendor-stated" },
      { k: "confirmed", v: "PO acknowledged on day 0" },
      { k: "missing", v: "factory test date in writing", tone: "unknown" },
      { k: "next question", v: "can two units ship from stock?" },
      { k: "confidence", v: "0.62, below the 0.75 threshold", tone: "unknown" },
    ],
  },
  {
    id: "check",
    who: ["src", "cmp"],
    tab: "Check",
    title: "Three candidates, one honest answer each",
    body: "Sourcing finds three alternatives. Each one is tested at the exact duty point against the unchanged requirement: at least 35 m of head at 100 m³/h.",
    rows: [
      { k: "candidate A", v: "pass, 36.1 m at duty", tone: "pass" },
      { k: "candidate B", v: "fail, 33.4 m at duty", tone: "fail" },
      { k: "candidate C", v: "unknown, motor data missing", tone: "unknown" },
      { k: "evaluated by", v: "deterministic curve check" },
    ],
  },
  {
    id: "recover",
    who: ["op", "hu"],
    tab: "Recover",
    title: "Options ranked after hard constraints",
    body: "Candidate B is removed before ranking starts. The operator compares what is left, recommends one plan and asks for exactly the approvals it needs.",
    rows: [
      { k: "substitute with A", v: "usable day 33, recommended", tone: "brand" },
      { k: "expedite original", v: "usable day 37, premium quoted" },
      { k: "split supply", v: "one unit day 31, one day 40" },
      { k: "approvals needed", v: "engineer of record, commercial" },
    ],
  },
  {
    id: "verify",
    who: ["op", "gw"],
    tab: "Verify",
    title: "Mitigated is not closed",
    body: "Both pumps arrive. One passes inspection and one is held for a damaged flange. The incident stays open until the accepted quantity matches the need.",
    rows: [
      { k: "received", v: "2 of 2" },
      { k: "accepted", v: "1 of 2", tone: "unknown" },
      { k: "state", v: "mitigated" },
      { k: "closure", v: "blocked until 2 accepted", tone: "fail" },
      { k: "next review", v: "day 34" },
    ],
  },
];

export function Incident() {
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(STAGES[0]!.id);
  const [auto, setAuto] = useState(true);
  const [hold, setHold] = useState(false);
  const [visible, setVisible] = useState(false);
  const [compact, setCompact] = useState(false);
  const dwell = compact ? DWELL.mobile : DWELL.desktop;
  useReveal(root);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = auto && !hold && visible;
  useEffect(() => {
    if (!running || prefersReducedMotion()) return;
    const id = window.setTimeout(() => {
      const i = STAGES.findIndex((s) => s.id === value);
      setValue(STAGES[(i + 1) % STAGES.length]!.id);
    }, dwell);
    return () => window.clearTimeout(id);
  }, [running, value, dwell]);

  useLayoutEffect(() => {
    const place = () => {
      const active = list.current?.querySelector<HTMLElement>(`[data-value="${value}"]`);
      if (!active || !pill.current) return;
      pill.current.style.width = `${active.offsetWidth}px`;
      pill.current.style.transform = `translateX(${active.offsetLeft - 4}px)`;
    };
    place();
    const ro = new ResizeObserver(place);
    if (list.current) ro.observe(list.current);
    return () => ro.disconnect();
  }, [value]);

  return (
    <section ref={root} id="incident" className="relative py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <div data-reveal>
          <h2 className="t-h2 max-w-[16ch] text-ink">One incident, <em className="gold-word">{"end to end."}</em></h2>
          <p className="t-lead mt-5 max-w-[34rem]">A sandbox incident with synthetic data. No real vendors, products or projects are named.</p>
        </div>

        <Tabs
          value={value}
          onValueChange={(v) => {
            setAuto(false);
            setValue(v);
          }}
          onPointerEnter={() => setHold(true)}
          onPointerLeave={() => setHold(false)}
          onFocus={() => setHold(true)}
          onBlur={() => setHold(false)}
          className="mt-10 gap-6 sm:mt-12 sm:gap-8"
          data-reveal
        >
          <div>
            <TabsList ref={list} className="grid w-full grid-cols-5 sm:inline-flex sm:w-fit">
              <span
                ref={pill}
                aria-hidden
                className="absolute top-1 left-1 h-9 rounded-full bg-surface shadow-[0_1px_2px_rgb(15_58_43/0.08),inset_0_0_0_1px_var(--line)] transition-[transform,width] duration-300 ease-out-strong"
              />
              {STAGES.map((s) => (
                <TabsTrigger key={s.id} value={s.id} data-value={s.id} className="px-1 text-[0.75rem] sm:px-4 sm:text-sm">
                  {s.tab}
                </TabsTrigger>
              ))}
            </TabsList>
            <div aria-hidden className="mt-3 h-px w-full overflow-hidden bg-line sm:max-w-[26rem]">
              {auto && (
                <span
                  key={value}
                  className="block h-full origin-left bg-brand motion-reduce:hidden"
                  style={{
                    animationName: "tab-progress",
                    animationDuration: `${dwell}ms`,
                    animationTimingFunction: "linear",
                    animationFillMode: "forwards",
                    animationPlayState: running ? "running" : "paused",
                  }}
                />
              )}
            </div>
          </div>

          {STAGES.map((s) => (
            <TabsContent
              key={s.id}
              value={s.id}
              className="grid gap-10 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300 data-[state=active]:ease-out-strong lg:grid-cols-12 lg:gap-8"
            >
              <div className="lg:col-span-5">
                <span className="mb-4 flex -space-x-1.5">
                  {s.who.map((id) => (
                    <AgentChip key={id} id={id} size={28} ring />
                  ))}
                </span>
                <h3 className="t-h3 text-ink">{s.title}</h3>
                <p className="t-body mt-4 max-w-[30rem]">{s.body}</p>
              </div>
              <div className="bezel lg:col-span-7">
                <dl className="bezel-core t-mono grid gap-0 p-3 text-[0.8125rem]">
                  {s.rows.map((r) => (
                    <div key={r.k} className="grid grid-cols-[9.5rem_1fr] gap-4 rounded-xl px-4 py-3 odd:bg-surface-2/55 sm:grid-cols-[11rem_1fr]">
                      <dt className="text-ink-3">{r.k}</dt>
                      <dd className={cn("text-ink", r.tone && TONE[r.tone])}>{r.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

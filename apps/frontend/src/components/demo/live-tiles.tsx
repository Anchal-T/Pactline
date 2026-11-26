"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import { Check, Question, X } from "@phosphor-icons/react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/** Builds a looping timeline that only runs while its scope is on screen. Reduced motion keeps the final frame. */
function useLoop(scope: RefObject<HTMLElement | null>, build: (tl: gsap.core.Timeline) => void, repeatDelay = 2.2) {
  useGSAP(
    () => {
      if (prefersReducedMotion() || !scope.current) return;
      const tl = gsap.timeline({ repeat: -1, repeatDelay, paused: true });
      build(tl);
      ScrollTrigger.create({ trigger: scope.current, start: "top 90%", end: "bottom 5%", onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
    },
    { scope },
  );
}

/* ------------------------------------------------------------------ */

const SOURCES = [
  { source: "Vendor email", claim: "arrival day 38", age: "2 days ago" },
  { source: "PO acknowledgement", claim: "arrival day 30", age: "original" },
  { source: "Factory milestones", claim: "no update", age: "silent 9 days" },
];

export function InvestigationDemo() {
  const root = useRef<HTMLDivElement>(null);
  useLoop(root, (tl) => {
    const q = gsap.utils.selector(root);
    tl.set(q("[data-row]"), { opacity: 0.35 })
      .set(q("[data-scan]"), { y: 0, opacity: 0 })
      .set(q("[data-conflict]"), { autoAlpha: 0, x: -6 })
      .set(q("[data-findbox]"), { autoAlpha: 0 })
      .set(q("[data-find]"), { autoAlpha: 0, y: 8 });
    q("[data-row]").forEach((row, i) => {
      tl.to(q("[data-scan]"), { opacity: 1, y: i * 58, duration: 0.45, ease: "power2.inOut" }, i === 0 ? 0.3 : ">")
        .to(row, { opacity: 1, duration: 0.3 }, "<0.15");
    });
    tl.to(q("[data-scan]"), { opacity: 0, duration: 0.3 })
      .to(q("[data-conflict]"), { autoAlpha: 1, x: 0, duration: 0.5, ease: "expo.out" }, "<")
      .to(q("[data-findbox]"), { autoAlpha: 1, duration: 0.3 }, "+=0.3")
      .to(q("[data-find]"), { autoAlpha: 1, y: 0, duration: 0.6, ease: "expo.out", stagger: 0.3 }, "<")
      .to({}, { duration: 2.6 })
      .to(q("[data-row], [data-conflict], [data-findbox]"), { opacity: 0.35, duration: 0.5 });
  });

  return (
    <div ref={root} className="grid gap-5">
      <div className="relative">
        <span data-scan aria-hidden className="absolute top-0 left-0 h-[50px] w-[2px] rounded-full bg-brand opacity-0" />
        <ul className="grid gap-2">
          {SOURCES.map((s) => (
            <li key={s.source} data-row className="grid h-[50px] grid-cols-[1fr_auto] items-center gap-x-4 rounded-2xl bg-surface-2/60 px-4">
              <span className="grid leading-tight">
                <span className="text-[0.875rem] text-ink">{s.source}</span>
                <span className="text-[0.75rem] text-ink-3">{s.age}</span>
              </span>
              <span className="t-mono text-ink">{s.claim}</span>
            </li>
          ))}
        </ul>
        <span data-conflict className="t-mono absolute top-[34px] right-3 rounded-full bg-unknown/14 px-2.5 py-1 text-[0.6875rem] text-unknown ring-1 ring-unknown/25 ring-inset">
          8-day conflict
        </span>
      </div>
      <div data-findbox className="grid gap-4">
        <div className="grid gap-1.5 border-l-2 border-brand pl-4">
          <p data-find className="text-[0.875rem] text-ink">Supported: factory backlog, as stated by the vendor</p>
          <p data-find className="text-[0.875rem] text-ink-2">Missing: a factory test date in writing</p>
          <p data-find className="t-mono text-ink-3">
            confidence <span className="text-ink">0.62</span>, routed to expediter
          </p>
        </div>
        <div data-find className="grid gap-2">
          <span className="text-[0.75rem] text-ink-3">Next questions sent to the vendor</span>
          <span className="flex flex-wrap gap-1.5">
            {["Factory test date, in writing", "Can 2 units ship from stock?"].map((t) => (
              <span key={t} className="rounded-full bg-surface-2/80 px-3 py-1 text-[0.75rem] text-ink-2 ring-1 ring-line ring-inset">
                {t}
              </span>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const CANDIDATES: Array<{ name: string; v: "pass" | "fail" | "unknown"; note: string }> = [
  { name: "Candidate A", v: "pass", note: "Meets every mandatory line" },
  { name: "Candidate B", v: "fail", note: "Head falls short at duty" },
  { name: "Candidate C", v: "unknown", note: "Motor data sheet missing" },
];

const MARK = {
  pass: { icon: Check, tone: "text-pass bg-pass/12" },
  fail: { icon: X, tone: "text-fail bg-fail/12" },
  unknown: { icon: Question, tone: "text-unknown bg-unknown/14" },
};

export function SourcingDemo() {
  const root = useRef<HTMLDivElement>(null);
  useLoop(root, (tl) => {
    const q = gsap.utils.selector(root);
    tl.set(q("[data-cand]"), { autoAlpha: 0, y: 10 }).set(q("[data-verdict]"), { autoAlpha: 0, scale: 0.85 }).set(q("[data-pending]"), { autoAlpha: 1 });
    tl.to(q("[data-cand]"), { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.25, ease: "expo.out" }, 0.3);
    q("[data-cand]").forEach((c) => {
      tl.to(c.querySelector("[data-pending]"), { autoAlpha: 0, duration: 0.2 }, "+=0.55").to(c.querySelector("[data-verdict]"), { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, "<");
    });
    tl.to({}, { duration: 2.4 });
  });

  return (
    <div ref={root}>
      <p className="t-mono text-ink-3">searched 4 catalogs, kept equivalents only</p>
      <ul className="mt-4 grid gap-3">
        {CANDIDATES.map((c) => {
          const M = MARK[c.v];
          return (
            <li key={c.name} data-cand className="flex items-center gap-3.5">
              <span className="relative grid size-6 place-items-center">
                <span data-pending className="absolute inset-0 animate-spin rounded-full border border-dashed border-ink-3 [animation-duration:2s] motion-reduce:hidden" />
                <span data-verdict className={cn("grid size-6 place-items-center rounded-full", M.tone)}>
                  <M.icon size={12} weight="bold" />
                </span>
              </span>
              <span className="grid">
                <span className="text-[0.9375rem] text-ink">{c.name}</span>
                <span className="text-[0.8125rem] text-ink-3">{c.note}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const D0 = 24;
const D1 = 52;
const at = (d: number) => `${((d - D0) / (D1 - D0)) * 100}%`;
const span = (a: number, b: number): CSSProperties => ({ left: at(a), width: `calc(${at(b)} - ${at(a)})` });

const ROWS: Array<{ label: string; from: number; to: number; shift: number; tone: string }> = [
  { label: "Pump delivery", from: 24, to: 28, shift: 10, tone: "bg-ink-2/80" },
  { label: "Receive and inspect", from: 28, to: 30, shift: 10, tone: "bg-ink-2/55" },
  { label: "Pump install", from: 30, to: 36, shift: 10, tone: "bg-brand" },
  { label: "Commissioning", from: 40, to: 44, shift: 6, tone: "bg-brand/60" },
];

export function GanttDemo() {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useLoop(
    root,
    (tl) => {
      const q = gsap.utils.selector(root);
      const unit = () => (track.current?.clientWidth ?? 0) / (D1 - D0);
      tl.set(q("[data-bar]"), { x: 0 }).set(q("[data-late], [data-usable]"), { autoAlpha: 0 });
      q("[data-bar]").forEach((bar) => {
        const shift = Number((bar as HTMLElement).dataset.shift);
        tl.to(bar, { x: () => shift * unit(), duration: 1.4, ease: "power3.inOut" }, 0.6);
      });
      tl.to(q("[data-usable]"), { autoAlpha: 1, duration: 0.4 }, 1.6).to(q("[data-late]"), { autoAlpha: 1, duration: 0.5, ease: "expo.out" }, 2.1).to({}, { duration: 2.6 });
      tl.to(q("[data-bar]"), { x: 0, duration: 0.9, ease: "power2.inOut" }).to(q("[data-late], [data-usable]"), { autoAlpha: 0, duration: 0.3 }, "<");
    },
    1,
  );

  return (
    <div ref={root} className="grid gap-3" role="img" aria-label="Gantt: delivery slips ten days, four days of float absorb part of it, commissioning moves six days">
      <div ref={track} className="relative ml-[8.5rem] h-5">
        <span className="t-mono absolute -translate-x-1/2 text-[0.6875rem] text-ink" style={{ left: at(30) }}>
          need 30
        </span>
        <span data-usable className="t-mono absolute -translate-x-1/2 text-[0.6875rem] text-fail" style={{ left: at(40) }}>
          usable 40
        </span>
      </div>
      {ROWS.map((r) => (
        <div key={r.label} className="grid grid-cols-[8.5rem_1fr] items-center">
          <span className="truncate pr-3 text-[0.8125rem] text-ink-2">{r.label}</span>
          <div className="relative h-6">
            <span className="absolute inset-y-[11px] right-0 left-0 h-px bg-line" />
            <span className="absolute top-0 h-6 rounded-md border border-dashed border-line-strong" style={span(r.from, r.to)} />
            {r.label === "Pump install" && (
              <span
                className="absolute top-1 h-4 rounded-sm opacity-60"
                style={{ ...span(36, 40), backgroundImage: "repeating-linear-gradient(135deg, var(--brand) 0 1px, transparent 1px 5px)" }}
                title="Float"
              />
            )}
            <span data-bar data-shift={r.shift} className={cn("absolute top-0 h-6 rounded-md", r.tone)} style={span(r.from, r.to)} />
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[8.5rem_1fr]">
        <span />
        <div className="relative h-4">
          {[24, 28, 32, 36, 40, 44, 48, 52].map((d) => (
            <span key={d} className="t-mono absolute -translate-x-1/2 text-[0.625rem] text-ink-3" style={{ left: at(d) }}>
              {d}
            </span>
          ))}
        </div>
      </div>
      <p data-late className="t-mono justify-self-end rounded-full bg-fail/12 px-3 py-1 text-[0.75rem] text-fail">
        float absorbs 4 days, critical path moves 6
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const REQUEST = ["call check_compliance", "  requirement_set  RS-PUMP-04 rev C", "  configuration    candidate-a"];
const RESPONSE: Array<[string, string?]> = [
  ["return finding ", "PASS"],
  ["  evidence    head 36.1 m at 100 m³/h"],
  ["  source      curve sheet, page 4, row 12"],
  ["  confidence  0.91"],
];

export function TerminalDemo() {
  const root = useRef<HTMLPreElement>(null);
  useLoop(root, (tl) => {
    const q = gsap.utils.selector(root);
    tl.set(q("[data-type]"), { clipPath: "inset(0 100% 0 0)" }).set(q("[data-resp]"), { autoAlpha: 0, y: 4 }).set(q("[data-wait]"), { autoAlpha: 0 });
    q("[data-type]").forEach((line) => {
      const n = line.textContent?.length ?? 10;
      tl.to(line, { clipPath: "inset(0 0% 0 0)", duration: n * 0.035, ease: `steps(${n})` });
    });
    tl.to(q("[data-wait]"), { autoAlpha: 1, duration: 0.2 })
      .to(q("[data-wait]"), { autoAlpha: 0, duration: 0.2 }, "+=0.7")
      .to(q("[data-resp]"), { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.18, ease: "expo.out" })
      .to({}, { duration: 2.8 });
  });

  return (
    <pre ref={root} className="t-mono overflow-x-auto rounded-2xl bg-black/25 p-5 leading-relaxed text-[#e5eae0] ring-1 ring-white/8 ring-inset">
      <code className="grid">
        {REQUEST.map((l) => (
          <span key={l} data-type className="block whitespace-pre">
            {l.startsWith("call") ? (
              <>
                <span className="text-[#9fb58e]">call</span>
                {l.slice(4)}
              </>
            ) : (
              l
            )}
          </span>
        ))}
        <span data-wait className="block h-[1.55em] text-[#8d988c]">
          waiting for evidence
        </span>
        {RESPONSE.map(([l, pass]) => (
          <span key={l} data-resp className="block whitespace-pre">
            {l.startsWith("return") ? (
              <>
                <span className="text-[#9fb58e]">return</span>
                {l.slice(6)}
                <span className="text-[#7fd0a6]">{pass}</span>
              </>
            ) : (
              l
            )}
          </span>
        ))}
      </code>
    </pre>
  );
}

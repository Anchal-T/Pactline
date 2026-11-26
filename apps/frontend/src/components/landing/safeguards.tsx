"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "@phosphor-icons/react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/utils";

interface Rule {
  rule: string;
  attempt: string;
  check: string;
  verdict: string;
  where: string;
}

const GROUPS: Array<{ name: string; rules: Rule[] }> = [
  {
    name: "Authority",
    rules: [
      {
        rule: "Take a binding action without a named human approval",
        attempt: "place_order_change POL-118 candidate-a",
        check: "looking up approval for plan rev 3",
        verdict: "no approval on record for plan rev 3",
        where: "execution gateway",
      },
      {
        rule: "Reuse an approval after the spec, offer or plan changed",
        attempt: "execute plan rev 4 using AP-2207",
        check: "comparing pinned revisions",
        verdict: "AP-2207 is pinned to offer 2, offer 3 arrived",
        where: "execution gateway",
      },
      {
        rule: "Retry an uncertain write before reconciling it",
        attempt: "retry vendor_follow_up vf-118-0007",
        check: "reconcile vf-118-0007 with the vendor portal",
        verdict: "receipt already exists, retry skipped",
        where: "action outbox",
      },
      {
        rule: "Edit the baseline schedule",
        attempt: "update BASELINE activity 4.2 finish day 44",
        check: "reading revision type",
        verdict: "baseline revisions are immutable",
        where: "database constraint",
      },
    ],
  },
  {
    name: "Evidence",
    rules: [
      {
        rule: "Allocate the same purchase order quantity twice",
        attempt: "allocate POL-118 qty 2 to INC-0415",
        check: "locking POL-118, summing active allocations",
        verdict: "2 of 2 already allocated to INC-0412",
        where: "database row lock",
      },
      {
        rule: "Report a pass on missing evidence, or invent stock, prices or dates",
        attempt: "mark candidate-c PASS",
        check: "motor data sheet for candidate-c",
        verdict: "no evidence, result stays UNKNOWN",
        where: "equipment module",
      },
      {
        rule: "Close an incident on an email or a new ETA",
        attempt: "close INC-0412, vendor says delivered",
        check: "accepted quantity against required",
        verdict: "accepted 1 of 2, closure blocked",
        where: "incident state machine",
      },
      {
        rule: "Leave an open incident without an owner, a next step and a review date",
        attempt: "save INC-0412 with owner cleared",
        check: "open incident invariants",
        verdict: "owner, next action and review date are required",
        where: "database check constraint",
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.rules);

export function Safeguards() {
  const root = useRef<HTMLElement>(null);
  const term = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const touched = useRef(0);
  const visible = useRef(false);
  useReveal(root);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => (visible.current = !!e?.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    if (prefersReducedMotion()) return () => io.disconnect();
    const id = window.setInterval(() => {
      if (visible.current && Date.now() - touched.current > 10000) setActive((a) => (a + 1) % ALL.length);
    }, 4800);
    return () => {
      io.disconnect();
      window.clearInterval(id);
    };
  }, []);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !term.current) return;
      const q = gsap.utils.selector(term);
      const cmd = q("[data-cmd]")[0];
      const n = cmd?.textContent?.length ?? 20;
      gsap
        .timeline()
        .set(q("[data-step]"), { autoAlpha: 0, y: 4 })
        .fromTo(cmd ?? [], { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: Math.min(1.4, n * 0.03), ease: `steps(${n})` })
        .to(q("[data-step]"), { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.45, ease: "expo.out" }, "+=0.15");
    },
    { scope: term, dependencies: [active], revertOnUpdate: true },
  );

  const r = ALL[active]!;
  let index = 0;

  return (
    <section ref={root} id="safeguards" className="relative py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <div data-reveal className="max-w-[40rem]">
          <h2 className="t-h2 text-ink">Eight things Pactline will not do</h2>
          <p className="t-lead mt-5">Each one is enforced in the database or in deterministic code, never in a prompt. Pick one and watch the attempt fail.</p>
        </div>

        <div className="mt-10 grid gap-8 sm:mt-12 lg:grid-cols-12 lg:gap-10">
          <div className="grid gap-8 lg:col-span-6" data-reveal>
            {GROUPS.map((g) => (
              <div key={g.name}>
                <h3 className="t-label border-b border-line pb-3 text-ink-2">{g.name}</h3>
                <ol className="mt-2 grid">
                  {g.rules.map((rule) => {
                    const i = index++;
                    const on = i === active;
                    return (
                      <li key={rule.rule}>
                        <button
                          type="button"
                          onClick={() => {
                            touched.current = Date.now();
                            setActive(i);
                          }}
                          aria-pressed={on}
                          className={cn(
                            "grid w-full grid-cols-[2.25rem_1fr] items-baseline gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-ring",
                            on ? "bg-brand-soft" : "hover:bg-brand-soft/60",
                          )}
                        >
                          <span className={cn("t-numeral text-[1.9rem] transition-colors duration-300", on ? "text-brand" : "text-ink-3")}>{i + 1}</span>
                          <span className={cn("text-[0.9688rem] leading-snug transition-colors duration-300", on ? "text-ink" : "text-ink-2")}>{rule.rule}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
          </div>

          <div className="lg:col-span-6" data-reveal>
            <div className="lg:sticky lg:top-28">
              <div className="bezel">
                <div ref={term} className="bezel-core overflow-hidden bg-[#12291f] text-[#e5eae0] dark:bg-[#132b21]">
                  <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
                    <span className="flex items-center gap-2 text-[0.8125rem] text-[#bcc6ba]">
                      <ShieldCheck size={16} weight="light" className="text-[#7fd0a6]" />
                      Policy gateway
                    </span>
                    <span className="t-mono text-[#8d988c]">rule {active + 1} of 8</span>
                  </div>
                  <div className="t-mono grid min-h-[15rem] content-start gap-3 p-5 text-[0.8125rem] leading-relaxed sm:p-6" aria-live="polite">
                    <p className="whitespace-pre-wrap">
                      <span className="text-[#8d988c]">$ </span>
                      <span data-cmd key={active} className="inline-block">
                        {r.attempt}
                      </span>
                    </p>
                    <p data-step className="text-[#8d988c]">
                      {r.check}
                    </p>
                    <p data-step className="flex flex-wrap items-baseline gap-x-2.5">
                      <span className="rounded-md bg-[#d98472]/18 px-1.5 py-0.5 text-[#f0a493]">blocked</span>
                      <span>{r.verdict}</span>
                    </p>
                    <p data-step className="text-[#8d988c]">
                      enforced in <span className="text-[#c9dccb]">{r.where}</span>
                    </p>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[0.8125rem] text-ink-3">Sandbox attempts against synthetic records</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useRef } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import CountUp from "@/components/reactbits/count-up";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const STATEMENT =
  "A late switchboard never sends a warning of its own. It turns up as a crew standing in an empty plant room, weeks after the signs sat unread in a schedule, a purchase order and a vendor email.";

const FIGURES: Array<{ from?: number; to: number; label: string }> = [
  { to: 37, label: "Switchgear and switchboards" },
  { to: 56, label: "Generators" },
  { from: 66, to: 132, label: "Some medium-voltage equipment" },
];

export function Problem() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const words = gsap.utils.toArray<HTMLElement>("[data-word]");
      gsap.set(words, { opacity: 0.22 });
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px)", () => {
        gsap.to(words, {
          opacity: 1,
          ease: "none",
          stagger: 0.08,
          scrollTrigger: { trigger: stage.current, start: "top top", end: "+=75%", pin: true, scrub: 0.5 },
        });
      });
      mm.add("(max-width: 767px)", () => {
        gsap.to(words, { opacity: 1, ease: "none", stagger: 0.08, scrollTrigger: { trigger: stage.current, start: "top 85%", end: "center 45%", scrub: 0.5 } });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="problem" className="relative">
      <div ref={stage} className="flex flex-col justify-center gap-10 py-12 md:min-h-[100dvh] md:gap-14 md:py-16">
        <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-6">
          <p className="t-h2 max-w-[26ch] text-ink" aria-label={STATEMENT}>
            {STATEMENT.split(" ").map((w, i) => (
              <span key={i} aria-hidden data-word className="inline-block pr-[0.24em]">
                {w}
              </span>
            ))}
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-4">
            <h2 className="text-[1.0625rem] font-medium text-ink">Lead times on the equipment that holds up a building</h2>
            <a
              href="https://www.dpr.com/view/q4-2026-market-conditions-report"
              target="_blank"
              rel="noreferrer"
              className="mt-3 block max-w-[22rem] text-sm text-ink-3 underline decoration-line-strong underline-offset-4 transition-colors duration-200 hover:text-ink"
            >
              DPR Construction, Q4 2026 market conditions{" "}
              <span className="whitespace-nowrap">
                report
                <ArrowUpRight size={13} weight="light" className="ml-1 inline-block align-[-1px]" />
              </span>
            </a>
            <p className="mt-1.5 text-[0.8125rem] text-ink-3">Internal lead-time estimates, cited as industry context</p>
          </div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-[1fr_1fr_1.45fr] lg:col-span-8">
            {FIGURES.map((f) => (
              <li key={f.label} className="border-t border-line-strong pt-5 last:col-span-2 sm:last:col-span-1">
                <p className="flex items-baseline gap-2 whitespace-nowrap text-ink">
                  <span className="t-numeral text-[clamp(2.8rem,2rem+2.4vw,4.6rem)]">
                    {f.from !== undefined && (
                      <>
                        <CountUp to={f.from} duration={1.4} mode="roll" />-
                      </>
                    )}
                    <CountUp to={f.to} duration={1.6} mode="roll" />
                  </span>
                  <span className="text-sm text-ink-3">weeks</span>
                </p>
                <p className="mt-2 text-[0.9375rem] text-ink-2">{f.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

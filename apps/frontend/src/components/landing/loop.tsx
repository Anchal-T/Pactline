"use client";

import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useReveal } from "@/lib/use-reveal";
import { AgentChip } from "@/components/demo/agent-chip";
import type { AgentId } from "@/lib/agents";

const STAGES: Array<{ verb: string; who: AgentId[]; body: string; record: Array<[string, string]> }> = [
  {
    verb: "Observe",
    who: ["op"],
    body: "Reads schedule revisions, PO acknowledgements, vendor emails and receiving logs as events, not as documents to summarise.",
    record: [["event", "VendorCommitmentChanged"], ["subject", "POL-118, pumps x2"], ["arrival", "day 30 to day 38"]],
  },
  {
    verb: "Interpret",
    who: ["sch"],
    body: "Links the event to the package, the activity that needs it, and the float the schedule actually has.",
    record: [["need date", "day 30"], ["usable date", "day 40"], ["impact", "critical, float 4 days"]],
  },
  {
    verb: "Plan",
    who: ["op", "inv", "cmp", "src"],
    body: "Delegates investigation, compliance and sourcing to specialists, in parallel where the work allows it.",
    record: [["tasks", "3 dispatched"], ["pinned to", "schedule rev 14"], ["budget", "2 attempts each"]],
  },
  {
    verb: "Act",
    who: ["gw"],
    body: "Sends the follow-ups it is allowed to send. Anything binding waits for a named human approval.",
    record: [["action", "vendor follow-up"], ["approval", "not required"], ["key", "vf-118-0007"]],
  },
  {
    verb: "Verify",
    who: ["op", "hu"],
    body: "Checks the world, not the tool response: received, inspected and accepted quantities against the need.",
    record: [["received", "2 of 2"], ["accepted", "1 of 2"], ["closure", "blocked"]],
  },
  {
    verb: "Maintain",
    who: ["op"],
    body: "Keeps watching after mitigation. A new ETA is a claim about the future, not a delivery.",
    record: [["state", "mitigated"], ["owner", "expediting"], ["next review", "day 33"]],
  },
  {
    verb: "Recover",
    who: ["op", "gw"],
    body: "Reopens the incident when evidence breaks the plan, and resumes after a restart without repeating an action.",
    record: [["trigger", "new ETA, day 41"], ["state", "investigating"], ["duplicate sends", "0"]],
  },
];

export function Loop() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  useReveal(root);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const t = track.current;
        const s = stage.current;
        if (!t || !s) return;
        const distance = () => Math.max(0, t.scrollWidth - s.clientWidth);
        const st = { trigger: s, start: "top top", end: () => `+=${distance()}`, scrub: 1, invalidateOnRefresh: true };
        gsap.to(t, { x: () => -distance(), ease: "none", scrollTrigger: { ...st, pin: true } });
        gsap.fromTo(meter.current, { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: st });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="loop" className="relative">
      <div ref={stage} className="relative flex h-[100svh] flex-col justify-start gap-6 overflow-hidden pt-24 pb-4 md:justify-start md:gap-8 md:pt-28 md:pb-8 motion-reduce:h-auto motion-reduce:py-12">
        <div className="mx-auto w-full max-w-[1180px] px-5 sm:px-6" data-reveal>
          <h2 className="t-h2 max-w-[18ch] text-ink">One <em className="gold-word">{"loop "}</em>, run until the job is done</h2>
          <p className="t-lead mt-3 max-w-[36rem]">
            The operator holds one standing responsibility - compliant equipment, available on the date the work needs it.
          </p>
        </div>

        <div
          ref={track}
          className="flex gap-4 px-5 [scrollbar-width:none] sm:gap-5 md:pl-[max(1.5rem,calc((100vw-1180px)/2+1.5rem))] md:pr-[max(1.5rem,calc((100vw-1180px)/2+1.5rem))] motion-reduce:snap-x motion-reduce:snap-mandatory motion-reduce:overflow-x-auto motion-reduce:pb-4"
        >
          {STAGES.map((s) => (
            <article key={s.verb} className="bezel w-[min(82vw,380px)] shrink-0 snap-start">
              <div className="bezel-core flex h-full min-h-[17.5rem] flex-col p-5 sm:min-h-[20rem] sm:p-7 lg:min-h-[clamp(17rem,calc(100svh-28.5rem),24rem)]">
                <div className="flex items-start justify-between gap-4">
                  <h3 className="font-display text-[2.6rem] leading-none font-normal tracking-[-0.025em] text-ink">{s.verb}</h3>
                  <span className="flex -space-x-1.5 pt-1">
                    {s.who.map((id) => (
                      <AgentChip key={id} id={id} size={24} ring />
                    ))}
                  </span>
                </div>
                <p className="t-body mt-5 mb-5">{s.body}</p>
                <dl className="t-mono mt-auto grid gap-2 border-t-[1.5px] border-gold-line pt-5">
                  {s.record.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-6">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="text-right text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          ))}
        </div>
        <div aria-hidden className="mx-auto h-px w-[calc(100%-2.5rem)] max-w-[1132px] bg-line motion-reduce:hidden">
          <div ref={meter} className="h-full origin-left scale-x-0 bg-brand" />
        </div>
      </div>
    </section>
  );
}

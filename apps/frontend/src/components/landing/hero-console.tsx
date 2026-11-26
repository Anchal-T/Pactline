"use client";

import { useEffect, useRef, useState } from "react";
import { AgentChip } from "@/components/demo/agent-chip";
import type { AgentId } from "@/lib/agents";
import { prefersReducedMotion } from "@/lib/gsap";

const FEED: Array<{ who: AgentId; text: string }> = [
  { who: "op", text: "Vendor moved arrival to day 38. Opened INC-0412" },
  { who: "sch", text: "Usable day 40 against need day 30. Critical by 6" },
  { who: "inv", text: "Backlog is claimed, not confirmed. Asked for test date" },
  { who: "src", text: "3 alternatives found from other manufacturers" },
  { who: "cmp", text: "Candidate A passes at 100 m³/h. B fails head" },
  { who: "hu", text: "Engineer of record approved AP-2207" },
  { who: "gw", text: "Order change sent once. Receipt vf-118-0007" },
  { who: "op", text: "Mitigated. Watching delivery until both are accepted" },
];

const CREW: AgentId[] = ["op", "inv", "cmp", "src", "hu"];
const VISIBLE = 4;

export function HeroConsole() {
  const [count, setCount] = useState(VISIBLE);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
    if (box.current) io.observe(box.current);
    const id = window.setInterval(() => {
      if (visible && !document.hidden) setCount((c) => c + 1);
    }, 2300);
    return () => {
      window.clearInterval(id);
      io.disconnect();
    };
  }, []);

  const items = Array.from({ length: VISIBLE }, (_, i) => {
    const n = count - 1 - i;
    return { n, ...FEED[((n % FEED.length) + FEED.length) % FEED.length]! };
  });

  return (
    <div ref={box} className="w-[22rem]">
      <div className="bezel">
        <div className="bezel-core w-full p-3 shadow-[0_24px_60px_-36px_rgb(15_58_43/0.45)] dark:shadow-[0_24px_60px_-30px_rgb(0_0_0/0.7)]">
          <div className="flex items-center justify-between gap-3 px-1">
            <div className="grid">
              <span className="t-mono text-[0.6875rem] text-ink-3">INC-0412</span>
              <span className="text-[0.875rem] font-medium text-ink">Chilled-water pumps, Tower B</span>
            </div>
            <div className="flex -space-x-1.5">
              {CREW.map((id) => (
                <AgentChip key={id} id={id} size={24} ring />
              ))}
            </div>
          </div>
          <ol className="mt-3 grid gap-1.5" aria-label="Sandbox replay of the operator's activity">
            {items.map((it, i) => (
              <li
                key={it.n}
                className="flex items-center gap-2.5 rounded-2xl bg-surface-2/55 px-2.5 py-2 transition-opacity duration-500 animate-in fade-in-0 slide-in-from-top-3 ease-out-strong"
                style={{ opacity: 1 - i * 0.18 }}
              >
                <AgentChip id={it.who} size={24} />
                <span className="text-[0.8125rem] leading-snug text-ink-2">{it.text}</span>
              </li>
            ))}
          </ol>
          <p className="t-mono mt-2.5 px-1 text-[0.6875rem] text-ink-3">Sandbox replay, synthetic data</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { HandGrabbing } from "@phosphor-icons/react";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/utils";

const RECORDS: Array<{ kind: string; id: string; facts: Array<[string, string]> }> = [
  { kind: "Project", id: "HVAC-CHW, Tower B", facts: [["calendar", "5-day week"], ["schedule", "rev 14, current"]] },
  { kind: "Equipment package", id: "P-CHW-01A/B", facts: [["need", "2 pumps by day 30"], ["spec", "RS-PUMP-04 rev C"]] },
  { kind: "PO line", id: "POL-118", facts: [["quantity", "2"], ["allocated", "2 of 2"]] },
  { kind: "Vendor commitment", id: "VC-118-06", facts: [["arrival", "day 38"], ["kind", "forecast, not promise"]] },
  { kind: "Compliance finding", id: "CF-A-HEAD", facts: [["result", "PASS"], ["confidence", "0.91"]] },
  { kind: "Approval", id: "AP-2207", facts: [["pinned to", "spec C, offer 2"], ["expires", "day 36"]] },
];

const BASE = { rx: 57, rz: -38 };
const GAP = 46;

export function WorldModel() {
  const root = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const touched = useRef(0);
  const scrolled = useRef(0);
  const visible = useRef(false);
  const drag = useRef<{ x: number; y: number; rz: number; rx: number } | null>(null);
  const user = useRef({ rz: 0, rx: 0 });
  const tilt = useRef<{ rz: (v: number) => void; rx: (v: number) => void } | null>(null);
  useReveal(root);

  useGSAP(
    () => {
      const plates = gsap.utils.toArray<HTMLElement>("[data-plate]");
      const pose = { rx: BASE.rx, rz: BASE.rz };
      const apply = () => {
        if (stack.current) stack.current.style.transform = `rotateX(${pose.rx}deg) rotateZ(${pose.rz}deg)`;
      };
      apply();
      const reduce = prefersReducedMotion();
      const dur = reduce ? 0 : 0.9;
      tilt.current = {
        rz: gsap.quickTo(pose, "rz", { duration: dur, ease: "power3.out", onUpdate: apply }),
        rx: gsap.quickTo(pose, "rx", { duration: dur, ease: "power3.out", onUpdate: apply }),
      };

      if (reduce) {
        plates.forEach((p, i) => gsap.set(p, { z: i * GAP }));
      } else {
        plates.forEach((p, i) => gsap.set(p, { z: i * 10 }));
        ScrollTrigger.create({
          trigger: wrap.current,
          start: "top 75%",
          once: true,
          onEnter: () => gsap.to(plates, { z: (i: number) => i * GAP, duration: 1.4, ease: "expo.out", stagger: 0.05 }),
        });
      }
      ScrollTrigger.create({ trigger: wrap.current, start: "top bottom", end: "bottom top", onToggle: (s) => (visible.current = s.isActive) });

      // Scrolling walks the pulled-out record through the stack; clicks and idle shuffling still work around it.
      const follow = (self: ScrollTrigger) => {
        scrolled.current = Date.now();
        setActive(Math.min(RECORDS.length - 1, Math.floor(self.progress * RECORDS.length)));
      };
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px)", () => {
        // Centre the block in the viewport, but never closer than 7rem to the top so the navbar never covers the heading.
        const start = () => `top ${Math.max(112, (window.innerHeight - (grid.current?.offsetHeight ?? 0)) / 2)}px`;
        ScrollTrigger.create({ trigger: grid.current, start, end: "+=130%", pin: true, invalidateOnRefresh: true, onUpdate: follow });
      });
      mm.add("(max-width: 1023px)", () => {
        ScrollTrigger.create({ trigger: wrap.current, start: "top 70%", end: "bottom 30%", onUpdate: follow });
      });
    },
    { scope: root },
  );

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      if (!visible.current || now - touched.current < 3000 || now - scrolled.current < 3000) return;
      setActive((a) => (a + 1) % RECORDS.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, []);

  const pick = (i: number) => {
    touched.current = Date.now();
    setActive(i);
  };

  const aim = (rz: number, rx: number) => {
    tilt.current?.rz(BASE.rz + rz);
    tilt.current?.rx(BASE.rx + rx);
  };

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (drag.current) {
      user.current = {
        rz: Math.max(-90, Math.min(90, drag.current.rz + (e.clientX - drag.current.x) * 0.35)),
        rx: Math.max(-22, Math.min(18, drag.current.rx - (e.clientY - drag.current.y) * 0.15)),
      };
      aim(user.current.rz, user.current.rx);
      return;
    }
    if (e.pointerType !== "mouse") return;
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    aim(user.current.rz + px * 10, user.current.rx - py * 6);
  };

  return (
    <section ref={root} id="world" className="relative overflow-x-clip pt-6 pb-12 sm:py-16 lg:py-6">
      <div ref={grid} className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 sm:px-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5" data-reveal>
          <h2 className="t-h2 max-w-[13ch] text-ink">A <em className="gold-word">{"world model "}</em>, not a chat log</h2>
          <p className="t-lead mt-5 max-w-[30rem]">
            Every promise, revision and approval is a versioned record. The operator reasons over facts it can cite, and an approval only counts for the exact revision it names.
          </p>
          <ol className="mt-8 grid gap-1">
            {RECORDS.map((r, i) => (
              <li key={r.kind}>
                <button
                  type="button"
                  onClick={() => pick(i)}
                  aria-pressed={i === active}
                  className={cn(
                    "flex w-full items-baseline justify-between gap-6 rounded-full px-4 py-2 text-left text-[0.9375rem] outline-none transition-[background-color,color] duration-300 focus-visible:ring-2 focus-visible:ring-ring",
                    i === active ? "bg-brand-soft text-ink" : "text-ink-3 hover:text-ink",
                  )}
                >
                  <span>{r.kind}</span>
                  <span className="t-mono">{r.id}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="lg:col-span-7" data-reveal>
          <div
            ref={wrap}
            onPointerDown={(e) => {
              touched.current = Date.now();
              drag.current = { x: e.clientX, y: e.clientY, ...user.current };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onPointerLeave={() => !drag.current && aim(user.current.rz, user.current.rx)}
            onDoubleClick={() => {
              user.current = { rz: 0, rx: 0 };
              aim(0, 0);
            }}
            className="relative grid h-[22rem] cursor-grab touch-pan-y place-items-center select-none [perspective:1700px] active:cursor-grabbing sm:h-[28rem] lg:h-[31rem]"
          >
            <div className="translate-x-12 translate-y-8 scale-[0.84] [perspective:1700px] sm:translate-x-0 sm:translate-y-20 sm:scale-100">
            <div
              ref={stack}
              className="relative h-[11.5rem] w-[17rem] [transform-style:preserve-3d] sm:h-[14rem] sm:w-[21rem]"
              style={{ transform: `rotateX(${BASE.rx}deg) rotateZ(${BASE.rz}deg)` }}
            >
              {RECORDS.map((r, i) => (
                <div key={r.kind} data-plate data-active={i === active} className="group absolute inset-0 [transform-style:preserve-3d]" style={{ zIndex: i }}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => pick(i)}
                    className="flex h-full w-full flex-col justify-between rounded-[1.25rem] border border-line-strong bg-surface p-4 text-left shadow-[0_30px_60px_-40px_rgb(15_58_43/0.45)] transition-[border-color,translate] duration-500 ease-out-strong group-data-[active=true]:-translate-x-[42%] group-data-[active=true]:border-brand motion-reduce:transition-none sm:p-5 dark:shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)]"
                  >
                    <span className="flex items-baseline justify-between gap-4">
                      <span className="font-display text-[1.25rem] leading-none text-ink sm:text-[1.35rem]">{r.kind}</span>
                      <span className="t-mono text-ink-3 group-data-[active=true]:text-brand">{r.id}</span>
                    </span>
                    <span className="t-mono grid gap-1 opacity-30 transition-opacity duration-300 group-data-[active=true]:opacity-100">
                      {r.facts.map(([k, v]) => (
                        <span key={k} className="flex justify-between gap-6">
                          <span className="text-ink-3">{k}</span>
                          <span className="text-ink">{v}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            </div>
          </div>
          <p className="mt-2 flex items-center justify-center gap-2 text-[0.8125rem] text-ink-3">
            <HandGrabbing size={15} weight="light" />
            Scroll, select a record or drag to turn the stack. Sandbox records.
          </p>
        </div>
      </div>
    </section>
  );
}

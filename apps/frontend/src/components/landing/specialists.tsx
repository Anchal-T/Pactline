"use client";

import { useRef, type ReactNode } from "react";
import { AgentChip } from "@/components/demo/agent-chip";
import { PumpCurve } from "@/components/demo/pump-curve";
import { GanttDemo, InvestigationDemo, SourcingDemo, TerminalDemo } from "@/components/demo/live-tiles";
import { Watercolor } from "@/components/art/watercolor";
import type { AgentId } from "@/lib/agents";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/utils";

function Tile({ className, core, children }: { className?: string; core?: string; children: ReactNode }) {
  return (
    <article className={cn("bezel", className)} data-reveal>
      <div className={cn("bezel-core relative flex h-full flex-col overflow-hidden p-6 sm:p-8", core)}>{children}</div>
    </article>
  );
}

function TileHead({ who, title, body, className, dark }: { who: AgentId; title: string; body: string; className?: string; dark?: boolean }) {
  return (
    <div className={cn("relative grid gap-2.5", className)}>
      <div className="flex items-center gap-2.5">
        <AgentChip id={who} size={26} />
        <h3 className="t-h3">{title}</h3>
      </div>
      <p className={cn("max-w-[34rem] text-[0.9375rem] leading-relaxed", dark ? "text-[#bcc6ba]" : "text-ink-2")}>{body}</p>
    </div>
  );
}

export function Specialists() {
  const root = useRef<HTMLElement>(null);
  useReveal(root);

  return (
    <section ref={root} id="specialists" className="relative py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <div data-reveal className="max-w-[40rem]">
          <span className="gold-rule mb-6" aria-hidden />
          <h2 className="t-h2 text-ink"><em className="gold-word">Specialists</em> that hand off cleanly</h2>
          <p className="t-lead mt-5">Each one works alone or in sequence, returns structured output with sources, and hands the decision to a person when it is unsure.</p>
        </div>

        <div className="mt-10 grid gap-4 sm:mt-12 sm:gap-5 lg:grid-cols-12">
          <Tile className="lg:col-span-7" core="isolate">
            <Watercolor
              seed={31}
              className="-z-10"
              blobs={[
                { cx: 380, cy: 20, rx: 110, ry: 60, fill: "var(--sage)", o: 0.45 },
                { cx: 420, cy: 120, rx: 40, ry: 50, fill: "var(--olive)", o: 0.22 },
              ]}
            />
            <TileHead who="cmp" title="Engineering compliance" body="Tests the exact configuration at the duty point, by interpolation inside the tested range. Missing evidence stays unknown, never a pass." />
            <div className="mt-6">
              <PumpCurve />
            </div>
          </Tile>

          <Tile className="lg:col-span-5">
            <TileHead who="inv" title="Investigation" body="Reconciles conflicting dates and stale promises, then asks for the evidence that would settle it." />
            <div className="mt-6 flex-1">
              <InvestigationDemo />
            </div>
          </Tile>

          <Tile className="lg:col-span-5">
            <TileHead who="src" title="Alternative sourcing" body="Finds equivalents from other manufacturers and proves each one against the original requirement, not a brochure." />
            <div className="mt-6">
              <SourcingDemo />
            </div>
          </Tile>

          <Tile className="lg:col-span-7" core="bg-[#12291f] text-[#e5eae0] dark:bg-[#132b21]">
            <TileHead who="op" dark title="Callable by Amber" body="Every specialist is an MCP tool with structured input, cited output and a confidence score." />
            <div className="mt-6">
              <TerminalDemo />
            </div>
            <p className="mt-3 text-[0.75rem] text-[#8d988c]">Sandbox call with synthetic data</p>
          </Tile>

          <Tile className="lg:col-span-12" core="lg:grid lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-center lg:gap-14 lg:p-10">
            <TileHead who="sch" title="Schedule engine" body="Deterministic critical-path math, no model involved. A ten-day slip becomes a six-day problem when four days of float exist." />
            <div className="mt-8 lg:mt-0">
              <GanttDemo />
            </div>
          </Tile>
        </div>
      </div>
    </section>
  );
}

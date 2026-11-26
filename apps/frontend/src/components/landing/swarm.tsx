"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowCounterClockwise, CalendarDots, EnvelopeSimple, Pause, Play, Receipt, type Icon } from "@phosphor-icons/react";
import { AgentChip } from "@/components/demo/agent-chip";
import { AGENTS, KIND_LABEL, type AgentId } from "@/lib/agents";
import { gsap, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useReveal } from "@/lib/use-reveal";
import { cn } from "@/lib/utils";

type SourceId = "mail" | "rev" | "po";
type NodeId = AgentId | SourceId;
type Layout = "wide" | "tall";
type Status = "idle" | "busy" | "wait" | "done";

const SOURCES: Record<SourceId, { label: string; short: string; icon: Icon }> = {
  mail: { label: "Vendor email", short: "Email", icon: EnvelopeSimple },
  rev: { label: "Schedule rev 14", short: "Schedule", icon: CalendarDots },
  po: { label: "PO acknowledgement", short: "PO ack", icon: Receipt },
};

const LAYOUTS: Record<Layout, { w: number; h: number; pos: Record<NodeId, [number, number]> }> = {
  wide: {
    w: 820,
    h: 520,
    pos: { mail: [96, 132], rev: [96, 260], po: [96, 388], op: [396, 260], gw: [396, 62], hu: [396, 458], inv: [690, 92], sch: [712, 206], cmp: [712, 316], src: [690, 430] },
  },
  tall: {
    w: 360,
    h: 680,
    pos: { mail: [62, 40], rev: [180, 40], po: [298, 40], op: [180, 200], inv: [92, 348], sch: [268, 348], cmp: [92, 452], src: [268, 452], gw: [92, 600], hu: [268, 600] },
  },
};

const EDGES: Array<[NodeId, NodeId]> = [
  ["mail", "op"],
  ["rev", "op"],
  ["po", "op"],
  ["op", "inv"],
  ["op", "sch"],
  ["op", "cmp"],
  ["op", "src"],
  ["op", "gw"],
  ["op", "hu"],
];

const PHASES = ["Detect", "Investigate", "Source", "Check", "Decide", "Approve", "Execute", "Monitor"] as const;
const PHASE_AT = [0, 1.8, 4.6, 6, 7.6, 8, 9.8, 12.2];

const AGENT_NODES: AgentId[] = ["op", "inv", "sch", "cmp", "src", "gw", "hu"];

interface NodeState {
  s: Status;
  note: string;
}

interface LogEntry {
  key: number;
  who: AgentId | "ev";
  text: string;
  time: string;
}

const IDLE: Record<AgentId, NodeState> = {
  op: { s: "idle", note: "Watching POL-118" },
  inv: { s: "idle", note: "Ready" },
  sch: { s: "idle", note: "Ready" },
  cmp: { s: "idle", note: "Ready" },
  src: { s: "idle", note: "Ready" },
  gw: { s: "idle", note: "No pending actions" },
  hu: { s: "idle", note: "No requests" },
};

const FINAL: Record<AgentId, NodeState> = {
  op: { s: "done", note: "Mitigated, review day 33" },
  inv: { s: "done", note: "Confidence 0.62" },
  sch: { s: "done", note: "Critical by 6 days" },
  cmp: { s: "done", note: "A pass, B fail, C unknown" },
  src: { s: "done", note: "3 candidates" },
  gw: { s: "done", note: "0 duplicate sends" },
  hu: { s: "done", note: "Approved AP-2207" },
};

type Script = Array<[number, AgentId | "ev", string]>;

const LOG_SCRIPT: Script = [
  [0.9, "ev", "Vendor email moves pump arrival from day 30 to day 38"],
  [1.4, "op", "Opened INC-0412 and pinned schedule rev 14"],
  [1.9, "op", "Dispatched schedule impact and investigation in parallel"],
  [3.2, "sch", "Usable day 40 against 4 days of float. Critical by 6"],
  [4.1, "inv", "Backlog is vendor-stated. Test date missing. Confidence 0.62"],
  [5.8, "src", "Found candidates A, B and C from other manufacturers"],
  [7.3, "cmp", "A passes at the duty point. B fails head. C stays unknown"],
  [7.7, "op", "Ranked plans after hard constraints. Recommends substitute A"],
  [8.1, "op", "Requested approval AP-2207, pinned to spec rev C"],
  [9.4, "hu", "Approved AP-2207 for candidate A"],
  [10.8, "gw", "Executed the order change once. Key vf-118-0007"],
  [11.6, "gw", "Confirmation timed out. Reconciled first: 0 duplicates"],
  [12.3, "op", "Mitigated. Closure waits for 2 accepted pumps"],
];

const clock = (t: number) => {
  const m = 14 + Math.round(t * 4);
  return `09:${String(m).padStart(2, "0")}`;
};

function edgePath(layout: Layout, a: NodeId, b: NodeId) {
  const L = LAYOUTS[layout];
  const [ax, ay] = L.pos[a];
  const [bx, by] = L.pos[b];
  const vertical = layout === "tall" || Math.abs(bx - ax) < 40;
  if (vertical) {
    const my = (ay + by) / 2;
    return `M${ax} ${ay}C${ax} ${my} ${bx} ${my} ${bx} ${by}`;
  }
  const mx = (ax + bx) / 2;
  return `M${ax} ${ay}C${mx} ${ay} ${mx} ${by} ${bx} ${by}`;
}

const finalLog = (): LogEntry[] => LOG_SCRIPT.map(([t, who, text], i) => ({ key: i, who, text, time: clock(t) })).reverse();

export function Swarm() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const edges = useRef<Record<string, SVGPathElement | null>>({});
  const dots = useRef<Array<SVGCircleElement | null>>([]);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const phaseRef = useRef(0);
  const phaseIndexRef = useRef(0);
  const playingRef = useRef(true);
  const logKey = useRef(100);

  const [layout, setLayout] = useState<Layout>("wide");
  const [nodes, setNodes] = useState<Record<AgentId, NodeState>>(IDLE);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [selected, setSelected] = useState<AgentId>("op");
  useReveal(root);

  useLayoutEffect(() => {
    const el = stage.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setLayout(el.clientWidth < 620 ? "tall" : "wide"));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The graph changes height when it switches layout, which moves every pinned section below it.
  useEffect(() => {
    ScrollTrigger.refresh();
  }, [layout]);

  const setNode = useCallback((id: AgentId, s: Status, note: string) => setNodes((n) => ({ ...n, [id]: { s, note } })), []);

  useGSAP(
    () => {
      if (prefersReducedMotion()) {
        setNodes(FINAL);
        setLog(finalLog());
        setPhase(PHASES.length - 1);
        setPlaying(false);
        return;
      }

      const t = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 2.6 });
      let dotIndex = 0;

      const send = (from: NodeId, to: NodeId, at: number, dur = 0.85) => {
        const forward = edges.current[`${from}-${to}`];
        const edge = forward ?? edges.current[`${to}-${from}`];
        if (!edge) return;
        const reverse = !forward;
        const dot = dots.current[dotIndex++ % dots.current.length];
        if (!dot) return;
        const color = from in AGENTS ? AGENTS[from as AgentId].color : "var(--brand)";
        const p = { t: 0 };
        t.fromTo(
          p,
          { t: 0 },
          {
            t: 1,
            duration: dur,
            ease: "power1.inOut",
            immediateRender: false,
            onStart: () => {
              dot.style.fill = color;
              dot.style.opacity = "1";
              edge.style.stroke = color;
              edge.style.strokeOpacity = "0.9";
            },
            onUpdate: () => {
              const len = edge.getTotalLength();
              const pt = edge.getPointAtLength((reverse ? 1 - p.t : p.t) * len);
              dot.setAttribute("cx", String(pt.x));
              dot.setAttribute("cy", String(pt.y));
            },
            onComplete: () => {
              dot.style.opacity = "0";
              edge.style.stroke = "";
              edge.style.strokeOpacity = "";
            },
          },
          at,
        );
      };
      const at = (time: number, fn: () => void) => t.call(fn, [], time);

      at(0, () => {
        setNodes(IDLE);
        setLog([]);
      });
      PHASE_AT.forEach((p, i) => at(p, () => (phaseRef.current = i)));
      LOG_SCRIPT.forEach(([time, who, text]) =>
        at(time, () => setLog((l) => [{ key: logKey.current++, who, text, time: clock(time) }, ...l].slice(0, 7))),
      );

      send("mail", "op", 0.1);
      at(1, () => setNode("op", "busy", "Opening INC-0412"));
      send("rev", "op", 1.2, 0.6);
      send("op", "sch", 1.9);
      send("op", "inv", 1.9);
      at(2.7, () => {
        setNode("sch", "busy", "Computing float");
        setNode("inv", "busy", "Reconciling dates");
      });
      send("po", "op", 2.5, 0.6);
      send("sch", "op", 3.0, 0.7);
      at(3.2, () => setNode("sch", "done", "Critical by 6 days"));
      send("inv", "op", 3.9, 0.7);
      at(4.1, () => setNode("inv", "done", "Confidence 0.62"));
      send("op", "src", 4.6);
      at(5.4, () => setNode("src", "busy", "Searching catalogs"));
      send("src", "op", 5.6, 0.7);
      at(5.8, () => setNode("src", "done", "3 candidates"));
      send("op", "cmp", 6.0);
      at(6.8, () => setNode("cmp", "busy", "Checking duty point"));
      send("cmp", "op", 7.1, 0.7);
      at(7.3, () => setNode("cmp", "done", "A pass, B fail, C unknown"));
      at(7.7, () => setNode("op", "busy", "Plan: substitute A"));
      send("op", "hu", 8.0);
      at(8.8, () => setNode("hu", "wait", "Reviewing AP-2207"));
      send("hu", "op", 9.2, 0.7);
      at(9.4, () => setNode("hu", "done", "Approved AP-2207"));
      send("op", "gw", 9.8);
      at(10.6, () => setNode("gw", "busy", "Executing once"));
      at(10.8, () => setNode("gw", "done", "Receipt vf-118-0007"));
      at(11.6, () => setNode("gw", "done", "0 duplicate sends"));
      at(12.3, () => setNode("op", "done", "Mitigated, review day 33"));

      t.eventCallback("onUpdate", () => {
        if (phaseRef.current !== phaseIndexRef.current) {
          phaseIndexRef.current = phaseRef.current;
          setPhase(phaseRef.current);
        }
      });

      tl.current = t;
      ScrollTrigger.create({
        trigger: stage.current,
        start: "top 75%",
        end: "bottom 15%",
        onToggle: (self) => {
          if (self.isActive && playingRef.current) t.play();
          else t.pause();
        },
      });
    },
    { scope: root },
  );

  const toggle = () => {
    const t = tl.current;
    if (!t) {
      setNodes(IDLE);
      setLog([]);
      return;
    }
    playingRef.current = !playing;
    setPlaying(!playing);
    if (playing) t.pause();
    else t.play();
  };

  const replay = () => {
    const t = tl.current;
    if (!t) return;
    playingRef.current = true;
    setPlaying(true);
    t.restart();
  };

  const L = LAYOUTS[layout];
  const pct = (id: NodeId) => ({ left: `${(L.pos[id][0] / L.w) * 100}%`, top: `${(L.pos[id][1] / L.h) * 100}%` });
  const agent = AGENTS[selected];

  return (
    <section ref={root} id="decide" className="relative py-12 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-[1180px] px-5 sm:px-6">
        <div data-reveal className="max-w-[40rem]">
          <h2 className="t-h2 text-ink">Watch the operator decide</h2>
          <p className="t-lead mt-5">
            One late delivery, handled by a small team of agents. Each one does a bounded job, returns evidence, and stops where a person has to sign. Select any node to see its contract.
          </p>
        </div>

        <div className="bezel mt-10 sm:mt-12" data-reveal>
          <div className="bezel-core grid overflow-hidden lg:grid-cols-[1fr_21rem]">
            <div className="relative border-line p-4 sm:p-6 lg:border-r">
              <div ref={stage} className="relative mx-auto w-full rounded-2xl bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:18px_18px]" style={{ aspectRatio: `${L.w} / ${L.h}`, maxWidth: layout === "tall" ? 420 : undefined }}>
                <svg viewBox={`0 0 ${L.w} ${L.h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
                  {EDGES.map(([a, b]) => (
                    <path
                      key={`${a}-${b}`}
                      ref={(el) => {
                        edges.current[`${a}-${b}`] = el;
                      }}
                      d={edgePath(layout, a, b)}
                      fill="none"
                      stroke="var(--line-strong)"
                      strokeWidth={1.25}
                      vectorEffect="non-scaling-stroke"
                      className="transition-[stroke,stroke-opacity] duration-300"
                    />
                  ))}
                  {Array.from({ length: 8 }, (_, i) => (
                    <circle
                      key={i}
                      ref={(el) => {
                        dots.current[i] = el;
                      }}
                      r={layout === "tall" ? 5 : 4.5}
                      cx={-20}
                      cy={-20}
                      style={{ opacity: 0, stroke: "var(--surface)", strokeWidth: 2 }}
                    />
                  ))}
                </svg>

                {(Object.keys(SOURCES) as SourceId[]).map((id) => {
                  const S = SOURCES[id];
                  return (
                    <div key={id} className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(id)}>
                      <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[0.75rem] whitespace-nowrap text-ink-2 shadow-[0_1px_2px_rgb(15_58_43/0.08)] ring-1 ring-line-strong ring-inset sm:text-[0.8125rem]">
                        <S.icon size={14} weight="light" className="text-brand" />
                        {layout === "tall" ? S.short : S.label}
                      </span>
                    </div>
                  );
                })}

                {AGENT_NODES.map((id) => (
                  <NodeCard key={id} id={id} state={nodes[id]} selected={selected === id} onSelect={() => setSelected(id)} style={pct(id)} compact={layout === "tall"} />
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 sm:mt-5">
                <div className="flex items-center gap-1">
                  <button type="button" onClick={toggle} aria-label={playing ? "Pause replay" : "Play replay"} className="press grid size-9 place-items-center rounded-full text-ink ring-1 ring-line-strong ring-inset hover:bg-brand-soft">
                    {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
                  </button>
                  <button type="button" onClick={replay} aria-label="Replay from the start" className="press grid size-9 place-items-center rounded-full text-ink ring-1 ring-line-strong ring-inset hover:bg-brand-soft">
                    <ArrowCounterClockwise size={15} weight="light" />
                  </button>
                </div>
                <ol className="flex flex-1 flex-wrap gap-x-1 gap-y-1.5" aria-label="Incident phases">
                  {PHASES.map((p, i) => (
                    <li
                      key={p}
                      aria-current={i === phase ? "step" : undefined}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[0.75rem] transition-colors duration-300",
                        i === phase ? "bg-brand text-brand-ink" : i < phase ? "text-ink-2" : "text-ink-3/70",
                      )}
                    >
                      {p}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="flex flex-col border-t border-line lg:border-t-0">
              <div className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <AgentChip id={agent.id} size={34} />
                  <div className="grid">
                    <span className="text-[0.9375rem] font-medium text-ink">{agent.name}</span>
                    <span className="text-[0.75rem] text-ink-3">{KIND_LABEL[agent.kind]}</span>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-[0.8125rem] leading-snug">
                  {(
                    [
                      ["Takes", agent.takes],
                      ["Returns", agent.returns],
                      ["Boundary", agent.boundary],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[4.75rem_1fr] gap-3">
                      <dt className="text-ink-3">{k}</dt>
                      <dd className="text-ink-2">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="flex min-h-[19rem] flex-1 flex-col border-t border-line p-5 sm:p-6 lg:min-h-0">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium text-ink">Activity</h3>
                  <span className="t-mono text-ink-3">sandbox replay</span>
                </div>
                <ol className="relative mt-4 grid content-start gap-3.5 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" aria-live="polite">
                  {log.map((e) => (
                    <li key={e.key} className="flex gap-3 animate-in fade-in-0 slide-in-from-top-2 duration-500 ease-out-strong">
                      {e.who === "ev" ? (
                        <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-surface-2 text-brand ring-1 ring-line ring-inset">
                          <EnvelopeSimple size={13} weight="light" />
                        </span>
                      ) : (
                        <AgentChip id={e.who} />
                      )}
                      <p className="grid gap-0.5 text-[0.8125rem] leading-snug text-ink-2">
                        <span>{e.text}</span>
                        <span className="t-mono text-[0.6875rem] text-ink-3">{e.time}</span>
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STATUS_TONE: Record<Status, string> = {
  idle: "text-ink-3",
  busy: "text-ink",
  wait: "text-unknown",
  done: "text-brand",
};

function NodeCard({ id, state, selected, onSelect, style, compact }: { id: AgentId; state: NodeState; selected: boolean; onSelect: () => void; style: CSSProperties; compact: boolean }) {
  const a = AGENTS[id];
  const isOp = id === "op";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${a.name}: ${state.note}`}
      className={cn(
        "group absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface text-left outline-none transition-[box-shadow,background-color] duration-300 focus-visible:ring-2 focus-visible:ring-ring",
        isOp ? (compact ? "w-[10.5rem] px-3 py-2.5" : "w-[14rem] px-4 py-3") : compact ? "w-[9.6rem] px-2.5 py-2" : "w-[12.25rem] px-3 py-2.5",
        selected ? "shadow-[0_10px_30px_-18px_rgb(15_58_43/0.55)]" : "shadow-[0_1px_2px_rgb(15_58_43/0.06)]",
      )}
      style={{ ...style, outline: selected ? `1.5px solid ${a.color}` : undefined, outlineOffset: 0 }}
    >
      <span className={cn("pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-line-strong ring-inset", selected && "ring-transparent")} />
      <span className="flex items-center gap-2">
        <span className="relative grid place-items-center">
          <AgentChip id={id} size={compact ? 22 : isOp ? 28 : 24} />
          {(state.s === "busy" || state.s === "wait") && (
            <span
              aria-hidden
              className="absolute -inset-1 animate-spin rounded-full border border-dashed [animation-duration:2.4s] motion-reduce:animate-none"
              style={{ borderColor: a.color }}
            />
          )}
        </span>
        <span className={cn("truncate font-medium text-ink", compact ? "text-[0.75rem]" : "text-[0.8125rem]")}>{a.name}</span>
      </span>
      <span className={cn("t-mono mt-1 block truncate transition-colors duration-300", compact ? "text-[0.625rem]" : "text-[0.6875rem]", STATUS_TONE[state.s])}>{state.note}</span>
    </button>
  );
}

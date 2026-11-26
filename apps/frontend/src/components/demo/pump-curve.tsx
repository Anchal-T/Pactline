"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Check, Question, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/** Synthetic pump curves, H(Q) = h0 - k * Q², each valid only over its tested flow range. */
const CANDIDATES = [
  { id: "A", h0: 48, k: 0.00119, range: [30, 150] as const, color: "var(--ag-op)", motor: true },
  { id: "B", h0: 44, k: 0.00106, range: [30, 125] as const, color: "var(--ag-inv)", motor: true },
  { id: "C", h0: 46, k: 0.00095, range: [30, 140] as const, color: "var(--ag-cmp)", motor: false },
];

const W = 420;
const H = 250;
const PAD = { l: 38, r: 12, t: 24, b: 30 };
const Q = [20, 170] as const;
const HD = [20, 52] as const;

const x = (q: number) => PAD.l + ((q - Q[0]) / (Q[1] - Q[0])) * (W - PAD.l - PAD.r);
const y = (h: number) => H - PAD.b - ((h - HD[0]) / (HD[1] - HD[0])) * (H - PAD.t - PAD.b);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function curvePath(c: (typeof CANDIDATES)[number]) {
  const pts: string[] = [];
  for (let q = c.range[0]; q <= c.range[1]; q += 2.5) pts.push(`${pts.length ? "L" : "M"}${x(q).toFixed(1)} ${y(c.h0 - c.k * q * q).toFixed(1)}`);
  return pts.join("");
}

type Verdict = { v: "pass" | "fail" | "unknown"; head?: number; why: string };

function judge(c: (typeof CANDIDATES)[number], q: number, need: number): Verdict {
  if (q < c.range[0] || q > c.range[1]) return { v: "unknown", why: "outside tested range" };
  const head = c.h0 - c.k * q * q;
  if (!c.motor) return { v: "unknown", head, why: "motor data missing" };
  return head >= need ? { v: "pass", head, why: "meets head" } : { v: "fail", head, why: "short on head" };
}

const MARK = {
  pass: { icon: Check, tone: "text-pass bg-pass/12", label: "Pass" },
  fail: { icon: X, tone: "text-fail bg-fail/12", label: "Fail" },
  unknown: { icon: Question, tone: "text-unknown bg-unknown/14", label: "Unknown" },
};

export function PumpCurve() {
  const [duty, setDuty] = useState({ q: 100, h: 35 });
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const fromPointer = useCallback((e: PointerEvent) => {
    const el = svg.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const py = ((e.clientY - r.top) / r.height) * H;
    const q = Q[0] + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (Q[1] - Q[0]);
    const h = HD[0] + ((H - PAD.b - py) / (H - PAD.t - PAD.b)) * (HD[1] - HD[0]);
    setDuty({ q: Math.round(clamp(q, 25, 165)), h: Math.round(clamp(h, 22, 50) * 2) / 2 });
  }, []);

  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, [number, number]> = { ArrowRight: [5, 0], ArrowLeft: [-5, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    setDuty((d) => ({ q: clamp(d.q + s[0], 25, 165), h: clamp(d.h + s[1], 22, 50) }));
  };

  return (
    <div className="grid gap-4">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          fromPointer(e);
        }}
        onPointerMove={(e) => dragging.current && fromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        role="img"
        aria-label={`Pump curves with the duty point at ${duty.q} cubic metres per hour and ${duty.h} metres of head`}
      >
        {[20, 28, 36, 44, 52].map((h) => (
          <g key={h}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(h)} y2={y(h)} stroke="var(--line)" />
            <text x={PAD.l - 8} y={y(h) + 3.5} textAnchor="end" className="fill-ink-3 font-mono text-[9px]">
              {h}
            </text>
          </g>
        ))}
        {[40, 80, 120, 160].map((q) => (
          <text key={q} x={x(q)} y={H - PAD.b + 16} textAnchor="middle" className="fill-ink-3 font-mono text-[9px]">
            {q}
          </text>
        ))}
        <text x={W - PAD.r} y={H - 4} textAnchor="end" className="fill-ink-3 font-mono text-[9px]">
          flow m³/h
        </text>
        <text x={4} y={10} className="fill-ink-3 font-mono text-[9px]">
          head m
        </text>

        {CANDIDATES.map((c) => (
          <g key={c.id}>
            <path d={curvePath(c)} fill="none" stroke={c.color} strokeWidth={1.75} strokeDasharray={c.motor ? undefined : "4 3"} />
            <text x={x(c.range[1]) + 4} y={y(c.h0 - c.k * c.range[1] ** 2) + 3} className="font-mono text-[10px]" style={{ fill: c.color }}>
              {c.id}
            </text>
          </g>
        ))}

        <line x1={x(duty.q)} x2={x(duty.q)} y1={y(duty.h)} y2={H - PAD.b} stroke="var(--brand)" strokeDasharray="2 3" />
        <line x1={PAD.l} x2={x(duty.q)} y1={y(duty.h)} y2={y(duty.h)} stroke="var(--brand)" strokeDasharray="2 3" />
        <g
          tabIndex={0}
          role="slider"
          aria-label="Duty point. Arrow keys move it"
          aria-valuetext={`${duty.q} cubic metres per hour at ${duty.h} metres`}
          onKeyDown={onKey}
          className="cursor-grab outline-none active:cursor-grabbing [&:focus-visible>circle:first-child]:stroke-[3]"
        >
          <circle cx={x(duty.q)} cy={y(duty.h)} r={9} fill="var(--surface)" stroke="var(--brand)" strokeWidth={1.75} />
          <circle cx={x(duty.q)} cy={y(duty.h)} r={3.5} fill="var(--brand)" />
        </g>
      </svg>

      <div className="flex items-center justify-between gap-3">
        <span className="t-mono text-ink-2">
          duty <span className="text-ink">{duty.q} m³/h</span> at <span className="text-ink">{duty.h.toFixed(1)} m</span>
        </span>
        <span className="text-[0.75rem] text-ink-3">Drag the point</span>
      </div>

      <ul className="grid gap-2">
        {CANDIDATES.map((c) => {
          const r = judge(c, duty.q, duty.h);
          const M = MARK[r.v];
          return (
            <li key={c.id} className="flex items-center gap-3 text-[0.8125rem]">
              <span className={cn("grid size-6 place-items-center rounded-full", M.tone)}>
                <M.icon size={12} weight="bold" />
                <span className="sr-only">{M.label}</span>
              </span>
              <span className="w-24 text-ink">Candidate {c.id}</span>
              <span className="t-mono w-16 text-ink-2">{r.head !== undefined ? `${r.head.toFixed(1)} m` : "n/a"}</span>
              <span className="text-ink-3">{r.why}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useId, useRef, useState, type CSSProperties } from "react";
import { animate, stagger, svg, type JSAnimation } from "animejs";
import { createRng, softBlob, type Stroke } from "@/lib/art/geometry";
import { WashFilter, WashPath } from "@/components/art/watercolor";
import { prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";

/*
 * Engineering sketch of a base-mounted end-suction pump package: plinth, volute casing,
 * bearing frame, coupling guard, TEFC motor, suction valve, discharge check valve and gauge.
 * Coordinates are in a 800 x 1000 field.
 */

type El = { d: string; s: Stroke; o: number; plate?: boolean };

const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
const lines = (segs: Array<[number, number, number, number]>) => segs.map(([a, b, c, d]) => `M${a} ${b}L${c} ${d}`).join("");

function range(from: number, to: number, step: number) {
  const out: number[] = [];
  for (let v = from; v <= to; v += step) out.push(v);
  return out;
}

const C = { x: 250, y: 680 };

function build(): { els: El[]; impeller: string; needle: string } {
  const els: El[] = [];
  const add = (d: string, s: Stroke, o: number) => els.push({ d, s, o });
  const plate = (d: string) => els.push({ d, s: "ink", o: 0, plate: true });

  add(lines([[0, 840, 800, 840]]), "ink", 0);
  add(lines(range(6, 796, 14).map((x) => [x, 841, x - 8, 853] as [number, number, number, number])), "fine", 0);
  plate(rect(100, 800, 600, 40));
  add(rect(100, 800, 600, 40), "ink", 0);
  add(lines(range(110, 690, 18).map((x) => [x, 838, x + 16, 802] as [number, number, number, number])), "fine", 0);
  plate(rect(120, 780, 560, 20));
  add(rect(120, 780, 560, 20) + circ(140, 790, 4) + circ(660, 790, 4), "ink", 0);

  add(lines([[0, 660, 122, 660], [0, 700, 122, 700]]), "ink", 3);
  plate(`M44 660L76 700L76 660L44 700Z`);
  add(`M44 660L76 700L76 660L44 700Z` + lines([[44, 652, 44, 708], [76, 652, 76, 708], [60, 680, 60, 618]]) + `M42 612a18 5 0 1 0 36 0a18 5 0 1 0 -36 0`, "ink", 3);

  add(lines([[268, 530, 268, 450], [312, 530, 312, 450]]) + `M268 450Q268 380 338 380M312 450Q312 424 338 424` + lines([[338, 380, 800, 380], [338, 424, 800, 424]]), "ink", 3);
  add(lines([[512, 372, 512, 432], [528, 372, 528, 432]]), "ink", 3);
  plate(`M268 476L312 504L268 504L312 476Z`);
  add(`M268 476L312 504L268 504L312 476Z` + lines([[258, 476, 322, 476], [258, 504, 322, 504]]), "ink", 3);
  add(lines([[312, 456, 342, 456], [312, 464, 342, 464]]), "ink", 4);
  plate(circ(362, 460, 20));
  add(circ(362, 460, 20), "ink", 4);
  add(
    range(-140, 140, 35)
      .map((deg) => {
        const a = ((deg - 90) * Math.PI) / 180;
        return `M${(362 + Math.cos(a) * 16).toFixed(1)} ${(460 + Math.sin(a) * 16).toFixed(1)}L${(362 + Math.cos(a) * 19).toFixed(1)} ${(460 + Math.sin(a) * 19).toFixed(1)}`;
      })
      .join(""),
    "fine",
    4,
  );

  plate(circ(C.x, C.y, 78));
  add(circ(C.x, C.y, 78), "ink", 1);
  const spiral = range(0, 300, 10)
    .map((deg, i) => {
      const a = ((deg - 60) * Math.PI) / 180;
      const r = 40 + (deg / 300) * 26;
      return `${i ? "L" : "M"}${(C.x + Math.cos(a) * r).toFixed(1)} ${(C.y + Math.sin(a) * r).toFixed(1)}`;
    })
    .join("");
  add(spiral, "fine", 1);
  add(circ(C.x, C.y, 22) + circ(C.x, C.y, 6), "ink", 1);
  plate(rect(268, 540, 44, 70));
  add(lines([[268, 610, 268, 540], [312, 610, 312, 540]]) + rect(258, 530, 64, 10), "ink", 1);
  plate(rect(132, 660, 40, 40));
  add(lines([[172, 660, 132, 660], [172, 700, 132, 700]]) + rect(122, 650, 10, 60), "ink", 1);
  add(`M220 752L210 780M280 752L290 780M210 780H290`, "ink", 1);

  plate(rect(328, 656, 92, 48));
  add(rect(328, 656, 92, 48) + rect(350, 704, 50, 76), "ink", 2);
  add(lines(range(666, 696, 10).map((y) => [334, y, 414, y] as [number, number, number, number])), "fine", 2);
  add(lines([[420, 676, 446, 676], [420, 684, 446, 684]]), "ink", 2);
  plate(rect(446, 648, 54, 64));
  add(rect(446, 648, 54, 64), "ink", 2);
  add(
    lines(range(446, 500, 9).map((x) => [x, 648, x + 18, 712] as [number, number, number, number])) +
      lines(range(464, 518, 9).map((x) => [x, 648, x - 18, 712] as [number, number, number, number])),
    "fine",
    2,
  );
  plate(`M500 620Q484 680 500 740H650Q666 680 650 620Z`);
  add(`M500 620Q484 680 500 740H650Q666 680 650 620Z` + rect(662, 634, 28, 92), "ink", 2);
  add(lines(range(632, 728, 10).map((y) => [512, y, 638, y] as [number, number, number, number])), "fine", 2);
  add(lines(range(668, 686, 6).map((x) => [x, 638, x, 722] as [number, number, number, number])), "fine", 2);
  plate(rect(552, 596, 48, 24));
  add(rect(552, 596, 48, 24) + rect(568, 586, 16, 10) + rect(518, 740, 30, 40) + rect(602, 740, 30, 40), "ink", 2);
  plate(rect(560, 692, 40, 22));
  add(rect(560, 692, 40, 22) + lines([[566, 700, 594, 700], [566, 706, 588, 706]]), "fine", 2);

  add(`M96 680H730`, "fine", 4);
  add(lines([[120, 805, 120, 892], [680, 805, 680, 892], [120, 880, 680, 880], [114, 886, 126, 874], [674, 886, 686, 874]]), "fine", 4);

  add(circ(158, 548, 30) + `M178 570L214 618`, "ink", 5);
  add(`M382 466L418 486H430M576 586L560 552H548M40 702L56 736H66`, "fine", 5);

  const impeller = range(0, 300, 60)
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const p = (r: number, off: number) => [C.x + Math.cos(a + off) * r, C.y + Math.sin(a + off) * r].map((v) => v.toFixed(1)).join(" ");
      return `M${p(24, 0)}Q${p(46, 0.35)} ${p(60, 0.75)}`;
    })
    .join("");
  const needle = `M362 460L${362 + 14} ${460 - 6}`;
  return { els, impeller, needle };
}

const SCENE = build();

const LABELS: Array<{ x: number; y: number; text: string; anchor?: "start" | "end" | "middle"; check?: boolean; size?: number }> = [
  { x: 158, y: 544, text: "P-CHW", anchor: "middle", size: 12 },
  { x: 158, y: 560, text: "01A", anchor: "middle", size: 12 },
  { x: 434, y: 491, text: "Head 36.1 m at 100 m³/h", check: true },
  { x: 544, y: 556, text: "400 V 50 Hz, IE3", anchor: "end", check: true },
  { x: 70, y: 741, text: "DN100" },
  { x: 330, y: 552, text: "DN80" },
  { x: 400, y: 873, text: "1 540", anchor: "middle", size: 12 },
];

const WASHES = [
  { cx: 420, cy: 640, rx: 360, ry: 230, fill: "var(--sage)", o: 0.32 },
  { cx: 575, cy: 680, rx: 92, ry: 66, fill: "var(--sage)", o: 0.5 },
  { cx: 250, cy: 680, rx: 84, ry: 80, fill: "var(--olive)", o: 0.42 },
  { cx: 400, cy: 820, rx: 330, ry: 30, fill: "var(--moss)", o: 0.3 },
  { cx: 560, cy: 402, rx: 260, ry: 26, fill: "var(--brand)", o: 0.2 },
];

const PEN = [
  { o: 0, at: 0, dur: 900, gap: 70 },
  { o: 1, at: 500, dur: 1000, gap: 60 },
  { o: 2, at: 1000, dur: 1000, gap: 40 },
  { o: 3, at: 1500, dur: 900, gap: 60 },
  { o: 4, at: 2000, dur: 800, gap: 70 },
  { o: 5, at: 2500, dur: 600, gap: 90 },
];

export function PumpSketch({ className, plate }: { className?: string; plate?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const id = `ps${useId().replace(/:/g, "")}`;
  const [running, setRunning] = useState(false);
  const blobs = (() => {
    const r = createRng(91);
    return WASHES.map((w) => ({ d: softBlob(r, w.cx, w.cy, w.rx, w.ry), fill: w.fill, o: w.o }));
  })();

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const ro = new ResizeObserver(() => {
        const s = Math.max(el.clientWidth / 800, el.clientHeight / 1000) || 1;
        el.style.setProperty("--u", String(1 / s));
      });
      ro.observe(el);

      if (prefersReducedMotion()) {
        el.dataset.state = "ready";
        return () => ro.disconnect();
      }

      const running: JSAnimation[] = [];
      const groups = PEN.map((p) => ({ ...p, els: svg.createDrawable(el.querySelectorAll(`path.ln[data-o="${p.o}"]`)) }));
      const labels = el.querySelectorAll("[data-label]");
      const wash = el.querySelectorAll(".wash-layer");
      labels.forEach((l) => ((l as SVGElement).style.opacity = "0"));
      wash.forEach((w) => ((w as SVGElement).style.opacity = "0"));
      el.dataset.state = "ready";

      for (const g of groups) running.push(animate(g.els, { draw: ["0 0", "0 1"], duration: g.dur, delay: stagger(g.gap, { start: g.at }), ease: "inOutSine" }));
      running.push(animate(wash, { opacity: [0, 1], duration: 1600, delay: 2300, ease: "outQuad" }));
      running.push(
        animate(labels, {
          opacity: [0, 1],
          duration: 600,
          delay: stagger(120, { start: 3000 }),
          ease: "outQuad",
          onComplete: () => setRunning(true),
        }),
      );
      return () => {
        ro.disconnect();
        running.forEach((a) => a.revert());
      };
    },
    { scope: root },
  );

  const box = "0 0 800 1000";
  const aspect = "xMidYMax slice";

  return (
    <div
      ref={root}
      aria-hidden
      data-state="pending"
      className={cn("art pointer-events-none relative overflow-hidden select-none", className)}
      style={plate ? ({ "--art-plate": plate } as CSSProperties) : undefined}
    >
      <svg viewBox={box} preserveAspectRatio={aspect} className="wash-layer absolute inset-0 h-full w-full">
        <defs>
          <WashFilter id={id} />
        </defs>
        <g className="wash" filter={`url(#${id})`}>
          {blobs.map((b, i) => (
            <WashPath key={i} {...b} />
          ))}
        </g>
      </svg>
      <svg viewBox={box} preserveAspectRatio={aspect} className="absolute inset-0 h-full w-full">
        {SCENE.els.map((e, i) => (e.plate ? <path key={i} className="plate" d={e.d} /> : <path key={i} className={`ln ${e.s}`} data-o={e.o} d={e.d} />))}
        <g className={cn(running && "pump-spin")} style={{ transformOrigin: `${C.x}px ${C.y}px` }}>
          <path className="ln leaf" data-o={1} d={SCENE.impeller} />
        </g>
        <g className={cn(running && "pump-needle")} style={{ transformOrigin: "362px 460px" }}>
          <path className="ln mark" data-o={4} d={SCENE.needle} />
        </g>
        {LABELS.map((l) => (
          <g key={l.text} data-label>
            {l.check && (
              <g transform={`translate(${l.anchor === "end" ? l.x - 4 - l.text.length * 8.2 - 22 : l.x - 22} ${l.y - 13})`}>
                <circle cx={8} cy={8} r={8} className="fill-brand/15" />
                <path d="M4.5 8.2l2.4 2.4 4.6-5" fill="none" stroke="var(--brand)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            <text x={l.x} y={l.y} textAnchor={l.anchor ?? "start"} className="fill-ink-2 font-mono" style={{ fontSize: l.size ?? 14 }}>
              {l.text}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

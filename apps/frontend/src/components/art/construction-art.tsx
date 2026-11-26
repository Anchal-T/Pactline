"use client";

import { useId, useRef, type CSSProperties } from "react";
import { animate, stagger, svg, type JSAnimation } from "animejs";
import { gsap, ScrollTrigger, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { getScene, type SceneName } from "@/lib/art/scenes";
import type { Layer } from "@/lib/art/geometry";
import { WashFilter, WashPath } from "@/components/art/watercolor";
import { cn } from "@/lib/utils";

type Fit = "slice-right" | "slice-center" | "meet";

const ASPECT: Record<Fit, string> = {
  "slice-right": "xMaxYMax slice",
  "slice-center": "xMidYMax slice",
  meet: "xMidYMax meet",
};

/** Pen order: per draw group, how long each stroke takes and how far apart they start. */
const PEN: Array<{ o: number; at: number; dur: number; gap: number }> = [
  { o: 0, at: 0, dur: 1100, gap: 60 },
  { o: 1, at: 150, dur: 900, gap: 40 },
  { o: 2, at: 380, dur: 950, gap: 34 },
  { o: 3, at: 820, dur: 1000, gap: 26 },
  { o: 4, at: 1050, dur: 1100, gap: 18 },
  { o: 5, at: 1250, dur: 650, gap: 4 },
  { o: 6, at: 1650, dur: 700, gap: 14 },
  { o: 7, at: 2250, dur: 800, gap: 60 },
];
const WASH_AT = 2300;

interface Props {
  scene: SceneName;
  fit?: Fit;
  className?: string;
  /** Scroll-linked depth between the far city, the buildings and the trees. */
  parallax?: boolean;
  /** Viewbox units the crane hook lowers as the art scrolls away. */
  hookTravel?: number;
  /** Color the opaque plates are painted in; must match what sits behind the art. */
  plate?: string;
  draw?: boolean;
}

export function ConstructionArt({ scene: name, fit = "slice-right", className, parallax = false, hookTravel = 0, plate, draw = true }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");
  const scene = getScene(name);
  const aspect = ASPECT[fit];
  const box = `0 0 ${scene.w} ${scene.h}`;

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;

      const scale = () => {
        const sx = el.clientWidth / scene.w;
        const sy = el.clientHeight / scene.h;
        return fit === "meet" ? Math.min(sx, sy) : Math.max(sx, sy);
      };
      const ro = new ResizeObserver(() => el.style.setProperty("--u", String(1 / (scale() || 1))));
      ro.observe(el);

      const reduce = prefersReducedMotion();
      const running: JSAnimation[] = [];

      if (reduce || !draw) {
        el.dataset.state = "ready";
      } else {
        const groups = PEN.map((p) => ({ ...p, els: svg.createDrawable(el.querySelectorAll(`path.ln[data-o="${p.o}"]`)) }));
        const washes = el.querySelectorAll<SVGSVGElement>(".wash-layer");
        gsap.set(washes, { opacity: 0 });
        el.dataset.state = "ready";

        ScrollTrigger.create({
          trigger: el,
          start: "top 85%",
          once: true,
          onEnter: () => {
            for (const g of groups) {
              if (!g.els.length) continue;
              running.push(animate(g.els, { draw: ["0 0", "0 1"], duration: g.dur, delay: stagger(g.gap, { start: g.at }), ease: "inOutSine" }));
            }
            running.push(animate(washes, { opacity: [0, 1], duration: 1900, delay: stagger(220, { start: WASH_AT }), ease: "outQuad" }));
          },
        });
      }

      if (parallax && !reduce) {
        const depth: Array<[string, number]> = [
          ["back", 0.16],
          ["mid", 0.08],
        ];
        for (const [layer, k] of depth) {
          gsap.to(el.querySelector(`[data-layer="${layer}"]`), {
            y: () => el.clientHeight * k,
            ease: "none",
            scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true },
          });
        }
      }

      if (hookTravel && !reduce) {
        gsap.to(el.querySelector("[data-hook]"), {
          y: () => hookTravel * scale(),
          ease: "none",
          scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: 0.6, invalidateOnRefresh: true },
        });
      }

      return () => {
        ro.disconnect();
        running.forEach((a) => a.revert());
      };
    },
    { scope: root },
  );

  const layerClass = cn("absolute inset-0", parallax && "will-change-transform");

  return (
    <div
      ref={root}
      aria-hidden
      data-state="pending"
      className={cn("art pointer-events-none relative overflow-hidden select-none", className)}
      style={plate ? ({ "--art-plate": plate } as CSSProperties) : undefined}
    >
      <div data-layer="back" className={layerClass}>
        <Washes layer={scene.back} id={`${uid}b`} box={box} aspect={aspect} />
        <Lines layer={scene.back} box={box} aspect={aspect} />
      </div>
      <div data-layer="mid" className={layerClass}>
        <Lines layer={scene.mid} box={box} aspect={aspect} />
        <Washes layer={scene.mid} id={`${uid}m`} box={box} aspect={aspect} />
        <Lines layer={scene.hook} box={box} aspect={aspect} hook />
      </div>
      <div data-layer="front" className="absolute inset-0">
        <Lines layer={scene.front} box={box} aspect={aspect} />
        <Washes layer={scene.front} id={`${uid}f`} box={box} aspect={aspect} />
      </div>
    </div>
  );
}

function Lines({ layer, box, aspect, hook }: { layer: Layer; box: string; aspect: string; hook?: boolean }) {
  if (!layer.items.length) return null;
  return (
    <svg viewBox={box} preserveAspectRatio={aspect} className="absolute inset-0 h-full w-full" data-hook={hook ? "" : undefined}>
      {layer.items.map((it, i) =>
        it.t === "plate" ? <path key={i} className="plate" d={it.d} /> : <path key={i} className={`ln ${it.s}`} data-o={it.o} d={it.d} />,
      )}
    </svg>
  );
}

function Washes({ layer, id, box, aspect }: { layer: Layer; id: string; box: string; aspect: string }) {
  if (!layer.washes.length) return null;
  return (
    <svg viewBox={box} preserveAspectRatio={aspect} className="wash-layer absolute inset-0 h-full w-full">
      <defs>
        <WashFilter id={id} />
      </defs>
      <g className="wash" filter={`url(#${id})`}>
        {layer.washes.map((w, i) => (
          <WashPath key={i} {...w} />
        ))}
      </g>
    </svg>
  );
}

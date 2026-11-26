import { useId } from "react";
import { createRng, softBlob } from "@/lib/art/geometry";
import { cn } from "@/lib/utils";

/** Pigment bleed (turbulence displacement), a soft edge, then paper-grain granulation. */
export function WashFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-8%" y="-12%" width="116%" height="124%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.017" numOctaves={3} seed={4} result="warp" />
      <feDisplacementMap in="SourceGraphic" in2="warp" scale={26} xChannelSelector="R" yChannelSelector="G" result="bleed" />
      <feGaussianBlur in="bleed" stdDeviation={2.2} result="soft" />
      <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={9} result="grain" />
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.15" result="pigment" />
      <feComposite in="soft" in2="pigment" operator="in" />
    </filter>
  );
}

export function WashPath({ d, fill, o }: { d: string; fill: string; o: number }) {
  return <path d={d} style={{ fill, stroke: fill, fillOpacity: o, strokeOpacity: Math.min(1, o * 1.3), strokeWidth: 5 }} />;
}

interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  o: number;
}

/** A static watercolor wash for a panel background, in a 400 x 300 field stretched to fit. */
export function Watercolor({ blobs, seed = 11, className }: { blobs: Blob[]; seed?: number; className?: string }) {
  const id = `wc${useId().replace(/:/g, "")}`;
  const r = createRng(seed);
  return (
    <div aria-hidden className={cn("art pointer-events-none absolute inset-0", className)}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="wash-layer h-full w-full">
        <defs>
          <WashFilter id={id} />
        </defs>
        <g className="wash" filter={`url(#${id})`}>
          {blobs.map((b, i) => (
            <WashPath key={i} d={softBlob(r, b.cx, b.cy, b.rx, b.ry)} fill={b.fill} o={b.o} />
          ))}
        </g>
      </svg>
    </div>
  );
}

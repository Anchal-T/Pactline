import type { ReactNode } from "react";
import type { AppRoute } from "@/lib/nav";

/** Page heading plus the not-yet-wired state, so each route states what it will read. */
export function Screen({ route, title, children }: { route: AppRoute; title?: string; children?: ReactNode }) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="font-display text-[2.4rem] leading-[1.05] font-normal tracking-[-0.02em] text-ink sm:text-[2.8rem]">{title ?? route.label}</h1>
        <p className="t-body max-w-[38rem]">{route.summary}</p>
      </div>
      {children ?? <Pending route={route} />}
    </div>
  );
}

export function Pending({ route }: { route: AppRoute }) {
  return (
    <div className="bezel">
      <div className="bezel-core grid gap-3 p-6 sm:p-8">
        <p className="text-[0.9375rem] text-ink">Nothing to show yet</p>
        <p className="t-body max-w-[36rem] text-[0.9375rem]">
          This screen reads from the operator API once the backend writes incident data. Until then it stays empty rather than showing invented records.
        </p>
        <p className="t-mono w-fit rounded-full bg-surface-2/70 px-3 py-1 text-ink-2">{route.endpoint}</p>
      </div>
    </div>
  );
}

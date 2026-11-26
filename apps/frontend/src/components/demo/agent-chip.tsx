import type { CSSProperties } from "react";
import { AGENTS, type AgentId } from "@/lib/agents";
import { cn } from "@/lib/utils";

/** A round identity mark for an actor in a demo, tinted with its agent color. */
export function AgentChip({ id, size = 26, className, ring }: { id: AgentId; size?: number; className?: string; ring?: boolean }) {
  const a = AGENTS[id];
  return (
    <span
      title={a.name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-mono font-medium tracking-tight select-none",
        ring && "ring-2 ring-surface",
        className,
      )}
      style={
        {
          width: size,
          height: size,
          fontSize: Math.round(size * 0.38),
          color: a.color,
          background: `color-mix(in srgb, ${a.color} 15%, var(--surface))`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${a.color} 30%, transparent)`,
        } as CSSProperties
      }
    >
      {a.mark}
    </span>
  );
}

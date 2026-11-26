"use client";

import { useEffect, useState } from "react";
import { apiGet, API_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

type State = "checking" | "online" | "offline";

const COPY: Record<State, string> = { checking: "Checking API", online: "API connected", offline: "API not running" };

export function ApiStatus({ className }: { className?: string }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let alive = true;
    const ping = () =>
      apiGet("/health", { timeoutMs: 3000 })
        .then(() => alive && setState("online"))
        .catch(() => alive && setState("offline"));
    ping();
    const id = window.setInterval(() => !document.hidden && ping(), 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className={cn("grid gap-0.5 rounded-2xl bg-surface-2/60 px-3.5 py-3", className)} role="status">
      <span className="flex items-center gap-2 text-[0.8125rem] text-ink">
        <span aria-hidden className={cn("size-2 rounded-full", state === "online" ? "bg-pass" : state === "offline" ? "bg-unknown" : "bg-ink-3/50")} />
        {COPY[state]}
      </span>
      <span className="t-mono truncate text-[0.6875rem] text-ink-3">{API_URL.replace(/^https?:\/\//, "")}</span>
    </div>
  );
}

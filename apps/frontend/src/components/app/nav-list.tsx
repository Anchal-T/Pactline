"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_ROUTES } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav aria-label="Workspace" className="grid gap-1">
      {APP_ROUTES.map(({ href, label, icon: I }) => {
        const on = path === href || path.startsWith(`${href}/`) || (href === "/dashboard" && path.startsWith("/incidents"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-full px-3.5 text-[0.9375rem] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
              on ? "bg-brand-soft font-medium text-ink" : "text-ink-2 hover:bg-brand-soft/60 hover:text-ink",
            )}
          >
            <I size={18} weight={on ? "regular" : "light"} className={on ? "text-brand" : undefined} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

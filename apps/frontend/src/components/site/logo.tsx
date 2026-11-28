import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label="Pactline home" className={cn("inline-flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="text-brand" aria-hidden>
        <circle cx="12" cy="12" r="7.25" />
        <path d="M1.5 12h21" strokeLinecap="round" className="text-gold" />
      </svg>
      <span className="font-display text-[1.6rem] leading-none font-medium tracking-[-0.02em] text-ink">Pactline</span>
    </Link>
  );
}

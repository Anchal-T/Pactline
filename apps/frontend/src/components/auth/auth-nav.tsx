"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

const ROUTES = [
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
] as const;

export function AuthCrumbs() {
  const path = usePathname();
  const current = ROUTES.find((r) => r.href === path)?.label ?? "Account";
  return (
    <Breadcrumb className="hidden sm:block">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/">Pactline</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <span>Account</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Route-level tab navigation; the pill persists across routes because the layout does. */
export function AuthSwitch() {
  const path = usePathname();
  const index = Math.max(0, ROUTES.findIndex((r) => r.href === path));
  return (
    <nav aria-label="Account" className="relative mb-12 grid grid-cols-2 rounded-full bg-surface-2/70 p-1 ring-1 ring-line ring-inset">
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-surface shadow-[0_1px_2px_rgb(15_58_43/0.08),inset_0_0_0_1px_var(--line)] transition-transform duration-300 ease-out-strong"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {ROUTES.map((r, i) => (
        <Link
          key={r.href}
          href={r.href}
          aria-current={i === index ? "page" : undefined}
          className={cn(
            "relative z-10 grid h-9 place-items-center rounded-full text-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
            i === index ? "text-ink" : "text-ink-3 hover:text-ink",
          )}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}

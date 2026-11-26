"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeft, List, X } from "@phosphor-icons/react";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { ApiStatus } from "@/components/app/api-status";
import { NavList } from "@/components/app/nav-list";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { crumbsFor } from "@/lib/nav";
import { lockScroll } from "@/lib/lenis";

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1">
        <Logo />
      </div>
      <NavList onNavigate={onNavigate} />
      <div className="mt-auto grid gap-3">
        <ApiStatus />
        <Link href="/" className="flex h-9 items-center gap-2 rounded-full px-3 text-[0.8125rem] text-ink-3 transition-colors duration-200 hover:text-ink">
          <ArrowLeft size={14} weight="light" />
          Back to site
        </Link>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const crumbs = crumbsFor(path);
  const change = (next: boolean) => {
    lockScroll(next);
    setOpen(next);
  };

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[16.5rem_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] border-r border-line bg-surface/60 lg:block">
        <SidebarBody />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-background/90 px-4 backdrop-blur-md sm:px-6">
          <DialogPrimitive.Root open={open} onOpenChange={change}>
            <DialogPrimitive.Trigger aria-label="Open navigation" className="press -ml-1.5 grid size-9 place-items-center rounded-full text-ink outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              <List size={20} weight="light" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 lg:hidden" />
              <DialogPrimitive.Content
                data-lenis-prevent
                className="fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] bg-surface shadow-[0_0_60px_-20px_rgb(0_0_0/0.5)] outline-none duration-300 ease-out-strong data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left lg:hidden"
              >
                <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
                <DialogPrimitive.Close aria-label="Close navigation" className="press absolute top-4 right-3 grid size-9 place-items-center rounded-full text-ink-3 outline-none hover:bg-brand-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring">
                  <X size={18} weight="light" />
                </DialogPrimitive.Close>
                <SidebarBody onNavigate={() => change(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((c, i) => (
                <Fragment key={c.label}>
                  {i > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem className="min-w-0">
                    {c.href ? (
                      <BreadcrumbLink asChild>
                        <Link href={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate">{c.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-10">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  ArrowRight,
  ArrowsLeftRight,
  CalendarCheck,
  MagnifyingGlass,
  Plugs,
  ShieldCheck,
  Ruler,
  type Icon,
} from "@phosphor-icons/react";
import { Button, ButtonIcon } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerClass,
} from "@/components/ui/navigation-menu";
import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { ScrollToTop } from "@/components/site/scroll-to-top";
import { RequestAccess } from "@/components/site/request-access";
import { lockScroll } from "@/lib/lenis";
import { cn } from "@/lib/utils";

const SPECIALISTS: Array<{ title: string; body: string; href: string; icon: Icon }> = [
  { title: "Investigation", body: "Reconciles stale and conflicting vendor dates", href: "/#specialists", icon: MagnifyingGlass },
  { title: "Engineering compliance", body: "Tests a product against the spec, line by line", href: "/#specialists", icon: Ruler },
  { title: "Alternative sourcing", body: "Finds equivalents and proves each one", href: "/#specialists", icon: ArrowsLeftRight },
  { title: "Schedule engine", body: "Deterministic float and critical path", href: "/#specialists", icon: CalendarCheck },
  { title: "MCP server", body: "Callable by Amber and any other agent", href: "/#specialists", icon: Plugs },
];

const LINKS = [
  { label: "How it decides", href: "/#decide" },
  { label: "Incident", href: "/#incident" },
  { label: "Safeguards", href: "/#safeguards" },
];

export function Nav() {
  return (
    <>
      <ScrollToTop />
      <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6">
        <div className="glass mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4 rounded-full pr-2.5 pl-5">
          <Logo />

          <NavigationMenu className="hidden lg:flex" delayDuration={80}>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Product</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid w-[680px] grid-cols-[15rem_1fr] gap-2 bg-surface p-2.5">
                    <NavigationMenuLink asChild>
                      <Link href="/#decide" className="group flex flex-col justify-between rounded-[calc(var(--radius-lg)-0.5rem)] bg-brand-soft p-5 transition-colors duration-200 hover:bg-brand/12">
                        <ShieldCheck size={22} weight="light" className="text-brand" />
                        <span className="mt-16 grid gap-1.5">
                          <span className="t-h3 text-[1.45rem] text-ink">The operator</span>
                          <span className="text-sm leading-snug text-ink-2">Owns each incident from the first signal to verified receipt, and reopens it if the fix slips</span>
                        </span>
                      </Link>
                    </NavigationMenuLink>
                    <ul className="grid gap-0.5">
                      {SPECIALISTS.map(({ title, body, href, icon: I }) => (
                        <li key={title}>
                          <NavigationMenuLink asChild>
                            <Link href={href} className="flex items-start gap-3.5 rounded-2xl p-3 transition-colors duration-200 hover:bg-brand-soft">
                              <I size={18} weight="light" className="mt-0.5 shrink-0 text-ink-2" />
                              <span className="grid gap-0.5">
                                <span className="text-sm font-medium text-ink">{title}</span>
                                <span className="text-[0.8125rem] leading-snug text-ink-3">{body}</span>
                              </span>
                            </Link>
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {LINKS.map((l) => (
                <NavigationMenuItem key={l.href}>
                  <NavigationMenuLink asChild>
                    <Link href={l.href} className={navigationMenuTriggerClass}>
                      {l.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <RequestAccess>
              <Button size="sm" className="hidden lg:inline-flex">
                Request access
              </Button>
            </RequestAccess>
            <MobileMenu />
          </div>
        </div>
      </header>
    </>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    lockScroll(next);
    setOpen(next);
  };
  const items = [...LINKS, { label: "How it works", href: "/#loop" }, { label: "Specialists", href: "/#specialists" }, { label: "Sign in", href: "/login" }];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={change}>
      <DialogPrimitive.Trigger
        aria-label="Open menu"
        className="press grid size-10 place-items-center rounded-full text-ink outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <Burger open={false} />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          data-lenis-prevent
          className="glass fixed inset-0 z-[55] flex flex-col rounded-none border-0 px-6 pt-28 pb-10 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-300"
          style={{ backdropFilter: "blur(32px) saturate(160%)", WebkitBackdropFilter: "blur(32px) saturate(160%)" }}
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <div className="absolute inset-x-4 top-4 flex h-16 items-center justify-between pr-2.5 pl-5 sm:inset-x-6">
            <Logo />
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <DialogPrimitive.Close aria-label="Close menu" className="press grid size-10 place-items-center rounded-full text-ink outline-none hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring">
                <ClosingBurger />
              </DialogPrimitive.Close>
            </div>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul className="grid gap-1">
              {items.map((item, i) => (
                <li key={item.href} className="overflow-hidden">
                  <Link
                    href={item.href}
                    onClick={() => change(false)}
                    style={{ "--i": i } as CSSProperties}
                    className="block py-2 font-display text-[2.6rem] leading-[1.1] font-normal tracking-[-0.02em] text-ink transition-[color] duration-200 hover:text-brand motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-6 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:delay-[calc(var(--i)*55ms+80ms)] motion-safe:ease-out-strong"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <RequestAccess>
                <Button size="lg" className="w-full justify-between">
                  Request access
                  <ButtonIcon>
                    <ArrowRight size={15} weight="bold" />
                  </ButtonIcon>
                </Button>
              </RequestAccess>
            </div>
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Mounts closed, then morphs to an X on the next frame so the change reads as one motion. */
function ClosingBurger() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return <Burger open={open} />;
}

function Burger({ open }: { open: boolean }) {
  const line = "absolute left-1/2 h-[1.5px] w-[18px] -translate-x-1/2 rounded-full bg-current transition-transform duration-300 ease-out-strong";
  return (
    <span className="relative block size-5" aria-hidden>
      <span className={cn(line, "top-[6.5px]", open && "translate-y-[3px] rotate-45")} />
      <span className={cn(line, "top-[12.5px]", open && "-translate-y-[3px] -rotate-45")} />
    </span>
  );
}

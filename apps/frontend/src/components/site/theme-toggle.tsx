"use client";

import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { Moon, Sun } from "@phosphor-icons/react";
import { prefersReducedMotion } from "@/lib/gsap";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    if (!document.startViewTransition || prefersReducedMotion()) {
      setTheme(next);
      return;
    }
    const x = e.clientX || window.innerWidth - 40;
    const y = e.clientY || 40;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(() => flushSync(() => setTheme(next)));
    transition.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 700, easing: "cubic-bezier(0.77, 0, 0.175, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      className={cn(
        "press relative grid size-9 place-items-center rounded-full text-ink-2 outline-none hover:bg-brand-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Sun size={18} weight="light" className="absolute transition-[opacity,scale,rotate,filter] duration-300 ease-out-strong dark:scale-75 dark:-rotate-90 dark:opacity-0 dark:blur-[2px]" />
      <Moon size={17} weight="light" className="absolute scale-75 rotate-90 opacity-0 blur-[2px] transition-[opacity,scale,rotate,filter] duration-300 ease-out-strong dark:scale-100 dark:rotate-0 dark:opacity-100 dark:blur-none" />
    </button>
  );
}

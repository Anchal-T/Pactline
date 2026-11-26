"use client";

import { useRef, useState } from "react";
import { ArrowUp } from "@phosphor-icons/react";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { getLenis } from "@/lib/lenis";
import { cn } from "@/lib/utils";

export function ScrollToTop() {
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    ScrollTrigger.create({ start: 720, end: "max", onToggle: (self) => setShown(self.isActive) });
  });

  const top = () => {
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(0, { duration: 1.4 });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      ref={ref}
      className={cn(
        "fixed right-5 bottom-5 z-40 transition-[opacity,translate] duration-300 ease-out-strong sm:right-7 sm:bottom-7",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <button
        type="button"
        onClick={top}
        aria-label="Back to top"
        tabIndex={shown ? 0 : -1}
        className="press grid size-12 place-items-center rounded-full bg-surface text-ink shadow-[0_10px_30px_-14px_rgb(15_58_43/0.45)] ring-1 ring-line-strong ring-inset outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring dark:shadow-[0_10px_30px_-10px_rgb(0_0_0/0.7)]"
      >
        <ArrowUp size={18} weight="light" />
      </button>
    </div>
  );
}

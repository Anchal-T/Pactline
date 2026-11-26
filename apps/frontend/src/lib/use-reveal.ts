"use client";

import type { RefObject } from "react";
import { gsap, ScrollTrigger, prefersReducedMotion, useGSAP } from "@/lib/gsap";

/** Fades and lifts every [data-reveal] inside scope as it enters the viewport, in small batches. */
export function useReveal(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      if (prefersReducedMotion() || !scope.current) return;
      const els = gsap.utils.toArray<HTMLElement>("[data-reveal]", scope.current);
      if (!els.length) return;
      gsap.set(els, { autoAlpha: 0, y: 28 });
      ScrollTrigger.batch(els, {
        start: "top 88%",
        once: true,
        onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1.1, ease: "expo.out", stagger: 0.07, overwrite: true }),
      });
    },
    { scope },
  );
}

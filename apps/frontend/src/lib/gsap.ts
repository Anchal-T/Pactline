"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);
// Mobile browsers resize the viewport as the address bar hides; re-measuring then makes pins jump.
if (typeof window !== "undefined") ScrollTrigger.config({ ignoreMobileResize: true });

export const EASE_OUT = "expo.out";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, ScrollTrigger, useGSAP };

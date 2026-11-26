import type Lenis from "lenis";

let instance: Lenis | null = null;

export const setLenis = (l: Lenis | null) => {
  instance = l;
};

export const getLenis = () => instance;

/** Pause smooth scrolling while an overlay owns the scroll. */
export function lockScroll(locked: boolean) {
  if (locked) instance?.stop();
  else instance?.start();
}

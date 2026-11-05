import { useEffect, useRef, useState } from "react";

const DURATION_MS = 600;

/** No `matchMedia` or animation frames (tests, very old browsers): show the number as is. */
function animates(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  if (typeof requestAnimationFrame !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A number that counts up to `value` (from 0 on first show, then from the last value shown),
 * easing out over 600 ms. With reduced motion it is simply `value`. Only for display: render
 * the real value too, for assistive technology and anything that reads the page.
 */
export function useCountUp(value: number): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const moving = animates();

  useEffect(() => {
    if (!moving) return;
    const start = from.current;
    let frame = 0;
    const begin = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - begin) / DURATION_MS);
      const next = Math.round(start + (value - start) * (1 - (1 - progress) ** 3));
      from.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, moving]);

  return moving ? shown : value;
}

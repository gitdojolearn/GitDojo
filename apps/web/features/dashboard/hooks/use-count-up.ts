import { useEffect, useRef, useState } from "react";
import { motionScale } from "@/features/settings";

const DURATION_MS = 600;

/**
 * How long counting takes, or 0 to show the number as is: with no `matchMedia` or animation frames
 * (tests, very old browsers), or with motion turned off by the learner or the operating system.
 */
function duration(): number {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return 0;
  if (typeof requestAnimationFrame !== "function") return 0;
  return DURATION_MS * motionScale();
}

/**
 * A number that counts up to `value` (from 0 on first show, then from the last value shown),
 * easing out over 600 ms (longer at slow animation speed). With motion off it is simply `value`. Only for display: render
 * the real value too, for assistive technology and anything that reads the page.
 */
export function useCountUp(value: number): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const length = duration();
  const moving = length > 0;

  useEffect(() => {
    if (!moving) return;
    const start = from.current;
    let frame = 0;
    const begin = performance.now();
    const step = (time: number) => {
      const progress = Math.min(1, (time - begin) / length);
      const next = Math.round(start + (value - start) * (1 - (1 - progress) ** 3));
      from.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [value, moving, length]);

  return moving ? shown : value;
}

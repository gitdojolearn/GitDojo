"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { REDUCED_MOTION_QUERY, SPLASH_ATTRIBUTE } from "./splash-script";

const REPLAY_EVENT = "gitdojo:intro-replay";
const SKIP_BUTTON_ID = "gd-splash-skip";
/** Once the overlay has gone, the hero's rise-in still has this long to finish. */
const HERO_SETTLE_MS = 450;

function mode() {
  return document.documentElement.getAttribute(SPLASH_ATTRIBUTE);
}

function isPlaying() {
  const current = mode();
  return current === "play" || current === "static";
}

/** Fades the intro out early. Focus never stays on a control that is about to disappear. */
function skipIntro(overlay: HTMLElement) {
  if (!isPlaying()) return;
  const hadFocus = overlay.contains(document.activeElement);
  document.documentElement.setAttribute(SPLASH_ATTRIBUTE, "skip");
  if (hadFocus) document.getElementById("hero-heading")?.focus({ preventScroll: true });
}

/** Starts the intro again: re-adding the attribute after a reflow restarts every CSS animation. */
export function replayIntro() {
  const root = document.documentElement;
  root.removeAttribute(SPLASH_ATTRIBUTE);
  // Reading layout applies the removal, so the animations start over when it is added back.
  root.getBoundingClientRect();
  root.setAttribute(
    SPLASH_ATTRIBUTE,
    window.matchMedia(REDUCED_MOTION_QUERY).matches ? "static" : "play",
  );
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

/**
 * The intro's overlay. The sequence itself is CSS (splash.css) and starts at first paint, before
 * this hydrates; this only ends it early (Skip, Escape, scrolling, a tap, or moving focus into
 * the page) and removes the attribute afterwards, so the page underneath is left untouched.
 */
export function SplashController({ children }: { children: ReactNode }) {
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = overlay.current;
    if (!element) return;
    const root = document.documentElement;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const skip = () => {
      skipIntro(element);
    };
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target !== element) return;
      if (event.animationName !== "gd-splash-out" && event.animationName !== "gd-splash-skip") {
        return;
      }
      clearTimeout(settle);
      settle = setTimeout(
        () => {
          root.removeAttribute(SPLASH_ATTRIBUTE);
        },
        mode() === "play" ? HERO_SETTLE_MS : 0,
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isPlaying() || event.key === "Tab" || event.key === "Shift") return;
      skip();
    };
    // Tabbing past Skip reaches the page, so the intro gets out of the way.
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) skip();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest("button")) return;
      skip();
    };
    const onReplay = () => {
      clearTimeout(settle);
      document.getElementById(SKIP_BUTTON_ID)?.focus({ preventScroll: true });
    };

    element.addEventListener("animationend", onAnimationEnd);
    element.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchmove", skip, { passive: true });
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => {
      clearTimeout(settle);
      element.removeEventListener("animationend", onAnimationEnd);
      element.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
      window.removeEventListener(REPLAY_EVENT, onReplay);
    };
  }, []);

  return (
    <div ref={overlay} className="gd-splash" data-testid="splash">
      {children}
      <button
        id={SKIP_BUTTON_ID}
        type="button"
        onClick={() => {
          if (overlay.current) skipIntro(overlay.current);
        }}
        className="gd-splash-skip inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-panel/80 px-3 text-small font-medium text-fg-secondary transition-colors duration-150 ease-out hover:bg-hover hover:text-fg"
      >
        Skip intro
        <kbd className="hidden rounded-sm border border-border bg-elevated px-1 font-mono text-micro text-fg-muted sm:inline">
          Esc
        </kbd>
      </button>
    </div>
  );
}

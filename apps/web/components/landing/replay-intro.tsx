"use client";

import { type ReactNode } from "react";
import { replayIntro } from "./splash-controller";

/**
 * Plays the first-visit intro again. The label (with its icon) comes from the server, so this
 * ships no icon code of its own.
 */
export function ReplayIntro({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={replayIntro}
      className="inline-flex items-center gap-1.5 rounded-sm text-small text-fg-muted underline-offset-4 transition-colors duration-150 ease-out hover:text-fg hover:underline [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

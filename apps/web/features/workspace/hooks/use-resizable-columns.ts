"use client";

import { useCallback, useSyncExternalStore, type CSSProperties } from "react";
import { gridTemplate, parseSizes, type ColumnSizes } from "../services/column-sizes";

const listeners = new Set<() => void>();
const memory = new Map<string, ColumnSizes>();

function storageKey(layout: string) {
  return `gitdojo:workspace-columns:${layout}`;
}

function read(layout: string): ColumnSizes | null {
  const remembered = memory.get(layout);
  if (remembered) return remembered;
  try {
    const saved = parseSizes(window.localStorage.getItem(storageKey(layout)));
    if (saved) memory.set(layout, saved);
    return saved;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The desktop workspace's column widths for one layout ("lesson", "playground"), remembered in
 * this browser. Renders the defaults on the server and until the saved sizes are read.
 */
export function useResizableColumns(layout: string, defaults: ColumnSizes) {
  const sizes =
    useSyncExternalStore(
      subscribe,
      () => read(layout),
      () => null,
    ) ?? defaults;

  const setSizes = useCallback(
    (next: ColumnSizes | null) => {
      if (next) memory.set(layout, next);
      else memory.delete(layout);
      try {
        if (next) window.localStorage.setItem(storageKey(layout), JSON.stringify(next));
        else window.localStorage.removeItem(storageKey(layout));
      } catch {
        // Blocked storage: the sizes still apply until the page is closed.
      }
      for (const listener of listeners) listener();
    },
    [layout],
  );

  const style = { "--gd-cols": gridTemplate(sizes) } as CSSProperties;
  const reset = () => {
    setSizes(null);
  };
  return { sizes, setSizes, style, reset };
}

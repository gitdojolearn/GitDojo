"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { isApplePlatform } from "../services/shortcuts";
import { usePaletteStore, type PaletteAction } from "../state/palette-store";

/**
 * Offers `actions` in the command palette (and their shortcuts) while the calling component is
 * mounted. Memoize the array: a new one re-registers.
 */
export function usePaletteActions(actions: readonly PaletteAction[]) {
  const source = useId();
  useEffect(() => {
    usePaletteStore.getState().register(source, actions);
  }, [source, actions]);
  useEffect(
    () => () => {
      usePaletteStore.getState().unregister(source);
    },
    [source],
  );
}

const noSubscription = () => () => undefined;

/** Whether to show ⌘ rather than Ctrl. False on the server, then corrected after hydration. */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(noSubscription, isApplePlatform, () => false);
}

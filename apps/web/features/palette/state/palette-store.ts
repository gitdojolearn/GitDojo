import { create } from "zustand";
import { type PaletteItem } from "../services/search";

/** A key combination: `mod` is ⌘ on Apple devices and Ctrl elsewhere. */
export interface Shortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
}

/** Something the palette can do on the current page. */
export interface PaletteAction extends PaletteItem {
  run: () => void;
  shortcut?: Shortcut;
  /** Unavailable right now (the workspace is still loading): listed, but not run. */
  disabled?: boolean;
}

interface PaletteState {
  open: boolean;
  /** Registered by whatever is on the page, keyed by who registered them. */
  sources: ReadonlyMap<string, readonly PaletteAction[]>;
  setOpen: (open: boolean) => void;
  register: (source: string, actions: readonly PaletteAction[]) => void;
  unregister: (source: string) => void;
}

export const usePaletteStore = create<PaletteState>((set) => ({
  open: false,
  sources: new Map(),
  setOpen: (open) => {
    set({ open });
  },
  register: (source, actions) => {
    set((state) => ({ sources: new Map(state.sources).set(source, actions) }));
  },
  unregister: (source) => {
    set((state) => {
      const sources = new Map(state.sources);
      sources.delete(source);
      return { sources };
    });
  },
}));

/** Opens the command palette from anywhere (a header button, a keyboard shortcut). */
export function openPalette() {
  usePaletteStore.getState().setOpen(true);
}

// The command palette's public API. Other features import only from here ("@/features/palette").

export { CommandPalette } from "./components/CommandPalette";
export { PaletteButton } from "./components/PaletteButton";
export { usePaletteActions } from "./hooks/use-palette-actions";
export { type PaletteLink } from "./services/search";
export { openPalette, type PaletteAction, type Shortcut } from "./state/palette-store";

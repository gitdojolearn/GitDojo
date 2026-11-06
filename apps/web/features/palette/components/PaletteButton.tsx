"use client";

import { cn, IconButton, Kbd, Tooltip } from "@gitdojo/ui";
import { Search } from "lucide-react";
import { useApplePlatform } from "../hooks/use-palette-actions";
import { openPalette } from "../state/palette-store";

/**
 * Opens the command palette. `compact` (workspace toolbars) is an icon; otherwise a search field
 * look-alike with the shortcut, as in most developer tools.
 */
export function PaletteButton({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const apple = useApplePlatform();
  const shortcut = `${apple ? "⌘" : "Ctrl"} K`;
  if (compact) {
    return (
      <Tooltip side="bottom" content={`Search and commands (${shortcut})`}>
        <IconButton
          aria-label="Open command palette"
          aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
          data-testid="palette-button"
          onClick={openPalette}
          className={className}
        >
          <Search />
        </IconButton>
      </Tooltip>
    );
  }
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Search lessons, commands and pages"
      aria-keyshortcuts={apple ? "Meta+K" : "Control+K"}
      data-testid="palette-button"
      className={cn(
        "flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border-subtle bg-surface px-2 text-small text-fg-muted transition-colors hover:border-border-strong hover:text-fg-secondary 2xl:pr-1.5 2xl:pl-2.5",
        className,
      )}
    >
      <Search className="size-4" aria-hidden="true" />
      <span className="max-2xl:sr-only">Search…</span>
      <span aria-hidden="true" className="ml-3 flex gap-0.5 max-2xl:hidden">
        <Kbd>{apple ? "⌘" : "Ctrl"}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

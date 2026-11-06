"use client";

import { cn, Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from "@gitdojo/ui";
import {
  ArrowRight,
  BookOpen,
  CornerDownLeft,
  FileText,
  Monitor,
  Moon,
  Search,
  Sparkles,
  SquareTerminal,
  Sun,
  Swords,
  Target,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { updateSettings, type MotionSetting } from "@/features/settings";
import { setTheme, type ThemePreference } from "@/features/theme";
import { useApplePlatform } from "../hooks/use-palette-actions";
import { groupItems, searchItems, type PaletteLink } from "../services/search";
import {
  isApplePlatform,
  isTypingSurface,
  matchesShortcut,
  shortcutKeys,
} from "../services/shortcuts";
import { usePaletteStore, type PaletteAction } from "../state/palette-store";

type Entry = (PaletteLink & { kind: "link" }) | (PaletteAction & { kind: "action" });

const THEMES: [ThemePreference, string, string][] = [
  ["dark", "Switch to dark theme", "dark mode night"],
  ["light", "Switch to light theme", "light mode day"],
  ["system", "Use the system theme", "auto os device"],
];

const MOTION: [MotionSetting, string][] = [
  ["normal", "Animation speed: normal"],
  ["slow", "Animation speed: slow"],
  ["off", "Turn animations off"],
];

/** Preferences that make sense from anywhere. */
const BUILTIN_ACTIONS: readonly PaletteAction[] = [
  ...THEMES.map(([theme, label, keywords]) => ({
    id: `theme-${theme}`,
    group: "Preferences",
    label,
    keywords: `theme appearance ${keywords}`,
    run: () => {
      setTheme(theme);
    },
  })),
  ...MOTION.map(([motion, label]) => ({
    id: `motion-${motion}`,
    group: "Preferences",
    label,
    keywords: "motion animation speed reduce",
    run: () => {
      updateSettings({ motion });
    },
  })),
];

const GROUP_ICONS: Record<string, ReactNode> = {
  Pages: <ArrowRight />,
  Lessons: <BookOpen />,
  Challenges: <Swords />,
  Practice: <Target />,
  "Git commands": <SquareTerminal />,
  Docs: <FileText />,
  Preferences: <Sparkles />,
};

function iconFor(entry: Entry): ReactNode {
  if (entry.id === "theme-dark") return <Moon />;
  if (entry.id === "theme-light") return <Sun />;
  if (entry.id === "theme-system") return <Monitor />;
  return GROUP_ICONS[entry.group] ?? <Zap />;
}

/** Text fields other than the terminal, where typing a shortcut's letter must just type it. */
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement) || target.closest(".xterm")) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * ⌘K / Ctrl+K: jump to any lesson, challenge, practice task, Git command or page, change
 * preferences, or run what the current page offers (reveal a hint, reset the lesson). Rendered
 * once, in the root layout.
 */
export function CommandPalette({ links }: { links: readonly PaletteLink[] }) {
  const open = usePaletteStore((state) => state.open);
  const setOpen = usePaletteStore((state) => state.setOpen);
  const sources = usePaletteStore((state) => state.sources);
  const router = useRouter();
  const apple = useApplePlatform();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const pageActions = useMemo(() => [...sources.values()].flat(), [sources]);

  // Global shortcuts: the palette itself, and whatever the page registered.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const apple = isApplePlatform();
      if (matchesShortcut(event, { key: "k", mod: true }, apple)) {
        // In the terminal and editor, Ctrl+K already deletes to the end of the line.
        if (!apple && isTypingSurface(event.target)) return;
        event.preventDefault();
        setOpen(!usePaletteStore.getState().open);
        return;
      }
      if (usePaletteStore.getState().open || inTextField(event.target)) return;
      if (event.target instanceof HTMLElement && event.target.closest(".monaco-editor")) return;
      for (const action of [...usePaletteStore.getState().sources.values()].flat()) {
        if (action.shortcut && !action.disabled && matchesShortcut(event, action.shortcut, apple)) {
          event.preventDefault();
          action.run();
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setOpen]);

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...pageActions.map((action) => ({ ...action, kind: "action" as const })),
      ...links.map((link) => ({ ...link, kind: "link" as const })),
      ...BUILTIN_ACTIONS.map((action) => ({ ...action, kind: "action" as const })),
    ];
    return searchItems(all, query, query.trim() ? 6 : 5);
  }, [pageActions, links, query]);
  const groups = useMemo(() => groupItems(entries), [entries]);

  const current = entries[Math.min(active, entries.length - 1)];

  useEffect(() => {
    if (!current) return;
    document.getElementById(`${listId}-${current.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current, listId]);

  const choose = (entry: Entry | undefined) => {
    if (!entry || (entry.kind === "action" && entry.disabled)) return;
    setOpen(false);
    if (entry.kind === "link") router.push(entry.href);
    // After the dialog has closed and returned focus, so an action can move focus itself.
    else window.setTimeout(entry.run, 0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showClose={false}
        data-testid="command-palette"
        className="top-[12vh] max-w-[600px] translate-y-0 overflow-hidden p-0"
        onOpenAutoFocus={() => {
          setQuery("");
          setActive(0);
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search lessons, challenges, Git commands and pages, or run an action. Use the arrow keys
          to choose and Enter to open.
        </DialogDescription>
        <div className="flex items-center gap-3 border-b border-border-subtle px-4">
          <Search className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
          <input
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current ? `${listId}-${current.id}` : undefined}
            aria-label="Search"
            placeholder="Search lessons, commands, pages…"
            data-testid="palette-input"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              const last = entries.length - 1;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((index) => (index >= last ? 0 : index + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((index) => (index <= 0 ? last : index - 1));
              } else if (event.key === "Home" && event.ctrlKey) {
                event.preventDefault();
                setActive(0);
              } else if (event.key === "End" && event.ctrlKey) {
                event.preventDefault();
                setActive(last);
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(current);
              }
            }}
            className="h-12 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-placeholder"
          />
          <Kbd aria-hidden="true">Esc</Kbd>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Results"
          className="max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain p-2"
        >
          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-small text-fg-muted" role="presentation">
              Nothing matches “{query}”.
            </p>
          ) : (
            groups.map(([group, items]) => (
              <div key={group} role="group" aria-label={group} className="mb-1 last:mb-0">
                <p
                  aria-hidden="true"
                  className="px-3 pt-2 pb-1 text-micro font-semibold tracking-wider text-fg-muted uppercase"
                >
                  {group}
                </p>
                {items.map((entry) => {
                  const selected = entry.id === current?.id;
                  const disabled = entry.kind === "action" && entry.disabled;
                  return (
                    <div
                      key={entry.id}
                      id={`${listId}-${entry.id}`}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={disabled || undefined}
                      data-testid="palette-option"
                      onPointerMove={() => {
                        if (!selected) setActive(entries.indexOf(entry));
                      }}
                      onClick={() => {
                        choose(entry);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-small [&_svg]:size-4 [&_svg]:shrink-0",
                        selected ? "bg-hover text-fg" : "text-fg-secondary",
                        disabled && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <span className={selected ? "text-accent" : "text-fg-muted"}>
                        {iconFor(entry)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{entry.label}</span>
                        {entry.hint ? (
                          <span className="block truncate text-caption text-fg-muted">
                            {entry.hint}
                          </span>
                        ) : null}
                      </span>
                      {entry.kind === "action" && entry.shortcut ? (
                        <span aria-hidden="true" className="flex gap-0.5">
                          {shortcutKeys(entry.shortcut, apple).map((key) => (
                            <Kbd key={key}>{key}</Kbd>
                          ))}
                        </span>
                      ) : selected ? (
                        <CornerDownLeft className="text-fg-muted" aria-hidden="true" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div
          aria-hidden="true"
          className="flex items-center gap-4 border-t border-border-subtle px-4 py-2 text-caption text-fg-muted"
        >
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to choose
          </span>
          <span className="flex items-center gap-1">
            <Kbd>↵</Kbd> to open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <Kbd>{apple ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd> anywhere
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

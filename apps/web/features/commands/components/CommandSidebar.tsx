"use client";

import { cn } from "@gitdojo/ui";
import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { CATEGORIES, commandHref, type CommandCategory } from "../services/catalog";

export interface CommandListItem {
  name: string;
  summary: string;
  category: CommandCategory;
}

/** Every command by category, with a filter. On phones it sits above the page as a list. */
export function CommandSidebar({ commands }: { commands: readonly CommandListItem[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const inputId = useId();
  const listId = useId();
  // Phones and tablets: the list folds away unless asked for or searched, so the page comes first.
  const [open, setOpen] = useState(false);
  const expanded = open || query.trim() !== "";
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = commands.filter((command) => {
    const text = `git ${command.name} ${command.summary}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });

  return (
    <nav aria-label="Git commands" className="lg:sticky lg:top-20" data-testid="command-sidebar">
      <label htmlFor={inputId} className="sr-only">
        Search Git commands
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-fg-muted"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Search Git commands…"
          data-testid="command-search"
          className="h-9 w-full rounded-md border border-border-input bg-panel pr-3 pl-8 text-small text-fg placeholder:text-fg-placeholder"
        />
      </div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="mt-2 flex w-full items-center justify-between rounded-md px-2 py-1.5 text-small text-fg-secondary hover:bg-hover lg:hidden"
      >
        All commands
        <ChevronDown
          className={cn("size-4 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <div
        id={listId}
        className={cn(
          "mt-4 max-h-[calc(100dvh-10rem)] space-y-4 overflow-y-auto pr-1 max-lg:mt-2 max-lg:max-h-72",
          !expanded && "max-lg:hidden",
        )}
      >
        {shown.length === 0 ? (
          <p className="px-2 text-small text-fg-muted" role="status">
            No command matches “{query}”.
          </p>
        ) : null}
        {CATEGORIES.map((category) => {
          const inCategory = shown.filter((command) => command.category === category);
          if (inCategory.length === 0) return null;
          return (
            <div key={category}>
              <p className="px-2 text-micro font-semibold tracking-wider text-fg-muted uppercase">
                {category}
              </p>
              <ul className="mt-1">
                {inCategory.map((command) => {
                  const href = commandHref(command.name);
                  const current = pathname === href;
                  return (
                    <li key={command.name}>
                      <Link
                        href={href}
                        aria-current={current ? "page" : undefined}
                        onClick={() => {
                          setOpen(false);
                          setQuery("");
                        }}
                        className={cn(
                          "block rounded-md px-2 py-1 font-mono text-caption transition-colors",
                          current
                            ? "bg-accent-soft text-accent"
                            : "text-fg-secondary hover:bg-hover hover:text-fg",
                        )}
                      >
                        git {command.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

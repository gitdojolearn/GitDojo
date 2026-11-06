"use client";

import { cn } from "@gitdojo/ui";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";

export interface DocLinkItem {
  slug: string;
  title: string;
  category: string;
}

/** Every doc page by category; the open one is marked. */
export function DocsSidebar({ docs }: { docs: readonly DocLinkItem[] }) {
  const pathname = usePathname();
  const categories = [...new Set(docs.map((doc) => doc.category))];
  // Phones and tablets: the list folds away above the page, so the article comes first.
  const [open, setOpen] = useState(false);
  const listId = useId();
  const current = docs.find((doc) => pathname === `/docs/${doc.slug}`);
  return (
    <nav aria-label="Documentation" className="lg:sticky lg:top-20" data-testid="docs-sidebar">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className="flex w-full items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2 text-small text-fg-secondary lg:hidden"
      >
        <span>
          <span className="text-fg-muted">Docs</span>
          {current ? <span className="text-fg"> / {current.title}</span> : null}
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <div
        id={listId}
        className={cn(
          "space-y-5 max-lg:mt-3 max-lg:grid max-lg:grid-cols-2 max-lg:gap-4 max-lg:space-y-0 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pr-1",
          !open && "max-lg:hidden",
        )}
      >
        {categories.map((category) => (
          <div key={category}>
            <p className="px-2 text-micro font-semibold tracking-wider text-fg-muted uppercase">
              {category}
            </p>
            <ul className="mt-1">
              {docs
                .filter((doc) => doc.category === category)
                .map((doc) => {
                  const href = `/docs/${doc.slug}`;
                  const isCurrent = pathname === href;
                  return (
                    <li key={doc.slug}>
                      <Link
                        href={href}
                        aria-current={isCurrent ? "page" : undefined}
                        onClick={() => {
                          setOpen(false);
                        }}
                        className={cn(
                          "block rounded-md px-2 py-1 text-small transition-colors",
                          isCurrent
                            ? "bg-accent-soft text-accent"
                            : "text-fg-secondary hover:bg-hover hover:text-fg",
                        )}
                      >
                        {doc.title}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

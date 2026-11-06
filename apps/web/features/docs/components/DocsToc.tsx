"use client";

import { cn } from "@gitdojo/ui";
import { useEffect, useState } from "react";

export interface TocHeading {
  id: string;
  text: string;
  depth: number;
}

/** "On this page": the doc's sections, with the one being read highlighted. */
export function DocsToc({ headings }: { headings: readonly TocHeading[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((element): element is HTMLElement => element !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        const first = visible.sort(
          (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
        )[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const element of elements) observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [headings]);

  if (headings.length === 0) return null;
  return (
    <nav aria-label="On this page" className="sticky top-20" data-testid="docs-toc">
      <p className="text-micro font-semibold tracking-wider text-fg-muted uppercase">
        On this page
      </p>
      <ul className="mt-2 max-h-[calc(100dvh-9rem)] space-y-1 overflow-y-auto border-l border-border-subtle">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={active === heading.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l py-0.5 text-caption transition-colors",
                heading.depth === 3 ? "pl-6" : "pl-3",
                active === heading.id
                  ? "border-accent text-accent"
                  : "border-transparent text-fg-muted hover:text-fg",
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

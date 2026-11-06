import { Button, cn } from "@gitdojo/ui";
import { Compass, RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

/** A grey block standing in for content that is on its way. Purely decorative. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-lg bg-panel", className)} />;
}

/** Announces the wait once, for assistive technology; the skeleton itself is hidden. */
function Loading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" data-testid="page-loading">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** The lesson workspace's outline while a lesson, challenge or the playground loads. */
export function WorkspaceSkeleton({ label = "Loading the workspace…" }: { label?: string }) {
  return (
    <Loading label={label}>
      <div className="flex min-h-dvh flex-col lg:h-dvh">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-2 w-56 max-md:hidden" />
          <Skeleton className="ml-auto h-8 w-24 md:ml-6" />
        </div>
        <div className="grid flex-1 gap-3 p-3 md:grid-cols-2 lg:grid-cols-[26fr_44fr_30fr] lg:grid-rows-[minmax(0,1fr)_minmax(200px,32%)]">
          <Skeleton className="h-[480px] lg:h-auto" />
          <div className="flex h-[480px] flex-col rounded-lg border border-border-subtle bg-terminal p-4 lg:h-auto">
            <Skeleton className="h-3 w-3/4 bg-elevated" />
            <Skeleton className="mt-3 h-3 w-1/2 bg-elevated" />
            <Skeleton className="mt-3 h-3 w-1/3 bg-elevated" />
          </div>
          <Skeleton className="h-[360px] max-md:hidden md:col-span-2 lg:col-span-1 lg:h-auto" />
          <div className="grid gap-3 max-md:hidden md:col-span-2 md:grid-cols-3 lg:col-span-3">
            <Skeleton className="h-full min-h-32" />
            <Skeleton className="h-full min-h-32" />
            <Skeleton className="h-full min-h-32" />
          </div>
        </div>
      </div>
    </Loading>
  );
}

/** A content page (dashboard, course list) while it loads: a title and a few cards. */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <Loading label={label}>
      <div className="h-14 border-b border-border-subtle" />
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 sm:px-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="mt-6 h-64 rounded-xl" />
      </div>
    </Loading>
  );
}

/**
 * Something failed: a plain explanation, a way to try again, and the technical details for
 * anyone reporting it, folded away by default.
 */
export function ErrorState({
  title = "Something went wrong loading this page.",
  description = "It may be a temporary problem. Try again, and if it keeps happening, reload the page.",
  details,
  onRetry,
}: {
  title?: string;
  description?: string;
  details?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      data-testid="error-state"
      className="mx-auto mt-16 max-w-md rounded-xl border border-border bg-panel p-6 text-center sm:mt-24"
    >
      <TriangleAlert className="mx-auto size-6 text-danger" aria-hidden="true" />
      <p className="mt-3 text-body font-medium text-fg">{title}</p>
      <p className="mt-1 text-small text-fg-secondary">{description}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            <RotateCcw /> Retry
          </Button>
        ) : null}
        <Button asChild variant="secondary">
          <Link href="/">Go home</Link>
        </Button>
      </div>
      {details ? (
        <details className="mt-4 text-left">
          <summary className="cursor-pointer text-caption text-fg-muted">Show details</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-terminal p-3 font-mono text-caption whitespace-pre-wrap text-fg-secondary">
            {details}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

const SUGGESTIONS = [
  { href: "/learn", label: "Courses", hint: "Start or continue learning" },
  { href: "/playground", label: "Playground", hint: "Try any Git command" },
  { href: "/commands", label: "Git commands", hint: "Look up what a command does" },
] as const;

/** A page that does not exist, with somewhere useful to go instead. */
export function NotFoundState() {
  return (
    <div className="mx-auto max-w-xl text-center" data-testid="not-found">
      <p className="font-mono text-small text-fg-muted">
        <span className="text-danger">fatal:</span> ambiguous argument &apos;this-page&apos;:
        unknown revision or path not in the working tree.
      </p>
      <h1 className="mt-4 text-h2 font-semibold tracking-tight text-fg sm:text-h1">
        Page not found
      </h1>
      <p className="mt-3 text-body text-fg-secondary">
        The link may be old, or the page may have moved. These are good places to pick up from:
      </p>
      <ul className="mt-8 grid gap-3 text-left sm:grid-cols-3">
        {SUGGESTIONS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="block h-full rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong hover:bg-panel"
            >
              <span className="flex items-center gap-2 text-small font-medium text-fg">
                <Compass className="size-4 text-accent" aria-hidden="true" />
                {item.label}
              </span>
              <span className="mt-1 block text-caption text-fg-muted">{item.hint}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

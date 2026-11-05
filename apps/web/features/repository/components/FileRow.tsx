"use client";

import { type FileState } from "@gitdojo/shared-types";
import { cn } from "@gitdojo/ui";
import { CircleCheck, FileText } from "lucide-react";
import { useState, type ReactNode } from "react";
import { type FileArrival, type FileDeparture } from "../services/transitions";
import { GitStatusBadge } from "./GitStatusBadge";

export type FileRowAnimation = "enter" | "move-in";

/**
 * How a row arrives: from the panel to the left by default (working tree → staging), from the
 * right when a change is undone (repository → staging → working tree), from below out of the
 * stash.
 */
export function arrivalAnimation(base: FileRowAnimation, arrival: FileArrival | undefined): string {
  if (arrival === "stash") return "animate-gd-rise";
  if (arrival === "repository" || arrival === "staging") return "animate-gd-move-in-reverse";
  return base === "move-in" ? "animate-gd-move-in" : "animate-gd-enter";
}

const LEAVING: Record<FileDeparture, string> = {
  // Onwards to the next panel, to the right.
  staged: "animate-gd-leave-right",
  committed: "animate-gd-leave-right",
  // Back to the previous panel, to the left.
  unstaged: "animate-gd-leave-left",
  // Down into the stash.
  stashed: "animate-gd-leave-down",
  // Thrown away: struck through and faded out.
  discarded: "animate-gd-leave-fade line-through",
};

/**
 * One file in a working-tree / staging list. Rows mount with a short movement animation so a
 * file visibly "arrives" when a command moves it between areas.
 */
export function FileRow({
  file,
  animation,
  arrival,
  attention = false,
  resolved = false,
  action,
  onOpen,
}: {
  file: FileState;
  animation: FileRowAnimation;
  /** Where the file just came from, when a command moved it here. */
  arrival?: FileArrival;
  /** A conflict that just appeared: one short pulse to draw the eye. */
  attention?: boolean;
  /** A conflict that was just resolved and staged: a check appears beside it. */
  resolved?: boolean;
  /** Optional control shown next to the status, e.g. "Resolve" for a conflict. */
  action?: ReactNode;
  /** Opens the file in the editor; the path becomes a button when set. */
  onOpen?: (path: string) => void;
}) {
  // Decided when the row mounts: arriving is a one-time event, and a later re-render (once the
  // command is old news) must not swap the class and replay a different animation.
  const [entrance] = useState(() =>
    attention ? "animate-gd-attention" : arrivalAnimation(animation, arrival),
  );
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-hover",
        entrance,
      )}
      data-testid="file-row"
      data-path={file.path}
      data-status={file.status}
    >
      <span className="flex min-w-0 items-center gap-2">
        <FileText className="size-4 shrink-0 text-fg-muted" aria-hidden="true" />
        {onOpen ? (
          <button
            type="button"
            title={`Open ${file.path} in the editor`}
            onClick={() => {
              onOpen(file.path);
            }}
            className="truncate font-mono text-small text-fg hover:underline"
          >
            {file.path}
          </button>
        ) : (
          <span className="truncate font-mono text-small text-fg">{file.path}</span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {resolved ? (
          <CircleCheck
            className="size-4 animate-gd-check text-success"
            aria-hidden="true"
            data-testid="conflict-resolved-check"
          />
        ) : null}
        {action}
        <GitStatusBadge status={file.status} change={file.change} />
      </span>
    </li>
  );
}

/**
 * A file that just left a panel, shown for a moment going the way it went (on to the next panel,
 * back to the previous one, into the stash, or thrown away), then collapsing. Decorative: its
 * text comes from a data attribute, so lists, tests and screen readers only see real files.
 */
export function LeavingFileRow({ file, reason }: { file: FileState; reason: FileDeparture }) {
  return (
    <li
      aria-hidden="true"
      data-testid="leaving-file-row"
      data-reason={reason}
      data-path={file.path}
      className={cn(
        "pointer-events-none flex max-h-10 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5",
        "after:truncate after:font-mono after:text-small after:text-fg-muted after:content-[attr(data-path)]",
        LEAVING[reason],
      )}
    >
      <FileText className="size-4 shrink-0 text-fg-faint" aria-hidden="true" />
    </li>
  );
}

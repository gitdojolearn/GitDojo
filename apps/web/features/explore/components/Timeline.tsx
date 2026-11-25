"use client";

import { Badge, cn } from "@gitdojo/ui";
import {
  ArrowDownToLine,
  Cherry,
  Copy,
  Dot,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  GitMerge,
  LifeBuoy,
  LocateFixed,
  type LucideIcon,
  PenLine,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { renderInline } from "@/components/content/rich-text";
import { formatTimestamp } from "@/lib/time";
import { short } from "../services/ancestry";
import { type TimelineEvent, type TimelineKind } from "../services/timeline";
import { type UndoSuggestion, undoSuggestion } from "../services/undo";
import { UndoPanel } from "./UndoPanel";

const ICONS: Record<TimelineKind, LucideIcon> = {
  commit: GitCommitHorizontal,
  amend: PenLine,
  merge: GitMerge,
  switch: GitBranch,
  detach: LocateFixed,
  reset: RotateCcw,
  rebase: GitCompareArrows,
  "cherry-pick": Cherry,
  revert: Undo2,
  pull: ArrowDownToLine,
  clone: Copy,
  other: Dot,
};

const dayOf = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const timeOf = (timestamp: number) =>
  new Date(timestamp * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** The DOM id of a timeline step, so other parts of the explorer can bring it into view. */
export const stepId = (selector: string) =>
  `explore-step-${selector.replace(/\D/g, "") || "unknown"}`;

/** Scrolls a timeline step into view and focuses it. */
export function showStep(selector: string) {
  const step = document.getElementById(stepId(selector));
  step?.scrollIntoView({ block: "center" });
  step?.querySelector("button")?.focus({ preventScroll: true });
}

function Step({
  event,
  undo,
  selected,
  onSelect,
}: {
  event: TimelineEvent;
  undo: UndoSuggestion | null;
  selected: boolean;
  onSelect: (oid: string) => void;
}) {
  const Icon = ICONS[event.kind];
  const left = event.leftBehind;
  return (
    <li id={stepId(event.selector)} className="scroll-mt-8">
      <button
        type="button"
        disabled={!event.inGraph}
        onClick={() => {
          onSelect(event.oid);
        }}
        className={cn(
          "flex w-full gap-3 rounded-md px-2 py-2 text-left transition-colors",
          event.inGraph ? "hover:bg-hover" : "cursor-default",
          selected && "bg-accent-soft",
        )}
        title={`${event.selector}: ${event.message}`}
      >
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-elevated text-fg-secondary">
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <time
              dateTime={new Date(event.timestamp * 1000).toISOString()}
              title={formatTimestamp(event.timestamp)}
              className="shrink-0 font-mono text-caption text-fg-muted"
            >
              {timeOf(event.timestamp)}
            </time>
            <span className="min-w-0 text-small break-words text-fg">
              {renderInline(event.title)}
            </span>
          </span>
          {event.command ? (
            <code className="mt-1 inline-block font-mono text-caption text-fg-muted">
              $ {event.command}
            </code>
          ) : null}
          {event.note ? (
            <span className="mt-1 block text-caption text-fg-secondary">
              {renderInline(event.note)}
            </span>
          ) : null}
          {left ? (
            <span
              className={cn(
                "mt-1.5 flex gap-1.5 rounded-sm px-2 py-1 text-caption",
                left.recoveredBy ? "bg-success-soft text-fg" : "bg-warning-soft text-fg",
              )}
            >
              <TriangleAlert
                aria-hidden="true"
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  left.recoveredBy ? "text-success" : "text-warning",
                )}
              />
              <span>
                {left.recoveredBy
                  ? renderInline(
                      `This left \`${short(left.oid)}\` behind; \`${left.recoveredBy}\` brought it back.`,
                    )
                  : renderInline(
                      `\`${short(left.oid)}\` is now on no branch: only the reflog remembers it.`,
                    )}
              </span>
            </span>
          ) : null}
          {event.recovered ? (
            <Badge tone="success" className="mt-1.5">
              <LifeBuoy aria-hidden="true" />
              Recovered {short(event.recovered)}
            </Badge>
          ) : null}
        </span>
      </button>
      {undo ? <UndoPanel suggestion={undo} onShowStep={showStep} className="mt-1 ml-11" /> : null}
    </li>
  );
}

/**
 * HEAD's reflog as a story, newest first and grouped by day. Selecting a step selects the commit
 * it moved HEAD to.
 */
export function Timeline({
  events,
  truncated,
  selectedOid,
  onSelect,
}: {
  events: readonly TimelineEvent[];
  truncated: boolean;
  selectedOid: string | null;
  onSelect: (oid: string) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="text-small text-fg-muted">
        This repository has no reflog, so there is no record of what was done in it. A fresh clone
        starts with one entry; every commit, switch, merge or reset after that adds one.
      </p>
    );
  }
  const days: { day: string; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const day = dayOf(event.timestamp);
    const last = days.at(-1);
    if (last?.day === day) last.events.push(event);
    else days.push({ day, events: [event] });
  }
  return (
    <ol aria-label="Timeline" data-testid="explore-timeline" className="space-y-4">
      {days.map(({ day, events: dayEvents }) => (
        <li key={day}>
          <h3 className="sticky top-0 z-10 bg-panel px-2 py-1 text-micro font-semibold tracking-wider text-fg-muted uppercase">
            {day}
          </h3>
          <ol className="space-y-0.5">
            {dayEvents.map((event) => (
              <Step
                key={event.selector}
                event={event}
                undo={undoSuggestion(event, events, truncated)}
                selected={event.oid === selectedOid}
                onSelect={onSelect}
              />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

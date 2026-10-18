import { cn } from "@gitdojo/ui";
import { Circle, CircleCheck, CircleDot, type LucideIcon } from "lucide-react";
import { type RequirementStatus, type TrackProgress } from "@/lib/certificates/track";

/** A track requirement with what the learner needs to find it. */
export interface TrackRequirementInfo {
  id: string;
  kind: "lesson" | "practice";
  order: number;
  title: string;
  /** One line from the content: the lesson's goal or the task's mission. */
  description?: string;
  /** Where to do it; absent when the content is missing from this site. */
  href?: string;
  course?: string;
}

export const STATUS_DISPLAY: Record<
  RequirementStatus,
  { label: string; icon: LucideIcon; tone: string }
> = {
  complete: { label: "Complete", icon: CircleCheck, tone: "text-success" },
  "in-progress": { label: "In progress", icon: CircleDot, tone: "text-accent" },
  "not-started": { label: "Not started", icon: Circle, tone: "text-fg-muted" },
};

/** "4 of 11 requirements complete", with a labelled bar. */
export function TrackProgressBar({
  progress,
  label,
  className,
}: {
  progress: TrackProgress;
  label: string;
  className?: string;
}) {
  const text = `${String(progress.completed)} of ${String(progress.total)} requirements complete`;
  return (
    <div className={className}>
      <p className="flex items-baseline justify-between gap-3 text-small text-fg-secondary">
        <span data-testid="track-count">
          <span className="font-mono font-semibold text-fg">{progress.completed}</span> of{" "}
          <span className="font-mono">{progress.total}</span> requirements complete
        </span>
        <span className="font-mono text-caption text-fg-muted">{progress.percent}%</span>
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuetext={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="mt-2 h-2 overflow-hidden rounded-full bg-border-strong"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            progress.eligible ? "bg-success" : "bg-accent",
          )}
          style={{ width: `${String(progress.percent)}%` }}
        />
      </div>
    </div>
  );
}

export function RequirementStatusLabel({ status }: { status: RequirementStatus }) {
  const { label, icon: Icon, tone } = STATUS_DISPLAY[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-caption font-medium", tone)}
      data-testid="requirement-status"
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Content text with its `backtick` spans shown as code, as lessons write them. */
export function WithInlineCode({ text }: { text: string }) {
  return text.split(/(`[^`]+`)/).map((part, index) =>
    part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
      <code key={index} className="gd-code">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

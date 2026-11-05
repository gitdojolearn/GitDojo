import { Badge, cn, Tooltip } from "@gitdojo/ui";
import { ArrowRight, Cloud, GitBranch, Tag } from "lucide-react";
import { type CSSProperties } from "react";
import { type RefKey } from "../services/transitions";

export const HEAD_EXPLANATION =
  "HEAD points to the branch you are on, and so to the commit your files are based on.";

export interface RefLabelsProps {
  /** Branches pointing at this commit. */
  branches: readonly string[];
  /** Tags naming this commit. */
  tags?: readonly string[];
  /** Remote-tracking branches (`origin/main`) at this commit. */
  remoteBranches?: readonly string[];
  /** HEAD points at this commit. */
  isHead: boolean;
  /** HEAD's branch, when HEAD is attached to one. */
  currentBranch: string | null;
  /** Explain HEAD in a tooltip (off inside static illustrations). */
  withTooltip?: boolean;
  className?: string;
  /**
   * Labels that just arrived here: how far above (negative) or below they were, in px, so they
   * glide over from their old commit, or `"new"` for a label that did not exist before.
   */
  motion?: Partial<Record<RefKey, number | "new">>;
}

/** Glides a label in from where it was, or pops in a label that is new. */
function motionOf(
  motion: RefLabelsProps["motion"],
  key: RefKey,
): { className?: string; style?: CSSProperties } {
  const value = motion?.[key];
  if (value === undefined) return {};
  if (value === "new") return { className: "animate-gd-pop" };
  return {
    className: "animate-gd-glide",
    style: { "--gd-from-y": `${String(value)}px` } as CSSProperties,
  };
}

/**
 * Branch and HEAD labels for a commit. HEAD is a solid blue chip and sits in front of the branch
 * it points to (`HEAD → main`), so it never reads as just another branch.
 */
export function RefLabels({
  branches,
  tags = [],
  remoteBranches = [],
  isHead,
  currentBranch,
  withTooltip = true,
  className,
  motion,
}: RefLabelsProps) {
  if (branches.length === 0 && tags.length === 0 && remoteBranches.length === 0 && !isHead) {
    return null;
  }
  const attachedTo =
    isHead && currentBranch !== null && branches.includes(currentBranch) ? currentBranch : null;
  const others = branches.filter((branch) => branch !== attachedTo);
  // HEAD and the branch it is attached to move together, as one label.
  const headMotion = motionOf(motion, isHead ? "head" : `branch:${attachedTo ?? ""}`);

  const head = (
    <Badge
      tone="accent"
      data-testid="head-label"
      className="border-accent-strong bg-accent-strong text-on-accent"
    >
      HEAD
    </Badge>
  );

  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {isHead ? (
        <span
          className={cn("inline-flex items-center gap-1", headMotion.className)}
          style={headMotion.style}
          data-motion={headMotion.className ? "moved" : undefined}
        >
          {withTooltip ? (
            <Tooltip content={HEAD_EXPLANATION}>
              <span tabIndex={0} className="nopan inline-flex rounded-sm">
                {head}
              </span>
            </Tooltip>
          ) : (
            head
          )}
          {attachedTo !== null ? (
            <>
              <ArrowRight className="size-3 text-accent" aria-label="points to" />
              <BranchLabel name={attachedTo} current />
            </>
          ) : null}
        </span>
      ) : null}
      {others.map((branch) => (
        <BranchLabel
          key={branch}
          name={branch}
          current={false}
          {...motionOf(motion, `branch:${branch}`)}
        />
      ))}
      {tags.map((tag) => (
        <Badge
          key={tag}
          tone="warning"
          mono
          data-testid="tag-label"
          data-tag={tag}
          {...motionOf(motion, `tag:${tag}`)}
        >
          <Tag aria-hidden="true" />
          <span className="sr-only">tag </span>
          {tag}
        </Badge>
      ))}
      {remoteBranches.map((ref) => (
        <Badge
          key={ref}
          tone="neutral"
          mono
          data-testid="remote-branch-label"
          data-ref={ref}
          className={cn("border-dashed", motionOf(motion, `remote:${ref}`).className)}
          style={motionOf(motion, `remote:${ref}`).style}
        >
          <Cloud aria-hidden="true" />
          <span className="sr-only">remote-tracking branch </span>
          {ref}
        </Badge>
      ))}
    </span>
  );
}

function BranchLabel({
  name,
  current,
  className,
  style,
}: {
  name: string;
  current: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Badge
      tone="branch"
      mono
      data-testid="branch-label"
      data-branch={name}
      data-current={current || undefined}
      className={cn(current && "ring-1 ring-branch/60", className)}
      style={style}
    >
      <GitBranch aria-hidden="true" />
      {name}
    </Badge>
  );
}

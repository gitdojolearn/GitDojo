import { short } from "./ancestry";
import { type TimelineEvent } from "./timeline";

/** One command the learner can copy and run in their own terminal. GitDojo never runs it. */
export interface UndoOption {
  /** Plain text, ready to paste. Always commit ids, never `HEAD@{n}`. */
  command: string;
  /** One sentence on what it does, with `code` for names (rendered by `renderInline`). */
  explanation: string;
  recommended: boolean;
}

/** How to undo one timeline step, or get back the commits it left behind. */
export interface UndoSuggestion {
  /** Already recovered: names the step that brought the commit back. */
  recoveredBy: string | null;
  options: UndoOption[];
  /** Something the learner should know before anything else, e.g. a rebase still running. */
  warning: string | null;
  /** Extra context, with `code` for names: why there is no undo command, how long commits last. */
  notes: string[];
}

const REBASE_START = /^rebase( -i)? \(start\)/;
const REBASE_END = /^rebase( -i)? \((finish|abort)\): (?:returning to )?(?:refs\/heads\/)?(.+)$/;
const LEFT_DETACHED = /^checkout: moving from ([0-9a-f]{7,40}) to /;

export const OLDER_STEP_NOTE =
  "Only the newest step (`HEAD@{0}`) gets an undo command: undoing an older one with `git reset` would also throw away every commit made after it.";

export const GC_NOTE =
  "Don't wait too long: `git gc` deletes commits on no branch once their reflog entries expire (90 days by default, 30 for unreachable ones).";

export const STASH_NOTE =
  "HEAD did not move, so no commits were lost. If you ran `git stash`, your changes are in `git stash list`.";

export const REBASE_IN_PROGRESS =
  "This rebase may still be in progress. `git rebase --abort` cancels it.";

export const NOTHING_LEFT_NOTE =
  "No commits were left behind by this step, so there is nothing to recover.";

const rescue = (oid: string): UndoOption => ({
  command: `git branch rescue/${short(oid)} ${short(oid)}`,
  explanation: `Puts a new branch on \`${short(oid)}\` and changes nothing else: not your files, not your current branch. Look at it, merge it or cherry-pick from it when you are ready.`,
  recommended: true,
});

/** Where a rebase that finished at `index` started: the nearest older `rebase (start)`. */
function rebaseStartOf(events: readonly TimelineEvent[], index: number): number {
  for (let older = index + 1; older < events.length; older += 1) {
    if (REBASE_START.test(events[older]?.message ?? "")) return older;
  }
  return -1;
}

/** A rebase started at `index` with no later `finish` or `abort` may still be running. */
function rebaseUnfinished(events: readonly TimelineEvent[], index: number): boolean {
  for (let newer = index - 1; newer >= 0; newer -= 1) {
    const message = events[newer]?.message ?? "";
    if (REBASE_END.test(message) || REBASE_START.test(message)) return false;
  }
  return true;
}

interface Undo {
  /** Index of the entry HEAD pointed at before: its `oid` is the target, its selector the label. */
  targetIndex: number;
  option(target: string, label: string): UndoOption;
}

/** The command that undoes this step itself, for the kinds of step that have one. */
function undoOf(
  event: TimelineEvent,
  events: readonly TimelineEvent[],
  index: number,
): Undo | null {
  if (event.kind === "reset") {
    return {
      targetIndex: index + 1,
      option: (target, label) => ({
        command: `git reset --keep ${short(target)}`,
        explanation: `Moves the branch back to \`${short(target)}\`, where HEAD was at \`${label}\` before this reset. \`--keep\` refuses to run rather than overwrite uncommitted changes.`,
        recommended: false,
      }),
    };
  }
  if (event.kind === "amend") {
    return {
      targetIndex: index + 1,
      option: (target, label) => ({
        command: `git reset --soft ${short(target)}`,
        explanation: `Makes the original commit \`${short(target)}\` (where HEAD was at \`${label}\`, before the amend) current again. What the amend changed stays staged, so nothing is lost: commit it again or drop it.`,
        recommended: false,
      }),
    };
  }
  const end = REBASE_END.exec(event.message);
  if (end?.[2] === "finish") {
    const start = rebaseStartOf(events, index);
    if (start < 0) return null;
    const branch = end[3] ?? "";
    return {
      targetIndex: start + 1,
      option: (target, label) => ({
        command: `git reset --keep ${short(target)}`,
        explanation: `Puts \`${branch}\` back exactly as it was before the rebase: \`${short(target)}\`, where HEAD was at \`${label}\`. You have to be on \`${branch}\` for this, so run \`git switch ${branch}\` first if you are not.`,
        recommended: false,
      }),
    };
  }
  return null;
}

/**
 * How to undo a timeline step, as data: copyable commands, newest-step-only undo, and nothing at
 * all when there is no telling. Commands always name commits by id, because `HEAD@{n}` shifts with
 * every git command the learner runs after opening the repository.
 *
 * `truncated`: the graph does not hold the whole history, so a commit missing from it is unknown.
 */
export function undoSuggestion(
  event: TimelineEvent,
  events: readonly TimelineEvent[],
  truncated: boolean,
): UndoSuggestion | null {
  const index = events.findIndex((candidate) => candidate.selector === event.selector);
  if (index < 0) return null;
  const end = REBASE_END.exec(event.message);
  const rebaseFinish = end?.[2] === "finish";
  if (!event.canLeaveBehind && !rebaseFinish) return null;

  const left = event.leftBehind;
  if (left?.recoveredBy) {
    return { recoveredBy: left.recoveredBy, options: [], warning: null, notes: [] };
  }
  if (
    event.kind === "reset" &&
    (event.message === "reset: moving to HEAD" || event.previousOid === event.oid)
  ) {
    return { recoveredBy: null, options: [], warning: null, notes: [STASH_NOTE] };
  }

  const options: UndoOption[] = [];
  const notes: string[] = [];
  let lost = false;
  if (left) {
    lost = true;
    options.push(rescue(left.oid));
    const detached = LEFT_DETACHED.exec(event.message);
    if (detached?.[1]) {
      options.push({
        command: `git switch -c rescue/${short(left.oid)} ${short(left.oid)}`,
        explanation: `Commits made on a detached HEAD belong to no branch. This creates a branch on \`${short(left.oid)}\` and switches to it, so you can keep working there.`,
        recommended: false,
      });
    }
  }

  if (rebaseFinish) {
    // The commits a rebase replaced were left behind when it started.
    const start = events[rebaseStartOf(events, index)];
    if (start?.leftBehind && start.leftBehind.recoveredBy === null) {
      lost = true;
      options.unshift(rescue(start.leftBehind.oid));
    }
  }

  const undo = undoOf(event, events, index);
  const before = undo ? events[undo.targetIndex] : undefined;
  if (undo && before && before.oid !== event.oid) {
    // Unsure where that is: a commit outside a partial graph may not be what it seems.
    if (before.inGraph || !truncated) {
      if (index === 0) options.push(undo.option(before.oid, before.selector));
      else notes.push(OLDER_STEP_NOTE);
    }
  }

  const warning =
    REBASE_START.test(event.message) && rebaseUnfinished(events, index) ? REBASE_IN_PROGRESS : null;
  if (lost) notes.push(GC_NOTE);

  if (options.length === 0 && warning === null && notes.length === 0) {
    // buildTimeline only judges steps to commits it can see in a complete graph.
    if (truncated || !event.inGraph) return null;
    notes.push(NOTHING_LEFT_NOTE);
  }
  return { recoveredBy: null, options, warning, notes };
}

import { type RepositoryState } from "@gitdojo/shared-types";
import { createAncestry, short } from "./ancestry";

export type TimelineKind =
  | "commit"
  | "amend"
  | "merge"
  | "switch"
  | "detach"
  | "reset"
  | "rebase"
  | "cherry-pick"
  | "revert"
  | "pull"
  | "clone"
  | "other";

/** What one reflog line says happened, in plain words. */
export interface ReflogDescription {
  kind: TimelineKind;
  /** Plain words, with `code` for names (rendered by `renderInline`). */
  title: string;
  /** The command that most likely wrote this line; `null` when there is no telling. */
  command: string | null;
  /** What the step did to history, when that is worth saying. */
  note: string | null;
  /** The step moved HEAD away from where it was in a way that can leave commits behind. */
  canLeaveBehind: boolean;
}

/** One step of the timeline: a reflog entry, explained. Newest first, like `git reflog`. */
export interface TimelineEvent extends ReflogDescription {
  /** `HEAD@{n}` */
  selector: string;
  /** Where HEAD was after this step. */
  oid: string;
  /** Where HEAD was before it; `null` for the first entry. */
  previousOid: string | null;
  /** Seconds since the Unix epoch. */
  timestamp: number;
  /** Git's own reflog message. */
  message: string;
  /** The commit HEAD moved to is in the graph, so the timeline can select it. */
  inGraph: boolean;
  /**
   * Commits this step left behind: `recoveredBy` is the later step that brought them back, or
   * `null` while only the reflog remembers them.
   */
  leftBehind: { oid: string; recoveredBy: string | null } | null;
  /** A commit an earlier step had left behind, brought back by this step. */
  recovered: string | null;
}

const HEX = /^[0-9a-f]{7,40}$/;
const quote = (subject: string) => `“${subject}”`;

interface Rule {
  pattern: RegExp;
  describe(match: RegExpExecArray): Omit<ReflogDescription, "canLeaveBehind"> & {
    canLeaveBehind?: boolean;
  };
}

/**
 * Reflog messages Git writes, most specific first. Each maps to a plain-words step and the command
 * that most likely ran.
 */
const RULES: readonly Rule[] = [
  {
    pattern: /^commit \(initial\): (.*)$/,
    describe: ([, subject = ""]) => ({
      kind: "commit",
      title: `Made the first commit, ${quote(subject)}`,
      command: "git commit",
      note: "The repository's history starts here.",
    }),
  },
  {
    pattern: /^commit \(amend\): (.*)$/,
    describe: ([, subject = ""]) => ({
      kind: "amend",
      title: `Amended the last commit, now ${quote(subject)}`,
      command: "git commit --amend",
      note: "Amending does not edit a commit: it makes a new one and moves the branch to it.",
      canLeaveBehind: true,
    }),
  },
  {
    pattern: /^commit \(merge\): (.*)$/,
    describe: ([, subject = ""]) => ({
      kind: "merge",
      title: `Finished a merge, ${quote(subject)}`,
      command: "git commit",
      note: "The merge stopped for conflicts; this commit concluded it once they were resolved.",
    }),
  },
  {
    pattern: /^commit: (.*)$/,
    describe: ([, subject = ""]) => ({
      kind: "commit",
      title: `Committed ${quote(subject)}`,
      command: "git commit",
      note: null,
    }),
  },
  {
    pattern: /^merge (.+?): Fast-forward$/,
    describe: ([, branch = ""]) => ({
      kind: "merge",
      title: `Fast-forwarded to \`${branch}\``,
      command: `git merge ${branch}`,
      note: "No merge commit was needed: the branch simply moved forward to the other one.",
    }),
  },
  {
    pattern: /^merge (.+?): (.*)$/,
    describe: ([, branch = ""]) => ({
      kind: "merge",
      title: `Merged \`${branch}\``,
      command: `git merge ${branch}`,
      note: "Git made a merge commit that joins the two lines of history.",
    }),
  },
  {
    pattern: /^checkout: moving from (.+) to (.+)$/,
    describe: ([, from = "", to = ""]) =>
      HEX.test(to)
        ? {
            kind: "detach",
            title: `Checked out commit \`${short(to)}\` directly (detached HEAD)`,
            command: `git switch --detach ${short(to)}`,
            note: "HEAD points at a commit instead of a branch: new commits here belong to no branch.",
            canLeaveBehind: HEX.test(from),
          }
        : {
            kind: "switch",
            title:
              from === to
                ? `Checked out \`${to}\` again`
                : `Switched from \`${from}\` to \`${to}\``,
            command: `git switch ${to}`,
            note: null,
            // Leaving a detached HEAD can strand the commits made there.
            canLeaveBehind: HEX.test(from),
          },
  },
  {
    pattern: /^reset: moving to (.+)$/,
    describe: ([, target = ""]) => ({
      kind: "reset",
      title: target === "HEAD" ? "Reset to `HEAD`" : `Reset the branch to \`${target}\``,
      command: `git reset ${target}`,
      note:
        target === "HEAD"
          ? "HEAD stayed put: `git stash` and `git reset --hard` without a commit write this line too."
          : "The branch now points somewhere else. Whether files changed depends on `--soft`, `--mixed` or `--hard`, which the reflog does not record.",
      canLeaveBehind: true,
    }),
  },
  {
    pattern: /^rebase( -i)? \(start\): checkout (.+)$/,
    describe: ([, interactive, onto = ""]) => ({
      kind: "rebase",
      title: `Started ${interactive ? "an interactive rebase" : "a rebase"} onto \`${onto}\``,
      command: `git rebase${interactive ? " -i" : ""} ${onto}`,
      note: "A rebase replays your commits one by one on a new base, as new copies.",
      canLeaveBehind: true,
    }),
  },
  {
    pattern: /^rebase( -i)? \((finish|abort)\): (?:returning to )?(?:refs\/heads\/)?(.+)$/,
    describe: ([, , step, branch = ""]) =>
      step === "finish"
        ? {
            kind: "rebase",
            title: `Finished rebasing \`${branch}\``,
            command: null,
            note: `\`${branch}\` now points at the replayed copies.`,
          }
        : {
            kind: "rebase",
            title: `Aborted the rebase of \`${branch}\``,
            command: "git rebase --abort",
            note: "Everything went back to how it was before the rebase started.",
          },
  },
  {
    pattern: /^rebase( -i)? \((pick|reword|edit|squash|fixup|continue)\): (.*)$/,
    describe: ([, , step = "", subject = ""]) => ({
      kind: "rebase",
      title:
        {
          pick: `Replayed ${quote(subject)}`,
          reword: `Reworded a commit to ${quote(subject)}`,
          edit: `Stopped to edit ${quote(subject)}`,
          squash: `Squashed commits into ${quote(subject)}`,
          fixup: `Folded a fixup into ${quote(subject)}`,
          continue: `Continued the rebase with ${quote(subject)}`,
        }[step] ?? subject,
      command: step === "continue" ? "git rebase --continue" : null,
      note: null,
    }),
  },
  {
    pattern: /^cherry-pick: (.*)$/,
    describe: ([, subject = ""]) => ({
      kind: "cherry-pick",
      title: `Cherry-picked ${quote(subject)}`,
      command: "git cherry-pick",
      note: "A copy of a commit from elsewhere, with the same changes and a new hash.",
    }),
  },
  {
    pattern: /^revert: (.*)$/,
    describe: ([, subject = ""]) => ({
      kind: "revert",
      title: `Reverted with ${quote(subject)}`,
      command: "git revert",
      note: "A new commit that undoes an earlier one. History is added to, not rewritten.",
    }),
  },
  {
    pattern: /^pull\b(.*?): (.*)$/,
    describe: ([, args = "", outcome = ""]) => ({
      kind: "pull",
      title: outcome === "Fast-forward" ? "Pulled and fast-forwarded" : "Pulled from the remote",
      command: `git pull${args.replace(/ \(\w+\)$/, "")}`,
      note:
        outcome === "Fast-forward"
          ? "The remote had new commits and yours had none: the branch just moved forward."
          : null,
    }),
  },
  {
    pattern: /^clone: from (.+)$/,
    describe: ([, url = ""]) => ({
      kind: "clone",
      title: `Cloned from \`${url}\``,
      command: `git clone ${url}`,
      note: "This copy of the repository starts here.",
    }),
  },
];

/** What a reflog message means, in plain words. */
export function describeReflogMessage(message: string): ReflogDescription {
  for (const rule of RULES) {
    const match = rule.pattern.exec(message);
    if (match) return { canLeaveBehind: false, ...rule.describe(match) };
  }
  return { kind: "other", title: message, command: null, note: null, canLeaveBehind: false };
}

/**
 * HEAD's reflog as a story, newest first. Steps that move HEAD off its commit (a reset, an amend,
 * a rebase, leaving a detached HEAD) are checked for commits left behind, and for the later step
 * that brought them back.
 *
 * `truncated`: the graph does not hold the whole history, so a commit missing from it may simply
 * be older, not left behind.
 */
export function buildTimeline(state: RepositoryState, truncated: boolean): TimelineEvent[] {
  const ancestry = createAncestry(state.allCommits);
  const events: TimelineEvent[] = state.reflog.map((entry, index) => ({
    ...describeReflogMessage(entry.message),
    selector: entry.selector,
    oid: entry.oid,
    previousOid: state.reflog[index + 1]?.oid ?? null,
    timestamp: entry.timestamp,
    message: entry.message,
    inGraph: ancestry.commit(entry.oid) !== undefined,
    leftBehind: null,
    recovered: null,
  }));

  // Oldest first, so each step looks forward for what recovered its commits.
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const left = event?.previousOid;
    if (!event?.canLeaveBehind || !left || left === event.oid) continue;
    // Where HEAD went is not in the graph, so its history is unknown: no telling what it left.
    if (!event.inGraph || ancestry.contains(event.oid, left)) continue;
    const recovery = events
      .slice(0, index)
      .reverse()
      .find((later) => ancestry.contains(later.oid, left));
    if (recovery) {
      event.leftBehind = { oid: left, recoveredBy: recovery.selector };
      recovery.recovered ??= left;
    } else if (ancestry.commit(left) === undefined && !truncated) {
      // Not reachable from any branch, tag or HEAD now: only the reflog still has it.
      event.leftBehind = { oid: left, recoveredBy: null };
    }
  }
  return events;
}

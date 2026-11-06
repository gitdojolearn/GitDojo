import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { WAITING_FOR_EDITOR, writeEditorRecord } from "../engine/editor-state";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitStatusData, type GitStatusEntry } from "../engine/git-engine";
import { learnerIdentity } from "../engine/config";
import { type GitCommitInput, type GitCommitResult } from "../engine/git-engine";
import {
  clearMergeState,
  operationKind,
  readMergeState,
  unresolvedConflicts,
  writeMergeState,
} from "../engine/merge-state";
import { logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isRepository,
  resolveRefOrNull,
  shortOid,
  subject,
} from "../engine/repository";
import { hasStagedChanges } from "../engine/status-matrix";
import { runAdd } from "./add";
import { formatStatus, readStatusData } from "./status";

export const COMMIT_MESSAGE_REQUIRED = "error: commit message is required";

export const UNRESOLVED_CONFLICTS_MESSAGE = [
  "error: Committing is not possible because you have unmerged files.",
  "hint: Fix them up in the work tree, and then use 'git add <file>'",
  "hint: as appropriate to mark resolution and make a commit.",
  "fatal: Exiting because of an unresolved conflict.",
].join("\n");

const EDITOR_HELP = [
  "# Please enter the commit message for your changes. Lines starting",
  "# with '#' will be ignored, and an empty message aborts the commit.",
  "#",
];

/** Tracked files whose changes `git commit -a` stages: edits and deletions, never new files. */
function trackedChanges(entries: readonly GitStatusEntry[]): GitStatusEntry[] {
  return entries.filter((entry) => entry.unstaged === "modified" || entry.unstaged === "deleted");
}

const LABELS = { added: "new file", modified: "modified", deleted: "deleted" } as const;

function commented(label: string, path: string): string {
  return `#\t${`${label}:`.padEnd(12)}${path}`;
}

/**
 * What Git puts in COMMIT_EDITMSG for a new commit: an empty first line for the message, its
 * help text, then the status as comments (with `-a`, tracked changes count as staged).
 */
function newCommitTemplate(status: GitStatusData, all: boolean): string {
  const tracked = new Set(all ? trackedChanges(status.entries).map((entry) => entry.path) : []);
  const staged = status.entries.flatMap((entry) => {
    const change = entry.staged ?? (tracked.has(entry.path) ? entry.unstaged : null);
    return change === null || change === "untracked" ? [] : [commented(LABELS[change], entry.path)];
  });
  const unstaged = trackedChanges(status.entries)
    .filter((entry) => !tracked.has(entry.path))
    .map((entry) =>
      commented(LABELS[entry.unstaged === "deleted" ? "deleted" : "modified"], entry.path),
    );
  const untracked = status.entries
    .filter((entry) => entry.unstaged === "untracked")
    .map((entry) => `#\t${entry.path}`);
  const where =
    status.branch === null && status.head !== null
      ? `# HEAD detached at ${shortOid(status.head)}`
      : `# On branch ${status.branch ?? "HEAD"}`;
  const section = (title: string, lines: string[]) =>
    lines.length === 0 ? [] : [`# ${title}:`, ...lines, "#"];
  return [
    "",
    ...EDITOR_HELP,
    where,
    ...(status.hasCommits ? [] : ["#", "# Initial commit", "#"]),
    ...section("Changes to be committed", staged),
    ...section("Changes not staged for commit", unstaged),
    ...section("Untracked files", untracked),
    "",
  ].join("\n");
}

/** `git commit` without `-m`: Git opens the editor and waits. Nothing is staged or made yet. */
async function openCommitEditor(
  ctx: GitContext,
  status: GitStatusData,
  all: boolean,
): Promise<GitCommitResult> {
  await writeEditorRecord(ctx, {
    kind: "commit",
    purpose: "message",
    file: "COMMIT_EDITMSG",
    content: newCommitTemplate(status, all),
    amend: false,
    ...(all ? { all } : {}),
  });
  return { ok: true, output: WAITING_FOR_EDITOR };
}

/** What Git puts in COMMIT_EDITMSG when amending: the current message, then its help text. */
async function openAmendEditor(
  ctx: GitContext,
  head: string,
  { resetAuthor, all }: { resetAuthor: boolean; all: boolean },
): Promise<GitCommitResult> {
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: head });
  const branch = await currentBranch(ctx);
  const content = [
    commit.message.trimEnd(),
    "",
    ...EDITOR_HELP,
    branch === null ? `# HEAD detached at ${shortOid(head)}` : `# On branch ${branch}`,
    "",
  ].join("\n");
  await writeEditorRecord(ctx, {
    kind: "commit",
    purpose: "message",
    file: "COMMIT_EDITMSG",
    content,
    ...(resetAuthor ? { resetAuthor } : {}),
    ...(all ? { all } : {}),
  });
  return { ok: true, output: WAITING_FOR_EDITOR };
}

export async function runCommit(ctx: GitContext, input: GitCommitInput): Promise<GitCommitResult> {
  if (!(await isRepository(ctx))) {
    return input.message.trim() === ""
      ? failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED))
      : notARepository();
  }

  const merge = await readMergeState(ctx);
  if (merge && unresolvedConflicts(merge).length > 0) {
    return failure(gitError("UNRESOLVED_CONFLICTS", UNRESOLVED_CONFLICTS_MESSAGE));
  }
  const operation = merge ? operationKind(merge) : null;
  const amendHead = input.amend ? await resolveRefOrNull(ctx, "HEAD") : null;
  // A rebase stopped with nothing to resolve (`edit`, `break`, or a step already committed)
  // leaves HEAD's commit free to amend, as in Git.
  const rebaseIdle = operation === "rebase" && merge?.rebase?.current === null;
  if (input.amend && ((merge !== null && !rebaseIdle) || amendHead === null)) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        merge !== null
          ? "fatal: cannot amend a commit while an operation is in progress"
          : "fatal: there is no commit to amend",
      ),
    );
  }
  // `git commit --amend` without a message opens the editor on the commit's current one.
  if (input.amend && amendHead !== null && !input.noEdit && input.message.trim() === "") {
    return openAmendEditor(ctx, amendHead, {
      resetAuthor: input.resetAuthor === true,
      all: input.all === true,
    });
  }
  // A rebase step that was already committed has nothing left for `git commit` to conclude.
  const concluding = merge !== null && !(operation === "rebase" && merge.rebase?.current === null);
  // `git commit` with no `-m` at all opens the editor, once there is something to commit.
  // (`-m "  "` is a message the learner typed, and is refused below.)
  if (!input.amend && !concluding && input.message === "") {
    const before = await readStatusData(ctx);
    const pending =
      hasStagedChanges(before.entries) ||
      (input.all === true && trackedChanges(before.entries).length > 0);
    if (pending) return openCommitEditor(ctx, before, input.all === true);
    return failure(gitError("NOTHING_TO_COMMIT", "nothing to commit"), formatStatus(before));
  }
  // Concluding an operation may use its prepared message, like `git commit --no-edit`.
  const message =
    input.message.trim() ||
    (input.noEdit && input.amend
      ? (
          await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: amendHead ?? "" })
        ).commit.message.trimEnd()
      : concluding
        ? merge.message
        : "");
  if (message === "") {
    return failure(gitError("INVALID_ARGUMENT", COMMIT_MESSAGE_REQUIRED));
  }

  if (input.all) {
    const tracked = trackedChanges((await readStatusData(ctx)).entries).map((entry) => entry.path);
    if (tracked.length > 0) {
      const staged = await runAdd(ctx, tracked);
      if (!staged.ok)
        return {
          ok: false,
          output: staged.output,
          ...(staged.error ? { error: staged.error } : {}),
        };
    }
  }
  const status = await readStatusData(ctx);
  // A merge commit may record no changes of its own (e.g. every conflict resolved to our version).
  if (operation !== "merge" && !input.amend && !hasStagedChanges(status.entries)) {
    if (concluding && (operation === "cherry-pick" || operation === "revert")) {
      // Every change was resolved away: there is nothing left to pick or revert.
      await clearMergeState(ctx);
      return failure(
        gitError(
          "EMPTY_COMMIT",
          `The previous ${operation} is now empty, possibly due to conflict resolution.`,
        ),
        `${formatStatus({ ...status, merge: null })}\nThe previous ${operation} is now empty, possibly due to conflict resolution.`,
      );
    }
    // Real Git prints the status report when there is nothing to commit.
    return failure(gitError("NOTHING_TO_COMMIT", "nothing to commit"), formatStatus(status));
  }

  // Cherry-picks and rebased commits keep their original author; the learner commits them.
  const amended =
    input.amend && amendHead !== null
      ? (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: amendHead })).commit
      : undefined;
  const original =
    (input.resetAuthor ? undefined : amended?.author) ??
    (concluding && input.message.trim() === "" ? merge.author : undefined);
  const learner = await learnerIdentity(ctx);
  const author = original ?? {
    ...(input.author ?? learner),
    ...(input.timestamp === undefined ? {} : { timestamp: input.timestamp }),
  };
  const head = await resolveRefOrNull(ctx, "HEAD");
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author,
    ...(original ? { committer: input.author ?? learner } : {}),
    ...(amended
      ? { parent: amended.parent }
      : (operation === "merge" || (concluding && merge.rebase?.currentStep?.action === "merge")) &&
          head !== null
        ? { parent: [head, merge?.theirs ?? head] }
        : {}),
  });
  if (operation === "rebase" && merge?.rebase) {
    // The stopped step is done; `git rebase --continue` replays the rest.
    await writeMergeState(ctx, {
      ...merge,
      conflicts: [],
      touched: [],
      rebase: { ...merge.rebase, current: null },
    });
  } else if (merge) {
    await clearMergeState(ctx);
  }

  const branch = await currentBranch(ctx);
  const changes = status.entries.filter((entry) => entry.staged !== null);
  const rootCommit = !status.hasCommits;
  const kind = rootCommit
    ? " (initial)"
    : operation === "merge"
      ? " (merge)"
      : operation === "cherry-pick" && concluding
        ? " (cherry-pick)"
        : "";
  await logHeadMove(ctx, {
    from: head,
    to: oid,
    message: `commit${input.amend ? " (amend)" : kind}: ${subject(message)}`,
    branch,
  });

  const fileWord = changes.length === 1 ? "file" : "files";
  const modeLines = changes.flatMap((entry) => {
    if (entry.staged === "added") return [` create mode 100644 ${entry.path}`];
    if (entry.staged === "deleted") return [` delete mode 100644 ${entry.path}`];
    return [];
  });
  const header = `[${branch ?? "detached HEAD"}${rootCommit ? " (root-commit)" : ""} ${shortOid(oid)}] ${message.split("\n")[0] ?? ""}`;
  // Like Git, concluding a merge prints only the summary line.
  const output =
    operation === "merge"
      ? header
      : [header, ` ${String(changes.length)} ${fileWord} changed`, ...modeLines].join("\n");

  return success(output, {
    oid,
    shortOid: shortOid(oid),
    branch,
    rootCommit,
    filesChanged: changes.length,
  });
}

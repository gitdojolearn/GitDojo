import git from "isomorphic-git";
import { learnerIdentity } from "../engine/config";
import { type GitContext } from "../engine/context";
import {
  cleanMessage,
  clearEditorRecord,
  editorOpenMessage,
  isRebaseEditor,
  readEditorRecord,
  refuseEditor,
  WAITING_FOR_EDITOR,
  writeEditorRecord,
  type RebaseEditorRecord,
} from "../engine/editor-state";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitEngineError } from "@gitdojo/shared-types";
import {
  type GitCommitInfo,
  type GitRebaseOptions,
  type GitRebaseResult,
  type GitSequencerAction,
} from "../engine/git-engine";
import {
  clearMergeState,
  operationInProgressMessage,
  operationKind,
  readMergeState,
  rebaseStep,
  stoppedStep,
  unresolvedConflicts,
  writeMergeState,
  type CommitStep,
  type MergeStateRecord,
  type RebaseAction,
  type RebaseRecord,
  type RebaseStep,
} from "../engine/merge-state";
import { logBranchMove, logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isAncestor,
  isRepository,
  readCommitsFrom,
  resolveRefOrNull,
  shortOid,
  subject,
  topologicalOrder,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import { hasStagedChanges, readStatusEntries } from "../engine/status-matrix";
import { threeWay, threeWayOverwriteError } from "../engine/three-way";
import { applyWorkingTreeUpdates, readTreeFiles } from "../engine/working-tree";
import { isValidBranchName } from "./branch";
import { commitPick, preparePick, type PreparedPick } from "./pick";
import { forceCheckout } from "./reset";
import { checkoutCommit } from "./switch";

export const REBASE_USAGE =
  "usage: git rebase [-i] <upstream>\n   or: git rebase (--continue | --skip | --abort)";

const NO_REBASE = "fatal: No rebase in progress?";

async function attachHead(ctx: GitContext, branch: string): Promise<void> {
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: "HEAD",
    value: `refs/heads/${branch}`,
    symbolic: true,
    force: true,
  });
}

async function detachAt(ctx: GitContext, oid: string): Promise<void> {
  await git.writeRef({ fs: ctx.fs, dir: ctx.dir, ref: "HEAD", value: oid, force: true });
}

/** The branch's own commits (not reachable from `onto`), oldest first. Merges are dropped. */
async function commitsToReplay(
  ctx: GitContext,
  head: string,
  onto: string,
): Promise<GitCommitInfo[]> {
  const ontoHistory = new Set((await readCommitsFrom(ctx, [onto])).map((commit) => commit.oid));
  const own = (await readCommitsFrom(ctx, [head])).filter(
    (commit: GitCommitInfo) => !ontoHistory.has(commit.oid) && commit.parents.length <= 1,
  );
  return topologicalOrder(own).reverse();
}

/** Points the rebased branch at where HEAD ended up and attaches HEAD to it again. */
async function finish(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) throw new Error("rebase lost HEAD");
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: `refs/heads/${rebase.branch}`,
    value: head,
    force: true,
  });
  await logBranchMove(ctx, rebase.branch, {
    from: rebase.originalHead,
    to: head,
    message: `rebase (finish): refs/heads/${rebase.branch} onto ${rebase.onto}`,
  });
  await attachHead(ctx, rebase.branch);
  await logHeadMove(ctx, {
    from: head,
    to: head,
    message: `rebase (finish): returning to refs/heads/${rebase.branch}`,
  });
  await clearMergeState(ctx);
  await clearEditorRecord(ctx);
  return success(`Successfully rebased and updated refs/heads/${rebase.branch}.`, {
    status: "rebased",
    oid: head,
  });
}

/** Rewrites HEAD's commit (detached, mid-rebase) with the index and `message`; same parents. */
async function amendHead(
  ctx: GitContext,
  message: string,
  reflogMessage: string,
  { keepTree = false }: { keepTree?: boolean } = {},
): Promise<string> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) throw new Error("rebase lost HEAD");
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: head });
  // The amended commit keeps its original author; the learner is the committer.
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author: commit.author,
    committer: await learnerIdentity(ctx),
    parent: commit.parent,
    ...(keepTree ? { tree: commit.tree } : {}),
  });
  await logHeadMove(ctx, { from: head, to: oid, message: reflogMessage });
  return oid;
}

async function headMessage(ctx: GitContext): Promise<string> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) return "";
  return (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: head })).commit.message.trimEnd();
}

const ORDINALS = ["1st", "2nd", "3rd"];

function ordinal(index: number): string {
  return ORDINALS[index] ?? `${String(index + 1)}th`;
}

/** What Git puts in the editor for a squash chain: every message, skipped ones commented out. */
function squashTemplate(rebase: RebaseRecord): string {
  const messages = rebase.chain?.messages ?? [];
  const blocks = messages.map((message, index) => {
    const label = message.skip
      ? `# The commit message #${String(index + 1)} will be skipped:`
      : index === 0
        ? `# This is the ${ordinal(0)} commit message:`
        : `# This is the commit message #${String(index + 1)}:`;
    const body = message.skip
      ? message.text
          .split("\n")
          .map((line) => `# ${line}`)
          .join("\n")
      : message.text;
    return `${label}\n\n${body}`;
  });
  return [
    `# This is a combination of ${String(messages.length)} commits.`,
    ...blocks,
    messageHelp(rebase),
  ].join("\n\n");
}

function messageHelp(rebase: RebaseRecord): string {
  return [
    "# Please enter the commit message for your changes. Lines starting",
    "# with '#' will be ignored, and an empty message aborts the commit.",
    "#",
    `# interactive rebase in progress; onto ${shortOid(rebase.onto)}`,
    "",
  ].join("\n");
}

/** Stops the rebase until the learner saves a commit message in the editor. */
async function waitForMessage(
  ctx: GitContext,
  rebase: RebaseRecord,
  reason: "reword" | "squash",
  report: string[],
): Promise<GitRebaseResult> {
  const content =
    reason === "squash"
      ? squashTemplate(rebase)
      : `${await headMessage(ctx)}\n\n${messageHelp(rebase)}`;
  await writeEditorRecord(ctx, {
    purpose: "message",
    file: "COMMIT_EDITMSG",
    content,
    rebase,
    reason,
  });
  return success([...report, WAITING_FOR_EDITOR].join("\n"), { status: "editing" });
}

/**
 * `edit` and `break`: the rebase stops with nothing to resolve. HEAD is free to move (amend,
 * reset, new commits) until `git rebase --continue` replays the rest on top of wherever it is.
 */
async function stopAt(
  ctx: GitContext,
  rebase: RebaseRecord,
  reason: "edit" | "break",
  report: string[],
): Promise<GitRebaseResult> {
  const head = (await resolveRefOrNull(ctx, "HEAD")) ?? rebase.onto;
  const message = (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: head })).commit.message;
  const title = subject(message);
  await writeMergeState(ctx, {
    kind: "rebase",
    branch: `${shortOid(head)} (${title})`,
    theirs: head,
    ours: head,
    message: message.trimEnd(),
    conflicts: [],
    touched: [],
    rebase: { ...rebase, current: null, stopped: reason },
  });
  const lines =
    reason === "edit"
      ? [
          `Stopped at ${shortOid(head)}...  ${title}`,
          "You can amend the commit now, with",
          "",
          "  git commit --amend",
          "",
          "Once you are satisfied with your changes, run",
          "",
          "  git rebase --continue",
        ]
      : [
          `Stopped at ${shortOid(head)}...  ${title}`,
          'hint: Run "git rebase --continue" to go on.',
        ];
  return success([...report, ...lines].join("\n"), { status: "stopped", oid: head });
}

/**
 * A step that cannot run (a `reset` or `merge` that would overwrite untracked files): the rebase
 * stops at a `break` so nothing is lost, and the learner can fix it and continue, or abort.
 */
async function stopWithError(
  ctx: GitContext,
  rebase: RebaseRecord,
  error: GitEngineError,
  report: string[],
): Promise<GitRebaseResult> {
  const stopped = await stopAt(ctx, rebase, "break", []);
  const output = [...report, error.message, stopped.output].join("\n");
  return { ok: false, output, data: { status: "stopped" }, error: { ...error, message: output } };
}

/**
 * Records the step whose changes are in the index: a new commit for pick/reword/edit, or folded
 * into HEAD's commit for squash/fixup. Returns a result when the rebase has to stop.
 */
async function commitStep(
  ctx: GitContext,
  rebase: RebaseRecord,
  step: CommitStep,
  pick: Pick<PreparedPick, "message" | "author">,
  report: string[],
): Promise<GitRebaseResult | null> {
  const { action } = step;
  const title = subject(pick.message);
  if (action === "pick" || action === "reword" || action === "edit") {
    await commitPick(ctx, pick, `rebase (pick): ${title}`);
    delete rebase.chain;
    if (action === "reword") return waitForMessage(ctx, rebase, "reword", report);
    return action === "edit" ? stopAt(ctx, rebase, "edit", report) : null;
  }
  // squash / fixup: meld into the previous commit, keeping its message for now.
  const chain = (rebase.chain ??= {
    messages: [{ text: await headMessage(ctx), skip: false }],
    squash: false,
  });
  if (action === "fixup" && step.message !== undefined) {
    // `fixup -C` / `-c`: this commit's message replaces every message folded so far.
    chain.messages = chain.messages.map((message) => ({ ...message, skip: true }));
    chain.messages.push({ text: pick.message, skip: false });
    if (step.message === "edit") chain.edit = true;
  } else {
    chain.messages.push({ text: pick.message, skip: action === "fixup" });
  }
  if (action === "squash") chain.squash = true;
  const kept = chain.messages.find((message) => !message.skip)?.text ?? pick.message;
  await amendHead(ctx, kept, `rebase (${action}): ${title}`);
  return endOfChain(ctx, rebase, report);
}

/**
 * After a squash or fixup: if the chain ends here, ask for the message when a `squash` (or a
 * `fixup -c`) wants it edited.
 */
async function endOfChain(
  ctx: GitContext,
  rebase: RebaseRecord,
  report: string[],
): Promise<GitRebaseResult | null> {
  const next = rebase.todo[0];
  const continues = next !== undefined && ["squash", "fixup"].includes(rebaseStep(next).action);
  if (continues || !rebase.chain) return null;
  if (rebase.chain.squash) return waitForMessage(ctx, rebase, "squash", report);
  const edit = rebase.chain.edit === true;
  delete rebase.chain;
  return edit ? waitForMessage(ctx, rebase, "reword", report) : null;
}

async function parentOf(ctx: GitContext, oid: string): Promise<string | null> {
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
  return commit.parent.length === 1 ? (commit.parent[0] ?? null) : null;
}

/** A label set earlier in the plan, `onto`, or any revision, as Git resolves `reset` targets. */
async function resolveLabel(
  ctx: GitContext,
  rebase: RebaseRecord,
  name: string,
): Promise<string | null> {
  return (
    rebase.labels?.[name] ?? (name === "onto" ? rebase.onto : await resolveRevision(ctx, name))
  );
}

/** `reset <label>`: HEAD (and the working tree) go back to that point; nothing is committed. */
async function resetStep(
  ctx: GitContext,
  rebase: RebaseRecord,
  name: string,
  report: string[],
): Promise<GitRebaseResult | null> {
  const target = await resolveLabel(ctx, rebase, name);
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (target === null) {
    return stopWithError(
      ctx,
      rebase,
      gitError("INVALID_TODO", `error: could not resolve '${name}'`),
      report,
    );
  }
  const moved = await checkoutCommit(ctx, head, target);
  if (!moved.ok) return stopWithError(ctx, rebase, moved.error, report);
  await detachAt(ctx, target);
  await logHeadMove(ctx, { from: head, to: target, message: `rebase (reset): '${name}'` });
  delete rebase.chain;
  return null;
}

/** Records a merge of HEAD with `theirs`, as a `merge` step's commit. */
async function commitMerge(
  ctx: GitContext,
  rebase: RebaseRecord,
  step: Extract<RebaseStep, { action: "merge" }>,
  theirs: string,
  message: string,
  report: string[],
): Promise<GitRebaseResult | null> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) throw new Error("rebase lost HEAD");
  const learner = await learnerIdentity(ctx);
  // `merge -C <commit>` recreates that merge, so it keeps its author, as a pick does.
  const author = step.messageFrom
    ? (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: step.messageFrom })).commit.author
    : learner;
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author,
    committer: learner,
    parent: [head, theirs],
  });
  await logHeadMove(ctx, { from: head, to: oid, message: `rebase (merge): ${subject(message)}` });
  delete rebase.chain;
  return step.editMessage ? waitForMessage(ctx, rebase, "reword", report) : null;
}

/** The message a `merge` step records: the `-C` commit's, the line's `# oneline`, or Git's. */
async function mergeStepMessage(
  ctx: GitContext,
  step: Extract<RebaseStep, { action: "merge" }>,
): Promise<string> {
  if (step.messageFrom) {
    const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: step.messageFrom });
    return commit.message.trimEnd();
  }
  return step.subject ?? `Merge branch '${step.name}'`;
}

/**
 * `merge [-C <commit> | -c <commit>] <label> [# <oneline>]`: three-way merges the labelled point
 * into HEAD and records a merge commit, stopping for conflicts like any other step.
 */
async function mergeStep(
  ctx: GitContext,
  rebase: RebaseRecord,
  step: Extract<RebaseStep, { action: "merge" }>,
  report: string[],
): Promise<GitRebaseResult | null> {
  const theirs = await resolveLabel(ctx, rebase, step.name);
  const ours = await resolveRefOrNull(ctx, "HEAD");
  if (theirs === null || ours === null) {
    return stopWithError(
      ctx,
      rebase,
      gitError("INVALID_TODO", `error: could not resolve '${step.name}'`),
      report,
    );
  }
  // Already part of HEAD's history: there is nothing to merge.
  if (await isAncestor(ctx, theirs, ours)) return null;

  const message = await mergeStepMessage(ctx, step);
  const bases = (await git.findMergeBase({
    fs: ctx.fs,
    dir: ctx.dir,
    oids: [ours, theirs],
  })) as string[];
  const [baseTree, oursTree, theirsTree] = await Promise.all([
    readTreeFiles(ctx, bases[0] ?? null),
    readTreeFiles(ctx, ours),
    readTreeFiles(ctx, theirs),
  ]);
  const merged = await threeWay(ctx, {
    base: baseTree,
    ours: oursTree,
    theirs: theirsTree,
    labels: { ours: "HEAD", theirs: step.name },
  });
  const status = new Map((await readStatusEntries(ctx)).map((entry) => [entry.path, entry]));
  const problem = threeWayOverwriteError("merge", merged, status);
  if (problem) return stopWithError(ctx, rebase, problem, report);
  await applyWorkingTreeUpdates(ctx, merged.updates);

  if (merged.conflicts.length > 0) {
    await writeMergeState(ctx, {
      kind: "rebase",
      branch: step.name,
      theirs,
      ours,
      message,
      conflicts: merged.conflicts,
      touched: merged.updates.map((update) => update.path),
      rebase: { ...rebase, current: theirs, currentStep: step },
    });
    const output = [
      ...report,
      ...merged.report,
      `error: could not merge '${step.name}'`,
      "hint: Resolve all conflicts manually, mark them as resolved with",
      'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".',
      'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
    ].join("\n");
    return {
      ok: false,
      output,
      data: { status: "conflict", conflicts: merged.conflicts.map((c) => c.path) },
      error: gitError("MERGE_CONFLICT", output),
    };
  }
  return commitMerge(ctx, rebase, step, theirs, message, report);
}

/**
 * Replays `rebase.todo` one step at a time on top of HEAD. Stops at the first conflict, editor,
 * `edit` or `break`, saving where it is so the rebase can pick up from there; finishes the
 * rebase otherwise.
 */
async function replay(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  const report: string[] = [];
  for (let next = rebase.todo.shift(); next !== undefined; next = rebase.todo.shift()) {
    const step = rebaseStep(next);
    const head = await resolveRefOrNull(ctx, "HEAD");

    if (step.action === "break") return stopAt(ctx, rebase, "break", report);
    if (step.action === "label") {
      if (head !== null) rebase.labels = { ...rebase.labels, [step.name]: head };
      continue;
    }
    if (step.action === "reset" || step.action === "merge") {
      const stopped =
        step.action === "reset"
          ? await resetStep(ctx, rebase, step.name, report)
          : await mergeStep(ctx, rebase, step, report);
      if (stopped) return stopped;
      continue;
    }

    const { action, oid } = step;
    const replaysAsIs = action === "pick" || action === "reword" || action === "edit";
    // An interactive rebase keeps commits it does not need to change, as Git does.
    if (rebase.interactive && replaysAsIs && head !== null) {
      if ((await parentOf(ctx, oid)) === head) {
        const moved = await checkoutCommit(ctx, head, oid);
        if (!moved.ok) return failure(moved.error);
        await detachAt(ctx, oid);
        await logHeadMove(ctx, {
          from: head,
          to: oid,
          message: `rebase (pick): ${await commitTitle(ctx, oid)}`,
        });
        delete rebase.chain;
        if (action === "reword") return waitForMessage(ctx, rebase, "reword", report);
        if (action === "edit") return stopAt(ctx, rebase, "edit", report);
        continue;
      }
    }

    const prepared = await preparePick(ctx, "rebase", oid);
    if (!prepared.ok) return failure(prepared.error);
    const { pick } = prepared;
    // A commit whose changes `onto` already has adds nothing: Git drops it. A squash or fixup
    // still folds its message into the chain.
    if (pick.merged.updates.length === 0 && replaysAsIs) continue;
    await applyWorkingTreeUpdates(ctx, pick.merged.updates);
    if (pick.merged.conflicts.length > 0) {
      const state: MergeStateRecord = {
        kind: "rebase",
        branch: pick.label,
        theirs: oid,
        ours: head ?? rebase.onto,
        message: pick.message,
        ...(pick.author ? { author: pick.author } : {}),
        conflicts: pick.merged.conflicts,
        touched: pick.merged.updates.map((update) => update.path),
        rebase: {
          ...rebase,
          current: oid,
          ...(rebase.interactive ? { currentAction: action, currentStep: step } : {}),
        },
      };
      await writeMergeState(ctx, state);
      const line = `Could not apply ${shortOid(oid)}... ${subject(pick.message)}`;
      const output = [
        ...report,
        ...pick.merged.report,
        `error: could not apply ${shortOid(oid)}... ${subject(pick.message)}`,
        "hint: Resolve all conflicts manually, mark them as resolved with",
        'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".',
        'hint: You can instead skip this commit: run "git rebase --skip".',
        'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
        line,
      ].join("\n");
      return {
        ok: false,
        output,
        data: { status: "conflict", conflicts: pick.merged.conflicts.map((c) => c.path) },
        error: gitError("MERGE_CONFLICT", output),
      };
    }
    const stopped = await commitStep(ctx, rebase, step, pick, report);
    if (stopped) return stopped;
  }
  return finish(ctx, rebase);
}

async function commitTitle(ctx: GitContext, oid: string): Promise<string> {
  return subject((await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid })).commit.message);
}

/** The todo list Git opens for `git rebase -i`, with its help text. */
async function todoTemplate(
  ctx: GitContext,
  commits: GitCommitInfo[],
  head: string,
  onto: string,
): Promise<string> {
  const lines =
    commits.length === 0
      ? ["noop"]
      : await Promise.all(
          commits.map(
            async (commit) => `pick ${commit.shortOid} ${await commitTitle(ctx, commit.oid)}`,
          ),
        );
  const count = commits.length;
  return [
    ...lines,
    "",
    `# Rebase ${shortOid(onto)}..${shortOid(head)} onto ${shortOid(onto)} (${String(count)} command${count === 1 ? "" : "s"})`,
    "#",
    "# Commands:",
    "# p, pick <commit> = use commit",
    "# r, reword <commit> = use commit, but edit the commit message",
    "# e, edit <commit> = use commit, but stop for amending",
    "# s, squash <commit> = use commit, but meld into previous commit",
    '# f, fixup [-C | -c] <commit> = like "squash" but keep only the previous',
    "#                    commit's log message, unless -C is used, in which case",
    "#                    keep only this commit's message; -c is same as -C but",
    "#                    opens the editor",
    "# b, break = stop here (continue rebase later with 'git rebase --continue')",
    "# d, drop <commit> = remove commit",
    "# l, label <label> = label current HEAD with a name",
    "# t, reset <label> = reset HEAD to a label",
    "# m, merge [-C <commit> | -c <commit>] <label> [# <oneline>]",
    "#         create a merge commit using the original merge commit's",
    "#         message (or the oneline, if no original merge commit was",
    "#         specified); use -c <commit> to reword the commit message",
    "#",
    "# These lines can be re-ordered; they are executed from top to bottom.",
    "#",
    "# If you remove a line here THAT COMMIT WILL BE LOST.",
    "#",
    "# However, if you remove everything, the rebase will be aborted.",
    "#",
    "# GitDojo has no shell, so 'exec' is not available.",
    "",
  ].join("\n");
}

type TodoWord = RebaseAction | "drop" | "noop" | "break" | "label" | "reset" | "merge";

const TODO_ACTIONS: Record<string, TodoWord> = {
  p: "pick",
  pick: "pick",
  r: "reword",
  reword: "reword",
  e: "edit",
  edit: "edit",
  s: "squash",
  squash: "squash",
  f: "fixup",
  fixup: "fixup",
  d: "drop",
  drop: "drop",
  b: "break",
  break: "break",
  l: "label",
  label: "label",
  t: "reset",
  reset: "reset",
  m: "merge",
  merge: "merge",
  noop: "noop",
};

type ParsedTodo = { ok: true; steps: RebaseStep[] } | { ok: false; message: string };

/** Parses an edited todo list into steps (drops removed), or says what is wrong with it. */
async function parseTodo(ctx: GitContext, content: string): Promise<ParsedTodo> {
  const steps: RebaseStep[] = [];
  // `onto` always names where the rebase started, as in Git.
  const labels = new Set(["onto"]);
  const lines = content.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const at = `(line ${String(index + 1)})`;
    const refuse = (message: string): ParsedTodo => ({ ok: false, message });
    // `merge ... # <oneline>`: everything after `#` is the merge's subject, not more words.
    const hash = line.indexOf(" #");
    const words = (hash === -1 ? line : line.slice(0, hash)).split(/\s+/);
    const comment = hash === -1 ? undefined : line.slice(hash + 2).trim();
    const [word = ""] = words;

    if (word === "x" || word === "exec") {
      return refuse(
        `error: GitDojo has no shell, so it cannot run '${line.slice(word.length).trim()}' ${at}.\nhint: Put a 'break' there instead and run what you need in the terminal, then "git rebase --continue".`,
      );
    }
    if (word === "u" || word === "update-ref") {
      return refuse(`error: GitDojo does not support 'update-ref' in an interactive rebase ${at}.`);
    }
    const action = TODO_ACTIONS[word];
    if (action === undefined) return refuse(`error: invalid line ${String(index + 1)}: ${line}`);
    if (action === "noop") continue;
    if (action === "break") {
      steps.push({ action });
      continue;
    }

    if (action === "label" || action === "reset") {
      const [, name] = words;
      if (name === undefined) return refuse(`error: missing arguments for ${action} ${at}`);
      if (action === "label") {
        if (!isValidBranchName(name))
          return refuse(`error: '${name}' is not a valid label name ${at}`);
        labels.add(name);
      } else if (!labels.has(name) && (await resolveRevision(ctx, name)) === null) {
        return refuse(`error: could not resolve '${name}' ${at}`);
      }
      steps.push(action === "label" ? { action, name } : { action, name });
      continue;
    }

    // `fixup -C <commit>` / `merge -c <commit> <label>`: the option comes before the operands.
    const option = words[1] === "-C" || words[1] === "-c" ? words[1] : undefined;
    const operands = words.slice(option === undefined ? 1 : 2);
    if (option !== undefined && action !== "fixup" && action !== "merge") {
      return refuse(`error: '${word}' does not take ${option} ${at}`);
    }
    const resolve = async (target: string) => resolveRevision(ctx, target);

    if (action === "merge") {
      let messageFrom: string | undefined;
      if (option !== undefined) {
        const [commit] = operands;
        messageFrom = commit === undefined ? undefined : ((await resolve(commit)) ?? undefined);
        if (messageFrom === undefined) {
          return refuse(`error: could not parse '${commit ?? ""}' after ${option} ${at}`);
        }
        operands.shift();
      }
      const [name] = operands;
      if (name === undefined) return refuse(`error: missing arguments for merge ${at}`);
      if (operands.length > 1) {
        return refuse(
          `error: GitDojo merges one label at a time (octopus merges are not supported) ${at}`,
        );
      }
      if (!labels.has(name) && (await resolve(name)) === null) {
        return refuse(`error: could not resolve '${name}' ${at}`);
      }
      steps.push({
        action,
        name,
        ...(messageFrom === undefined ? {} : { messageFrom }),
        ...(option === "-c" ? { editMessage: true } : {}),
        ...(messageFrom === undefined && comment ? { subject: comment } : {}),
      });
      continue;
    }

    const [target] = operands;
    if (target === undefined) return refuse(`error: missing arguments for ${action} ${at}`);
    if (target.startsWith("-")) {
      return refuse(`error: GitDojo does not support '${word} ${target}' yet ${at}.`);
    }
    const oid = await resolve(target);
    if (oid === null) {
      return refuse(
        `error: invalid line ${String(index + 1)}: ${line}\nerror: could not parse '${target}'`,
      );
    }
    if (action === "drop") continue;
    if (
      (action === "squash" || action === "fixup") &&
      !steps.some((step) => "oid" in step || step.action === "merge")
    ) {
      return refuse(`error: cannot '${action}' without a previous commit`);
    }
    steps.push({
      action,
      oid,
      ...(option === undefined ? {} : { message: option === "-C" ? "use" : "edit" }),
    });
  }
  return { ok: true, steps };
}

/** Why `git rebase` cannot start right now, or `null` (with the branch and HEAD) when it can. */
async function rebasePreconditions(
  ctx: GitContext,
): Promise<{ ok: false; result: GitRebaseResult } | { ok: true; branch: string; head: string }> {
  const inProgress = await readMergeState(ctx);
  if (inProgress) {
    return {
      ok: false,
      result: failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(inProgress))),
    };
  }
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (branch === null || head === null) {
    return {
      ok: false,
      result: failure(
        gitError(
          "NOT_ON_BRANCH",
          branch === null
            ? "fatal: You are not currently on a branch.\nhint: GitDojo rebases branches: switch to one first."
            : `fatal: your current branch '${branch}' does not have any commits yet`,
        ),
      ),
    };
  }
  const status = await readStatusEntries(ctx);
  if (hasStagedChanges(status)) {
    return {
      ok: false,
      result: failure(
        gitError(
          "LOCAL_CHANGES",
          "error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.",
        ),
      ),
    };
  }
  if (status.some((entry) => entry.unstaged === "modified" || entry.unstaged === "deleted")) {
    return {
      ok: false,
      result: failure(
        gitError(
          "LOCAL_CHANGES",
          "error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.",
        ),
      ),
    };
  }
  return { ok: true, branch, head };
}

/**
 * `git rebase <upstream>`: replays the current branch's own commits on top of `upstream`.
 * `git rebase -i <upstream>`: first waits for the learner to edit the todo list.
 */
export async function runRebase(
  ctx: GitContext,
  upstream: string,
  { interactive = false }: GitRebaseOptions = {},
): Promise<GitRebaseResult> {
  if (upstream === "") return failure(gitError("INVALID_ARGUMENT", REBASE_USAGE));
  if (!(await isRepository(ctx))) return notARepository();
  const ready = await rebasePreconditions(ctx);
  if (!ready.ok) return ready.result;
  const { branch, head } = ready;
  const onto = await resolveRevision(ctx, upstream);
  if (onto === null) {
    return failure(gitError("INVALID_REVISION", `fatal: invalid upstream '${upstream}'`));
  }

  if (interactive) {
    const commits = await commitsToReplay(ctx, head, onto);
    await writeEditorRecord(ctx, {
      purpose: "todo",
      file: "git-rebase-todo",
      content: await todoTemplate(ctx, commits, head, onto),
      upstream,
      rebase: {
        branch,
        originalHead: head,
        onto,
        todo: commits.map((commit) => commit.oid),
        current: null,
        interactive: true,
      },
    });
    return success(WAITING_FOR_EDITOR, { status: "editing" });
  }

  if (await isAncestor(ctx, onto, head)) {
    return success(`Current branch ${branch} is up to date.`, { status: "up-to-date", oid: head });
  }

  const start = await checkoutCommit(ctx, head, onto);
  if (!start.ok) return failure(start.error);
  await detachAt(ctx, onto);
  await logHeadMove(ctx, { from: head, to: onto, message: `rebase (start): checkout ${upstream}` });

  const rebase: RebaseRecord = {
    branch,
    originalHead: head,
    onto,
    todo: (await commitsToReplay(ctx, head, onto)).map((commit) => commit.oid),
    current: null,
  };
  // The branch has nothing of its own: it simply catches up (a fast-forward).
  if (rebase.todo.length === 0) {
    const finished = await finish(ctx, rebase);
    return finished.ok ? { ...finished, data: { status: "fast-forward", oid: onto } } : finished;
  }
  return replay(ctx, rebase);
}

/** The learner saved and closed the todo list or message an interactive rebase opened. */
export async function closeRebaseEditor(
  ctx: GitContext,
  record: RebaseEditorRecord,
  content: string,
): Promise<GitRebaseResult> {
  const rebase: RebaseRecord = { ...record.rebase, todo: [...record.rebase.todo] };

  if (record.purpose === "message") {
    const message = cleanMessage(content);
    if (message === "") {
      return refuseEditor(ctx, record, content, "Aborting commit due to empty commit message.");
    }
    await clearEditorRecord(ctx);
    await amendHead(ctx, message, `rebase (${record.reason ?? "reword"}): ${subject(message)}`, {
      keepTree: true,
    });
    delete rebase.chain;
    return replay(ctx, rebase);
  }

  const parsed = await parseTodo(ctx, content);
  if (!parsed.ok) return refuseEditor(ctx, record, content, parsed.message);
  await clearEditorRecord(ctx);
  if (parsed.steps.length === 0) return success("Nothing to do", { status: "nothing" });

  // Nothing may have moved while the editor was open; if it did, the plan no longer applies.
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (branch !== rebase.branch || head !== rebase.originalHead) {
    return failure(
      gitError("NO_OPERATION", "error: HEAD moved while the editor was open; rebase aborted."),
    );
  }
  const start = await checkoutCommit(ctx, head, rebase.onto);
  if (!start.ok) return failure(start.error);
  await detachAt(ctx, rebase.onto);
  await logHeadMove(ctx, {
    from: head,
    to: rebase.onto,
    message: `rebase (start): checkout ${record.upstream ?? shortOid(rebase.onto)}`,
  });
  return replay(ctx, { ...rebase, todo: parsed.steps });
}

/** Undoes a rebase completely: the branch never moved, so HEAD simply goes back to it. */
async function abortRebase(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  await forceCheckout(ctx, rebase.originalHead);
  const head = await resolveRefOrNull(ctx, "HEAD");
  await clearMergeState(ctx);
  await clearEditorRecord(ctx);
  await attachHead(ctx, rebase.branch);
  await logHeadMove(ctx, {
    from: head,
    to: rebase.originalHead,
    message: `rebase (abort): returning to refs/heads/${rebase.branch}`,
  });
  return success("", { status: "aborted", oid: rebase.originalHead });
}

/** `git rebase --continue | --skip | --abort`. */
export async function runRebaseControl(
  ctx: GitContext,
  action: GitSequencerAction,
): Promise<GitRebaseResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const editor = await readEditorRecord(ctx);
  if (editor && !isRebaseEditor(editor)) {
    return failure(gitError("EDITOR_OPEN", editorOpenMessage(editor)));
  }
  if (editor) {
    if (action === "abort") {
      // Waiting for the todo list: nothing has happened yet, so there is nothing to undo.
      if (editor.purpose === "todo") {
        await clearEditorRecord(ctx);
        return success("", { status: "aborted", oid: editor.rebase.originalHead });
      }
      return abortRebase(ctx, editor.rebase);
    }
    return failure(
      gitError(
        "EDITOR_OPEN",
        `error: Git is waiting for you to close the editor (${editor.file}).\nhint: Save and close it to go on, or run "git rebase --abort".`,
      ),
    );
  }

  const state = await readMergeState(ctx);
  if (!state?.rebase || operationKind(state) !== "rebase") {
    return failure(gitError("NO_OPERATION", NO_REBASE));
  }
  const rebase: RebaseRecord = { ...state.rebase, todo: [...state.rebase.todo] };

  if (action === "abort") return abortRebase(ctx, rebase);

  if (action === "skip") {
    // Drop the stopped commit: back to HEAD, then on with the rest.
    await forceCheckout(ctx, await resolveRefOrNull(ctx, "HEAD"));
    await clearMergeState(ctx);
    return replay(ctx, resumed(rebase));
  }

  // Stopped by `edit` or `break`: whatever the learner changed must be committed first.
  if (rebase.stopped) {
    const entries = await readStatusEntries(ctx);
    if (hasStagedChanges(entries)) {
      return failure(gitError("LOCAL_CHANGES", STAGED_WHILE_STOPPED));
    }
    if (entries.some((entry) => entry.unstaged === "modified" || entry.unstaged === "deleted")) {
      return failure(
        gitError(
          "LOCAL_CHANGES",
          "error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.",
        ),
      );
    }
  }

  if (unresolvedConflicts(state).length > 0) {
    return failure(
      gitError(
        "UNRESOLVED_CONFLICTS",
        "error: you must edit all merge conflicts and then\nmark them as resolved using git add",
      ),
    );
  }
  await clearMergeState(ctx);
  const next = resumed(rebase);
  // The stopped step, unless `git commit` already recorded it. A merge is recorded even when
  // every conflict was resolved to HEAD's side: it still joins two histories.
  const step = stoppedStep(rebase);
  if (step?.action === "merge") {
    const stopped = await commitMerge(ctx, next, step, state.theirs, state.message, []);
    if (stopped) return stopped;
  } else if (step && "oid" in step && hasStagedChanges(await readStatusEntries(ctx))) {
    const stopped = await commitStep(ctx, next, step, state, []);
    if (stopped) return stopped;
  }
  return replay(ctx, next);
}

/** The rebase record once its stopped step is dealt with: nothing current, nothing stopped. */
function resumed(rebase: RebaseRecord): RebaseRecord {
  const next: RebaseRecord = { ...rebase, current: null };
  delete next.currentAction;
  delete next.currentStep;
  delete next.stopped;
  return next;
}

const STAGED_WHILE_STOPPED = [
  "error: you have staged changes in your working tree",
  "If these changes are meant to be squashed into the previous commit, run:",
  "",
  "  git commit --amend",
  "",
  "If they are meant to go into a new commit, run:",
  "",
  "  git commit -m <message>",
  "",
  "In both cases, once you're done, continue with:",
  "",
  "  git rebase --continue",
].join("\n");

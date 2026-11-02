import { type GitCommandResult } from "@gitdojo/shared-types";
import git, { type TreeEntry } from "isomorphic-git";
import { normalizeWorkspacePath } from "../filesystem/paths";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  type GitFetchData,
  type GitFetchResult,
  type GitPullMode,
  type GitPullOptions,
  type GitPullResult,
  type GitPushOptions,
  type GitPushResult,
  type GitRemoteInfo,
  type GitRemoteResult,
  type GitSetupRemoteCommitInput,
  type GitSetupRemoteOptions,
} from "../engine/git-engine";
import { effectiveConfigValue } from "../engine/config";
import { operationInProgressMessage, readMergeState } from "../engine/merge-state";
import { readUpstreamConfig, writeUpstreamConfig } from "../engine/refs";
import {
  addSimulatedRemote,
  findRemote,
  readRemotes,
  simulatedRemoteUrl,
  simulatedServerName,
  writeRemoteBranch,
  writeRemoteTag,
} from "../engine/remote-store";
import {
  currentBranch,
  isAncestor,
  isRepository,
  readCommitsFrom,
  resolveRefOrNull,
  shortOid,
} from "../engine/repository";
import { readTreeFiles } from "../engine/working-tree";
import { allRefTips } from "./log";
import { runMerge } from "./merge";
import { runRebase } from "./rebase";

export const NO_NETWORK =
  "hint: GitDojo has no network access: its remotes are simulated inside your workspace.";

function remoteNotFound<T>(name: string): GitCommandResult<T> {
  return failure(
    gitError(
      "REMOTE_NOT_FOUND",
      [
        `fatal: '${name}' does not appear to be a git repository`,
        "fatal: Could not read from remote repository.",
        "",
        "Please make sure you have the correct access rights",
        "and the repository exists.",
      ].join("\n"),
    ),
  );
}

/** For remotes added with a real-looking URL: say plainly that nothing left the browser. */
function simulationNote(remote: GitRemoteInfo): string[] {
  return simulatedServerName(remote.url) === null
    ? [`hint: GitDojo has no network access: ${remote.url} is simulated in your browser.`]
    : [];
}

/** `   1b7e55c..8d4c21e  main       -> origin/main`, Git's ref update line. */
function refLine(flag: string, summary: string, from: string, to: string, width: number): string {
  return ` ${flag} ${summary.padEnd(17)} ${from.padEnd(width)} -> ${to}`;
}

/** `git remote` and `git remote -v`. */
export async function runListRemotes(
  ctx: GitContext,
  { verbose = false }: { verbose?: boolean } = {},
): Promise<GitRemoteResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const remotes = await readRemotes(ctx);
  const lines = verbose
    ? remotes.flatMap((remote) => [
        `${remote.name}\t${remote.url} (fetch)`,
        `${remote.name}\t${remote.url} (push)`,
      ])
    : remotes.map((remote) => remote.name);
  return success(lines.join("\n"), { remotes });
}

/** The remote a command without one uses: the current branch's upstream's, else `origin`. */
async function defaultRemote(ctx: GitContext): Promise<string | null> {
  const branch = await currentBranch(ctx);
  const upstream = branch === null ? null : await readUpstreamConfig(ctx, branch);
  if (upstream) return upstream.remote;
  const remotes = await readRemotes(ctx);
  return remotes.find((remote) => remote.name === "origin")?.name ?? remotes[0]?.name ?? null;
}

/**
 * Copies the simulated server's branches into `refs/remotes/<remote>/*`. Returns the report lines
 * (empty when nothing changed, as Git prints nothing then).
 */
export async function fetchRemote(
  ctx: GitContext,
  remote: GitRemoteInfo,
): Promise<{ lines: string[]; data: GitFetchData }> {
  const updated: GitFetchData["updated"] = [];
  const lines: string[] = [];
  const width = Math.max(10, ...[...remote.branches, ...remote.tags].map((ref) => ref.name.length));
  for (const branch of remote.branches) {
    const ref = `refs/remotes/${remote.name}/${branch.name}`;
    const before = await resolveRefOrNull(ctx, ref);
    if (before === branch.oid) continue;
    const tracking = `${remote.name}/${branch.name}`;
    if (before === null) {
      lines.push(refLine("*", "[new branch]", branch.name, tracking, width));
    } else if (await isAncestor(ctx, before, branch.oid)) {
      lines.push(
        refLine(" ", `${shortOid(before)}..${shortOid(branch.oid)}`, branch.name, tracking, width),
      );
    } else {
      lines.push(
        `${refLine("+", `${shortOid(before)}...${shortOid(branch.oid)}`, branch.name, tracking, width)}  (forced update)`,
      );
    }
    await git.writeRef({ fs: ctx.fs, dir: ctx.dir, ref, value: branch.oid, force: true });
    updated.push({ ref: tracking, from: before, to: branch.oid });
  }
  // Tags the server has and this repository does not; an existing local tag is never replaced.
  for (const tag of remote.tags) {
    const ref = `refs/tags/${tag.name}`;
    if ((await resolveRefOrNull(ctx, ref)) !== null) continue;
    await git.writeRef({ fs: ctx.fs, dir: ctx.dir, ref, value: tag.oid });
    lines.push(refLine("*", "[new tag]", tag.name, tag.name, width));
  }
  return {
    lines: lines.length > 0 ? [`From ${remote.url}`, ...lines] : [],
    data: { updated },
  };
}

/** `pull.rebase=true|false` or `pull.ff=only`, when set; otherwise Git's default. */
async function configuredPullMode(ctx: GitContext): Promise<GitPullMode | undefined> {
  const rebase = (await effectiveConfigValue(ctx, "pull.rebase"))?.toLowerCase();
  if (rebase === "true") return "rebase";
  if (rebase === "false") return "merge";
  return (await effectiveConfigValue(ctx, "pull.ff"))?.toLowerCase() === "only"
    ? "ff-only"
    : undefined;
}

/** `git fetch [<remote>]`. */
export async function runFetch(ctx: GitContext, name?: string): Promise<GitFetchResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const remoteName = name ?? (await defaultRemote(ctx));
  if (remoteName === null) {
    return failure(
      gitError(
        "REMOTE_NOT_FOUND",
        `fatal: No remote repository specified.  Please, specify either a URL or a\nremote name from which new revisions should be fetched.\n${NO_NETWORK}`,
      ),
    );
  }
  const remote = await findRemote(ctx, remoteName);
  if (remote === null) return remoteNotFound(remoteName);
  const { lines, data } = await fetchRemote(ctx, remote);
  return success(lines.join("\n"), data);
}

/** True when some local ref (branch, tag, remote-tracking branch or HEAD) reaches `oid`. */
async function knownLocally(ctx: GitContext, oid: string): Promise<boolean> {
  const reachable = await readCommitsFrom(ctx, await allRefTips(ctx));
  return reachable.some((commit) => commit.oid === oid);
}

/** The remote a push names, or the reason it cannot go anywhere. */
async function pushRemote(
  ctx: GitContext,
  name: string | undefined,
): Promise<{ ok: true; remote: GitRemoteInfo } | { ok: false; result: GitPushResult }> {
  const remoteName = name ?? (await defaultRemote(ctx));
  if (remoteName === null) {
    return {
      ok: false,
      result: failure(
        gitError("REMOTE_NOT_FOUND", `fatal: No configured push destination.\n${NO_NETWORK}`),
      ),
    };
  }
  const remote = await findRemote(ctx, remoteName);
  return remote === null ? { ok: false, result: remoteNotFound(remoteName) } : { ok: true, remote };
}

/** `git push <remote> --delete <branch>` (or `git push <remote> :<branch>`). */
async function pushDelete(
  ctx: GitContext,
  remoteArg: string | undefined,
  branch: string | undefined,
): Promise<GitPushResult> {
  if (branch === undefined || branch === "") {
    return failure(
      gitError("INVALID_ARGUMENT", "fatal: --delete doesn't make sense without any refs"),
    );
  }
  const found = await pushRemote(ctx, remoteArg);
  if (!found.ok) return found.result;
  const { remote } = found;
  if (!remote.branches.some((entry) => entry.name === branch)) {
    const output = `error: unable to delete '${branch}': remote ref does not exist\nerror: failed to push some refs to '${remote.url}'`;
    return failure(gitError("BRANCH_NOT_FOUND", output));
  }
  await writeRemoteBranch(ctx, remote.name, branch, null);
  const tracking = `refs/remotes/${remote.name}/${branch}`;
  if ((await resolveRefOrNull(ctx, tracking)) !== null) {
    await git.deleteRef({ fs: ctx.fs, dir: ctx.dir, ref: tracking });
  }
  return success(`To ${remote.url}\n - ${"[deleted]".padEnd(17)} ${branch}`, {
    status: "deleted",
    remote: remote.name,
    branch,
  });
}

/** `git push --tags [<remote>]` and `git push <remote> <tag>`. */
async function pushTags(
  ctx: GitContext,
  remoteArg: string | undefined,
  only: string | undefined,
  force: boolean,
): Promise<GitPushResult> {
  const found = await pushRemote(ctx, remoteArg);
  if (!found.ok) return found.result;
  const { remote } = found;
  const names = (await git.listTags({ fs: ctx.fs, dir: ctx.dir })).filter(
    (name) => only === undefined || name === only,
  );
  const width = Math.max(0, ...names.map((name) => name.length));
  const lines: string[] = [];
  const rejected: string[] = [];
  const pushed: string[] = [];
  for (const name of names) {
    // The tag object itself for an annotated tag, so the server has the same tag.
    const oid = await git.resolveRef({ fs: ctx.fs, dir: ctx.dir, ref: `refs/tags/${name}` });
    const before = remote.tags.find((tag) => tag.name === name)?.oid ?? null;
    if (before === oid) continue;
    if (before !== null && !force) {
      lines.push(refLine("!", "[rejected]", name, `${name} (already exists)`, width));
      rejected.push(name);
      continue;
    }
    await writeRemoteTag(ctx, remote.name, name, oid);
    pushed.push(name);
    lines.push(
      before === null
        ? refLine("*", "[new tag]", name, name, width)
        : `${refLine("+", `${shortOid(before)}...${shortOid(oid)}`, name, name, width)} (forced update)`,
    );
  }
  const data = { remote: remote.name, branch: [...pushed, ...rejected].join(" ") };
  if (lines.length === 0)
    return success("Everything up-to-date", { ...data, status: "up-to-date" });
  if (rejected.length > 0) {
    const output = [
      `To ${remote.url}`,
      ...lines,
      `error: failed to push some refs to '${remote.url}'`,
      "hint: Updates were rejected because the tag already exists in the remote.",
    ].join("\n");
    return {
      ok: false,
      output,
      data: { ...data, status: "rejected" },
      error: gitError("PUSH_REJECTED", output),
    };
  }
  return success([`To ${remote.url}`, ...lines, ...simulationNote(remote)].join("\n"), {
    ...data,
    status: "pushed",
  });
}

/**
 * `git push [-u] [--force | --force-with-lease] [<remote> [<branch>]]`, with push.default=simple;
 * also `--delete`, `--tags` and pushing one tag by name.
 */
export async function runPush(
  ctx: GitContext,
  options: GitPushOptions = {},
): Promise<GitPushResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const { remote: remoteArg, setUpstream = false, force } = options;
  const branchArg = options.branch?.startsWith(":") ? options.branch.slice(1) : options.branch;
  if (options.delete === true || options.branch?.startsWith(":")) {
    return pushDelete(ctx, remoteArg, branchArg);
  }
  if (options.tags === true) {
    if (branchArg !== undefined) {
      return failure(
        gitError("INVALID_ARGUMENT", "fatal: GitDojo pushes either --tags or one branch"),
      );
    }
    return pushTags(ctx, remoteArg, undefined, force !== undefined);
  }
  // `git push origin v1.0`: a tag (that is not also a branch) pushes just that tag.
  if (
    branchArg !== undefined &&
    (await resolveRefOrNull(ctx, `refs/heads/${branchArg}`)) === null &&
    (await resolveRefOrNull(ctx, `refs/tags/${branchArg}`)) !== null
  ) {
    return pushTags(ctx, remoteArg, branchArg, force !== undefined);
  }
  const current = await currentBranch(ctx);
  const local = branchArg === undefined || branchArg === "HEAD" ? current : branchArg;
  if (local === null) {
    return failure(
      gitError(
        "NOT_ON_BRANCH",
        "fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>\n",
      ),
    );
  }
  if (branchArg?.includes(":")) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        `fatal: GitDojo pushes a branch to the branch of the same name: git push <remote> <branch>`,
      ),
    );
  }
  const oid = await resolveRefOrNull(ctx, `refs/heads/${local}`);
  if (oid === null) {
    return failure(gitError("BRANCH_NOT_FOUND", `error: src refspec ${local} does not match any`));
  }

  const upstream = await readUpstreamConfig(ctx, local);
  // Without a branch, a push needs an upstream to know where to go (push.default=simple), even
  // with `-u`: Git asks for the branch to be named the first time.
  if (branchArg === undefined && upstream === null) {
    const suggested = remoteArg ?? (await defaultRemote(ctx)) ?? "origin";
    return failure(
      gitError(
        "NO_UPSTREAM",
        [
          `fatal: The current branch ${local} has no upstream branch.`,
          "To push the current branch and set the remote as upstream, use",
          "",
          `    git push --set-upstream ${suggested} ${local}`,
          "",
        ].join("\n"),
      ),
    );
  }
  const remoteName = remoteArg ?? upstream?.remote ?? (await defaultRemote(ctx));
  if (remoteName === null) {
    return failure(
      gitError("REMOTE_NOT_FOUND", `fatal: No configured push destination.\n${NO_NETWORK}`),
    );
  }
  const remote = await findRemote(ctx, remoteName);
  if (remote === null) return remoteNotFound(remoteName);
  const target =
    branchArg === undefined && upstream?.remote === remoteName ? upstream.branch : local;
  if (target !== local) {
    return failure(
      gitError(
        "INVALID_ARGUMENT",
        `fatal: The upstream branch of your current branch does not match\nthe name of your current branch.`,
      ),
    );
  }

  const before = remote.branches.find((branch) => branch.name === target)?.oid ?? null;
  const header = `To ${remote.url}`;
  const trackingName = `${remote.name}/${target}`;
  const setTracking = async () => {
    await git.writeRef({
      fs: ctx.fs,
      dir: ctx.dir,
      ref: `refs/remotes/${trackingName}`,
      value: oid,
      force: true,
    });
    if (!setUpstream) return [];
    await writeUpstreamConfig(ctx, local, remote.name, target);
    return [`branch '${local}' set up to track '${trackingName}'.`];
  };

  if (before === oid) {
    const tracked = await setTracking();
    return success(["Everything up-to-date", ...tracked].join("\n"), {
      status: "up-to-date",
      remote: remote.name,
      branch: target,
      from: before,
      to: oid,
    });
  }
  const width = local.length;
  const fastForward = before === null || (await isAncestor(ctx, before, oid));
  // `--force-with-lease`: the remote must still be where this repository last saw it.
  const expected = await resolveRefOrNull(ctx, `refs/remotes/${trackingName}`);
  if (force === "lease" && before !== expected) {
    const output = [
      header,
      refLine("!", "[rejected]", local, `${target} (stale info)`, width),
      `error: failed to push some refs to '${remote.url}'`,
      "hint: The remote branch has moved since you last fetched it, so pushing could",
      "hint: throw away someone else's work. Fetch, look at what changed, then decide.",
    ].join("\n");
    return {
      ok: false,
      output,
      data: { status: "rejected", remote: remote.name, branch: target, from: before },
      error: gitError("PUSH_REJECTED", output),
    };
  }
  if (!fastForward && force === undefined) {
    // The server has commits this branch does not: pushing would throw them away.
    const fetchFirst = !(await knownLocally(ctx, before));
    const output = [
      header,
      refLine(
        "!",
        "[rejected]",
        local,
        `${target} (${fetchFirst ? "fetch first" : "non-fast-forward"})`,
        width,
      ),
      `error: failed to push some refs to '${remote.url}'`,
      ...(fetchFirst
        ? [
            "hint: Updates were rejected because the remote contains work that you do not",
            "hint: have locally. This is usually caused by another repository pushing to",
            "hint: the same ref. If you want to integrate the remote changes, use",
            "hint: 'git pull' before pushing again.",
          ]
        : [
            "hint: Updates were rejected because the tip of your current branch is behind",
            "hint: its remote counterpart. If you want to integrate the remote changes,",
            "hint: use 'git pull' before pushing again.",
          ]),
      "hint: See the 'Note about fast-forwards' in 'git push --help' for details.",
    ].join("\n");
    return {
      ok: false,
      output,
      data: { status: "rejected", remote: remote.name, branch: target, from: before },
      error: gitError("PUSH_REJECTED", output),
    };
  }

  await writeRemoteBranch(ctx, remote.name, target, oid);
  const tracked = await setTracking();
  const line =
    before === null
      ? refLine("*", "[new branch]", local, target, width)
      : fastForward
        ? refLine(" ", `${shortOid(before)}..${shortOid(oid)}`, local, target, width)
        : `${refLine("+", `${shortOid(before)}...${shortOid(oid)}`, local, target, width)} (forced update)`;
  return success([header, line, ...tracked, ...simulationNote(remote)].join("\n"), {
    status: "pushed",
    remote: remote.name,
    branch: target,
    from: before,
    to: oid,
    ...(fastForward ? {} : { forced: true }),
  });
}

const DIVERGENT_HINT = [
  "hint: You have divergent branches and need to specify how to reconcile them.",
  "hint: You can do so by running one of the following commands sometime before",
  "hint: your next pull:",
  "hint:",
  "hint:   git config pull.rebase false  # merge",
  "hint:   git config pull.rebase true   # rebase",
  "hint:   git config pull.ff only       # fast-forward only",
  "hint:",
  'hint: You can replace "git config" with "git config --global" to set a default',
  "hint: preference for all repositories. You can also pass --rebase, --no-rebase,",
  "hint: or --ff-only on the command line to override the configured default per",
  "hint: invocation.",
  "fatal: Need to specify how to reconcile divergent branches.",
];

function joinOutput(...parts: string[]): string {
  return parts.filter((part) => part !== "").join("\n");
}

/** `git pull`: a fetch, then a fast-forward, merge or rebase onto what was fetched. */
export async function runPull(
  ctx: GitContext,
  { remote: remoteArg, branch: branchArg, mode: modeArg }: GitPullOptions = {},
): Promise<GitPullResult> {
  if (!(await isRepository(ctx))) return notARepository();
  // Without an option, `pull.rebase` and `pull.ff` choose, as the divergent-branches hint says.
  const mode = modeArg ?? (await configuredPullMode(ctx));
  const inProgress = await readMergeState(ctx);
  if (inProgress) {
    return failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(inProgress)));
  }
  const current = await currentBranch(ctx);
  if (current === null) {
    return failure(
      gitError(
        "NOT_ON_BRANCH",
        "You are not currently on a branch.\nPlease specify which branch you want to merge with.",
      ),
    );
  }
  const upstream = await readUpstreamConfig(ctx, current);
  const remoteName = remoteArg ?? upstream?.remote ?? null;
  const branchName =
    branchArg ??
    (remoteArg === undefined || remoteArg === upstream?.remote ? upstream?.branch : undefined);
  if (remoteName === null || branchName === undefined) {
    return failure(
      gitError(
        "NO_UPSTREAM",
        [
          "There is no tracking information for the current branch.",
          "Please specify which branch you want to merge with.",
          "",
          "    git pull <remote> <branch>",
          "",
          "If you wish to set tracking information for this branch you can do so with:",
          "",
          `    git branch --set-upstream-to=origin/<branch> ${current}`,
          "",
        ].join("\n"),
      ),
    );
  }
  const remote = await findRemote(ctx, remoteName);
  if (remote === null) return remoteNotFound(remoteName);

  const fetched = await fetchRemote(ctx, remote);
  const fetchOutput = fetched.lines.join("\n");
  const tracking = `${remote.name}/${branchName}`;
  const theirs = await resolveRefOrNull(ctx, `refs/remotes/${tracking}`);
  if (theirs === null) {
    return failure(
      gitError(
        "BRANCH_NOT_FOUND",
        joinOutput(fetchOutput, `fatal: couldn't find remote ref ${branchName}`),
      ),
    );
  }
  const ours = await resolveRefOrNull(ctx, "HEAD");
  if (ours !== null && (await isAncestor(ctx, theirs, ours))) {
    return success(joinOutput(fetchOutput, "Already up to date."), {
      status: "up-to-date",
      oid: ours,
    });
  }
  const fastForward = ours === null || (await isAncestor(ctx, ours, theirs));

  if (mode === "rebase") {
    const rebased = await runRebase(ctx, tracking);
    const status = rebased.data?.status;
    return {
      ...rebased,
      output: joinOutput(fetchOutput, rebased.output),
      data: {
        status:
          status === "conflict"
            ? "conflict"
            : status === "fast-forward"
              ? "fast-forward"
              : status === "up-to-date"
                ? "up-to-date"
                : "rebased",
        ...(rebased.data?.oid ? { oid: rebased.data.oid } : {}),
      },
    };
  }
  if (!fastForward && mode === undefined) {
    const output = joinOutput(fetchOutput, DIVERGENT_HINT.join("\n"));
    return { ok: false, output, error: gitError("DIVERGENT_BRANCHES", output) };
  }
  const merged = await runMerge(ctx, tracking, {
    fastForwardOnly: mode === "ff-only",
    message: `Merge branch '${branchName}' of ${remote.url}`,
  });
  const type = merged.data?.type;
  return {
    ...merged,
    output: joinOutput(fetchOutput, merged.output),
    data: {
      status:
        type === "conflict"
          ? "conflict"
          : type === "merge-commit"
            ? "merge-commit"
            : type === "up-to-date"
              ? "up-to-date"
              : "fast-forward",
      ...(merged.data?.oid ? { oid: merged.data.oid } : {}),
    },
  };
}

/** Lesson setup: a simulated remote that has these local branches, as after a clone. */
export async function runSetupRemote(
  ctx: GitContext,
  name: string,
  { url = simulatedRemoteUrl(name), branches }: GitSetupRemoteOptions,
): Promise<GitCommandResult> {
  if (!(await isRepository(ctx))) return notARepository();
  await addSimulatedRemote(ctx, name, url);
  for (const branch of branches) {
    const oid = await resolveRefOrNull(ctx, `refs/heads/${branch}`);
    if (oid === null) {
      return failure(
        gitError("BRANCH_NOT_FOUND", `error: src refspec ${branch} does not match any`),
      );
    }
    await writeRemoteBranch(ctx, name, branch, oid);
    await git.writeRef({
      fs: ctx.fs,
      dir: ctx.dir,
      ref: `refs/remotes/${name}/${branch}`,
      value: oid,
      force: true,
    });
    await writeUpstreamConfig(ctx, branch, name, branch);
  }
  return success("", {});
}

interface TreeNode {
  files: Map<string, string>;
  dirs: Map<string, TreeNode>;
}

/** Writes nested tree objects for path → blob oid and returns the root tree's oid. */
async function writeTreeFromFiles(ctx: GitContext, files: ReadonlyMap<string, string>) {
  const root: TreeNode = { files: new Map(), dirs: new Map() };
  for (const [path, oid] of files) {
    const parts = path.split("/");
    const name = parts.pop() ?? path;
    let node = root;
    for (const part of parts) {
      let next = node.dirs.get(part);
      if (!next) {
        next = { files: new Map(), dirs: new Map() };
        node.dirs.set(part, next);
      }
      node = next;
    }
    node.files.set(name, oid);
  }
  const write = async (node: TreeNode): Promise<string> => {
    const entries: TreeEntry[] = [];
    for (const [name, child] of node.dirs) {
      entries.push({ mode: "040000", path: name, oid: await write(child), type: "tree" });
    }
    for (const [name, oid] of node.files) {
      entries.push({ mode: "100644", path: name, oid, type: "blob" });
    }
    return git.writeTree({ fs: ctx.fs, dir: ctx.dir, tree: entries });
  };
  return write(root);
}

/**
 * Lesson setup: a commit "somebody else pushed": written straight into the object database and
 * onto the simulated server's branch, without touching the learner's branches, index or files.
 */
export async function runSetupRemoteCommit(
  ctx: GitContext,
  name: string,
  {
    branch,
    message,
    files,
    author = { name: "Sam Rivera", email: "sam@example.com" },
    timestamp,
  }: GitSetupRemoteCommitInput,
): Promise<GitCommandResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const remote = await findRemote(ctx, name);
  if (remote === null) return remoteNotFound(name);
  const parent =
    remote.branches.find((candidate) => candidate.name === branch)?.oid ??
    remote.branches.find((candidate) => candidate.name === "main")?.oid ??
    null;
  const tree = await readTreeFiles(ctx, parent);
  for (const [path, content] of Object.entries(files)) {
    const normalized = normalizeWorkspacePath(path);
    if (content === null) tree.delete(normalized);
    else {
      tree.set(
        normalized,
        await git.writeBlob({ fs: ctx.fs, dir: ctx.dir, blob: new TextEncoder().encode(content) }),
      );
    }
  }
  const when = { timestamp: timestamp ?? Math.floor(Date.now() / 1000), timezoneOffset: 0 };
  const oid = await git.writeCommit({
    fs: ctx.fs,
    dir: ctx.dir,
    commit: {
      message: message.endsWith("\n") ? message : `${message}\n`,
      tree: await writeTreeFromFiles(ctx, tree),
      parent: parent === null ? [] : [parent],
      author: { ...author, ...when },
      committer: { ...author, ...when },
    },
  });
  await writeRemoteBranch(ctx, name, branch, oid);
  return success("", { oid });
}

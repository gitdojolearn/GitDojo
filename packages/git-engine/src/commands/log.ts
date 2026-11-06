import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { formatDiffStat, formatFileDiff } from "../engine/diff";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitCommitInfo, type GitLogOptions, type GitLogResult } from "../engine/git-engine";
import {
  currentBranch,
  isRepository,
  readCommitsFrom,
  readCommitsFromHead,
  resolveRefOrNull,
} from "../engine/repository";
import { drawCommitLines, layoutGraph } from "../engine/log-graph";
import { readRemoteTrackingBranches, readTags } from "../engine/refs";
import { resolveRevision, unknownRevisionMessage } from "../engine/revisions";
import { hashText, readTreeFiles } from "../engine/working-tree";
import { fileDiffs, treeChanges } from "./diff";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats like Git's default date format, in the author's recorded timezone (not the viewer's). */
export function formatGitDate(timestamp: number, timezoneOffset: number): string {
  const local = new Date((timestamp - timezoneOffset * 60) * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const sign = timezoneOffset <= 0 ? "+" : "-";
  const absolute = Math.abs(timezoneOffset);
  const zone = `${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
  return `${WEEKDAYS[local.getUTCDay()] ?? ""} ${MONTHS[local.getUTCMonth()] ?? ""} ${String(local.getUTCDate())} ${time} ${String(local.getUTCFullYear())} ${zone}`;
}

export async function branchDecorations(ctx: GitContext): Promise<Map<string, string[]>> {
  const decorations = new Map<string, string[]>();
  const add = (oid: string, label: string) => {
    decorations.set(oid, [...(decorations.get(oid) ?? []), label]);
  };
  const head = await currentBranch(ctx);
  const branches = await git.listBranches({ fs: ctx.fs, dir: ctx.dir });
  // A detached HEAD is its own label, listed before any branch at the same commit.
  const detached = head === null ? await resolveRefOrNull(ctx, "HEAD") : null;
  if (detached !== null) decorations.set(detached, ["HEAD"]);
  const headOid = head === null ? null : await resolveRefOrNull(ctx, `refs/heads/${head}`);
  if (head !== null && headOid !== null) add(headOid, `HEAD -> ${head}`);
  // Then tags, other local branches and remote-tracking branches, as Git lists them.
  for (const tag of await readTags(ctx)) add(tag.oid, `tag: ${tag.name}`);
  for (const name of branches.filter((branch) => branch !== head)) {
    const oid = await resolveRefOrNull(ctx, `refs/heads/${name}`);
    if (oid !== null) add(oid, name);
  }
  for (const ref of await readRemoteTrackingBranches(ctx)) add(ref.oid, ref.name);
  return decorations;
}

/** Every ref `git log --all` starts from: HEAD, branches, tags and remote-tracking branches. */
export async function allRefTips(ctx: GitContext): Promise<string[]> {
  const branches = await Promise.all(
    (await git.listBranches({ fs: ctx.fs, dir: ctx.dir })).map((name) =>
      resolveRefOrNull(ctx, `refs/heads/${name}`),
    ),
  );
  const head = await resolveRefOrNull(ctx, "HEAD");
  const tags = (await readTags(ctx)).map((tag) => tag.oid);
  const remotes = (await readRemoteTrackingBranches(ctx)).map((ref) => ref.oid);
  return [head, ...branches, ...tags, ...remotes].filter((oid) => oid !== null);
}

export function formatCommit(commit: GitCommitInfo, decoration: string, oneline: boolean): string {
  if (oneline) return `${commit.shortOid}${decoration} ${commit.message.split("\n")[0] ?? ""}`;
  const body = commit.message
    .split("\n")
    .map((line) => (line === "" ? "" : `    ${line}`))
    .join("\n");
  return [
    `commit ${commit.oid}${decoration}`,
    ...(commit.parents.length > 1
      ? [`Merge: ${commit.parents.map((parent) => parent.slice(0, 7)).join(" ")}`]
      : []),
    `Author: ${commit.author.name} <${commit.author.email}>`,
    `Date:   ${formatGitDate(commit.author.timestamp, commit.author.timezoneOffset)}`,
    "",
    body,
  ].join("\n");
}

export async function runLog(ctx: GitContext, options: GitLogOptions = {}): Promise<GitLogResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) {
    const branch = (await currentBranch(ctx)) ?? "HEAD";
    return failure(
      gitError(
        "NO_COMMITS",
        `fatal: your current branch '${branch}' does not have any commits yet`,
      ),
    );
  }

  let commits: GitCommitInfo[];
  if (options.all) {
    commits = await readCommitsFrom(ctx, await allRefTips(ctx));
  } else if (options.revision !== undefined) {
    const start = await resolveRevision(ctx, options.revision);
    if (start === null) {
      return failure(gitError("INVALID_REVISION", unknownRevisionMessage(options.revision)));
    }
    commits = await readCommitsFrom(ctx, [start]);
  } else if (options.graph) {
    // The graph needs every commit after all of its children, as `--graph` makes Git do.
    commits = await readCommitsFrom(ctx, [head]);
  } else {
    commits = await readCommitsFromHead(ctx);
  }
  // The graph is laid out over the whole history, so lanes still open past the limit show.
  const graph = options.graph ? layoutGraph(commits) : null;
  if (options.maxCount !== undefined) commits = commits.slice(0, options.maxCount);
  const decorations = await branchDecorations(ctx);
  const oneline = options.oneline ?? false;

  const lines: string[] = [];
  for (const [index, commit] of commits.entries()) {
    const labels = decorations.get(commit.oid);
    const decoration = labels ? ` (${labels.join(", ")})` : "";
    const block = formatCommit(commit, decoration, oneline).split("\n");
    const details = await commitDetails(ctx, commit, options);
    // In the long format, the stat and the patch follow the message after a blank line.
    if (details.length > 0) block.push(...(oneline ? details : ["", ...details]));
    if (!oneline && index < commits.length - 1) block.push("");
    const rows = graph?.[index];
    lines.push(...(rows ? drawCommitLines(rows, block) : block));
  }

  return success(lines.join("\n"), { commits });
}

/** `--stat` and `-p` for one commit, against its parent. Merges show neither, as in Git. */
async function commitDetails(
  ctx: GitContext,
  commit: GitCommitInfo,
  { stat = false, patch = false }: GitLogOptions,
): Promise<string[]> {
  if ((!stat && !patch) || commit.parents.length > 1) return [];
  const changes = await treeChanges(
    ctx,
    await readTreeFiles(ctx, commit.parents[0] ?? null),
    await readTreeFiles(ctx, commit.oid),
  );
  const lines: string[] = [];
  // Like Git's log, the stat has no create/delete mode lines (those belong to `--summary`).
  if (stat) lines.push(...formatDiffStat(changes, { modes: false }));
  if (patch) {
    const diffs = await fileDiffs(changes, hashText);
    if (stat && diffs.length > 0) lines.push("");
    lines.push(...diffs.flatMap((diff) => formatFileDiff(diff.file, diff.oids).split("\n")));
  }
  return lines;
}

import { type FileState, type RepositoryState } from "@gitdojo/shared-types";

/** Labels on the graph that can move between commits. */
export type RefKey = `head` | `branch:${string}` | `remote:${string}` | `tag:${string}`;

/** A commit history no longer contains, shown briefly next to what replaced or copied it. */
export interface CommitGhost {
  shortOid: string;
  subject: string;
  /**
   * `replaced`: the old commit is gone (amend, rebase, squash), and fades away next to its
   * replacement. `copied`: the original is still there (cherry-pick); a copy travels from it.
   */
  kind: "replaced" | "copied";
  /** For copies: the original commit, which is still in the graph. */
  from?: string;
}

/** Where a file that just appeared in a panel came from. */
export type FileArrival = "repository" | "staging" | "stash";

/** Why a file just left a panel, which decides how it leaves. */
export type FileDeparture = "staged" | "unstaged" | "committed" | "stashed" | "discarded";

export interface LeavingFile {
  file: FileState;
  reason: FileDeparture;
}

/**
 * What one command did to the repository, as the views need to animate it. Everything is
 * derived from the states before and after: the views never see the command itself, so the
 * same movement shows however the learner got there.
 */
export interface RepositoryTransition {
  /** Labels now at another commit than before, with the commit they were at. */
  movedRefs: ReadonlyMap<RefKey, string>;
  /** Labels that did not exist before. */
  newRefs: ReadonlySet<RefKey>;
  /** Commits that did not exist before. */
  freshCommits: ReadonlySet<string>;
  /** New commit → the commit it replaced or copied. */
  ghosts: ReadonlyMap<string, CommitGhost>;
  /** Server branches (`origin/main`) that moved: `push` from here, `fetch` into `origin/*`. */
  remoteSyncs: ReadonlyMap<string, "push" | "fetch">;
  /** Path → where it came from, for files that just appeared in the working tree. */
  workingTreeArrivals: ReadonlyMap<string, FileArrival>;
  /** Path → where it came from, for files that just appeared in the staging area. */
  stagingArrivals: ReadonlyMap<string, FileArrival>;
  workingTreeLeaving: readonly LeavingFile[];
  stagingLeaving: readonly LeavingFile[];
  /** Conflicted paths that were just resolved. */
  resolvedConflicts: ReadonlySet<string>;
  /** Conflicted paths that just appeared. */
  newConflicts: ReadonlySet<string>;
  /** When it happened (`Date.now()`), so a view mounted much later does not replay it. */
  at: number;
}

/** A transition this old has already been seen: a remount must not animate it again. */
export const TRANSITION_TTL_MS = 1500;

export function isRecent(transition: RepositoryTransition | null, now = Date.now()) {
  return transition !== null && now - transition.at < TRANSITION_TTL_MS;
}

const UNSTAGED = new Set(["conflicted", "untracked", "modified", "deleted"]);

function subject(message: string): string {
  return message.split("\n")[0]?.trim() ?? "";
}

function refTargets(state: RepositoryState): Map<RefKey, string> {
  const refs = new Map<RefKey, string>();
  if (state.head !== null) refs.set("head", state.head);
  for (const branch of state.branches)
    if (branch.oid) refs.set(`branch:${branch.name}`, branch.oid);
  for (const ref of state.remoteBranches) refs.set(`remote:${ref.name}`, ref.oid);
  for (const tag of state.tags) refs.set(`tag:${tag.name}`, tag.oid);
  return refs;
}

function serverBranches(state: RepositoryState): Map<string, string> {
  return new Map(
    state.remotes.flatMap((remote) =>
      remote.branches.map((branch) => [`${remote.name}/${branch.name}`, branch.oid] as const),
    ),
  );
}

/**
 * Pairs each new commit with the old one it stands in for. Rewritten commits keep their
 * subject (rebase, squash, cherry-pick), so that decides first; a lone amend with a new message
 * is paired by being the only commit replaced.
 */
function pairGhosts(
  previous: RepositoryState,
  next: RepositoryState,
  fresh: ReadonlySet<string>,
): Map<string, CommitGhost> {
  const nextOids = new Set(next.allCommits.map((commit) => commit.oid));
  const removed = previous.allCommits.filter((commit) => !nextOids.has(commit.oid));
  const freshCommits = next.allCommits.filter((commit) => fresh.has(commit.oid));
  const ghosts = new Map<string, CommitGhost>();
  const used = new Set<string>();

  for (const commit of freshCommits) {
    const match = removed.find(
      (old) => !used.has(old.oid) && subject(old.message) === subject(commit.message),
    );
    if (match) {
      used.add(match.oid);
      ghosts.set(commit.oid, {
        shortOid: match.shortOid,
        subject: subject(match.message),
        kind: "replaced",
      });
      continue;
    }
    // A cherry-pick: the original is still in history, elsewhere.
    const original = previous.allCommits.find(
      (old) => nextOids.has(old.oid) && subject(old.message) === subject(commit.message),
    );
    if (original && commit.parents.length === 1) {
      ghosts.set(commit.oid, {
        shortOid: original.shortOid,
        subject: subject(original.message),
        kind: "copied",
        from: original.oid,
      });
    }
  }
  const unmatched = removed.filter((old) => !used.has(old.oid));
  const unpaired = freshCommits.filter((commit) => !ghosts.has(commit.oid));
  const [old] = unmatched;
  const [replacement] = unpaired;
  if (unmatched.length === 1 && unpaired.length === 1 && old && replacement) {
    ghosts.set(replacement.oid, {
      shortOid: old.shortOid,
      subject: subject(old.message),
      kind: "replaced",
    });
  }
  return ghosts;
}

/**
 * Describes the move from `previous` to `next`, or `null` when they are not one step apart: the
 * first state of a workspace, or a reset to a different history (no commit in common), where
 * animating every difference would only be noise.
 */
export function computeTransition(
  previous: RepositoryState,
  next: RepositoryState,
  now = Date.now(),
): RepositoryTransition | null {
  if (!previous.initialized && previous.files.length === 0) return null;
  const previousOids = new Set(previous.allCommits.map((commit) => commit.oid));
  const sharesHistory =
    previous.allCommits.length === 0 ||
    next.allCommits.some((commit) => previousOids.has(commit.oid));
  if (!sharesHistory) return null;

  const freshCommits = new Set(
    next.allCommits.filter((commit) => !previousOids.has(commit.oid)).map((commit) => commit.oid),
  );

  const before = refTargets(previous);
  const movedRefs = new Map<RefKey, string>();
  const newRefs = new Set<RefKey>();
  for (const [key, oid] of refTargets(next)) {
    const was = before.get(key);
    if (was === undefined) newRefs.add(key);
    else if (was !== oid) movedRefs.set(key, was);
  }

  const serverBefore = serverBranches(previous);
  const remoteSyncs = new Map<string, "push" | "fetch">();
  for (const [name, oid] of serverBranches(next)) {
    const was = serverBefore.get(name);
    if (was !== undefined && was !== oid) remoteSyncs.set(name, "push");
  }
  for (const ref of next.remoteBranches) {
    if (remoteSyncs.has(ref.name)) continue;
    const was = previous.remoteBranches.find((candidate) => candidate.name === ref.name)?.oid;
    if (was !== undefined && was !== ref.oid) remoteSyncs.set(ref.name, "fetch");
  }

  // Files: compare what each panel shows before and after.
  const previousStaged = new Map(previous.stagedFiles.map((file) => [file.path, file]));
  const nextStaged = new Map(next.stagedFiles.map((file) => [file.path, file]));
  const previousChanged = new Map(
    previous.files.filter((file) => UNSTAGED.has(file.status)).map((file) => [file.path, file]),
  );
  const nextChanged = new Map(
    next.files.filter((file) => UNSTAGED.has(file.status)).map((file) => [file.path, file]),
  );
  const stashed = next.stashes.length > previous.stashes.length;
  const unstashed = next.stashes.length < previous.stashes.length;
  const committed = freshCommits.size > 0;

  const workingTreeArrivals = new Map<string, FileArrival>();
  for (const path of nextChanged.keys()) {
    if (previousChanged.has(path)) continue;
    if (previousStaged.has(path) && !nextStaged.has(path)) workingTreeArrivals.set(path, "staging");
    else if (unstashed) workingTreeArrivals.set(path, "stash");
  }
  // HEAD moved to a commit that already existed: history was undone (`reset --soft`).
  const headWentBack = movedRefs.has("head") && !committed;
  const stagingArrivals = new Map<string, FileArrival>();
  for (const path of nextStaged.keys()) {
    if (previousStaged.has(path) || previousChanged.has(path)) continue;
    if (unstashed) stagingArrivals.set(path, "stash");
    else if (headWentBack) stagingArrivals.set(path, "repository");
  }

  const workingTreeLeaving: LeavingFile[] = [];
  for (const [path, file] of previousChanged) {
    if (nextChanged.has(path)) continue;
    const reason: FileDeparture = nextStaged.has(path)
      ? "staged"
      : stashed
        ? "stashed"
        : "discarded";
    workingTreeLeaving.push({ file, reason });
  }
  const stagingLeaving: LeavingFile[] = [];
  for (const [path, file] of previousStaged) {
    if (nextStaged.has(path)) continue;
    const reason: FileDeparture = nextChanged.has(path)
      ? "unstaged"
      : committed
        ? "committed"
        : stashed
          ? "stashed"
          : "discarded";
    stagingLeaving.push({ file, reason });
  }

  const wasConflicted = new Set(
    previous.conflicts.filter((conflict) => !conflict.resolved).map((conflict) => conflict.path),
  );
  const isConflicted = new Set(
    next.conflicts.filter((conflict) => !conflict.resolved).map((conflict) => conflict.path),
  );
  const resolvedConflicts = new Set(
    [...wasConflicted].filter(
      (path) =>
        !isConflicted.has(path) &&
        next.conflicts.some((conflict) => conflict.path === path && conflict.resolved),
    ),
  );
  const newConflicts = new Set([...isConflicted].filter((path) => !wasConflicted.has(path)));

  return {
    movedRefs,
    newRefs,
    freshCommits,
    ghosts: pairGhosts(previous, next, freshCommits),
    remoteSyncs,
    workingTreeArrivals,
    stagingArrivals,
    workingTreeLeaving,
    stagingLeaving,
    resolvedConflicts,
    newConflicts,
    at: now,
  };
}

import {
  EMPTY_REPOSITORY_STATE,
  type CommitState,
  type FileState,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { buildCommitGraph, COMMIT_ROW_HEIGHT } from "./build-commit-graph";
import { computeTransition, isRecent, TRANSITION_TTL_MS } from "./transitions";

const commit = (oid: string, message: string, parents: string[] = []): CommitState => ({
  oid,
  shortOid: oid.slice(0, 7),
  message,
  authorName: "GitDojo Learner",
  authorEmail: "learner@gitdojo.local",
  timestamp: 0,
  parents,
  changedPaths: [],
});

const A = commit("aaaaaaaaaa", "Initial commit");
const B = commit("bbbbbbbbbb", "Add login", [A.oid]);

/** A repository on `main` with these commits (newest first), HEAD at the first. */
function repo(commits: CommitState[], extra: Partial<RepositoryState> = {}): RepositoryState {
  const head = commits[0]?.oid ?? null;
  return {
    ...EMPTY_REPOSITORY_STATE,
    initialized: true,
    currentBranch: "main",
    head,
    branches: head ? [{ name: "main", oid: head, current: true }] : [],
    commits,
    allCommits: commits,
    ...extra,
  };
}

const file = (path: string, status: FileState["status"]): FileState => ({ path, status });

describe("computeTransition", () => {
  it("is null for a workspace's first state and for an unrelated history (a reset lesson)", () => {
    expect(computeTransition(EMPTY_REPOSITORY_STATE, repo([B, A]))).toBeNull();
    const other = repo([commit("cccccccccc", "Initial commit")]);
    expect(computeTransition(repo([B, A]), other)).toBeNull();
  });

  it("commit: the new commit is fresh, HEAD and main move to it, staged files go onwards", () => {
    const before = repo([A], {
      stagedFiles: [{ ...file("login.js", "staged"), change: "added" }],
    });
    const after = repo([B, A], { files: [file("login.js", "committed")] });
    const transition = computeTransition(before, after);
    expect([...(transition?.freshCommits ?? [])]).toEqual([B.oid]);
    expect(transition?.movedRefs).toEqual(
      new Map([
        ["head", A.oid],
        ["branch:main", A.oid],
      ]),
    );
    expect(transition?.stagingLeaving).toEqual([
      { file: { ...file("login.js", "staged"), change: "added" }, reason: "committed" },
    ]);
    expect(transition?.ghosts.size).toBe(0);
  });

  it("amend: the replaced commit becomes a ghost of its replacement", () => {
    const amended = commit("dddddddddd", "Add login form", [A.oid]);
    const transition = computeTransition(repo([B, A]), repo([amended, A]));
    expect(transition?.ghosts.get(amended.oid)).toEqual({
      shortOid: B.shortOid,
      subject: "Add login",
      kind: "replaced",
    });
  });

  it("rebase: each replayed commit is paired with the original of the same subject", () => {
    const C = commit("cccccccccc", "Add search", [B.oid]);
    const main2 = commit("eeeeeeeeee", "Fix header", [A.oid]);
    const before = repo([C, B, main2, A], {
      branches: [
        { name: "feature", oid: C.oid, current: true },
        { name: "main", oid: main2.oid, current: false },
      ],
      currentBranch: "feature",
    });
    const B2 = commit("bbbbbbbbb2", "Add login", [main2.oid]);
    const C2 = commit("ccccccccc2", "Add search", [B2.oid]);
    const after = repo([C2, B2, main2, A], {
      branches: [
        { name: "feature", oid: C2.oid, current: true },
        { name: "main", oid: main2.oid, current: false },
      ],
      currentBranch: "feature",
    });
    const ghosts = computeTransition(before, after)?.ghosts;
    expect(ghosts?.get(C2.oid)?.shortOid).toBe(C.shortOid);
    expect(ghosts?.get(B2.oid)?.shortOid).toBe(B.shortOid);
  });

  it("cherry-pick: the copy remembers the original, which is still there", () => {
    const fix = commit("ffffffffff", "Fix typo", [A.oid]);
    const before = repo([B, fix, A], {
      branches: [
        { name: "main", oid: B.oid, current: true },
        { name: "hotfix", oid: fix.oid, current: false },
      ],
    });
    const copy = commit("9999999999", "Fix typo", [B.oid]);
    const after = repo([copy, B, fix, A], {
      branches: [
        { name: "main", oid: copy.oid, current: true },
        { name: "hotfix", oid: fix.oid, current: false },
      ],
    });
    const transition = computeTransition(before, after);
    expect(transition?.ghosts.get(copy.oid)).toMatchObject({ kind: "copied", from: fix.oid });
    // The graph sends the copy over from the original's row, two rows below.
    const graph = buildCommitGraph(after, null, transition ?? null);
    expect(graph.nodes[0]?.data.ghost?.fromY).toBe(2 * COMMIT_ROW_HEIGHT);
  });

  it("reset --soft: files come back from the repository into staging", () => {
    const before = repo([B, A], { files: [file("login.js", "committed")] });
    const after = repo([A], {
      branches: [{ name: "main", oid: A.oid, current: true }],
      stagedFiles: [{ ...file("login.js", "staged"), change: "added" }],
      allCommits: [B, A],
    });
    expect(computeTransition(before, after)?.stagingArrivals.get("login.js")).toBe("repository");
  });

  it("restore --staged and restore: back to the working tree, then thrown away", () => {
    const staged = repo([A], { stagedFiles: [{ ...file("a.md", "staged"), change: "modified" }] });
    const unstaged = repo([A], { files: [file("a.md", "modified")] });
    const unstagedMove = computeTransition(staged, unstaged);
    expect(unstagedMove?.workingTreeArrivals.get("a.md")).toBe("staging");
    expect(unstagedMove?.stagingLeaving[0]?.reason).toBe("unstaged");
    const discarded = computeTransition(
      unstaged,
      repo([A], { files: [file("a.md", "committed")] }),
    );
    expect(discarded?.workingTreeLeaving[0]?.reason).toBe("discarded");
  });

  it("stash and stash pop: files go down into the stash and rise back out", () => {
    const changed = repo([A], { files: [file("a.md", "modified")] });
    const stash = {
      selector: "stash@{0}",
      message: "WIP",
      branch: "main",
      oid: "5",
      files: ["a.md"],
    };
    const stashed = repo([A], { stashes: [stash] });
    expect(computeTransition(changed, stashed)?.workingTreeLeaving[0]?.reason).toBe("stashed");
    expect(computeTransition(stashed, changed)?.workingTreeArrivals.get("a.md")).toBe("stash");
  });

  it("push and fetch: says which way commits travelled", () => {
    const remote = (oid: string) => [
      { name: "origin", url: "gitdojo://simulated/origin.git", branches: [{ name: "main", oid }] },
    ];
    const tracking = (oid: string) => [
      { name: "origin/main", remote: "origin", branch: "main", oid },
    ];
    const before = repo([B, A], { remotes: remote(A.oid), remoteBranches: tracking(A.oid) });
    const pushed = repo([B, A], { remotes: remote(B.oid), remoteBranches: tracking(B.oid) });
    expect(computeTransition(before, pushed)?.remoteSyncs.get("origin/main")).toBe("push");
    const serverAhead = repo([B, A], { remotes: remote(B.oid), remoteBranches: tracking(A.oid) });
    const fetched = computeTransition(serverAhead, pushed);
    expect(fetched?.remoteSyncs.get("origin/main")).toBe("fetch");
    expect(fetched?.movedRefs.get("remote:origin/main")).toBe(A.oid);
  });

  it("conflicts: new ones and resolved ones", () => {
    const conflict = (resolved: boolean) => [{ path: "app.js", resolved }];
    const clean = repo([B, A]);
    const conflicted = repo([B, A], { conflicts: conflict(false) });
    const resolved = repo([B, A], { conflicts: conflict(true) });
    expect([...(computeTransition(clean, conflicted)?.newConflicts ?? [])]).toEqual(["app.js"]);
    expect([...(computeTransition(conflicted, resolved)?.resolvedConflicts ?? [])]).toEqual([
      "app.js",
    ]);
  });

  it("is only replayed while it is recent", () => {
    const transition = computeTransition(repo([A]), repo([B, A]), 1000);
    expect(isRecent(transition, 1000 + TRANSITION_TTL_MS - 1)).toBe(true);
    expect(isRecent(transition, 1000 + TRANSITION_TTL_MS)).toBe(false);
    expect(isRecent(null)).toBe(false);
  });
});

describe("buildCommitGraph with a transition", () => {
  it("pops the new commit, draws its links and glides labels from their old row", () => {
    const C = commit("cccccccccc", "Add search", [B.oid]);
    const before = repo([B, A], {
      branches: [
        { name: "main", oid: B.oid, current: true },
        { name: "feature", oid: A.oid, current: false },
      ],
    });
    // `git switch feature` then nothing else: HEAD glides down two rows, nothing is fresh.
    const switched = repo([B, A], {
      currentBranch: "feature",
      head: A.oid,
      branches: [
        { name: "main", oid: B.oid, current: false },
        { name: "feature", oid: A.oid, current: true },
      ],
    });
    const switchGraph = buildCommitGraph(switched, null, computeTransition(before, switched));
    expect(switchGraph.nodes[1]?.data.refMotion).toEqual({ head: -COMMIT_ROW_HEIGHT });
    expect(switchGraph.edges.every((edge) => edge.data?.fresh === false)).toBe(true);

    const committed = repo([C, B, A]);
    const graph = buildCommitGraph(committed, null, computeTransition(repo([B, A]), committed));
    expect(graph.nodes.map((node) => node.data.fresh)).toEqual([true, false, false]);
    // main was on B, now one row below C: it glides up from there.
    expect(graph.nodes[0]?.data.refMotion).toEqual({
      head: COMMIT_ROW_HEIGHT,
      "branch:main": COMMIT_ROW_HEIGHT,
    });
    expect(graph.edges.find((edge) => edge.source === C.oid)?.data).toMatchObject({
      fresh: true,
      delay: 0,
    });
  });
});

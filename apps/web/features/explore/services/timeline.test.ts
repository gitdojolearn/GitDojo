import {
  type CommitState,
  EMPTY_REPOSITORY_STATE,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { buildTimeline, describeReflogMessage } from "./timeline";

const oid = (name: string) => name.repeat(40).slice(0, 40);

function commit(name: string, parents: string[] = []): CommitState {
  return {
    oid: oid(name),
    shortOid: oid(name).slice(0, 7),
    message: `Commit ${name}`,
    authorName: "Ada",
    authorEmail: "ada@example.com",
    timestamp: 1_700_000_000,
    parents: parents.map(oid),
    changedPaths: [],
  };
}

function repository(commits: CommitState[], reflog: [string, string][]): RepositoryState {
  return {
    ...EMPTY_REPOSITORY_STATE,
    initialized: true,
    allCommits: commits,
    reflog: reflog.map(([target, message], index) => ({
      selector: `HEAD@{${String(index)}}`,
      oid: oid(target),
      shortOid: oid(target).slice(0, 7),
      message,
      timestamp: 1_700_000_000 + (reflog.length - index) * 60,
    })),
  };
}

describe("describeReflogMessage", () => {
  it.each([
    ["commit (initial): Add README", "commit", "git commit"],
    ["commit: Add login", "commit", "git commit"],
    ["commit (amend): Add login form", "amend", "git commit --amend"],
    ["checkout: moving from main to feature/login", "switch", "git switch feature/login"],
    [`checkout: moving from main to ${oid("a")}`, "detach", "git switch --detach aaaaaaa"],
    ["merge feature: Fast-forward", "merge", "git merge feature"],
    ["merge feature: Merge made by the 'ort' strategy.", "merge", "git merge feature"],
    ["reset: moving to HEAD~2", "reset", "git reset HEAD~2"],
    ["rebase -i (start): checkout main", "rebase", "git rebase -i main"],
    ["rebase (abort): returning to refs/heads/feature", "rebase", "git rebase --abort"],
    ["cherry-pick: Fix typo", "cherry-pick", "git cherry-pick"],
    ["pull: Fast-forward", "pull", "git pull"],
    ["pull origin main: Fast-forward", "pull", "git pull origin main"],
    ["clone: from https://github.com/a/b.git", "clone", "git clone https://github.com/a/b.git"],
  ])("%s", (message, kind, command) => {
    expect(describeReflogMessage(message)).toMatchObject({ kind, command });
  });

  it("names the branch a rebase finished on", () => {
    expect(describeReflogMessage("rebase (finish): returning to refs/heads/feature").title).toBe(
      "Finished rebasing `feature`",
    );
  });

  it("keeps a message it does not know as it is", () => {
    expect(describeReflogMessage("something new")).toMatchObject({
      kind: "other",
      title: "something new",
      command: null,
    });
  });
});

describe("buildTimeline", () => {
  it("links a reset that left commits behind to the step that recovered them", () => {
    const state = repository(
      [commit("c", ["b"]), commit("b", ["a"]), commit("a")],
      [
        ["c", "reset: moving to cccccc"],
        ["a", "reset: moving to HEAD~2"],
        ["c", "commit: Commit c"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    const [recovery, reset, ...rest] = buildTimeline(state, false);

    expect(reset).toMatchObject({
      kind: "reset",
      previousOid: oid("c"),
      leftBehind: { oid: oid("c"), recoveredBy: "HEAD@{0}" },
    });
    expect(recovery).toMatchObject({ recovered: oid("c"), leftBehind: null });
    expect(rest.every((event) => event.leftBehind === null && event.recovered === null)).toBe(true);
    expect(rest.at(-1)?.previousOid).toBeNull();
  });

  it("says a commit replaced by an amend is only in the reflog", () => {
    const state = repository(
      [commit("d", ["a"]), commit("a")],
      [
        ["d", "commit (amend): Commit d"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    const [amend, committed] = buildTimeline(state, false);
    expect(amend?.leftBehind).toEqual({ oid: oid("b"), recoveredBy: null });
    expect(committed?.inGraph).toBe(false);
  });

  it("does not claim commits are lost when the graph is only the newest part of history", () => {
    const state = repository(
      [commit("d", ["a"]), commit("a")],
      [
        ["d", "commit (amend): Commit d"],
        ["b", "commit: Commit b"],
      ],
    );
    expect(buildTimeline(state, true)[0]?.leftBehind).toBeNull();
  });

  it("makes no claim about a step to a commit whose history it does not know", () => {
    // `d` (on top of `c`) was later reset away: moving from `c` to `d` left nothing behind.
    const state = repository(
      [commit("c", ["a"]), commit("a")],
      [
        ["c", "reset: moving to HEAD~1"],
        ["d", "reset: moving to HEAD@{1}"],
        ["c", "reset: moving to HEAD~1"],
        ["d", "commit: Commit d"],
      ],
    );
    const [lastReset, recovery, firstReset] = buildTimeline(state, false);
    expect(firstReset?.leftBehind).toEqual({ oid: oid("d"), recoveredBy: "HEAD@{1}" });
    expect(recovery).toMatchObject({ recovered: oid("d"), leftBehind: null });
    expect(lastReset?.leftBehind).toEqual({ oid: oid("d"), recoveredBy: null });
    expect(lastReset?.recovered).toBeNull();
  });

  it("ignores a reset that only moved forward", () => {
    const state = repository(
      [commit("b", ["a"]), commit("a")],
      [
        ["b", "reset: moving to main"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(buildTimeline(state, false)[0]?.leftBehind).toBeNull();
  });
});

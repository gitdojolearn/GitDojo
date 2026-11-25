import {
  type CommitState,
  EMPTY_REPOSITORY_STATE,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { buildTimeline, type TimelineEvent } from "./timeline";
import {
  GC_NOTE,
  NOTHING_LEFT_NOTE,
  OLDER_STEP_NOTE,
  REBASE_IN_PROGRESS,
  STASH_NOTE,
  undoSuggestion,
} from "./undo";

const oid = (name: string) => name.repeat(40).slice(0, 40);
const sha = (name: string) => oid(name).slice(0, 7);

function commit(name: string, parents: string[] = []): CommitState {
  return {
    oid: oid(name),
    shortOid: sha(name),
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
      shortOid: sha(target),
      message,
      timestamp: 1_700_000_000 + (reflog.length - index) * 60,
    })),
  };
}

/** The timeline and every step's suggestion, by position. */
function suggestions(commits: CommitState[], reflog: [string, string][], truncated = false) {
  const events = buildTimeline(repository(commits, reflog), truncated);
  return {
    events,
    at: (index: number) => undoSuggestion(events[index] as TimelineEvent, events, truncated),
  };
}

const commands = (suggestion: ReturnType<typeof undoSuggestion>) =>
  suggestion?.options.map((option) => option.command) ?? [];

describe("undoSuggestion", () => {
  it("offers a rescue branch first and undoes the newest reset with --keep", () => {
    const { at } = suggestions(
      [commit("a")],
      [
        ["a", "reset: moving to HEAD~1"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    const suggestion = at(0);
    expect(suggestion?.options).toEqual([
      expect.objectContaining({
        command: `git branch rescue/${sha("b")} ${sha("b")}`,
        recommended: true,
      }),
      expect.objectContaining({ command: `git reset --keep ${sha("b")}`, recommended: false }),
    ]);
    expect(suggestion?.options[1]?.explanation).toContain("`HEAD@{1}`");
    expect(suggestion?.recoveredBy).toBeNull();
    expect(suggestion?.notes).toContain(GC_NOTE);
  });

  it("undoes the newest amend with --soft", () => {
    const { at } = suggestions(
      [commit("d", ["a"]), commit("a")],
      [
        ["d", "commit (amend): Commit d"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(commands(at(0))).toEqual([
      `git branch rescue/${sha("b")} ${sha("b")}`,
      `git reset --soft ${sha("b")}`,
    ]);
    expect(at(0)?.options[1]?.explanation).toContain("stays staged");
  });

  it("undoes the newest rebase to where the branch was before it started", () => {
    // `b` on `a` was rebased onto `c`, becoming `e`.
    const { at } = suggestions(
      [commit("e", ["c"]), commit("c", ["a"]), commit("a")],
      [
        ["e", "rebase (finish): returning to refs/heads/feature"],
        ["e", "rebase (pick): Commit b"],
        ["c", "rebase (start): checkout main"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    const finish = at(0);
    expect(commands(finish)).toEqual([
      `git branch rescue/${sha("b")} ${sha("b")}`,
      `git reset --keep ${sha("b")}`,
    ]);
    expect(finish?.options[1]?.explanation).toContain("You have to be on `feature`");
    expect(finish?.options[1]?.explanation).toContain("`HEAD@{3}`");
    expect(finish?.warning).toBeNull();

    // The start is older: a rescue branch only, and no "in progress" warning since it finished.
    const start = at(2);
    expect(commands(start)).toEqual([`git branch rescue/${sha("b")} ${sha("b")}`]);
    expect(start?.warning).toBeNull();
  });

  it("marks a finished rebase as already recovered when its pre-rebase commit was brought back", () => {
    const { at } = suggestions(
      [commit("b", ["a"]), commit("e", ["c"]), commit("c", ["a"]), commit("a")],
      [
        ["b", `reset: moving to ${sha("b")}`],
        ["e", "rebase (finish): returning to refs/heads/feature"],
        ["e", "rebase (pick): Commit b"],
        ["c", "rebase (start): checkout main"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(at(1)).toEqual({ recoveredBy: "HEAD@{0}", options: [], warning: null, notes: [] });
  });

  it("creates and switches to a branch for commits left on a detached HEAD", () => {
    const { at } = suggestions(
      [commit("a")],
      [
        ["a", `checkout: moving from ${oid("b")} to main`],
        ["b", "commit: Commit b"],
        ["a", `checkout: moving from main to ${oid("a")}`],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(commands(at(0))).toEqual([
      `git branch rescue/${sha("b")} ${sha("b")}`,
      `git switch -c rescue/${sha("b")} ${sha("b")}`,
    ]);
  });

  it("offers no command for a reset to HEAD and mentions git stash", () => {
    const { at } = suggestions(
      [commit("a")],
      [
        ["a", "reset: moving to HEAD"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(at(0)).toEqual({ recoveredBy: null, options: [], warning: null, notes: [STASH_NOTE] });
  });

  it("offers undo commands only for the newest step and explains why", () => {
    const { at } = suggestions(
      [commit("c", ["a"]), commit("a")],
      [
        ["c", "commit: Commit c"],
        ["a", "reset: moving to HEAD~1"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    const older = at(1);
    expect(commands(older)).toEqual([`git branch rescue/${sha("b")} ${sha("b")}`]);
    expect(older?.notes).toContain(OLDER_STEP_NOTE);
  });

  it("never puts HEAD@{n} or --hard in a command", () => {
    const cases: [CommitState[], [string, string][]][] = [
      [
        [commit("a")],
        [
          ["a", "reset: moving to HEAD@{1}"],
          ["b", "commit: Commit b"],
          ["a", "commit (initial): Commit a"],
        ],
      ],
      [
        [commit("d", ["a"]), commit("a")],
        [
          ["d", "commit (amend): Commit d"],
          ["b", "commit: Commit b"],
          ["a", "commit (initial): Commit a"],
        ],
      ],
    ];
    for (const [commits, reflog] of cases) {
      const { events, at } = suggestions(commits, reflog);
      for (const index of events.keys()) {
        for (const command of commands(at(index))) {
          expect(command).not.toMatch(/HEAD@\{|--hard/);
        }
      }
    }
  });

  it("names the step that already recovered a commit and offers no command", () => {
    const { at } = suggestions(
      [commit("c", ["b"]), commit("b", ["a"]), commit("a")],
      [
        ["c", "reset: moving to cccccc"],
        ["a", "reset: moving to HEAD~2"],
        ["c", "commit: Commit c"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(at(1)).toEqual({ recoveredBy: "HEAD@{0}", options: [], warning: null, notes: [] });
  });

  it("suggests nothing when the history is truncated and the target is not in the graph", () => {
    const { at } = suggestions(
      [commit("d", ["a"]), commit("a")],
      [
        ["d", "commit (amend): Commit d"],
        ["b", "commit: Commit b"],
      ],
      true,
    );
    expect(at(0)).toBeNull();
  });

  it("still undoes the newest reset in a truncated history when the target is in the graph", () => {
    const { at } = suggestions(
      [commit("b", ["a"]), commit("a")],
      [
        ["a", "reset: moving to HEAD~1"],
        ["b", "commit: Commit b"],
      ],
      true,
    );
    expect(commands(at(0))).toEqual([`git reset --keep ${sha("b")}`]);
  });

  it("warns that a rebase with no finish or abort may still be in progress", () => {
    const { at } = suggestions(
      [commit("b", ["a"]), commit("c", ["a"]), commit("a")],
      [
        ["c", "rebase (start): checkout main"],
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(at(0)?.warning).toBe(REBASE_IN_PROGRESS);
  });

  it("says nothing was lost when a step left nothing behind", () => {
    const { at } = suggestions(
      [commit("b", ["a"]), commit("a")],
      [
        ["b", "checkout: moving from aaaaaaa to main"],
        ["a", `checkout: moving from main to ${oid("a")}`],
        ["b", "commit: Commit b"],
      ],
    );
    expect(at(0)).toEqual({
      recoveredBy: null,
      options: [],
      warning: null,
      notes: [NOTHING_LEFT_NOTE],
    });
  });

  it("has nothing to say about steps that cannot leave commits behind", () => {
    const { at } = suggestions(
      [commit("b", ["a"]), commit("a")],
      [
        ["b", "commit: Commit b"],
        ["a", "commit (initial): Commit a"],
      ],
    );
    expect(at(0)).toBeNull();
    expect(at(1)).toBeNull();
  });
});

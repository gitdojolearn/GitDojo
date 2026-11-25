import {
  type CommitState,
  EMPTY_REPOSITORY_STATE,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { explainCommit } from "./explain-commit";

const oid = (name: string) => name.repeat(40).slice(0, 40);

function commit(name: string, parents: string[], extra: Partial<CommitState> = {}): CommitState {
  return {
    oid: oid(name),
    shortOid: oid(name).slice(0, 7),
    message: `Commit ${name}`,
    authorName: "Ada",
    authorEmail: "ada@example.com",
    timestamp: 1_700_000_000 + name.charCodeAt(0),
    parents: parents.map(oid),
    changedPaths: ["README.md"],
    ...extra,
  };
}

const merge = commit("m", ["b", "f"], { message: "Merge branch 'feature/login' into main" });
const base = commit("b", ["a"]);
const feature = commit("f", ["a"]);
const root = commit("a", []);

const state: RepositoryState = {
  ...EMPTY_REPOSITORY_STATE,
  initialized: true,
  currentBranch: "main",
  head: merge.oid,
  allCommits: [merge, base, feature, root],
  branches: [
    { name: "feature/login", oid: feature.oid, current: false },
    { name: "main", oid: merge.oid, current: true },
  ],
  tags: [{ name: "v1.0.0", oid: merge.oid, annotated: true }],
  reflog: [
    {
      selector: "HEAD@{0}",
      oid: merge.oid,
      shortOid: merge.shortOid,
      message: "merge feature/login: Merge made by the 'ort' strategy.",
      timestamp: 1,
    },
  ],
};

describe("explainCommit", () => {
  it("explains a merge: what it joined, its parents, how it was made and where it lives", () => {
    const { headline, notes } = explainCommit(merge, state, false);
    expect(headline).toBe("This merge joined `feature/login` into `main`.");
    expect(notes).toEqual([
      "Its first parent `bbbbbbb` is the branch it was made on; `fffffff` came in from the other side.",
      "The reflog first records it at `HEAD@{0}`: Merged `feature/login` (`git merge feature/login`).",
      "`HEAD` is here: your files are checked out from this commit.",
      "Tagged `v1.0.0`.",
      "Part of `main`.",
    ]);
  });

  it("names every branch that contains a commit", () => {
    expect(explainCommit(root, state, false)).toMatchObject({
      headline: "The first commit: this repository's history starts here.",
      notes: ["Part of `feature/login` and `main`."],
    });
  });

  it("recognises a revert and a pull request merge", () => {
    const revert = commit("r", ["m"], {
      message: `Revert "Add login"\n\nThis reverts commit ${oid("f")}.`,
    });
    expect(explainCommit(revert, state, false).headline).toBe("This commit undoes `fffffff`.");
    const pr = commit("p", ["m", "f"], { message: "Merge pull request #97 from org/feat/x" });
    expect(explainCommit(pr, state, false).headline).toBe(
      "This merge joined pull request #97 (`org/feat/x`).",
    );
  });

  it("spots a rebased or cherry-picked copy by its author, date and message", () => {
    const copy = commit("c", ["b"], {
      message: feature.message,
      timestamp: feature.timestamp,
    });
    const withCopy = { ...state, allCommits: [copy, ...state.allCommits] };
    expect(explainCommit(copy, withCopy, false).notes[0]).toMatch(
      /^`fffffff` has the same author, date and message: one is a copy of the other/,
    );
  });

  it("says what still leads to a commit that is on no branch", () => {
    const tagged = { ...state, branches: [] };
    expect(explainCommit(root, tagged, false).notes).toContain(
      "On no branch: only tag `v1.0.0` leads to it.",
    );
    const detached = { ...state, branches: [], tags: [] };
    expect(explainCommit(root, detached, false).notes).toContain(
      "On no branch: only `HEAD` leads to it, so switching away would leave it behind.",
    );
  });

  it("says when a parent is older than the history read", () => {
    const orphan = commit("o", ["z"]);
    const notes = explainCommit(orphan, { ...state, allCommits: [orphan] }, true).notes;
    expect(notes).toContain("Its parent `zzzzzzz` is older than the history the explorer read.");
  });
});

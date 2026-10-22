import { EMPTY_REPOSITORY_STATE } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import {
  commonCompletionPrefix,
  completionCandidates,
  completionContextFromRepository,
  completionRange,
  formatCompletionList,
  replaceCompletion,
} from "./completion";

const context = {
  branches: ["main", "feature/login"],
  commits: ["abc1234"],
  files: ["README.md", "src/app.ts", "src/lib/git.ts"],
  remotes: ["origin"],
  stashes: ["stash@{0}"],
  tags: ["v1.0.0"],
};

describe("terminal completion", () => {
  it("completes Git command names and supported flags from the command catalog", () => {
    expect(completionCandidates("git stat", 8, context)?.candidates).toEqual(["status"]);
    expect(completionCandidates("git commit --a", 14, context)?.candidates).toContain("--amend");
  });

  it("suggests live refs, paths, directories, remotes and stashes", () => {
    expect(completionCandidates("git switch fea", 14, context)?.candidates).toEqual([
      "feature/login",
    ]);
    expect(completionCandidates("git add sr", 10, context)?.candidates).toEqual([
      "src/",
      "src/app.ts",
      "src/lib/",
      "src/lib/git.ts",
    ]);
    expect(completionCandidates("git fetch or", 12, context)?.candidates).toEqual(["origin"]);
    expect(completionCandidates("git stash apply stash", 21, context)?.candidates).toEqual([
      "stash@{0}",
    ]);
    expect(completionCandidates("git restore --source abc", 23, context)?.candidates).toEqual([
      "abc1234",
    ]);
    expect(completionCandidates("git branch -d fea", 17, context)?.candidates).toEqual([
      "feature/login",
    ]);
  });

  it("does not complete text inside a quoted message", () => {
    expect(completionRange('git commit -m "am', 16)).toBeNull();
    expect(completionCandidates('git commit -m "am', 16, context)).toBeNull();
  });

  it("maps repository refs and files into completion context", () => {
    const repository = {
      ...EMPTY_REPOSITORY_STATE,
      branches: [{ name: "main", oid: null, current: true }],
      files: [{ path: "README.md", status: "committed" as const }],
      allCommits: [
        {
          oid: "abcdef123456",
          shortOid: "abcdef1",
          message: "Initial",
          authorName: "Learner",
          authorEmail: "learner@example.test",
          timestamp: 0,
          parents: [],
          changedPaths: ["README.md"],
        },
      ],
    };
    expect(completionContextFromRepository(repository)).toMatchObject({
      branches: ["main"],
      commits: ["abcdef1"],
      files: ["README.md"],
    });
  });

  it("uses the shared prefix first and prints candidate names in terminal-width columns", () => {
    expect(commonCompletionPrefix(["feature/api", "feature/auth"])).toBe("feature/a");
    expect(formatCompletionList(["a", "b", "c"], 8)).toEqual(["a  b", "c"]);
  });

  it("replaces the full token and adds a separator after a completed value", () => {
    expect(
      replaceCompletion(
        { buffer: "git sta", cursor: 7 },
        { start: 4, end: 7, prefix: "sta" },
        "status",
      ),
    ).toEqual({ buffer: "git status ", cursor: 11 });
  });
});

import { GIT_COMMAND_SPECS } from "@gitdojo/command-parser";
import { describe, expect, it, vi } from "vitest";
import { COMMAND_INFO } from "./services/catalog";
import { formatFlag, isAbout, loadCommandReference } from "./services/reference";

vi.mock("server-only", () => ({}));

describe("command reference", () => {
  it("has an entry for every command the terminal runs, and none for others", () => {
    expect(Object.keys(COMMAND_INFO).sort()).toEqual(Object.keys(GIT_COMMAND_SPECS).sort());
  });

  it("writes options as they are typed", () => {
    expect(formatFlag({ name: "m", aliases: ["message"], takesValue: true })).toBe(
      "-m, --message <value>",
    );
    expect(formatFlag({ name: "amend", takesValue: false })).toBe("--amend");
  });

  it("matches examples to their command only", () => {
    expect(isAbout("git stash pop", "stash")).toBe(true);
    expect(isAbout("git status", "stash")).toBe(false);
    expect(isAbout("git cherry-pick abc123", "cherry-pick")).toBe(true);
  });

  it("finds the lessons and authored examples for each command", async () => {
    const reference = await loadCommandReference();
    expect(reference).toHaveLength(Object.keys(GIT_COMMAND_SPECS).length);
    const clone = reference.find((command) => command.name === "clone");
    expect(clone?.lessons.map((lesson) => lesson.href)).toContain(
      "/learn/remotes/clone-a-repository",
    );
    expect(clone?.examples[0]?.command).toBe("git clone gitdojo://simulated/origin.git .");
  });
});

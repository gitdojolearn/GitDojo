import { describe, expect, it } from "vitest";
import { parsePullRequestReleaseNote } from "./pr-release-note.mjs";

describe("pull request release notes", () => {
  it("extracts a valid learner note without reading later PR sections", () => {
    expect(
      parsePullRequestReleaseNote(`## Summary
Technical detail.

## Learner-facing release note
<!-- Example: - Do something. -->
- Completed practice tasks can now count toward certification.

## Validation
- Unit tests pass.`),
    ).toEqual(["Completed practice tasks can now count toward certification."]);
  });

  it("accepts the explicit internal-only marker", () => {
    expect(
      parsePullRequestReleaseNote("## Learner-facing release note\n\nNo learner-facing change."),
    ).toEqual([]);
  });

  it("rejects a missing or placeholder-only section", () => {
    expect(() => parsePullRequestReleaseNote("## Summary\nSome changes.")).toThrow(
      /Add a "## Learner-facing release note" section/,
    );
    expect(() =>
      parsePullRequestReleaseNote("## Learner-facing release note\n<!-- Add a bullet. -->"),
    ).toThrow(/no highlights yet/);
  });

  it("rejects notes the release draft could not publish", () => {
    expect(() => parsePullRequestReleaseNote("## Learner-facing release note\n- Fix #71")).toThrow(
      /pull request or issue number/,
    );
    expect(() =>
      parsePullRequestReleaseNote("## Learner-facing release note\nA sentence."),
    ).toThrow(/Use only plain-language bullets/);
  });
});

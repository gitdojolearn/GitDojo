import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RefLabels } from "./RefLabels";

describe("RefLabels", () => {
  it("shows tags and remote-tracking branches next to branches, with spoken labels", () => {
    render(
      <RefLabels
        branches={["main"]}
        tags={["v1.0"]}
        remoteBranches={["origin/main"]}
        isHead
        currentBranch="main"
        withTooltip={false}
      />,
    );
    expect(screen.getByTestId("tag-label")).toHaveTextContent("tag v1.0");
    expect(screen.getByTestId("remote-branch-label")).toHaveTextContent(
      "remote-tracking branch origin/main",
    );
    expect(screen.getByTestId("branch-label")).toHaveAttribute("data-branch", "main");
  });

  it("renders a commit that only a tag names", () => {
    render(<RefLabels branches={[]} tags={["v0.9"]} isHead={false} currentBranch="main" />);
    expect(screen.getByTestId("tag-label")).toHaveAttribute("data-tag", "v0.9");
  });

  it("glides labels in from their old commit and pops in new ones", () => {
    render(
      <RefLabels
        branches={["main", "feature"]}
        tags={["v1.0"]}
        isHead
        currentBranch="main"
        withTooltip={false}
        motion={{ head: 76, "branch:feature": "new" }}
      />,
    );
    const head = screen.getByTestId("head-label").parentElement;
    // HEAD and its branch move as one label.
    expect(head).toHaveClass("animate-gd-glide");
    expect(head).toHaveStyle({ "--gd-from-y": "76px" });
    const feature = screen
      .getAllByTestId("branch-label")
      .find((label) => label.getAttribute("data-branch") === "feature");
    expect(feature).toHaveClass("animate-gd-pop");
    expect(screen.getByTestId("tag-label")).not.toHaveClass("animate-gd-glide");
  });
});

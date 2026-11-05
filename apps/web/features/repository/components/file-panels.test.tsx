import { EMPTY_REPOSITORY_STATE } from "@gitdojo/shared-types";
import { act, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useRepositoryStore } from "../state/use-repository-store";
import { StagingAreaPanel } from "./StagingAreaPanel";
import { WorkingTreePanel } from "./WorkingTreePanel";

describe("working tree and staging panels", () => {
  beforeEach(() => {
    useRepositoryStore.getState().setWorkspace("test");
  });

  it("moves README.md from the working tree to the staging area", () => {
    render(
      <>
        <WorkingTreePanel />
        <StagingAreaPanel />
      </>,
    );
    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        files: [{ path: "README.md", status: "untracked" }],
      });
    });
    const workingTree = screen.getByTestId("working-tree-panel");
    expect(within(workingTree).getByText("README.md")).toBeInTheDocument();
    expect(within(workingTree).getByText("Untracked")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("staging-area-panel")).getByText("No staged changes"),
    ).toBeInTheDocument();

    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        files: [{ path: "README.md", status: "staged" }],
        stagedFiles: [{ path: "README.md", status: "staged", change: "added" }],
      });
    });
    expect(within(workingTree).getByText("No unstaged changes")).toBeInTheDocument();
    const staging = screen.getByTestId("staging-area-panel");
    expect(within(staging).getByText("README.md")).toBeInTheDocument();
    expect(within(staging).getByText("Staged · New file")).toBeInTheDocument();
    // It visibly leaves the working tree to the right and arrives from the left.
    const leaving = within(workingTree).getByTestId("leaving-file-row");
    expect(leaving).toHaveAttribute("data-reason", "staged");
    expect(leaving).toHaveClass("animate-gd-leave-right");
    expect(leaving).toHaveAttribute("aria-hidden", "true");
    expect(within(staging).getByTestId("file-row")).toHaveClass("animate-gd-move-in");
  });

  it("moves a file back from staging, from the right, when it is unstaged", () => {
    render(
      <>
        <WorkingTreePanel />
        <StagingAreaPanel />
      </>,
    );
    const staged = {
      ...EMPTY_REPOSITORY_STATE,
      initialized: true,
      files: [{ path: "notes.md", status: "staged" as const }],
      stagedFiles: [{ path: "notes.md", status: "staged" as const, change: "modified" as const }],
    };
    act(() => {
      useRepositoryStore.getState().setRepositoryState(staged);
    });
    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...staged,
        files: [{ path: "notes.md", status: "modified" }],
        stagedFiles: [],
      });
    });
    const workingTree = screen.getByTestId("working-tree-panel");
    expect(within(workingTree).getByTestId("file-row")).toHaveClass("animate-gd-move-in-reverse");
    const staging = screen.getByTestId("staging-area-panel");
    expect(within(staging).getByTestId("leaving-file-row")).toHaveClass("animate-gd-leave-left");
    // The leaving copy never reads as a second file.
    expect(screen.getAllByText("notes.md")).toHaveLength(1);
  });

  it("does not animate the first state of a workspace", () => {
    render(<WorkingTreePanel />);
    act(() => {
      useRepositoryStore.getState().setRepositoryState({
        ...EMPTY_REPOSITORY_STATE,
        initialized: true,
        files: [{ path: "README.md", status: "untracked" }],
      });
    });
    expect(useRepositoryStore.getState().transition).toBeNull();
    expect(screen.queryByTestId("leaving-file-row")).toBeNull();
  });
});

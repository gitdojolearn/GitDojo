import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeroDemo } from "./hero-demo";

let reducedMotion = false;
let reveal: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  reducedMotion = false;
  reveal = undefined;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("reduce") && reducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {
        reveal = () => {
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        };
      }
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const area = (name: string) => within(screen.getByRole("group", { name }));

/** Runs every pending playback timer, one tick at a time. */
function playThrough() {
  for (let tick = 0; tick < 200; tick += 1) {
    act(() => {
      vi.runOnlyPendingTimers();
    });
  }
}

describe("HeroDemo", () => {
  it("starts in a folder that isn't a repository yet, with a way into the playground", () => {
    render(<HeroDemo />);
    expect(area("Working tree").getByText("README.md")).toBeInTheDocument();
    expect(area("Repository").getByText("No .git yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Try it in the playground/ })).toHaveAttribute(
      "href",
      "/playground",
    );
  });

  it("plays the first commit once it scrolls into view, then offers a replay", () => {
    render(<HeroDemo />);
    act(() => reveal?.());
    expect(screen.getByRole("button", { name: /Pause/ })).toBeInTheDocument();
    playThrough();
    expect(area("Repository").getByText("1f9d220")).toBeInTheDocument();
    expect(area("Repository").getByText("HEAD")).toBeInTheDocument();
    expect(area("Staging area").getByText("Nothing staged")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Terminal" })).toHaveTextContent(
      "[main (root-commit) 1f9d220] Initial commit",
    );
    expect(screen.getByRole("button", { name: /Replay/ })).toBeInTheDocument();
  });

  it("never plays by itself with reduced motion", () => {
    reducedMotion = true;
    render(<HeroDemo />);
    act(() => reveal?.());
    playThrough();
    expect(area("Repository").getByText("No .git yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Play/ })).toBeInTheDocument();
  });

  it("jumps to any step, stops playback and announces what the command did", () => {
    render(<HeroDemo />);
    act(() => reveal?.());
    fireEvent.click(screen.getByRole("button", { name: "Step 3: git add" }));
    expect(screen.getByRole("button", { name: "Step 3: git add" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(area("Staging area").getByText("Staged")).toBeInTheDocument();
    expect(area("Working tree").getByText("No changes")).toBeInTheDocument();
    expect(document.querySelector("[aria-live='polite']")).toHaveTextContent(
      /copies README.md into the staging area/,
    );
    // Paused: nothing advances on its own.
    playThrough();
    expect(area("Repository").getByText("No commits yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resume/ })).toBeInTheDocument();
  });

  it("pauses and resumes", () => {
    render(<HeroDemo />);
    act(() => reveal?.());
    fireEvent.click(screen.getByRole("button", { name: /Pause/ }));
    playThrough();
    expect(area("Repository").getByText("No .git yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resume|Play/ }));
    playThrough();
    expect(area("Repository").getByText("HEAD")).toBeInTheDocument();
  });
});

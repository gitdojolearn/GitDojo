import { describe, expect, it } from "vitest";
import { assignLanes, laneEdgePath, tipsInLaneOrder } from "./lanes";

// Children first: D and C both branch off B.
const commits = [
  { id: "D", parents: ["B"] },
  { id: "C", parents: ["B"] },
  { id: "B", parents: ["A"] },
  { id: "A", parents: [] },
];

describe("assignLanes", () => {
  it("keeps the first tip's history in lane 0 and gives diverging work its own lane", () => {
    const { lanes, laneCount } = assignLanes(commits, ["D", "C"]);
    expect(Object.fromEntries(lanes)).toEqual({ D: 0, B: 0, A: 0, C: 1 });
    expect(laneCount).toBe(2);
  });

  it("needs no extra lane for a branch pointing at an already placed commit", () => {
    const linear = commits.slice(2);
    const { lanes, laneCount } = assignLanes(linear, ["B", "B", "A"]);
    expect(Object.fromEntries(lanes)).toEqual({ B: 0, A: 0 });
    expect(laneCount).toBe(1);
  });

  it("places commits no tip reaches", () => {
    expect(assignLanes(commits, []).lanes.size).toBe(4);
  });

  describe("compact", () => {
    // Three pull requests merged one after another; their branches are gone.
    const merged = [
      { id: "M3", parents: ["M2", "F3"] },
      { id: "F3", parents: ["M2"] },
      { id: "M2", parents: ["M1", "F2"] },
      { id: "F2", parents: ["M1"] },
      { id: "M1", parents: ["A", "F1"] },
      { id: "F1", parents: ["A"] },
      { id: "A", parents: [] },
    ];

    it("reuses a lane once its line of work has joined another", () => {
      const { lanes, laneCount } = assignLanes(merged, ["M3"], { compact: true });
      expect(Object.fromEntries(lanes)).toEqual({
        M3: 0,
        M2: 0,
        M1: 0,
        A: 0,
        F3: 1,
        // F2's merge into M2 meets F3's line at M2: it cannot share that lane.
        F2: 2,
        F1: 1,
      });
      expect(laneCount).toBe(3);
      expect(assignLanes(merged, ["M3"]).laneCount).toBe(4);
    });

    it("lays out like the default when no lane comes free", () => {
      expect(assignLanes(commits, ["D", "C"], { compact: true })).toEqual(
        assignLanes(commits, ["D", "C"]),
      );
    });
  });
});

describe("tipsInLaneOrder", () => {
  it("puts main first and the rest by name, regardless of HEAD", () => {
    const tips = tipsInLaneOrder(
      [
        { name: "zeta", target: "Z" },
        { name: "main", target: "M" },
        { name: "alpha", target: "A" },
        { name: "unborn", target: null },
      ],
      "H",
    );
    expect(tips).toEqual(["M", "A", "Z", "H"]);
  });
});

describe("laneEdgePath", () => {
  it("draws a straight line within a lane", () => {
    expect(laneEdgePath({ x: 10, y: 0 }, { x: 10, y: 80 }, 40)).toBe("M 10 0 L 10 80");
  });

  it("bends into the parent's lane one row above the parent", () => {
    expect(laneEdgePath({ x: 30, y: 0 }, { x: 10, y: 120 }, 40)).toBe(
      "M 30 0 L 30 80 C 30 100 10 100 10 120",
    );
  });

  it("bends a merge edge right below the merge commit", () => {
    expect(laneEdgePath({ x: 10, y: 0 }, { x: 30, y: 120 }, 40, "child")).toBe(
      "M 10 0 C 10 20 30 20 30 40 L 30 120",
    );
  });
});

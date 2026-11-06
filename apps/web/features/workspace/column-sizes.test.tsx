import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResizeHandle } from "./components/ResizeHandle";
import { gridTemplate, MIN_COLUMN, moveSplitter, parseSizes } from "./services/column-sizes";

describe("workspace columns", () => {
  it("moves one splitter between its two neighbours and never hides a panel", () => {
    expect(moveSplitter([26, 44, 30], 0, 4)).toEqual([30, 40, 30]);
    expect(moveSplitter([26, 44, 30], 1, -100)).toEqual([26, MIN_COLUMN, 74 - MIN_COLUMN]);
    expect(moveSplitter([26, 44, 30], 0, -100)[0]).toBe(MIN_COLUMN);
  });

  it("only trusts saved sizes that add up and keep every panel visible", () => {
    expect(parseSizes("[30,40,30]")).toEqual([30, 40, 30]);
    expect(parseSizes("[5,65,30]")).toBeNull();
    expect(parseSizes("[30,30,30]")).toBeNull();
    expect(parseSizes("nope")).toBeNull();
    expect(gridTemplate([30, 40, 30])).toBe(
      "minmax(0,30fr) 0.75rem minmax(0,40fr) 0.75rem minmax(0,30fr)",
    );
  });

  it("is a focusable separator that the arrow keys move and Enter resets", () => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    render(
      <ResizeHandle
        index={0}
        sizes={[26, 44, 30]}
        onChange={onChange}
        onReset={onReset}
        label="Resize the lesson and terminal panels"
      />,
    );
    const handle = screen.getByRole("separator", { name: "Resize the lesson and terminal panels" });
    expect(handle).toHaveAttribute("aria-valuenow", "26");
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith([28, 42, 30]);
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith([MIN_COLUMN, 52, 30]);
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(onReset).toHaveBeenCalled();
  });
});

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "./use-count-up";

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced, media: query }));
  window.matchMedia = globalThis.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useCountUp", () => {
  it("shows the value straight away with reduced motion", () => {
    stubMotion(true);
    const { result } = renderHook(() => useCountUp(450));
    expect(result.current).toBe(450);
  });

  it("counts up from 0 and lands exactly on the value", () => {
    stubMotion(false);
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    const { result, rerender } = renderHook(({ value }) => useCountUp(value), {
      initialProps: { value: 450 },
    });
    expect(result.current).toBe(0);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(450);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(450);
    // A new value counts on from the last one shown.
    rerender({ value: 500 });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(result.current).toBe(500);
  });
});

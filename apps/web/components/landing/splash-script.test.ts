import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPLASH_ATTRIBUTE, SPLASH_SCRIPT } from "./splash-script";

let reducedMotion = false;

function run(url: string) {
  window.history.replaceState(null, "", url);
  // Runs the exact string the layout inlines into <head>, as the browser would.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function(SPLASH_SCRIPT)();
  return document.documentElement.getAttribute(SPLASH_ATTRIBUTE);
}

beforeEach(() => {
  reducedMotion = false;
  document.documentElement.removeAttribute(SPLASH_ATTRIBUTE);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reducedMotion })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SPLASH_SCRIPT", () => {
  it("plays the intro on every landing-page visit", () => {
    expect(run("/")).toBe("play");
    document.documentElement.removeAttribute(SPLASH_ATTRIBUTE);
    expect(run("/")).toBe("play");
  });

  it("shows the static version with reduced motion", () => {
    reducedMotion = true;
    expect(run("/")).toBe("static");
  });

  it("never shows on a deep link", () => {
    expect(run("/learn")).toBeNull();
    expect(run("/#courses")).toBeNull();
  });

  it("plays even when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run("/")).toBe("play");
    vi.restoreAllMocks();
  });
});

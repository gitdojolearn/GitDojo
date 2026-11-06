import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { clearToasts, Toaster } from "@gitdojo/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./components/SettingsPage";
import {
  DEFAULT_SETTINGS,
  motionScale,
  parseSettings,
  readSettings,
  resetSettings,
  SETTINGS_STORAGE_KEY,
  updateSettings,
} from "./services/settings";
import { SETTINGS_SCRIPT } from "./services/settings-script";

vi.mock("@/features/auth", () => ({
  loadAccountSession: () => Promise.resolve(),
  useAccountSession: (select: (state: { session: unknown }) => unknown) =>
    select({ session: { status: "unconfigured" } }),
}));

const root = document.documentElement;
// eslint-disable-next-line @typescript-eslint/no-implied-eval -- running the shipped script verbatim
const runSettingsScript = new Function(SETTINGS_SCRIPT) as () => void;

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  window.matchMedia = globalThis.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.motion;
  resetSettings();
  clearToasts();
  stubReducedMotion(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("settings", () => {
  it("keeps every default until something is saved, and each invalid field falls back alone", () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(
      parseSettings(
        JSON.stringify({ motion: "slow", terminalFontSize: 99, terminalCursorStyle: "bar" }),
      ),
    ).toEqual({ ...DEFAULT_SETTINGS, motion: "slow", terminalCursorStyle: "bar" });
  });

  it("saves a change, shows the animation speed on <html> and returns a stable snapshot", () => {
    updateSettings({ motion: "slow", terminalFontSize: 16 });
    expect(root.dataset.motion).toBe("slow");
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? "{}")).toMatchObject({
      motion: "slow",
      terminalFontSize: 16,
    });
    expect(readSettings()).toBe(readSettings());
    updateSettings({ motion: "normal" });
    expect(root.dataset.motion).toBeUndefined();
  });

  it("applies a saved speed before the app runs, and ignores anything else", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ motion: "off" }));
    runSettingsScript();
    expect(root.dataset.motion).toBe("off");

    delete root.dataset.motion;
    localStorage.setItem(SETTINGS_STORAGE_KEY, "{broken");
    expect(runSettingsScript).not.toThrow();
    expect(root.dataset.motion).toBeUndefined();
  });

  it("still applies in this tab when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    updateSettings({ editorWordWrap: true });
    expect(readSettings().editorWordWrap).toBe(true);
  });

  it("scales movement by the chosen speed, and stops it for reduced motion", () => {
    expect(motionScale()).toBe(1);
    updateSettings({ motion: "slow" });
    expect(motionScale()).toBe(2);
    updateSettings({ motion: "off" });
    expect(motionScale()).toBe(0);
    updateSettings({ motion: "normal" });
    stubReducedMotion(true);
    expect(motionScale()).toBe(0);
  });

  it("changes settings from the page with labelled radio groups and switches", async () => {
    const user = userEvent.setup();
    render(
      <>
        <SettingsPage />
        <Toaster />
      </>,
    );
    const speed = screen.getByRole("radiogroup", { name: "Animation speed" });
    await user.click(screen.getByRole("radio", { name: "Slow" }));
    expect(speed).toContainElement(screen.getByRole("radio", { name: "Slow", checked: true }));
    expect(readSettings().motion).toBe("slow");

    await user.click(screen.getByRole("radio", { name: "Bar" }));
    expect(readSettings().terminalCursorStyle).toBe("bar");

    const wrap = screen.getByRole("switch", { name: "Wrap long lines" });
    expect(wrap).toHaveAttribute("aria-checked", "false");
    await user.click(wrap);
    expect(wrap).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByTestId("reset-settings"));
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await screen.findByTestId("toast")).toHaveTextContent("Settings restored");
  });

  it("follows a change made in another tab", () => {
    render(<SettingsPage />);
    act(() => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ motion: "off" }));
      window.dispatchEvent(new StorageEvent("storage", { key: SETTINGS_STORAGE_KEY }));
    });
    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
    expect(root.dataset.motion).toBe("off");
  });
});

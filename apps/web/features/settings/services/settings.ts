/**
 * Learner preferences other than the theme: animation speed, terminal and editor. Kept in this
 * browser (localStorage), like the theme, and followed by every open tab. Animation speed is also
 * applied to <html> before the first paint by {@link SETTINGS_SCRIPT}.
 */

/** `slow` doubles the movement that shows what Git did; `off` removes animation entirely. */
export type MotionSetting = "normal" | "slow" | "off";
export type CursorStyle = "block" | "bar" | "underline";

export interface Settings {
  motion: MotionSetting;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalCursorStyle: CursorStyle;
  terminalCursorBlink: boolean;
  editorFontSize: number;
  editorWordWrap: boolean;
}

export const SETTINGS_STORAGE_KEY = "gitdojo:settings";

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  motion: "normal",
  terminalFontSize: 13,
  terminalLineHeight: 1.35,
  terminalCursorStyle: "block",
  terminalCursorBlink: true,
  editorFontSize: 13,
  editorWordWrap: false,
});

export const MOTION_SETTINGS: readonly MotionSetting[] = ["normal", "slow", "off"];
export const CURSOR_STYLES: readonly CursorStyle[] = ["block", "bar", "underline"];
export const FONT_SIZE_RANGE = { min: 11, max: 20 } as const;
export const LINE_HEIGHTS: readonly number[] = [1.2, 1.35, 1.5, 1.7];

/** How long movement takes compared with normal speed; 0 when it is off. */
export const MOTION_SCALE: Readonly<Record<MotionSetting, number>> = {
  normal: 1,
  slow: 2,
  off: 0,
};

function oneOf<T>(values: readonly T[], value: unknown, fallback: T): T {
  return values.includes(value as T) ? (value as T) : fallback;
}

function fontSize(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= FONT_SIZE_RANGE.min &&
    value <= FONT_SIZE_RANGE.max
    ? value
    : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Saved settings, field by field: anything missing or invalid keeps its default. */
export function parseSettings(raw: string | null | undefined): Settings {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      saved = parsed as Record<string, unknown>;
    }
  } catch {
    // Corrupt: everything stays at its default.
  }
  const d = DEFAULT_SETTINGS;
  return {
    motion: oneOf(MOTION_SETTINGS, saved.motion, d.motion),
    terminalFontSize: fontSize(saved.terminalFontSize, d.terminalFontSize),
    terminalLineHeight: oneOf(LINE_HEIGHTS, saved.terminalLineHeight, d.terminalLineHeight),
    terminalCursorStyle: oneOf(CURSOR_STYLES, saved.terminalCursorStyle, d.terminalCursorStyle),
    terminalCursorBlink: flag(saved.terminalCursorBlink, d.terminalCursorBlink),
    editorFontSize: fontSize(saved.editorFontSize, d.editorFontSize),
    editorWordWrap: flag(saved.editorWordWrap, d.editorWordWrap),
  };
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(SETTINGS_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

// One object per saved value, so useSyncExternalStore sees a stable snapshot.
let cache: { raw: string | null; settings: Settings } | null = null;
/** This tab's settings when storage is blocked. */
let unsaved: Settings | null = null;

export function readSettings(): Settings {
  if (unsaved) return unsaved;
  const raw = readRaw();
  if (cache?.raw !== raw) cache = { raw, settings: parseSettings(raw) };
  return cache.settings;
}

/** Shows the animation speed on <html>, where the CSS reads it. Does not save it. */
export function applyMotion(motion: MotionSetting): void {
  const root = document.documentElement;
  if (motion === "normal") delete root.dataset.motion;
  else root.dataset.motion = motion;
}

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** Changes some settings: applies them here, saves them, and lets other tabs follow. */
export function updateSettings(patch: Partial<Settings>): void {
  const next = { ...readSettings(), ...patch };
  unsaved = null;
  try {
    const store = storage();
    if (!store) throw new Error("no storage");
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Blocked or full: the settings still apply to this tab.
    unsaved = next;
  }
  applyMotion(next.motion);
  notify();
}

/** Back to every default. */
export function resetSettings(): void {
  unsaved = null;
  try {
    storage()?.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    unsaved = { ...DEFAULT_SETTINGS };
  }
  applyMotion(DEFAULT_SETTINGS.motion);
  notify();
}

/** Calls back when settings change, here or in another tab (which this tab then follows). */
export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SETTINGS_STORAGE_KEY && event.key !== null) return;
    applyMotion(readSettings().motion);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Whether movement should play: off when the learner or the operating system turned it off. */
export function motionScale(): number {
  if (typeof window === "undefined") return 0;
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return 0;
  }
  return MOTION_SCALE[readSettings().motion];
}

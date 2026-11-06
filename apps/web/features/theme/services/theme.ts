/**
 * The learner's color theme. Dark is the default, so nobody's GitDojo changes until they pick
 * light or "system" (follow the operating system). The choice is kept in this browser
 * (localStorage), applied to <html> before the first paint by {@link THEME_SCRIPT}, and followed by
 * every open tab.
 */

export type Theme = "dark" | "light";
/** What the learner chose: a theme, or whatever the operating system uses. */
export type ThemePreference = Theme | "system";

export const THEMES: readonly Theme[] = ["dark", "light"];
export const THEME_PREFERENCES: readonly ThemePreference[] = ["dark", "light", "system"];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "gitdojo:theme";
/** Matches when the operating system asks for light; anything else counts as dark. */
export const LIGHT_SCHEME_QUERY = "(prefers-color-scheme: light)";

/** The browser chrome color for each theme: each theme's --bg-app. */
export const THEME_COLORS: Readonly<Record<Theme, string>> = {
  dark: "#0b0d10",
  light: "#f4f6f9",
};

export function isTheme(value: unknown): value is Theme {
  return value === "dark" || value === "light";
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Accessing localStorage throws when site data is blocked.
    return null;
  }
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return isTheme(value) || value === "system";
}

/** The saved choice, which may be "system". */
export function readStoredPreference(): ThemePreference {
  try {
    const stored = storage()?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function systemQuery(): MediaQueryList | null {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? null
    : window.matchMedia(LIGHT_SCHEME_QUERY);
}

/** The theme a preference shows right now. */
export function resolveTheme(preference: ThemePreference): Theme {
  if (preference !== "system") return preference;
  return systemQuery()?.matches ? "light" : "dark";
}

/** The theme the saved choice shows right now. */
export function readStoredTheme(): Theme {
  return resolveTheme(readStoredPreference());
}

/** The theme on <html> right now: what the page is actually showing. */
export function activeTheme(): Theme {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const theme = document.documentElement.dataset.theme;
  return isTheme(theme) ? theme : DEFAULT_THEME;
}

const listeners = new Set<() => void>();

/**
 * Shows a theme: the tokens (`data-theme`), native controls and scrollbars (`color-scheme`) and
 * the browser chrome (`<meta name="theme-color">`). Does not save it.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const changed = root.dataset.theme !== theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.content = THEME_COLORS[theme];
  }
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="color-scheme"]')) {
    meta.content = theme;
  }
  if (changed) for (const listener of listeners) listener();
}

/** This tab's preference when storage is blocked, so "system" still follows the OS here. */
let unsavedPreference: ThemePreference | null = null;

function currentPreference(): ThemePreference {
  return unsavedPreference ?? readStoredPreference();
}

/**
 * The learner chose a theme (or "system"): show it here, remember it, and let other tabs follow.
 */
export function setTheme(preference: ThemePreference): void {
  unsavedPreference = null;
  try {
    storage()?.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Blocked or full: the theme still applies to this tab.
    unsavedPreference = preference;
  }
  const changed = activeTheme() !== resolveTheme(preference);
  applyTheme(resolveTheme(preference));
  // Choosing "system" while it already shows the same theme still changes the preference.
  if (!changed) for (const listener of listeners) listener();
}

/** The learner's choice, for controls that offer "system". */
export function activePreference(): ThemePreference {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return currentPreference();
}

/**
 * Calls back when the theme or preference changes: here, in another tab (which this tab then
 * follows), or in the operating system while the preference is "system".
 */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // `key === null`: another tab cleared site storage, which means the default again.
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    const preference = isThemePreference(event.newValue) ? event.newValue : DEFAULT_THEME;
    const changed = activeTheme() !== resolveTheme(preference);
    applyTheme(resolveTheme(preference));
    if (!changed) listener();
  };
  const onSystemChange = () => {
    if (currentPreference() === "system") applyTheme(resolveTheme("system"));
  };
  const query = systemQuery();
  window.addEventListener("storage", onStorage);
  query?.addEventListener("change", onSystemChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    query?.removeEventListener("change", onSystemChange);
  };
}

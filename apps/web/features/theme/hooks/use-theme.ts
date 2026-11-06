"use client";

import { useSyncExternalStore } from "react";
import {
  activePreference,
  activeTheme,
  DEFAULT_THEME,
  subscribeTheme,
  type Theme,
  type ThemePreference,
} from "../services/theme";

/**
 * The active theme, re-rendering when it changes here or in another tab. Renders the default on
 * the server; the pre-paint script has already applied the real one to the page itself.
 */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, activeTheme, () => DEFAULT_THEME);
}

/** The learner's choice, which may be "system", for controls that offer it. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, activePreference, () => DEFAULT_THEME);
}
